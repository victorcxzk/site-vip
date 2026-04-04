// functions/payments/status.js
// GET /payments/status — retorna pedidos e assinatura do usuário autenticado

import { requireAuth, adminSupabase } from '../_lib/middleware/auth.js';
import { getPaymentsByUser } from '../_lib/repositories/payments.js';
import { getActiveSubscription } from '../_lib/repositories/subscriptions.js';
import { getProfile } from '../_lib/repositories/profiles.js';
import { validateEnvVars } from '../_lib/utils/validators.js';
import { ok, unauthorized, serverError, unavailable, methodNotAllowed } from '../_lib/utils/response.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export async function onRequestGet({ request, env }) {
  try {
    const missing = validateEnvVars(env, REQUIRED_ENV);
    if (missing) return unavailable();

    const { user, error } = await requireAuth(request, env);
    if (!user) return unauthorized(error);

    const db = adminSupabase(env);

    const [{ data: payments }, { data: subscription }, { data: profile }] = await Promise.all([
      getPaymentsByUser(db, user.id),
      getActiveSubscription(db, user.id),
      getProfile(db, user.id)
    ]);

    const now = Date.now();
    const hasActive = subscription
      ? subscription.status === 'active' && new Date(subscription.expires_at).getTime() > now
      : false;

    return ok({
      has_access:   hasActive,
      subscription: subscription ?? null,
      payments:     payments ?? [],
      profile:      profile ?? null
    });

  } catch (e) {
    console.error('[payments/status]', e);
    return serverError();
  }
}

export async function onRequest({ request }) {
  if (request.method === 'GET') return;
  return methodNotAllowed('GET');
}
