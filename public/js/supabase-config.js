window.SUPABASE_URL = 'COLE_AQUI_SUA_SUPABASE_URL';
window.SUPABASE_ANON_KEY = 'COLE_AQUI_SUA_SUPABASE_ANON_KEY';
window.ADMIN_EMAIL_HINT = 'seuemail@exemplo.com';
window.TELEGRAM_USERNAME = 'seuusuario';

window.createSupabaseClient = function createSupabaseClient() {
  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
  return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
};
