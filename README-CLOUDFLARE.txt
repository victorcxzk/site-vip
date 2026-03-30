PROJETO PRONTO PARA CLOUDFLARE PAGES

1) Antes de subir:
- preencha js/supabase-config.js
- rode supabase/schema.sql no SQL Editor do Supabase

2) Variáveis do Cloudflare Pages / Functions:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ADMIN_EMAIL
- TELEGRAM_USERNAME

3) Estrutura de deploy:
- Como o projeto usa /functions, deploy com Git integration OU Wrangler.
- O upload por arrastar no painel não serve para Functions do Pages.

4) Comandos locais:
- npm install
- npm run dev

5) Deploy com Wrangler:
- npx wrangler login
- npx wrangler pages project create NOME-DO-PROJETO
- npx wrangler pages deploy . --project-name NOME-DO-PROJETO

6) Imagens para trocar:
- img/avatar-photo.svg
- img/hero-cover.svg
- img/site-background.svg
- img/gallery-1.svg
- img/gallery-2.svg
- img/gallery-3.svg
- img/preview.svg

7) Fluxo do botão Assinar:
- registra pedido no banco
- cria registro em pagamentos com status aguardando_contato
- abre link do Telegram
- a assinatura só libera no admin
