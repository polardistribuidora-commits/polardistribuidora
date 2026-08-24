-- POLAR DISTRIBUIDORA
-- Execute este arquivo no SQL Editor do Supabase.
-- O frontend usa somente a chave pública (anon/publishable) + RLS.

create extension if not exists pgcrypto;

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  role text not null default 'consulta'
    check (role in ('admin','estoquista','vendedor','consulta')),
  criado_em timestamptz not null default now()
);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique,
  razao_social text not null,
  nome_fantasia text,
  telefone text,
  email text,
  criado_em timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  telefone text,
  email text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  codigo_interno text not null unique,
  codigo_barras text unique,
  nome text not null,
  categoria_id uuid references public.categorias(id),
  unidade text not null default 'UN',
  custo numeric(14,4) not null default 0 check (custo >= 0),
  preco_venda numeric(14,2) not null default 0 check (preco_venda >= 0),
  estoque_atual numeric(14,3) not null default 0,
  estoque_minimo numeric(14,3) not null default 0 check (estoque_minimo >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists produtos_nome_idx on public.produtos using gin (to_tsvector('simple', nome));
create index if not exists produtos_codigo_barras_idx on public.produtos(codigo_barras);

create table if not exists public.produto_fornecedor (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  codigo_fornecedor text,
  descricao_fornecedor text,
  codigo_barras text,
  unique (produto_id, fornecedor_id),
  unique (fornecedor_id, codigo_fornecedor)
);

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  data timestamptz not null default now(),
  cliente_id uuid references public.clientes(id),
  vendedor_id uuid not null references auth.users(id),
  subtotal numeric(14,2) not null,
  desconto numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  status text not null default 'concluida'
    check (status in ('concluida','cancelada')),
  observacao text
);

create index if not exists vendas_data_idx on public.vendas(data desc);

create table if not exists public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  quantidade numeric(14,3) not null check (quantidade > 0),
  valor_unitario numeric(14,2) not null check (valor_unitario >= 0),
  total numeric(14,2) not null check (total >= 0)
);

create table if not exists public.venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  forma text not null check (forma in ('pix','dinheiro','debito','credito','prazo')),
  valor numeric(14,2) not null check (valor >= 0)
);

create table if not exists public.nfe_entradas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  numero text not null,
  serie text,
  emissao timestamptz,
  fornecedor_id uuid not null references public.fornecedores(id),
  valor_total numeric(14,2) not null default 0,
  xml_original text,
  usuario_id uuid not null references auth.users(id),
  criado_em timestamptz not null default now()
);

create table if not exists public.nfe_itens (
  id uuid primary key default gen_random_uuid(),
  nfe_id uuid not null references public.nfe_entradas(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  codigo_fornecedor text,
  descricao text not null,
  codigo_barras text,
  unidade text,
  quantidade numeric(14,3) not null check (quantidade > 0),
  valor_unitario numeric(14,4) not null check (valor_unitario >= 0),
  total numeric(14,2) not null check (total >= 0)
);

create table if not exists public.movimentacoes_estoque (
  id bigint generated always as identity primary key,
  produto_id uuid not null references public.produtos(id),
  tipo text not null check (tipo in ('entrada_nfe','venda','ajuste')),
  quantidade numeric(14,3) not null,
  estoque_anterior numeric(14,3) not null,
  estoque_posterior numeric(14,3) not null,
  origem_tipo text,
  origem_id uuid,
  usuario_id uuid not null references auth.users(id),
  observacao text,
  criado_em timestamptz not null default now()
);

create index if not exists mov_estoque_produto_data_idx
  on public.movimentacoes_estoque(produto_id, criado_em desc);

-- Perfil automático para novos usuários.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfis (id, nome, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    'consulta'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Helpers de autorização sem recursão nas policies.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.perfis where id = auth.uid();
$$;

create or replace function public.can_stock()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_app_role() in ('admin','estoquista'), false);
$$;

create or replace function public.can_sell()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_app_role() in ('admin','vendedor'), false);
$$;

