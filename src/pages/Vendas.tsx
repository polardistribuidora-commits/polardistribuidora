import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Barcode, Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { CarrinhoItem, Produto } from '../lib/types'
import { moeda } from '../lib/format'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { useAuth } from '../components/AuthProvider'
import { imprimirCupomNaoFiscal, type CupomVenda, type LarguraCupom } from '../lib/cupom'

export function Vendas() {
  const { perfil } = useAuth()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([])
  const [desconto, setDesconto] = useState(0)
  const [forma, setForma] = useState('pix')
  const [scanner, setScanner] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [finalizando, setFinalizando] = useState(false)
  const [larguraCupom, setLarguraCupom] = useState<LarguraCupom>(() => Number(localStorage.getItem('polar_largura_cupom')) === 58 ? 58 : 80)
  const [imprimirAoFinalizar, setImprimirAoFinalizar] = useState(() => localStorage.getItem('polar_imprimir_automatico') !== 'false')
  const [ultimaVenda, setUltimaVenda] = useState<CupomVenda | null>(() => {
    try {
      const salvo = localStorage.getItem('polar_ultima_venda')
      return salvo ? JSON.parse(salvo) as CupomVenda : null
    } catch {
      return null
    }
  })
  const buscaRef = useRef<HTMLInputElement>(null)

  const podeVender = perfil?.role === 'admin' || perfil?.role === 'vendedor'

  useEffect(() => {
    supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setProdutos((data as Produto[]) ?? []))
  }, [])

  const resultados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q) return []
    return produtos.filter(p =>
      p.nome.toLowerCase().includes(q) ||
      p.codigo_interno.toLowerCase().includes(q) ||
      (p.codigo_barras || '').includes(q)
    ).slice(0, 8)
  }, [busca, produtos])

  function adicionar(produto: Produto) {
    if (Number(produto.estoque_atual) <= 0) {
      setMensagem('Produto sem estoque.')
      return
    }
    setCarrinho(prev => {
      const achou = prev.find(i => i.produto.id === produto.id)
      if (achou) {
        if (achou.quantidade + 1 > Number(produto.estoque_atual)) return prev
        return prev.map(i => i.produto.id === produto.id ? {...i, quantidade: i.quantidade + 1} : i)
      }
      return [...prev, { produto, quantidade: 1, valor_unitario: Number(produto.preco_venda) }]
    })
    setBusca('')
    setMensagem('')
    setTimeout(() => buscaRef.current?.focus(), 0)
  }

  function alterarQtd(id: string, delta: number) {
    setCarrinho(prev => prev
      .map(i => i.produto.id === id
        ? {...i, quantidade: Math.max(0, Math.min(Number(i.produto.estoque_atual), i.quantidade + delta))}
        : i)
      .filter(i => i.quantidade > 0)
    )
  }

  const subtotal = carrinho.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
  const total = Math.max(0, subtotal - Number(desconto || 0))

  const codigoDetectado = useCallback((codigo: string) => {
    const produto = produtos.find(p => p.codigo_barras === codigo)
    if (produto) adicionar(produto)
    else {
      setBusca(codigo)
      setMensagem(`Código ${codigo} não encontrado no cadastro.`)
    }
  }, [produtos, carrinho])

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = busca.trim()
    const exato = produtos.find(p => p.codigo_barras === q || p.codigo_interno.toLowerCase() === q.toLowerCase())
    if (exato) adicionar(exato)
    else if (resultados.length === 1) adicionar(resultados[0])
  }

  function alterarLarguraCupom(valor: LarguraCupom) {
    setLarguraCupom(valor)
    localStorage.setItem('polar_largura_cupom', String(valor))
  }

  function alterarImpressaoAutomatica(valor: boolean) {
    setImprimirAoFinalizar(valor)
    localStorage.setItem('polar_imprimir_automatico', String(valor))
  }

  function imprimirUltimaVenda() {
    if (!ultimaVenda) return setMensagem('Ainda não existe uma venda para reimprimir neste navegador.')
    try {
      imprimirCupomNaoFiscal(ultimaVenda, larguraCupom)
    } catch (err) {
      setMensagem(err instanceof Error ? err.message : 'Não foi possível imprimir o cupom.')
    }
  }

  async function finalizar(e: FormEvent) {
    e.preventDefault()
    if (!podeVender) return setMensagem('Seu perfil não possui permissão para registrar vendas.')
    if (!carrinho.length) return setMensagem('Adicione ao menos um produto.')
    setFinalizando(true)
    setMensagem('')

    const itens = carrinho.map(i => ({
      produto_id: i.produto.id,
      quantidade: i.quantidade,
      valor_unitario: i.valor_unitario,
    }))

    const pagamentos = [{ forma, valor: total }]

    const { data, error } = await supabase.rpc('finalizar_venda', {
      p_cliente_id: null,
      p_desconto: Number(desconto || 0),
      p_pagamentos: pagamentos,
      p_itens: itens,
    })

    if (error) {
      setMensagem(error.message)
      setFinalizando(false)
      return
    }

    const cupom: CupomVenda = {
      numero: data,
      data: new Date().toISOString(),
      vendedor: perfil?.nome,
      itens: carrinho.map(item => ({ ...item, produto: { ...item.produto } })),
      subtotal,
      desconto: Number(desconto || 0),
      total,
      formaPagamento: forma,
    }

    setUltimaVenda(cupom)
    localStorage.setItem('polar_ultima_venda', JSON.stringify(cupom))
    setMensagem(`Venda #${data} concluída com sucesso.`)

    if (imprimirAoFinalizar) {
      try {
        imprimirCupomNaoFiscal(cupom, larguraCupom)
      } catch (err) {
        setMensagem(`Venda #${data} concluída, mas o cupom não pôde ser aberto para impressão.`)
        console.error(err)
      }
    }

    setCarrinho([])
    setDesconto(0)
    const { data: novos } = await supabase.from('produtos').select('*').eq('ativo', true).order('nome')
    setProdutos((novos as Produto[]) ?? [])
    setFinalizando(false)
    setTimeout(() => buscaRef.current?.focus(), 0)
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PDV interno</span>
          <h1>Nova venda</h1>
          <p>Leia o código de barras ou pesquise o produto para adicionar.</p>
        </div>
      </div>

      <div className="sales-grid">
        <div className="card">
          <div className="toolbar">
            <div className="search-box grow">
              <Search size={18} />
              <input
                ref={buscaRef}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Bipe o código de barras ou digite..."
                autoFocus
              />
            </div>
            <button className="secondary" onClick={() => setScanner(true)} type="button">
              <Barcode size={18} /> Câmera
            </button>
          </div>

          {busca && (
            <div className="product-results">
              {resultados.length === 0 && <div className="empty compact">Nenhum produto encontrado.</div>}
              {resultados.map(p => (
                <button key={p.id} onClick={() => adicionar(p)} className="product-result">
                  <div>
                    <strong>{p.nome}</strong>
                    <span>{p.codigo_barras || p.codigo_interno}</span>
                  </div>
                  <div className="product-result-side">
                    <strong>{moeda(p.preco_venda)}</strong>
                    <span>Estoque: {p.estoque_atual}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="cart-title"><ShoppingCart size={19} /><strong>Itens da venda</strong><span>{carrinho.length}</span></div>

          <div className="cart-list">
            {carrinho.length === 0 && <div className="empty cart-empty">Nenhum item adicionado.</div>}
            {carrinho.map(i => (
              <div className="cart-item" key={i.produto.id}>
                <div className="cart-main">
                  <strong>{i.produto.nome}</strong>
                  <span>{i.produto.codigo_barras || i.produto.codigo_interno}</span>
                </div>
                <div className="qty-control">
                  <button onClick={() => alterarQtd(i.produto.id, -1)}><Minus size={16}/></button>
                  <strong>{i.quantidade}</strong>
                  <button onClick={() => alterarQtd(i.produto.id, 1)}><Plus size={16}/></button>
                </div>
                <div className="cart-price">
                  <span>{moeda(i.valor_unitario)}</span>
                  <strong>{moeda(i.quantidade * i.valor_unitario)}</strong>
                </div>
                <button className="icon-button danger-text" onClick={() => setCarrinho(v => v.filter(x => x.produto.id !== i.produto.id))}>
                  <Trash2 size={18}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        <form className="card checkout" onSubmit={finalizar}>
          <h2>Resumo</h2>
          <div className="summary-line"><span>Subtotal</span><strong>{moeda(subtotal)}</strong></div>
          <label>
            Desconto
            <input type="number" min="0" max={subtotal} step="0.01" value={desconto} onChange={e => setDesconto(Number(e.target.value))} />
          </label>
          <label>
            Forma de pagamento
            <select value={forma} onChange={e => setForma(e.target.value)}>
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="debito">Cartão débito</option>
              <option value="credito">Cartão crédito</option>
              <option value="prazo">Prazo</option>
            </select>
          </label>

          <div className="receipt-config">
            <div className="receipt-config-title"><Printer size={17} /><strong>Cupom não fiscal</strong></div>
            <label>
              Bobina da impressora
              <select value={larguraCupom} onChange={e => alterarLarguraCupom(Number(e.target.value) as LarguraCupom)}>
                <option value={80}>80 mm</option>
                <option value={58}>58 mm</option>
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={imprimirAoFinalizar}
                onChange={e => alterarImpressaoAutomatica(e.target.checked)}
              />
              <span>Imprimir ao finalizar a venda</span>
            </label>
            <button type="button" className="secondary receipt-reprint" onClick={imprimirUltimaVenda} disabled={!ultimaVenda}>
              <Printer size={17} /> Reimprimir última venda
            </button>
          </div>

          <div className="total-box"><span>Total</span><strong>{moeda(total)}</strong></div>
          {mensagem && <div className="alert">{mensagem}</div>}
          <button className="primary large" disabled={finalizando || !podeVender}>
            {finalizando ? 'Finalizando...' : 'Finalizar venda'}
          </button>
          {!podeVender && <p className="muted small">Perfil sem permissão para vender.</p>}
        </form>
      </div>

      <BarcodeScanner open={scanner} onClose={() => setScanner(false)} onDetected={codigoDetectado} />
    </>
  )
}
