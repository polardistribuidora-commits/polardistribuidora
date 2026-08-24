export type Perfil = {
  id: string
  nome: string | null
  role: 'admin' | 'estoquista' | 'vendedor' | 'consulta'
}

export type Produto = {
  id: string
  codigo_interno: string
  codigo_barras: string | null
  nome: string
  unidade: string
  custo: number
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  ativo: boolean
  categoria_id?: string | null
}

export type CarrinhoItem = {
  produto: Produto
  quantidade: number
  valor_unitario: number
}
