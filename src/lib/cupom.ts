import type { CarrinhoItem } from './types'

export type LarguraCupom = 58 | 80

export type CupomVenda = {
  numero: number | string
  data: string
  vendedor?: string | null
  itens: CarrinhoItem[]
  subtotal: number
  desconto: number
  total: number
  formaPagamento: string
}

const pagamentos: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'DINHEIRO',
  debito: 'CARTAO DEBITO',
  credito: 'CARTAO CREDITO',
  prazo: 'A PRAZO',
}

function esc(valor: unknown) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function brl(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0))
}

function qtd(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 3,
    maximumFractionDigits: 3,
  }).format(valor)
}

export function imprimirCupomNaoFiscal(cupom: CupomVenda, largura: LarguraCupom = 80) {
  const larguraConteudo = largura === 58 ? 50 : 72
  const fonte = largura === 58 ? 10 : 11

  const linhasItens = cupom.itens.map((item, index) => `
    <div class="item">
      <div class="item-name">${index + 1}. ${esc(item.produto.nome)}</div>
      <div class="item-row">
        <span>${qtd(item.quantidade)} ${esc(item.produto.unidade || 'UN')} x R$ ${brl(item.valor_unitario)}</span>
        <strong>R$ ${brl(item.quantidade * item.valor_unitario)}</strong>
      </div>
      <div class="code">COD: ${esc(item.produto.codigo_barras || item.produto.codigo_interno)}</div>
    </div>
  `).join('')

  const data = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(cupom.data))

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Cupom Polar #${esc(cupom.numero)}</title>
<style>
  @page { size: ${largura}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    width: ${larguraConteudo}mm;
    margin: 0 auto;
    padding: 3mm 0 5mm;
    font-family: "Courier New", Courier, monospace;
    font-size: ${fonte}px;
    line-height: 1.25;
    font-weight: 500;
  }
  .center { text-align: center; }
  .brand { font-size: ${largura === 58 ? 20 : 24}px; font-weight: 900; letter-spacing: 1px; }
  .subtitle { font-weight: 700; margin-top: 1px; }
  .non-fiscal { border: 1px solid #000; padding: 3px; margin: 7px 0; font-weight: 900; text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .meta { display: flex; justify-content: space-between; gap: 5px; }
  .item { padding: 4px 0; }
  .item-name { font-weight: 800; overflow-wrap: anywhere; }
  .item-row { display: flex; justify-content: space-between; gap: 5px; margin-top: 2px; }
  .item-row strong { white-space: nowrap; }
  .code { font-size: ${fonte - 1}px; margin-top: 1px; }
  .totals .row { display: flex; justify-content: space-between; gap: 5px; padding: 1px 0; }
  .totals .grand { font-size: ${fonte + 3}px; font-weight: 900; margin-top: 3px; }
  .footer { text-align: center; margin-top: 8px; }
  .legal { font-size: ${fonte - 1}px; font-weight: 800; margin-top: 5px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="center">
    <div class="brand">POLAR</div>
    <div class="subtitle">DISTRIBUIDORA</div>
    <div>A GELADA QUE TODO MUNDO CONFIA!</div>
  </div>

  <div class="non-fiscal">CUPOM NAO FISCAL</div>

  <div class="meta"><span>VENDA:</span><strong>#${esc(cupom.numero)}</strong></div>
  <div class="meta"><span>DATA:</span><span>${esc(data)}</span></div>
  ${cupom.vendedor ? `<div class="meta"><span>VENDEDOR:</span><span>${esc(cupom.vendedor)}</span></div>` : ''}

  <div class="divider"></div>
  <strong>ITENS</strong>
  <div class="divider"></div>
  ${linhasItens}

  <div class="divider"></div>
  <div class="totals">
    <div class="row"><span>SUBTOTAL</span><span>R$ ${brl(cupom.subtotal)}</span></div>
    <div class="row"><span>DESCONTO</span><span>R$ ${brl(cupom.desconto)}</span></div>
    <div class="row grand"><span>TOTAL</span><span>R$ ${brl(cupom.total)}</span></div>
    <div class="row"><span>PAGAMENTO</span><strong>${esc(pagamentos[cupom.formaPagamento] || cupom.formaPagamento.toUpperCase())}</strong></div>
  </div>

  <div class="divider"></div>
  <div class="footer">
    <strong>OBRIGADO PELA PREFERENCIA!</strong>
    <div class="legal">DOCUMENTO SEM VALOR FISCAL</div>
  </div>
</body>
</html>`

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '1px'
  iframe.style.height = '1px'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    throw new Error('Não foi possível abrir a impressão do cupom.')
  }

  doc.open()
  doc.write(html)
  doc.close()

  const remover = () => setTimeout(() => iframe.remove(), 500)
  win.onafterprint = remover

  setTimeout(() => {
    win.focus()
    win.print()
    setTimeout(() => {
      if (document.body.contains(iframe)) iframe.remove()
    }, 30000)
  }, 250)
}
