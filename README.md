# Polar Distribuidora

MVP web para controle de estoque, vendas, importação de XML de NF-e e relatório diário.

## O que já está implementado

- Login com Supabase Auth.
- Perfis: `admin`, `estoquista`, `vendedor`, `consulta`.
- Dashboard.
- Cadastro e pesquisa de produtos.
- Pesquisa por código interno, nome e código de barras.
- Leitura de código de barras pela câmera usando ZXing.
- Compatível com leitor USB de código de barras (entrada como teclado).
- Venda com baixa automática de estoque.
- Pagamento: Pix, dinheiro, débito, crédito ou prazo.
- Histórico de movimentações.
- Ajuste manual de estoque com motivo.
- Importação de XML de NF-e de entrada.
- Reconhecimento de item da NF-e por EAN/GTIN.
- Proteção contra importação duplicada pela chave da NF-e.
- Relatório diário de vendas.
- Impressão/PDF pelo navegador.
- Exportação CSV.
- Deploy automático no GitHub Pages.

## 1. Criar o projeto Supabase

No Supabase, abra **SQL Editor** e execute:

`supabase/schema.sql`

Depois vá em **Authentication > Users** e crie o primeiro usuário.

Em seguida rode no SQL Editor, trocando o e-mail:

```sql
insert into public.perfis(id,nome,role)
select id, coalesce(raw_user_meta_data->>'nome', split_part(email,'@',1)), 'admin'
from auth.users
where email = 'SEU-EMAIL@EXEMPLO.COM'
on conflict (id) do update set role='admin';
```

## 2. Configurar o frontend local

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

No Windows:

```cmd
copy .env.example .env
```

Edite:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON
```

Use apenas a chave pública/anon no frontend. Nunca use `service_role` no GitHub Pages.

## 3. Rodar

```bash
npm install
npm run dev
```

## 4. GitHub Pages

No repositório GitHub:

1. **Settings > Secrets and variables > Actions > Variables**
   - crie `VITE_SUPABASE_URL`

2. **Settings > Secrets and variables > Actions > Secrets**
   - crie `VITE_SUPABASE_ANON_KEY`

3. **Settings > Pages**
   - em Source escolha **GitHub Actions**.

4. Faça push para `main`.

O workflow `.github/workflows/deploy-pages.yml` fará o build e publicará.

## Código de barras

### Leitor USB
A maioria dos leitores USB funciona como teclado. Na tela **Vendas**, deixe o campo de busca selecionado e bipe o produto. Se o leitor enviar `Enter`, o produto é adicionado automaticamente.

### Câmera
Clique em **Câmera** ou **Ler código**. O GitHub Pages usa HTTPS, requisito normal dos navegadores para liberar câmera.

O sistema usa `@zxing/browser` com leitor multi-formato 1D/2D.

## Importação NF-e

A tela **Importar NF-e** lê os principais campos do XML:
- chave
- número
- série
- emissão
- CNPJ / razão social do emitente
- valor total
- `cProd`
- `xProd`
- `cEAN` / `cEANTrib`
- unidade
- quantidade
- valor unitário

O sistema tenta vincular automaticamente o item ao produto Polar pelo EAN/GTIN e, como fallback, pelo código interno.

Antes de confirmar a entrada, todos os itens precisam estar vinculados a um produto existente.

## Segurança importante

A baixa de estoque da venda e a entrada de NF-e são feitas por funções PostgreSQL transacionais (`RPC`) no Supabase. O frontend não altera `estoque_atual` diretamente.

O SQL também habilita RLS e limita permissões por perfil.

## Próximas melhorias recomendadas

- Cadastro de clientes na interface.
- Cancelamento de venda com estorno automático.
- Inventário completo por sessão de contagem.
- Múltiplas formas de pagamento na mesma venda.
- Contas a receber para vendas a prazo.
- Lotes e validade.
- Relatório de margem/lucro.
- Gestão de usuários dentro do sistema.
- Armazenar XML original em bucket privado do Supabase Storage.

## Impressão de cupom não fiscal (impressora térmica)

A tela **Vendas** possui impressão de cupom não fiscal para bobinas de **80 mm** e **58 mm**.

1. Instale a impressora térmica no Windows normalmente (USB, rede ou compartilhada).
2. No driver da impressora, configure a largura da bobina usada (80 mm ou 58 mm).
3. Na tela **Vendas > Cupom não fiscal**, selecione a mesma largura.
4. Deixe **Imprimir ao finalizar a venda** marcado para abrir a impressão após cada venda.
5. No primeiro cupom, selecione a impressora térmica no diálogo do navegador e ajuste margens para "Nenhuma"/"Mínimas" e escala 100%, se necessário.
6. O botão **Reimprimir última venda** permite imprimir novamente o último cupom salvo neste navegador.

O cupom mostra "CUPOM NÃO FISCAL" e "DOCUMENTO SEM VALOR FISCAL" e não substitui NFC-e/NF-e.

### Limitação do GitHub Pages/navegador

Por segurança, um site hospedado no GitHub Pages não pode selecionar uma impressora local e imprimir silenciosamente sem autorização do navegador. O modo incluído abre o diálogo de impressão do sistema. Para impressão direta/automática ESC/POS sem diálogo, é necessário um componente local adicional, como um agente de impressão no computador (por exemplo, QZ Tray) ou integração específica com o SDK do fabricante da maquininha/impressora.
