// ─────────────────────────────────────────────────────────────
//  Beatriz Lopes Privacy — Configuração do Supabase
//
//  SUPABASE_URL e SUPABASE_ANON_KEY são públicas por design
//  do Supabase — protegidas pelas políticas RLS.
//
//  ⚠️  NUNCA coloque SUPABASE_SERVICE_ROLE_KEY aqui.
//      Ela fica APENAS nas variáveis de ambiente da Cloudflare.
//
//  O link de Admin não é exibido na navbar (segurança).
//  Acesse /admin.html diretamente com sua conta de administrador.
//
//  INSTAGRAM_URL e TELEGRAM_URL centralizam os links de contato.
// ─────────────────────────────────────────────────────────────

window.SUPABASE_URL      = 'https://ezpxrhmyetfbnqqqetpm.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6cHhyaG15ZXRmYm5xcXFldHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjM5MzcsImV4cCI6MjA5MDI5OTkzN30.7jY_z1oN9zAysuvc0sSdcAqrA775jg15pTrnEHt25hE';
// ADMIN_EMAIL_HINT REMOVIDO — nunca expor o e-mail do admin no frontend.
// O link Admin não aparece no nav; acesse /admin.html diretamente.
window.TELEGRAM_USERNAME = 'talespwk';

// URLs de contato — altere aqui para mudar em todo o site
window.INSTAGRAM_URL = 'https://instagram.com/lopes.beeatrizz';
window.TELEGRAM_URL  = 'https://t.me/talespwk';

window.createSupabaseClient = function () {
  if (!window.supabase)          return null;
  if (!window.SUPABASE_URL)      return null;
  if (!window.SUPABASE_ANON_KEY) return null;

  return window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: true
      }
    }
  );
};
