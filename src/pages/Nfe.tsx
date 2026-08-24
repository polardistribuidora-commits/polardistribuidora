import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { FileCheck2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Produto } from '../lib/types'
import { moeda } from '../lib/format'
import { useAuth } from '../components/AuthProvider'

type NfeCab = {
  chave: string
  numero: string
  serie: string
  emissao: string | null
  cnpj: string
  fornecedor: string
  valor_total: number
  xml_original: string
}

type NfeItem = {
  codigo_fornecedor: string
  descricao: string
  codigo_barras: string | null
  unidade: string
  quantidade: number
  valor_unitario: number
  produto_id: string
}

const txt = (el: Element | null, tag: string) => {
  const node = el?.getElementsByTagName(tag)?.[0]
  return node?.textContent?.trim() || ''
}

function parseNfe(xml: string): { cab: NfeCab, itens: NfeItem[] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido.')

  const inf = doc.getElementsByTagName('infNFe')[0]
  if (!inf) throw new Error('O arquivo não parece ser um XML de NF-e.')

  const ide = doc.getElementsByTagName('ide')[0]
  const emit = doc.getElementsByTagName('emit')[0]
  const total = doc.getElementsByTagName('ICMSTot')[0]
  const chave = (inf.getAttribute('Id') || '').replace(/^NFe/, '') || txt(doc.documentElement, 'chNFe')

  const itens = Array.from(doc.getElementsByTagName('det')).map(det => {
    const prod = det.getElementsByTagName('prod')[0]
    const ean = txt(prod, 'cEAN')
    const eanTrib = txt(prod, 'cEANTrib')
    const codigoBarras = [ean, eanTrib].find(v => v && v !== 'SEM GTIN') || null
    return {
      codigo_fornecedor: txt(prod, 'cProd'),
      descricao: txt(prod, 'xProd'),
      codigo_barras: codigoBarras,
      unidade: txt(prod, 'uCom') || 'UN',
      quantidade: Number(txt(prod, 'qCom') || 0),
      valor_unitario: Number(txt(prod, 'vUnCom') || 0),
      produto_id: '',
    }
  })

  return {
    cab: {
      chave,
      numero: txt(ide, 'nNF'),
      serie: txt(ide, 'serie'),
      emissao: txt(ide, 'dhEmi') || txt(ide, 'dEmi') || null,
      cnpj: txt(emit, 'CNPJ'),
      fornecedor: txt(emit, 'xNome'),
      valor_total: Number(txt(total, 'vNF') || 0),
      xml_original: xml,
    },
    itens,
  }
}

export function Nfe() {
  const { perfil } = useAuth()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [cab, setCab] = useState<NfeCab | null>(null)
  const [itens, setItens] = useState<NfeItem[]>([])
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const podeImportar = perfil?.role === 'admin' || perfil?.role === 'estoquista'

  useEffect(() => {
    supabase.from('produtos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => setProdutos((data as Produto[]) ?? []))
  }, [])

  async function arquivo(e: ChangeEvent<HTMLInputElement>) {
    setMensagem('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const xml = await file.text()
      const parsed = parseNfe(xml)
      const auto = parsed.itens.map(item => {
        const match = item.codigo_barras
          ? produtos.find(p => p.codigo_barras === item.codigo_barras)
          : undefined
        const fallback = produtos.find(p => p.codigo_interno === item.codigo_fornecedor)
        return { ...item, produto_id: match?.id || fallback?.id || '' }
      })
      setCab(parsed.cab)
      setItens(auto)
    } catch (err: any) {
      setMensagem(err.message || 'Falha ao ler XML.')
    }
  }

  const todosVinculados = useMemo(() => itens.length > 0 && itens.every(i => i.produto_id), [itens])

  async function confirmar() {
    if (!cab || !todosVinculados) return
    if (!podeImportar) {
      setMensagem('Seu perfil não possui permissão para importar NF-e.')
      return
    }
    setSalvando(true)
    setMensagem('')

    const { data, error } = await supabase.rpc('registrar_entrada_nfe', {
      p_nfe: cab,
      p_itens: itens.map(i => ({
        produto_id: i.produto_id,
        codigo_fornecedor: i.codigo_fornecedor,
        descricao: i.descricao,
        codigo_barras: i.codigo_barras,
        unidade: i.unidade,
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
      })),
    })

    if (error) setMensagem(error.message)
    else {
      setMensagem(`NF-e ${cab.numero} importada. Entrada ${data} registrada no estoque.`)
      setCab(null)
      setItens([])
    }
    setSalvando(false)
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Recebimento</span>
          <h1>Importar NF-e</h1>
          <p>Importe o XML, vincule os itens e confirme a entrada no estoque.</p>
        </div>
      </div>

      <div className="card">
        <label className="upload-box">
          <Upload size={28}/>
          <strong>Selecionar XML da NF-e</strong>
          <span>O sistema apenas importa a nota. Não há emissão fiscal.</span>
          <input type="file" accept=".xml,application/xml,text/xml" onChange={arquivo} hidden />
        </label>
        {mensagem && <div className="alert">{mensagem}</div>}
      </div>

      {cab && (
        <>
          <div className="card nfe-summary">
            <div><span>NF-e</span><strong>{cab.numero} / série {cab.serie}</strong></div>
            <div><span>Fornecedor</span><strong>{cab.fornecedor}</strong><small>{cab.cnpj}</small></div>
            <div><span>Valor</span><strong>{moeda(cab.valor_total)}</strong></div>
            <div><span>Chave</span><strong className="mono wrap">{cab.chave}</strong></div>
          </div>

          <div className="card">
            <div className="card-header">
              <div><h2>Vincular produtos</h2><p className="muted">O código de barras é usado primeiro para reconhecimento automático.</p></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item da NF-e</th><th>EAN/GTIN</th><th>Qtd.</th><th>Custo</th><th>Produto Polar</th></tr></thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={`${item.codigo_fornecedor}-${idx}`}>
                      <td><strong>{item.descricao}</strong><div className="muted small">{item.codigo_fornecedor}</div></td>
                      <td className="mono">{item.codigo_barras || 'SEM GTIN'}</td>
                      <td>{item.quantidade} {item.unidade}</td>
                      <td>{moeda(item.valor_unitario)}</td>
                      <td>
                        <select
                          value={item.produto_id}
                          onChange={e => setItens(v => v.map((x, i) => i === idx ? {...x, produto_id:e.target.value} : x))}
                          className={!item.produto_id ? 'invalid' : ''}
                        >
                          <option value="">Vincular produto...</option>
                          {produtos.map(p => <option key={p.id} value={p.id}>{p.codigo_interno} — {p.nome}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!todosVinculados && <div className="alert warning">Vincule todos os itens antes de confirmar. Se algum produto não existir, cadastre-o na tela Produtos.</div>}
            <div className="form-actions">
              <button className="primary large" disabled={!todosVinculados || salvando || !podeImportar} onClick={confirmar}>
                <FileCheck2 size={18}/>
                {salvando ? 'Registrando entrada...' : 'Confirmar entrada no estoque'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
