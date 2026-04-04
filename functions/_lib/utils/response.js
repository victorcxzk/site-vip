// _lib/utils/response.js
// Respostas JSON padronizadas para todas as rotas

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

export function ok(data = {}) {
  return json({ ok: true, ...data });
}

export function err(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

export function unauthorized(msg = 'Acesso negado.') {
  return err(msg, 401);
}

export function forbidden(msg = 'Sem permissão para esta ação.') {
  return err(msg, 403);
}

export function notFound(msg = 'Recurso não encontrado.') {
  return err(msg, 404);
}

export function conflict(msg = 'Conflito: operação já realizada.') {
  return err(msg, 409);
}

export function serverError(msg = 'Erro interno. Tente novamente.') {
  return err(msg, 500);
}

export function unavailable(msg = 'Serviço temporariamente indisponível.') {
  return err(msg, 503);
}

export function methodNotAllowed(allow = 'GET, POST') {
  return new Response(JSON.stringify({ ok: false, error: 'Método não permitido.' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      Allow: allow
    }
  });
}
