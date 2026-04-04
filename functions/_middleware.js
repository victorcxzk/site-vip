// functions/_middleware.js
// Adiciona headers de segurança em todas as respostas do site.
// Roda antes de qualquer function ou asset estático.

export async function onRequest(context) {
  const response = await context.next();
  const headers  = new Headers(response.headers);

  // Evita sniffing de MIME type
  headers.set('X-Content-Type-Options', 'nosniff');

  // Impede o site de ser carregado em iframe de terceiros
  headers.set('X-Frame-Options', 'DENY');

  // Não vazamos a URL de origem ao navegar para sites externos
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissões de hardware desnecessárias bloqueadas
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content Security Policy
  // connect-src: Supabase REST/Auth + websocket de realtime
  // frame-ancestors: reforça X-Frame-Options
  // Telegram é aberto via window.open (navegação), não via fetch/XHR — não precisa em connect-src
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
    status:     response.status,
    statusText: response.statusText,
    headers
  });
}