-- Venda atômica: valida estoque, grava venda, baixa estoque e cria histórico.
create or replace function public.finalizar_venda(
  p_cliente_id uuid,
  p_desconto numeric,
  p_pagamentos jsonb,
  p_itens jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  pagamento jsonb;
  produto_row public.produtos%rowtype;
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2);
  v_pago numeric(14,2) := 0;
  v_venda_id uuid;
  v_numero bigint;
  v_qtd numeric(14,3);
  v_unit numeric(14,2);
  v_item_total numeric(14,2);
  v_anterior numeric(14,3);
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.can_sell() then
    raise exception 'Usuário sem permissão para registrar venda.';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa de pelo menos um item.';
  end if;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    select * into produto_row
    from public.produtos
    where id = (item->>'produto_id')::uuid and ativo = true
    for update;

    if not found then
      raise exception 'Produto inválido ou inativo.';
    end if;

    v_qtd := (item->>'quantidade')::numeric;
    if v_qtd <= 0 then raise exception 'Quantidade inválida.'; end if;
    if produto_row.estoque_atual < v_qtd then
      raise exception 'Estoque insuficiente para %.', produto_row.nome;
    end if;

    v_unit := coalesce(nullif(item->>'valor_unitario','')::numeric, produto_row.preco_venda);
    if v_unit < 0 then raise exception 'Preço inválido.'; end if;
    v_subtotal := v_subtotal + round(v_qtd * v_unit, 2);
  end loop;

  p_desconto := coalesce(p_desconto, 0);
  if p_desconto < 0 or p_desconto > v_subtotal then
    raise exception 'Desconto inválido.';
  end if;

  v_total := round(v_subtotal - p_desconto, 2);

  if p_pagamentos is null or jsonb_array_length(p_pagamentos) = 0 then
    raise exception 'Informe a forma de pagamento.';
  end if;

  for pagamento in select * from jsonb_array_elements(p_pagamentos)
  loop
    v_pago := v_pago + coalesce((pagamento->>'valor')::numeric, 0);
  end loop;

  if abs(v_pago - v_total) > 0.01 then
    raise exception 'O total dos pagamentos deve ser igual ao total da venda.';
  end if;

  insert into public.vendas(cliente_id, vendedor_id, subtotal, desconto, total)
  values (p_cliente_id, auth.uid(), v_subtotal, p_desconto, v_total)
  returning id, numero into v_venda_id, v_numero;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    select * into produto_row
    from public.produtos
    where id = (item->>'produto_id')::uuid
    for update;

    v_qtd := (item->>'quantidade')::numeric;
    v_unit := coalesce(nullif(item->>'valor_unitario','')::numeric, produto_row.preco_venda);
    v_item_total := round(v_qtd * v_unit, 2);
    v_anterior := produto_row.estoque_atual;

    insert into public.venda_itens(venda_id, produto_id, quantidade, valor_unitario, total)
    values (v_venda_id, produto_row.id, v_qtd, v_unit, v_item_total);

    update public.produtos
    set estoque_atual = estoque_atual - v_qtd, atualizado_em = now()
    where id = produto_row.id;

    insert into public.movimentacoes_estoque(
      produto_id, tipo, quantidade, estoque_anterior, estoque_posterior,
      origem_tipo, origem_id, usuario_id, observacao
    )
    values (
      produto_row.id, 'venda', -v_qtd, v_anterior, v_anterior - v_qtd,
      'venda', v_venda_id, auth.uid(), 'Venda #' || v_numero
    );
  end loop;

  for pagamento in select * from jsonb_array_elements(p_pagamentos)
  loop
    insert into public.venda_pagamentos(venda_id, forma, valor)
    values (
      v_venda_id,
      pagamento->>'forma',
      (pagamento->>'valor')::numeric
    );
  end loop;

  return v_numero;
end;
$$;

