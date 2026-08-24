import { FormEvent, useEffect, useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Produto } from '../lib/types'
import { dataHora, numero } from '../lib/format'
import { useAuth } from '../components/AuthProvider'

export function Estoque() {
  const { perfil } = useAuth()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [movimentos, setMovimentos] = useState<any[]>([])
  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const podeAjustar = perfil?.role === 'admin' || perfil?.role === 'estoquista'

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const [p, m] = await Promise.all([
      supabase.from('produtos').select('*').eq('ativo', true).order('nome'),
      supabase.from('movimentacoes_estoque')
        .select('id,criado_em,tipo,quantidade,estoque_anterior,estoque_posterior,observacao,produtos(nome,codigo_interno)')
        .order('criado_em', { ascending: false })
        .limit(100),
    ])
    setProdutos((p.data as Produto[]) ?? [])
    setMovimentos(m.data ?? [])
  }

  async function ajustar(e: FormEvent) {
    e.preventDefault()
    setMensagem('')
    const q = Number(quantidade)
    if (!produtoId || !q || !motivo.trim()) {
      setMensagem('Informe produto, quantidade diferente de zero e motivo.')
      return
    }
    const { error } = await supabase.rpc('ajustar_estoque', {
      p_produto_id: produtoId,
      p_quantidade: q,
      p_motivo: motivo.trim(),
    })
    if (error) setMensagem(error.message)
    else {
      setMensagem('Ajuste registrado com sucesso.')
      setQuantidade('')
      setMotivo('')
      carregar()
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Rastreabilidade</span>
          <h1>Movimentações de estoque</h1>
          <p>Entradas, saídas por venda e ajustes ficam registrados.</p>
        </div>
        <button className="secondary" onClick={carregar}><RefreshCcw size={18}/> Atualizar</button>
      </div>

      {podeAjustar && (
        <form className="card form-grid" onSubmit={ajustar}>
          <div className="span-2">
            <h2>Ajuste manual</h2>
            <p className="muted">Use quantidade positiva para entrada e negativa para saída.</p>
          </div>
          <label>Produto
            <select value={produtoId} onChange={e => setProdutoId(e.target.value)} required>
              <option value="">Selecione...</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.codigo_interno} — {p.nome} (atual: {p.estoque_atual})</option>)}
            </select>
          </label>
          <label>Quantidade
            <input type="number" step="0.001" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="Ex.: 10 ou -2" required />
          </label>
          <label className="span-2">Motivo
            <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: contagem física / avaria / correção" required />
          </label>
          {mensagem && <div className="alert span-2">{mensagem}</div>}
          <div className="form-actions span-2"><button className="primary">Registrar ajuste</button></div>
        </form>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Movimento</th><th>Anterior</th><th>Posterior</th><th>Observação</th></tr></thead>
            <tbody>
              {movimentos.length === 0 && <tr><td colSpan={7} className="empty">Sem movimentações.</td></tr>}
              {movimentos.map(m => (
                <tr key={m.id}>
                  <td>{dataHora(m.criado_em)}</td>
                  <td><strong>{m.produtos?.nome}</strong><div className="muted small">{m.produtos?.codigo_interno}</div></td>
                  <td><span className="badge">{m.tipo}</span></td>
                  <td className={Number(m.quantidade) >= 0 ? 'positive' : 'negative'}>{Number(m.quantidade) > 0 ? '+' : ''}{numero(m.quantidade, 3).replace(',000','')}</td>
                  <td>{numero(m.estoque_anterior, 3).replace(',000','')}</td>
                  <td>{numero(m.estoque_posterior, 3).replace(',000','')}</td>
                  <td>{m.observacao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
