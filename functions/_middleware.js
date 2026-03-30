export async function onRequest(context) {
  const response = await context.next();
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-Frame-Options', 'DENY');
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
}