-- Entrada atômica de NF-e.
create or replace function public.registrar_entrada_nfe(
  p_nfe jsonb,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  v_fornecedor_id uuid;
  v_nfe_id uuid;
  produto_row public.produtos%rowtype;
  v_qtd numeric(14,3);
  v_custo numeric(14,4);
  v_anterior numeric(14,3);
  v_cnpj text;
  v_razao text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.can_stock() then raise exception 'Usuário sem permissão para importar NF-e.'; end if;
  if coalesce(p_nfe->>'chave','') = '' then raise exception 'NF-e sem chave de acesso.'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'NF-e sem itens.'; end if;

  v_cnpj := coalesce(p_nfe->>'cnpj','');
  v_razao := coalesce(p_nfe->>'fornecedor','Fornecedor');

  insert into public.fornecedores(cnpj, razao_social)
  values (v_cnpj, v_razao)
  on conflict (cnpj) do update set razao_social = excluded.razao_social
  returning id into v_fornecedor_id;

  insert into public.nfe_entradas(
    chave, numero, serie, emissao, fornecedor_id, valor_total, xml_original, usuario_id
  )
  values (
    p_nfe->>'chave',
    p_nfe->>'numero',
    p_nfe->>'serie',
    nullif(p_nfe->>'emissao','')::timestamptz,
    v_fornecedor_id,
    coalesce((p_nfe->>'valor_total')::numeric, 0),
    p_nfe->>'xml_original',
    auth.uid()
  )
  returning id into v_nfe_id;

  for item in select * from jsonb_array_elements(p_itens)
  loop
    select * into produto_row
    from public.produtos
    where id = (item->>'produto_id')::uuid and ativo = true
    for update;

    if not found then raise exception 'Produto da NF-e não vinculado ou inativo.'; end if;

    v_qtd := (item->>'quantidade')::numeric;
    v_custo := coalesce((item->>'valor_unitario')::numeric, 0);
    if v_qtd <= 0 then raise exception 'Quantidade inválida na NF-e.'; end if;

    v_anterior := produto_row.estoque_atual;

    insert into public.nfe_itens(
      nfe_id, produto_id, codigo_fornecedor, descricao, codigo_barras,
      unidade, quantidade, valor_unitario, total
    )
    values (
      v_nfe_id,
      produto_row.id,
      item->>'codigo_fornecedor',
      item->>'descricao',
      nullif(item->>'codigo_barras',''),
      item->>'unidade',
      v_qtd,
      v_custo,
      round(v_qtd * v_custo, 2)
    );

    update public.produtos
    set estoque_atual = estoque_atual + v_qtd,
        custo = v_custo,
        atualizado_em = now()
    where id = produto_row.id;

    insert into public.produto_fornecedor(
      produto_id, fornecedor_id, codigo_fornecedor, descricao_fornecedor, codigo_barras
    )
    values (
      produto_row.id, v_fornecedor_id, item->>'codigo_fornecedor',
      item->>'descricao', nullif(item->>'codigo_barras','')
    )
    on conflict (produto_id, fornecedor_id)
    do update set
      codigo_fornecedor = excluded.codigo_fornecedor,
      descricao_fornecedor = excluded.descricao_fornecedor,
      codigo_barras = excluded.codigo_barras;

    insert into public.movimentacoes_estoque(
      produto_id, tipo, quantidade, estoque_anterior, estoque_posterior,
      origem_tipo, origem_id, usuario_id, observacao
    )
    values (
      produto_row.id, 'entrada_nfe', v_qtd, v_anterior, v_anterior + v_qtd,
      'nfe', v_nfe_id, auth.uid(), 'NF-e ' || (p_nfe->>'numero')
    );
  end loop;

  return v_nfe_id;
exception
  when unique_violation then
    raise exception 'Esta NF-e já foi importada.';
end;
$$;

-- Ajuste manual mantendo rastreabilidade.
create or replace function public.ajustar_estoque(
  p_produto_id uuid,
  p_quantidade numeric,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  produto_row public.produtos%rowtype;
  v_novo numeric(14,3);
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.can_stock() then raise exception 'Usuário sem permissão para ajustar estoque.'; end if;
  if p_quantidade = 0 then raise exception 'Quantidade não pode ser zero.'; end if;
  if length(trim(coalesce(p_motivo,''))) < 3 then raise exception 'Informe o motivo do ajuste.'; end if;

  select * into produto_row
  from public.produtos
  where id = p_produto_id and ativo = true
  for update;

  if not found then raise exception 'Produto não encontrado.'; end if;

  v_novo := produto_row.estoque_atual + p_quantidade;
  if v_novo < 0 then raise exception 'O ajuste deixaria o estoque negativo.'; end if;

  update public.produtos
  set estoque_atual = v_novo, atualizado_em = now()
  where id = p_produto_id;

  insert into public.movimentacoes_estoque(
    produto_id, tipo, quantidade, estoque_anterior, estoque_posterior,
    origem_tipo, usuario_id, observacao
  )
  values (
    p_produto_id, 'ajuste', p_quantidade, produto_row.estoque_atual, v_novo,
    'ajuste_manual', auth.uid(), trim(p_motivo)
  );
end;
$$;

-- RLS
alter table public.perfis enable row level security;
alter table public.categorias enable row level security;
alter table public.fornecedores enable row level security;
alter table public.clientes enable row level security;
alter table public.produtos enable row level security;
alter table public.produto_fornecedor enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.venda_pagamentos enable row level security;
alter table public.nfe_entradas enable row level security;
alter table public.nfe_itens enable row level security;
alter table public.movimentacoes_estoque enable row level security;

drop policy if exists "perfil select own or admin" on public.perfis;
create policy "perfil select own or admin" on public.perfis
for select to authenticated
using (id = auth.uid() or public.current_app_role() = 'admin');

drop policy if exists "categorias read" on public.categorias;
create policy "categorias read" on public.categorias for select to authenticated using (true);
drop policy if exists "categorias stock write" on public.categorias;
create policy "categorias stock write" on public.categorias for all to authenticated
using (public.can_stock()) with check (public.can_stock());

drop policy if exists "fornecedores read" on public.fornecedores;
create policy "fornecedores read" on public.fornecedores for select to authenticated using (true);
drop policy if exists "fornecedores stock write" on public.fornecedores;
create policy "fornecedores stock write" on public.fornecedores for all to authenticated
using (public.can_stock()) with check (public.can_stock());

drop policy if exists "clientes read" on public.clientes;
create policy "clientes read" on public.clientes for select to authenticated using (true);
drop policy if exists "clientes seller write" on public.clientes;
create policy "clientes seller write" on public.clientes for all to authenticated
using (public.current_app_role() in ('admin','vendedor'))
with check (public.current_app_role() in ('admin','vendedor'));

drop policy if exists "produtos read" on public.produtos;
create policy "produtos read" on public.produtos for select to authenticated using (true);
drop policy if exists "produtos stock insert" on public.produtos;
create policy "produtos stock insert" on public.produtos for insert to authenticated
with check (public.can_stock());
drop policy if exists "produtos stock update" on public.produtos;
create policy "produtos stock update" on public.produtos for update to authenticated
using (public.can_stock()) with check (public.can_stock());

drop policy if exists "produto fornecedor read" on public.produto_fornecedor;
create policy "produto fornecedor read" on public.produto_fornecedor for select to authenticated using (true);

drop policy if exists "vendas read" on public.vendas;
create policy "vendas read" on public.vendas for select to authenticated using (true);
drop policy if exists "venda itens read" on public.venda_itens;
create policy "venda itens read" on public.venda_itens for select to authenticated using (true);
drop policy if exists "venda pagamentos read" on public.venda_pagamentos;
create policy "venda pagamentos read" on public.venda_pagamentos for select to authenticated using (true);

drop policy if exists "nfe read" on public.nfe_entradas;
create policy "nfe read" on public.nfe_entradas for select to authenticated using (true);
drop policy if exists "nfe itens read" on public.nfe_itens;
create policy "nfe itens read" on public.nfe_itens for select to authenticated using (true);
drop policy if exists "movimentos read" on public.movimentacoes_estoque;
create policy "movimentos read" on public.movimentacoes_estoque for select to authenticated using (true);

-- Privilégios mínimos no Data API.
revoke all on public.perfis, public.categorias, public.fornecedores, public.clientes,
  public.produtos, public.produto_fornecedor, public.vendas, public.venda_itens,
  public.venda_pagamentos, public.nfe_entradas, public.nfe_itens,
  public.movimentacoes_estoque from anon;

grant select on public.perfis, public.categorias, public.fornecedores, public.clientes,
  public.produtos, public.produto_fornecedor, public.vendas, public.venda_itens,
  public.venda_pagamentos, public.nfe_entradas, public.nfe_itens,
  public.movimentacoes_estoque to authenticated;

grant insert (codigo_interno,codigo_barras,nome,categoria_id,unidade,custo,preco_venda,estoque_minimo,ativo)
  on public.produtos to authenticated;
grant update (codigo_interno,codigo_barras,nome,categoria_id,unidade,custo,preco_venda,estoque_minimo,ativo)
  on public.produtos to authenticated;

grant insert, update on public.categorias, public.fornecedores, public.clientes to authenticated;

grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.finalizar_venda(uuid,numeric,jsonb,jsonb) from public;
revoke all on function public.registrar_entrada_nfe(jsonb,jsonb) from public;
revoke all on function public.ajustar_estoque(uuid,numeric,text) from public;
grant execute on function public.finalizar_venda(uuid,numeric,jsonb,jsonb) to authenticated;
grant execute on function public.registrar_entrada_nfe(jsonb,jsonb) to authenticated;
grant execute on function public.ajustar_estoque(uuid,numeric,text) to authenticated;

-- IMPORTANTE:
-- Depois de criar o primeiro usuário no Authentication > Users,
-- transforme-o em administrador:
--
-- insert into public.perfis(id,nome,role)
-- select id, coalesce(raw_user_meta_data->>'nome', split_part(email,'@',1)), 'admin'
-- from auth.users
-- where email = 'SEU-EMAIL@EXEMPLO.COM'
-- on conflict (id) do update set role='admin';
