// functions/api/request-access.js
// ROTA LEGADA — mantida para compatibilidade
// O novo endpoint é /payments/request
// Esta rota delega para o novo handler

import { requireAuth, adminSupabase } from '../_lib/middleware/auth.js';
import { createPaymentService } from '../_lib/services/payment-service.js';
import { listPlans } from '../_lib/repositories/profiles.js';
import { hasJsonContentType, safeString, validateEnvVars } from '../_lib/utils/validators.js';
import { ok, err, unauthorized, serverError, unavailable, methodNotAllowed } from '../_lib/utils/response.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export async function onRequestPost({ request, env }) {
  try {
    const missing = validateEnvVars(env, REQUIRED_ENV);
    if (missing) return unavailable();

    if (!hasJsonContentType(request)) return err('Formato de requisição inválido.', 415);

    const { user, error } = await requireAuth(request, env);
    if (!user) return unauthorized(error);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const db = adminSupabase(env);
    const { data: plans } = await listPlans(db);
    const plan = plans?.[0];
    if (!plan) return err('Nenhum plano disponível.');

    const proofText = safeString(body.observacao || body.proof_text, 500);

    const result = await createPaymentService(db, {
      userId:    user.id,
      planId:    plan.id,
      amount:    plan.price,
      proofText,
      notes: null
    });

    if (!result.ok) return serverError(result.error);
    return ok({ ok: true, status: result.payment.status, duplicated: result.duplicated, request: result.payment });

  } catch (e) {
    console.error('[api/request-access]', e);
    return serverError('Não foi possível enviar seu pedido.');
  }
}

export async function onRequest({ request }) {
  if (request.method === 'POST') return;
  return methodNotAllowed('POST');
}
