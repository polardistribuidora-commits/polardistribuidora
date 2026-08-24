import { useEffect, useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { dataISOInicio, dataISOFim, hojeInput, moeda } from '../lib/format'

export function Relatorios() {
  const [data, setData] = useState(hojeInput())
  const [vendas, setVendas] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { carregar() }, [data])

  async function carregar() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('vendas')
      .select('id,numero,data,subtotal,desconto,total,status,clientes(nome),venda_itens(quantidade,total,produtos(nome,codigo_barras)),venda_pagamentos(forma,valor)')
      .gte('data', dataISOInicio(data))
      .lt('data', dataISOFim(data))
      .order('data')
    setVendas(rows ?? [])
    setLoading(false)
  }

  const concluidas = vendas.filter(v => v.status === 'concluida')
  const faturamentoBruto = concluidas.reduce((s,v) => s + Number(v.subtotal), 0)
  const faturamento = concluidas.reduce((s,v) => s + Number(v.total), 0)
  const descontos = concluidas.reduce((s,v) => s + Number(v.desconto), 0)
  const itens = concluidas.reduce((s,v) => s + (v.venda_itens || []).reduce((a:number,i:any) => a + Number(i.quantidade),0), 0)
  const ticket = concluidas.length ? faturamento / concluidas.length : 0

  const pagamentos = useMemo(() => {
    const acc: Record<string, number> = {}
    concluidas.forEach(v => (v.venda_pagamentos || []).forEach((p:any) => {
      acc[p.forma] = (acc[p.forma] || 0) + Number(p.valor)
    }))
    return acc
  }, [vendas])

  const produtos = useMemo(() => {
    const acc: Record<string, { nome:string, qtd:number, valor:number }> = {}
    concluidas.forEach(v => (v.venda_itens || []).forEach((i:any) => {
      const nome = i.produtos?.nome || 'Produto'
      if (!acc[nome]) acc[nome] = { nome, qtd:0, valor:0 }
      acc[nome].qtd += Number(i.quantidade)
      acc[nome].valor += Number(i.total)
    }))
    return Object.values(acc).sort((a,b) => b.qtd - a.qtd)
  }, [vendas])

  function exportarCsv() {
    const rows = [
      ['Venda','Data','Cliente','Status','Subtotal','Desconto','Total'],
      ...vendas.map(v => [
        v.numero,
        new Date(v.data).toLocaleString('pt-BR'),
        v.clientes?.nome || 'Consumidor',
        v.status,
        Number(v.subtotal).toFixed(2),
        Number(v.desconto).toFixed(2),
        Number(v.total).toFixed(2),
      ])
    ]
    const csv = '\ufeff' + rows.map(r => r.map(x => `"${String(x).replaceAll('"','""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `polar-vendas-${data}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportarPdf() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const margem = 14
    const largura = doc.internal.pageSize.getWidth()
    const dataRelatorio = new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR')
    const geradoEm = new Date().toLocaleString('pt-BR')

    // Cabeçalho institucional
    doc.setFillColor(20, 36, 62)
    doc.rect(0, 0, largura, 34, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('POLAR DISTRIBUIDORA', margem, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Relatório Diário de Vendas', margem, 21)
    doc.setFontSize(9)
    doc.text(`Período: ${dataRelatorio}`, largura - margem, 14, { align: 'right' })
    doc.text(`Gerado em: ${geradoEm}`, largura - margem, 21, { align: 'right' })

    // Resumo principal
    doc.setTextColor(32, 41, 55)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Resumo do dia', margem, 44)

    autoTable(doc, {
      startY: 49,
      margin: { left: margem, right: margem },
      theme: 'grid',
      head: [['Vendas', 'Itens vendidos', 'Faturamento bruto', 'Descontos', 'Faturamento líquido', 'Ticket médio']],
      body: [[
        String(concluidas.length),
        formatarQuantidade(itens),
        moeda(faturamentoBruto),
        moeda(descontos),
        moeda(faturamento),
        moeda(ticket),
      ]],
      styles: { fontSize: 8.3, cellPadding: 3, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [236, 240, 245], textColor: [36, 46, 61], fontStyle: 'bold' },
      bodyStyles: { textColor: [20, 36, 62], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 21 },
        1: { cellWidth: 26 },
        2: { cellWidth: 33 },
        3: { cellWidth: 27 },
        4: { cellWidth: 35 },
        5: { cellWidth: 30 },
      },
    })

    let y = (doc as any).lastAutoTable.finalY + 9

    // Formas de pagamento
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Recebimentos por forma de pagamento', margem, y)

    const pagamentoRows = Object.entries(pagamentos).map(([forma, valor]) => [labelPagamento(forma), moeda(valor)])
    if (!pagamentoRows.length) pagamentoRows.push(['Sem recebimentos', moeda(0)])
    pagamentoRows.push(['TOTAL', moeda(Object.values(pagamentos).reduce((s, valor) => s + valor, 0))])

    autoTable(doc, {
      startY: y + 4,
      margin: { left: margem, right: 108 },
      theme: 'grid',
      head: [['Forma de pagamento', 'Valor']],
      body: pagamentoRows,
      styles: { fontSize: 9, cellPadding: 2.6 },
      headStyles: { fillColor: [20, 36, 62], textColor: 255 },
      columnStyles: { 1: { halign: 'right' } },
      didParseCell: dataCell => {
        if (dataCell.section === 'body' && dataCell.row.index === pagamentoRows.length - 1) {
          dataCell.cell.styles.fontStyle = 'bold'
          dataCell.cell.styles.fillColor = [242, 245, 248]
        }
      },
    })

    y = (doc as any).lastAutoTable.finalY + 9

    // Produtos mais vendidos
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Produtos mais vendidos', margem, y)

    const produtoRows = produtos.slice(0, 10).map((p, index) => [
      String(index + 1),
      p.nome,
      formatarQuantidade(p.qtd),
      moeda(p.valor),
    ])

    autoTable(doc, {
      startY: y + 4,
      margin: { left: margem, right: margem },
      theme: 'striped',
      head: [['#', 'Produto', 'Qtd.', 'Total vendido']],
      body: produtoRows.length ? produtoRows : [['-', 'Sem produtos vendidos', '-', moeda(0)]],
      styles: { fontSize: 8.8, cellPadding: 2.5 },
      headStyles: { fillColor: [20, 36, 62], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        2: { cellWidth: 24, halign: 'right' },
        3: { cellWidth: 35, halign: 'right' },
      },
    })

    y = (doc as any).lastAutoTable.finalY + 9

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Vendas detalhadas', margem, y)

    const vendaRows = vendas.map(v => [
      new Date(v.data).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
      `#${v.numero}`,
      v.clientes?.nome || 'Consumidor',
      formatarQuantidade((v.venda_itens || []).reduce((s:number,i:any)=>s+Number(i.quantidade),0)),
      (v.venda_pagamentos || []).map((p:any)=>labelPagamento(p.forma)).join(', ') || '-',
      labelStatus(v.status),
      moeda(Number(v.total)),
    ])

    autoTable(doc, {
      startY: y + 4,
      margin: { left: margem, right: margem, bottom: 18 },
      theme: 'grid',
      head: [['Hora', 'Venda', 'Cliente', 'Itens', 'Pagamento', 'Status', 'Total']],
      body: vendaRows.length ? vendaRows : [['-', '-', 'Nenhuma venda neste dia', '-', '-', '-', moeda(0)]],
      styles: { fontSize: 7.6, cellPadding: 2.1, valign: 'middle' },
      headStyles: { fillColor: [20, 36, 62], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 18 },
        2: { cellWidth: 40 },
        3: { cellWidth: 14, halign: 'right' },
        4: { cellWidth: 35 },
        5: { cellWidth: 24 },
        6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      didDrawPage: () => {
        const pagina = doc.getNumberOfPages()
        const altura = doc.internal.pageSize.getHeight()
        doc.setDrawColor(220, 225, 232)
        doc.line(margem, altura - 12, largura - margem, altura - 12)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(100, 110, 125)
        doc.text('Polar Distribuidora • Relatório gerado pelo sistema', margem, altura - 7)
        doc.text(`Página ${pagina}`, largura - margem, altura - 7, { align: 'right' })
      },
    })

    doc.save(`relatorio-vendas-polar-${data}.pdf`)
  }

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <span className="eyebrow">Fechamento diário</span>
          <h1>Relatório de vendas</h1>
          <p>Consolidado automático das vendas registradas no sistema.</p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={exportarCsv}><Download size={18}/> CSV</button>
          <button className="primary" onClick={exportarPdf}><FileText size={18}/> Gerar PDF</button>
        </div>
      </div>

      <div className="card report-filter no-print">
        <label>Data do relatório<input type="date" value={data} onChange={e => setData(e.target.value)} /></label>
      </div>

      <section className="report-sheet">
        <div className="report-title">
          <div>
            <h1>POLAR DISTRIBUIDORA</h1>
            <p>Relatório diário de vendas</p>
          </div>
          <strong>{new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR')}</strong>
        </div>

        <div className="report-kpis">
          <div><span>Vendas</span><strong>{concluidas.length}</strong></div>
          <div><span>Itens vendidos</span><strong>{itens}</strong></div>
          <div><span>Descontos</span><strong>{moeda(descontos)}</strong></div>
          <div><span>Ticket médio</span><strong>{moeda(ticket)}</strong></div>
          <div><span>Faturamento líquido</span><strong>{moeda(faturamento)}</strong></div>
        </div>

        <div className="report-columns">
          <div>
            <h3>Por forma de pagamento</h3>
            <table className="compact-table">
              <tbody>
                {Object.keys(pagamentos).length === 0 && <tr><td>Sem recebimentos</td><td>{moeda(0)}</td></tr>}
                {Object.entries(pagamentos).map(([f,v]) => <tr key={f}><td>{labelPagamento(f)}</td><td>{moeda(v)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Produtos mais vendidos</h3>
            <table className="compact-table">
              <tbody>
                {produtos.slice(0,8).map(p => <tr key={p.nome}><td>{p.nome}</td><td>{formatarQuantidade(p.qtd)} un.</td><td>{moeda(p.valor)}</td></tr>)}
                {!produtos.length && <tr><td>Sem produtos vendidos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <h3>Vendas detalhadas</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Hora</th><th>Venda</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}>Carregando...</td></tr>}
              {!loading && vendas.length === 0 && <tr><td colSpan={7} className="empty">Nenhuma venda neste dia.</td></tr>}
              {vendas.map(v => (
                <tr key={v.id}>
                  <td>{new Date(v.data).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</td>
                  <td>#{v.numero}</td>
                  <td>{v.clientes?.nome || 'Consumidor'}</td>
                  <td>{formatarQuantidade((v.venda_itens || []).reduce((s:number,i:any)=>s+Number(i.quantidade),0))}</td>
                  <td>{(v.venda_pagamentos || []).map((p:any)=>labelPagamento(p.forma)).join(', ')}</td>
                  <td>{labelStatus(v.status)}</td>
                  <td><strong>{moeda(v.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function labelPagamento(v: string) {
  return ({
    pix:'Pix',
    dinheiro:'Dinheiro',
    debito:'Cartão débito',
    credito:'Cartão crédito',
    prazo:'Prazo',
  } as Record<string,string>)[v] || v
}

function labelStatus(v: string) {
  return ({
    concluida: 'Concluída',
    cancelada: 'Cancelada',
    aberta: 'Aberta',
  } as Record<string,string>)[v] || v
}

function formatarQuantidade(valor: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(valor)
}
