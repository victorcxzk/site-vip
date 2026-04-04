// ─────────────────────────────────────────────────────────────
//  Beatriz Lopes Privacy — Configuração do Supabase
//
//  SUPABASE_URL e SUPABASE_ANON_KEY são públicas por design
//  do Supabase — a anon key é protegida pelas políticas de RLS.
//
//  ⚠️  NUNCA coloque SUPABASE_SERVICE_ROLE_KEY aqui.
//      Ela fica APENAS nas variáveis de ambiente da Cloudflare.
//
//  ADMIN_EMAIL_HINT é usado APENAS para esconder/mostrar o link
//  visual de Admin na navbar. A validação real é feita pelo
//  backend comparando com env.ADMIN_EMAIL (variável privada).
// ─────────────────────────────────────────────────────────────

window.SUPABASE_URL      = 'https://ezpxrhmyetfbnqqqetpm.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6cHhyaG15ZXRmYm5xcXFldHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjM5MzcsImV4cCI6MjA5MDI5OTkzN30.7jY_z1oN9zAysuvc0sSdcAqrA775jg15pTrnEHt25hE';
window.ADMIN_EMAIL_HINT  = 'talescxzpx@gmail.com';
window.TELEGRAM_USERNAME = 'talespwk';

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
