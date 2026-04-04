// _lib/utils/validators.js
// Funções de validação e sanitização reutilizáveis

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function sanitizeSearch(q) {
  // Escapa % e _ para evitar injeção em queries ILIKE
  return String(q || '').trim().slice(0, 100).replace(/[%_\\]/g, '\\$&');
}

export function safeString(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen);
}

export function safeNumber(value, min = 0, max = 99999.99) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function readBearerToken(request) {
  const header = (request.headers.get('Authorization') || '').trim();
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

export function hasJsonContentType(request) {
  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  return ct.includes('application/json');
}

export function validateEnvVars(env, required = []) {
  for (const key of required) {
    if (!env[key]) return key;
  }
  return null;
}

export const ALLOWED_PAYMENT_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'canceled'];
export const ALLOWED_SUBSCRIPTION_STATUSES = ['active', 'expired', 'canceled'];
