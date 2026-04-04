// functions/admin/payments.js
// GET  /admin/payments        — lista pedidos com filtros (admin)
// POST /admin/payments/[id]/approve — aprova pedido
// POST /admin/payments/[id]/reject  — recusa pedido

import { requireAdmin, adminSupabase } from '../_lib/middleware/auth.js';
import { approvePaymentService, rejectPaymentService } from '../_lib/services/payment-service.js';
import { listAllPayments, getPaymentById } from '../_lib/repositories/payments.js';
import { sanitizeSearch, isValidUUID, hasJsonContentType, validateEnvVars, ALLOWED_PAYMENT_STATUSES } from '../_lib/utils/validators.js';
import { json, ok, err, forbidden, serverError, unavailable, methodNotAllowed, conflict } from '../_lib/utils/response.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAIL'];

export async function onRequestGet({ request, env }) {
  const missing = validateEnvVars(env, REQUIRED_ENV);
  if (missing) { console.error(`admin/payments: ${missing} ausente`); return unavailable(); }

  const { user, error } = await requireAdmin(request, env);
  if (!user) return forbidden(error);

  const db = adminSupabase(env);
  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || '').trim();
  const search = sanitizeSearch(url.searchParams.get('q') || '');

  // Valida status para prevenir injeção de valor arbitrário
  if (status && !ALLOWED_PAYMENT_STATUSES.includes(status)) {
    return err('Status inválido. Use: ' + ALLOWED_PAYMENT_STATUSES.join(', '));
  }
  const page   = Math.max(1, parseInt(url.searchParams.get('page') || '1'));

  const { data, error: dbErr } = await listAllPayments(db, {
    status: status || undefined,
    search: search || undefined,
    page,
    limit: 50
  });

  if (dbErr) {
    console.error('[admin/payments GET]', dbErr);
    return serverError('Não foi possível carregar os pedidos.');
  }

  // Normaliza resultado para o frontend
  const payments = (data || []).map(p => ({
    id:               p.id,
    user_id:          p.user_id,
    amount:           p.amount,
    status:           p.status,
    proof_url:        p.proof_url,
    proof_text:       p.proof_text,
    notes:            p.notes,
    created_at:       p.created_at,
    approved_at:      p.approved_at,
    approved_by:      p.approved_by,
    rejected_at:      p.rejected_at,
    rejected_by:      p.rejected_by,
    rejection_reason: p.rejection_reason,
    plan_name:        p.plans?.name ?? 'Vitalício',
    plan_duration:    p.plans?.duration_days ?? null,
    user_email:       p.perfis?.email ?? '',
    user_nome:        p.perfis?.nome  ?? '',
    user_usuario:     p.perfis?.usuario ?? '',
    user_telegram:    p.perfis?.telegram ?? ''
  }));

  return ok({ payments, page });
}

export async function onRequestPost({ request, env }) {
  const missing = validateEnvVars(env, REQUIRED_ENV);
  if (missing) { console.error(`admin/payments: ${missing} ausente`); return unavailable(); }

  if (!hasJsonContentType(request)) return err('Formato de requisição inválido.', 415);

  const { user, error } = await requireAdmin(request, env);
  if (!user) return forbidden(error);

  let body = {};
  try { body = await request.json(); } catch (_) { return err('Requisição inválida.'); }

  const action    = String(body.action    || '').trim();
  const paymentId = String(body.payment_id || '').trim();
  const reason    = String(body.reason    || '').trim();

  if (!isValidUUID(paymentId)) return err('ID de pedido inválido.');
  if (!['approve', 'reject'].includes(action)) return err('Ação não reconhecida.');

  const db = adminSupabase(env);

  if (action === 'approve') {
    const result = await approvePaymentService(db, { paymentId, adminUserId: user.id });
    if (result.conflict) return conflict(result.error);
    if (!result.ok) return serverError(result.error);
    return ok({ message: 'Pedido aprovado e acesso liberado.' });
  }

  // action === 'reject'
  if (!reason) return err('Motivo da recusa é obrigatório.');
  const result = await rejectPaymentService(db, { paymentId, adminUserId: user.id, reason });
  if (result.conflict) return conflict(result.error);
  if (!result.ok) return serverError(result.error);
  return ok({ message: 'Pedido recusado.' });
}

export async function onRequest({ request }) {
  if (['GET', 'POST'].includes(request.method)) return;
  return methodNotAllowed('GET, POST');
}
