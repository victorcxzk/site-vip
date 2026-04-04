// functions/payments/request.js  (substitui functions/api/request-access.js)
// POST /payments/request — cria pedido de pagamento para o usuário autenticado

import { requireAuth, adminSupabase } from '../_lib/middleware/auth.js';
import { createPaymentService } from '../_lib/services/payment-service.js';
import { getPlanById, listPlans } from '../_lib/repositories/profiles.js';
import { hasJsonContentType, isValidUUID, safeString, safeNumber, validateEnvVars } from '../_lib/utils/validators.js';
import { ok, err, unauthorized, serverError, unavailable, methodNotAllowed } from '../_lib/utils/response.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export async function onRequestPost({ request, env }) {
  try {
    const missing = validateEnvVars(env, REQUIRED_ENV);
    if (missing) { console.error(`payments/request: ${missing} ausente`); return unavailable(); }

    if (!hasJsonContentType(request)) return err('Formato de requisição inválido.', 415);

    const { user, error } = await requireAuth(request, env);
    if (!user) return unauthorized(error);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const db = adminSupabase(env);

    // Valida plan_id ou usa o primeiro plano ativo
    let planId   = safeString(body.plan_id, 36);
    let amount   = safeNumber(body.amount, 0, 9999.99);
    let planData = null;

    if (planId && isValidUUID(planId)) {
      const { data } = await getPlanById(db, planId);
      planData = data;
    }

    if (!planData) {
      // Fallback: usa primeiro plano ativo
      const { data: plans } = await listPlans(db);
      planData = plans?.[0] ?? null;
    }

    if (!planData) {
      return err('Nenhum plano disponível no momento.');
    }

    planId = planData.id;
    // Usa preço do plano — não aceita valor arbitrário do cliente
    amount = planData.price;

    const proofText = safeString(body.proof_text || body.observacao, 500);
    const notes     = safeString(body.notes, 500);

    const result = await createPaymentService(db, {
      userId: user.id,
      planId,
      amount,
      proofText,
      notes
    });

    if (!result.ok) return serverError(result.error);

    return ok({
      payment:    result.payment,
      duplicated: result.duplicated,
      plan:       { id: planData.id, name: planData.name, price: planData.price }
    });

  } catch (e) {
    console.error('[payments/request] unexpected:', e);
    return serverError('Não foi possível enviar seu pedido.');
  }
}

export async function onRequest({ request }) {
  if (request.method === 'POST') return;
  return methodNotAllowed('POST');
}
