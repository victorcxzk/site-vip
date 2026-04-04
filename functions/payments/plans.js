// functions/payments/plans.js
// GET /payments/plans — lista planos ativos (público)

import { adminSupabase } from '../_lib/middleware/auth.js';
import { listPlans } from '../_lib/repositories/profiles.js';
import { validateEnvVars } from '../_lib/utils/validators.js';
import { ok, serverError, unavailable, methodNotAllowed } from '../_lib/utils/response.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

export async function onRequestGet({ env }) {
  const missing = validateEnvVars(env, REQUIRED_ENV);
  if (missing) return unavailable();

  const db = adminSupabase(env);
  const { data, error } = await listPlans(db);

  if (error) {
    console.error('[payments/plans]', error);
    return serverError('Não foi possível carregar os planos.');
  }

  return ok({ plans: data ?? [] });
}

export async function onRequest({ request }) {
  if (request.method === 'GET') return;
  return methodNotAllowed('GET');
}
