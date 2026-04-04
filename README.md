# Beatriz Lopes Privacy — v2.0

Sistema de conteúdo exclusivo com pagamento manual confirmado pelo admin.

---

## Arquitetura

```
/functions
  _middleware.js              ← Headers de segurança + rate limiting global
  _lib/
    middleware/auth.js        ← requireAuth(), requireAdmin(), adminSupabase()
    services/payment-service.js ← Regras de negócio: aprovar, recusar, criar pedido
    repositories/
      payments.js             ← Queries na tabela payments
      subscriptions.js        ← Queries na tabela subscriptions
      profiles.js             ← Queries em perfis e plans
      audit.js                ← Registro de auditoria
    utils/
      response.js             ← Respostas JSON padronizadas
      validators.js           ← Validação de UUID, sanitização, etc.
  admin/
    payments.js               ← GET/POST /admin/payments (lista, aprova, recusa)
    users.js                  ← GET/POST /admin/users (lista usuários, remove acesso)
  payments/
    request.js                ← POST /payments/request (cria pedido)
    status.js                 ← GET  /payments/status (status do usuário)
    plans.js                  ← GET  /payments/plans (planos disponíveis)
  api/
    admin-users.js            ← LEGADO: mantido para compatibilidade
    request-access.js         ← LEGADO: mantido para compatibilidade
/public
  index.html, login.html, criar-conta.html
  assinar.html                ← Página de planos com estados: sem pedido / pendente / recusado
  conteudo.html               ← Área protegida com verificação backend obrigatória
  minha-conta.html            ← Perfil + histórico de pedidos
  admin.html                  ← Painel admin: lista, aprova, recusa pedidos
  js/supabase-config.js       ← Config pública (SUPABASE_URL, ANON_KEY, contatos)
  js/app.js                   ← Toda lógica de frontend
  css/style.css               ← Estilos
/supabase
  schema.sql                  ← Schema idempotente (rodar no Supabase SQL Editor)
```

---

## Deploy

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor** e execute o arquivo `supabase/schema.sql` inteiro
3. Ative **Realtime** para as tabelas `perfis`, `subscriptions` e `payments`:
   - Supabase Dashboard → Database → Replication → habilite as tabelas

### 2. Cloudflare Pages

1. Conecte o repositório no Cloudflare Pages
2. Configure **Build**:
   - Framework preset: None
   - Build command: *(vazio)*
   - Build output directory: `public`
3. Configure as **variáveis de ambiente** (Settings → Environment variables):

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase (ex: `https://xxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Chave anon/pública do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role (**secreta** — nunca expor no frontend) |
| `ADMIN_EMAIL` | E-mail do admin (**secreta** — validação real no backend) |

### 3. Frontend

Edite `public/js/supabase-config.js` e atualize:
- `SUPABASE_URL` — URL do seu projeto Supabase
- `SUPABASE_ANON_KEY` — chave anon do Supabase
- `ADMIN_EMAIL_HINT` — e-mail admin (apenas controle visual do link no menu)
- `TELEGRAM_USERNAME` — seu @username do Telegram
- `INSTAGRAM_URL` — seu link do Instagram

---

## Fluxo de pagamento

```
Usuário → /assinar.html → clica "Quero acesso"
  → POST /payments/request  (cria pedido status=pending)
  → Telegram abre com mensagem pré-preenchida
  → Usuário manda comprovante no Telegram

Admin → /admin.html → vê pedido pendente
  → Clica "Aprovar"
  → POST /admin/payments {action: "approve", payment_id: "..."}
  → Backend valida admin (env.ADMIN_EMAIL)
  → payments.status = approved (atômico — só se ainda pending)
  → subscriptions criada/renovada
  → perfis.assinante = true
  → audit_logs registrado
  → Realtime notifica frontend do usuário instantaneamente

Usuário → conteudo.html → acesso liberado sem refresh
```

---

## Segurança

- **Admin validado no backend** via `env.ADMIN_EMAIL` (variável privada da Cloudflare)
- **RLS** em todas as tabelas — usuário só vê os próprios dados
- **Service role** usada apenas no backend (nunca exposta ao frontend)
- **Idempotência** — aprovação só funciona se status for exatamente `pending`
- **Fail-safe** — qualquer erro na validação nega acesso (fail closed)
- **Rate limiting** — 60 req/min geral, 10 req/min em rotas de auth
- **Proteção de conteúdo real** — validação via backend, não só CSS
- **Auditoria** — toda ação admin registrada em `audit_logs`
- **Sanitização** — inputs escapados, UUIDs validados, ilike protegido

---

## Variáveis de ambiente necessárias

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  ← NUNCA expor no frontend
ADMIN_EMAIL=seu@email.com         ← NUNCA expor no frontend
```

---

## Realtime

Para o Realtime funcionar (liberação instantânea após aprovação):

1. Supabase Dashboard → Database → Replication
2. Ative as tabelas: `perfis`, `subscriptions`, `payments`
3. O frontend escuta via `supabase.channel()` — implementado em `app.js`
4. Fail-safe: se o canal cair, o sistema revalida via backend a cada 5s

---

## Cenários testados

| Cenário | Resultado esperado |
|---|---|
| Usuário comum tenta aprovar pedido | 403 Forbidden |
| Admin aprova pedido pendente | OK — assinatura criada |
| Admin aprova pedido já aprovado | 409 Conflict |
| Admin recusa sem motivo | 400 Bad Request |
| Assinatura ativa | Acesso liberado |
| Assinatura expirada | Acesso bloqueado |
| Backend indisponível | Fail closed — acesso negado |
| Realtime cai | Revalida via backend em 5s |
