// ─────────────────────────────────────────────────────────────
//  Beatriz Lopes Privacy — Configuração do Supabase
//
//  COMO PREENCHER:
//  1. Acesse https://supabase.com → seu projeto → Settings → API
//  2. Copie "Project URL"  e cole em SUPABASE_URL
//  3. Copie "anon public"  e cole em SUPABASE_ANON_KEY
//  4. Em ADMIN_EMAIL_HINT coloque o e-mail da conta admin
//     (usado só pra esconder/mostrar o link de Admin na nav)
//  5. Em TELEGRAM_USERNAME coloque o @ do Telegram (sem @)
//
//  ⚠️  Nunca coloque a SERVICE_ROLE_KEY aqui.
//      Ela fica APENAS nas variáveis de ambiente da Cloudflare.
// ─────────────────────────────────────────────────────────────

window.SUPABASE_URL      = 'https://ezpxrhmyetfbnqqqetpm.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6cHhyaG15ZXRmYm5xcXFldHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjM5MzcsImV4cCI6MjA5MDI5OTkzN30.7jY_z1oN9zAysuvc0sSdcAqrA775jg15pTrnEHt25hE';
window.ADMIN_EMAIL_HINT  = 'talescxzpx@gmail.com';
window.TELEGRAM_USERNAME = 'talespwk';

window.createSupabaseClient = function createSupabaseClient() {
  if (!window.supabase)           return null;
  if (!window.SUPABASE_URL)       return null;
  if (!window.SUPABASE_ANON_KEY)  return null;

  return window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession:    true,
        autoRefreshToken:  true,
        detectSessionInUrl: true
      }
    }
  );
};
