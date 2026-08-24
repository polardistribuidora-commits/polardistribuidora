import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Barcode, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { moeda, numero } from '../lib/format'
import type { Produto } from '../lib/types'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { useAuth } from '../components/AuthProvider'

const vazio = {
  codigo_interno: '',
  codigo_barras: '',
  nome: '',
  unidade: 'UN',
  custo: '0',
  preco_venda: '0',
  estoque_minimo: '0',
}

export function Produtos() {
  const { perfil } = useAuth()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [busca, setBusca] = useState('')
  const [scanner, setScanner] = useState(false)
  const [form, setForm] = useState(vazio)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const podeEditar = perfil?.role === 'admin' || perfil?.role === 'estoquista'

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .order('nome')
    if (error) setMensagem(error.message)
    setProdutos((data as Produto[]) ?? [])
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q) return produtos
    return produtos.filter(p =>
      p.nome.toLowerCase().includes(q) ||
      p.codigo_interno.toLowerCase().includes(q) ||
      (p.codigo_barras || '').includes(q)
    )
  }, [produtos, busca])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMensagem('')
    const { error } = await supabase.from('produtos').insert({
      codigo_interno: form.codigo_interno.trim(),
      codigo_barras: form.codigo_barras.trim() || null,
      nome: form.nome.trim(),
      unidade: form.unidade.trim().toUpperCase(),
      custo: Number(form.custo),
      preco_venda: Number(form.preco_venda),
      estoque_minimo: Number(form.estoque_minimo),
    })

    if (error) {
      setMensagem(error.message)
      return
    }

    setForm(vazio)
    setMostrarForm(false)
    setMensagem('Produto cadastrado com sucesso.')
    carregar()
  }

  const detectado = useCallback((codigo: string) => {
    setBusca(codigo)
  }, [])

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Catálogo</span>
          <h1>Produtos</h1>
          <p>Pesquise por nome, código interno ou código de barras.</p>
        </div>
        {podeEditar && (
          <button className="primary" onClick={() => setMostrarForm(v => !v)}>
            <Plus size={18} /> Novo produto
          </button>
        )}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-box grow">
            <Search size={18} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome, código interno ou EAN/GTIN..."
              autoFocus
            />
          </div>
          <button className="secondary" onClick={() => setScanner(true)}>
            <Barcode size={18} /> Ler código
          </button>
        </div>

        {mensagem && <div className="alert">{mensagem}</div>}

        {mostrarForm && (
          <form onSubmit={salvar} className="form-grid inset">
            <label>Código interno<input value={form.codigo_interno} onChange={e => setForm({...form, codigo_interno:e.target.value})} required /></label>
            <label>Código de barras<input value={form.codigo_barras} onChange={e => setForm({...form, codigo_barras:e.target.value})} inputMode="numeric" /></label>
            <label className="span-2">Descrição<input value={form.nome} onChange={e => setForm({...form, nome:e.target.value})} required /></label>
            <label>Unidade<input value={form.unidade} onChange={e => setForm({...form, unidade:e.target.value})} required /></label>
            <label>Custo<input type="number" step="0.01" min="0" value={form.custo} onChange={e => setForm({...form, custo:e.target.value})} /></label>
            <label>Preço de venda<input type="number" step="0.01" min="0" value={form.preco_venda} onChange={e => setForm({...form, preco_venda:e.target.value})} required /></label>
            <label>Estoque mínimo<input type="number" step="0.001" min="0" value={form.estoque_minimo} onChange={e => setForm({...form, estoque_minimo:e.target.value})} /></label>
            <div className="form-actions span-2">
              <button type="button" className="ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
              <button className="primary">Salvar produto</button>
            </div>
          </form>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Código</th><th>Código de barras</th><th>Produto</th><th>Un.</th><th>Estoque</th><th>Venda</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && <tr><td colSpan={7} className="empty">Nenhum produto encontrado.</td></tr>}
              {filtrados.map(p => {
                const baixo = Number(p.estoque_atual) <= Number(p.estoque_minimo)
                return (
                  <tr key={p.id}>
                    <td>{p.codigo_interno}</td>
                    <td className="mono">{p.codigo_barras || '—'}</td>
                    <td><strong>{p.nome}</strong></td>
                    <td>{p.unidade}</td>
                    <td>{numero(p.estoque_atual, 3).replace(',000', '')}</td>
                    <td>{moeda(p.preco_venda)}</td>
                    <td><span className={`badge ${baixo ? 'danger' : 'success'}`}>{baixo ? 'Baixo' : 'OK'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <BarcodeScanner open={scanner} onClose={() => setScanner(false)} onDetected={detectado} />
    </>
  )
}
