// functions/_middleware.js
// Middleware global: headers de segurança, rate limiting básico

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX       = 60;
const RATE_LIMIT_AUTH_MAX  = 10;

function checkRateLimit(ip, path, max) {
  const key  = `${ip}::${path}`;
  const now  = Date.now();
  const slot = rateLimitMap.get(key) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
  if (now > slot.reset) { slot.count = 0; slot.reset = now + RATE_LIMIT_WINDOW_MS; }
  slot.count++;
  rateLimitMap.set(key, slot);
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap) { if (Date.now() > v.reset) rateLimitMap.delete(k); }
  }
  return slot.count <= max;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url  = new URL(request.url);
  const path = url.pathname;
  // Usa apenas CF-Connecting-IP (confiável na Cloudflare).
  // X-Forwarded-For é enviado pelo cliente e pode ser forjado — ignorado.
  const ip = request.headers.get('CF-Connecting-IP') || 'dev-local';

  const isApiRoute = path.startsWith('/admin/') || path.startsWith('/payments/') || path.startsWith('/api/');
  if (isApiRoute) {
    const max = (path.includes('login') || path.includes('reset')) ? RATE_LIMIT_AUTH_MAX : RATE_LIMIT_MAX;
    if (!checkRateLimit(ip, path, max)) {
      return new Response(JSON.stringify({ ok: false, error: 'Muitas requisições. Tente em breve.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
      });
    }
  }

  const response = await next();
  const headers  = new Headers(response.headers);

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com https://*.supabase.co",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'"
    ].join('; ')
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
