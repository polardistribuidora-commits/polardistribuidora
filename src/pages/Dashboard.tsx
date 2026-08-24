import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Boxes, PackageCheck, ReceiptText, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dataISOInicio, dataISOFim, hojeInput, moeda, numero } from '../lib/format'

type Kpis = {
  produtos: number
  unidades: number
  estoqueBaixo: number
  vendas: number
  faturamento: number
}

export function Dashboard() {
  const [kpis, setKpis] = useState<Kpis>({ produtos: 0, unidades: 0, estoqueBaixo: 0, vendas: 0, faturamento: 0 })
  const [recentes, setRecentes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const hoje = hojeInput()
    const [produtosRes, vendasRes, recentesRes] = await Promise.all([
      supabase.from('produtos').select('id,estoque_atual,estoque_minimo').eq('ativo', true),
      supabase
        .from('vendas')
        .select('id,total,status')
        .gte('data', dataISOInicio(hoje))
        .lt('data', dataISOFim(hoje))
        .eq('status', 'concluida'),
      supabase
        .from('vendas')
        .select('id,numero,data,total,status,clientes(nome)')
        .order('data', { ascending: false })
        .limit(6),
    ])

    const produtos = produtosRes.data ?? []
    const vendas = vendasRes.data ?? []

    setKpis({
      produtos: produtos.length,
      unidades: produtos.reduce((s: number, p: any) => s + Number(p.estoque_atual), 0),
      estoqueBaixo: produtos.filter((p: any) => Number(p.estoque_atual) <= Number(p.estoque_minimo)).length,
      vendas: vendas.length,
      faturamento: vendas.reduce((s: number, v: any) => s + Number(v.total), 0),
    })
    setRecentes(recentesRes.data ?? [])
    setLoading(false)
  }

  return (
    <>
      <div className="polar-banner">
        <img
          src={`${import.meta.env.BASE_URL}polar-banner.webp`}
          alt="Polar Distribuidora - A gelada que todo mundo confia"
        />
      </div>

      <div className="page-heading">
        <div>
          <span className="eyebrow">Visão geral</span>
          <h1>Dashboard</h1>
          <p>Resumo operacional da Distribuidora Polar.</p>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi icon={<Boxes />} label="Produtos ativos" value={String(kpis.produtos)} />
        <Kpi icon={<PackageCheck />} label="Unidades em estoque" value={numero(kpis.unidades, 0)} />
        <Kpi icon={<AlertTriangle />} label="Estoque baixo" value={String(kpis.estoqueBaixo)} attention={kpis.estoqueBaixo > 0} />
        <Kpi icon={<ShoppingCart />} label="Vendas hoje" value={String(kpis.vendas)} />
        <Kpi icon={<ReceiptText />} label="Faturamento hoje" value={moeda(kpis.faturamento)} wide />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>Vendas recentes</h2>
            <p className="muted">Últimos registros realizados.</p>
          </div>
        </div>
        {loading ? <p>Carregando...</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Venda</th><th>Data</th><th>Cliente</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {recentes.length === 0 && <tr><td colSpan={5} className="empty">Nenhuma venda registrada.</td></tr>}
                {recentes.map((v) => (
                  <tr key={v.id}>
                    <td>#{v.numero}</td>
                    <td>{new Date(v.data).toLocaleString('pt-BR')}</td>
                    <td>{v.clientes?.nome || 'Consumidor'}</td>
                    <td><span className={`badge ${v.status === 'concluida' ? 'success' : ''}`}>{v.status}</span></td>
                    <td><strong>{moeda(v.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function Kpi({ icon, label, value, attention, wide }: { icon: ReactNode, label: string, value: string, attention?: boolean, wide?: boolean }) {
  return (
    <div className={`kpi-card ${attention ? 'attention' : ''} ${wide ? 'wide' : ''}`}>
      <div className="kpi-icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  )
}
