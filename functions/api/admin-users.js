// functions/api/admin-users.js
// ROTA LEGADA — mantida para compatibilidade com frontend antigo
// Novas rotas: GET/POST /admin/users e GET/POST /admin/payments

import { requireAdmin, adminSupabase } from '../_lib/middleware/auth.js';
import { listProfiles } from '../_lib/repositories/profiles.js';
import { approvePaymentService } from '../_lib/services/payment-service.js';
import { cancelSubscription } from '../_lib/repositories/subscriptions.js';
import { syncProfileSubscription, listPlans } from '../_lib/repositories/profiles.js';
import { sanitizeSearch, isValidUUID, hasJsonContentType, validateEnvVars } from '../_lib/utils/validators.js';
import { ok, err, forbidden, serverError, unavailable, methodNotAllowed } from '../_lib/utils/response.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAIL'];

export async function onRequestGet({ request, env }) {
  const missing = validateEnvVars(env, REQUIRED_ENV);
  if (missing) return unavailable();

  const { user, error } = await requireAdmin(request, env);
  if (!user) return forbidden(error);

  const db = adminSupabase(env);
  const q  = sanitizeSearch(new URL(request.url).searchParams.get('q') || '');

  const { data: profiles, error: profilesError } = await listProfiles(db, { search: q || undefined });
  if (profilesError) return serverError('Não foi possível carregar os perfis.');

  const { data: orders } = await db
    .from('payments')
    .select('user_id,status,plan_id,amount,created_at')
    .order('created_at', { ascending: false });

  const latestByUser = new Map();
  (orders || []).forEach(item => { if (!latestByUser.has(item.user_id)) latestByUser.set(item.user_id, item); });

  const now = Date.now();
  const users = (profiles || []).map(p => {
    const order  = latestByUser.get(p.id);
    const active = !!p.assinante && (!p.assinatura_fim || new Date(p.assinatura_fim).getTime() > now);
    return {
      id: p.id, email: p.email, nome: p.nome, usuario: p.usuario, telegram: p.telegram,
      assinante: p.assinante, plano: p.plano,
      assinatura_inicio: p.assinatura_inicio, assinatura_fim: p.assinatura_fim,
      criado_em: p.criado_em, assinante_ativo: active,
      pedido_status: order?.status ?? null,
      pedido_plano: order?.plan_id ?? null,
      pedido_valor: order?.amount ?? null,
      pedido_em: order?.created_at ?? null
    };
  });

  return ok({ users });
}

export async function onRequestPost({ request, env }) {
  const missing = validateEnvVars(env, REQUIRED_ENV);
  if (missing) return unavailable();

  if (!hasJsonContentType(request)) return err('Formato de requisição inválido.', 415);

  const { user, error } = await requireAdmin(request, env);
  if (!user) return forbidden(error);

  let body = {};
  try { body = await request.json(); } catch (_) { return err('Requisição inválida.'); }

  const userId = String(body.user_id || '').trim();
  const action = String(body.action  || '').trim();

  if (!isValidUUID(userId)) return err('Parâmetros inválidos.');
  if (!['approve', 'remove'].includes(action)) return err('Ação não reconhecida.');

  const db = adminSupabase(env);

  if (action === 'approve') {
    // Busca o último pedido pendente deste usuário
    const { data: pendingPayments } = await db
      .from('payments')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (pendingPayments && pendingPayments.length > 0) {
      const result = await approvePaymentService(db, { paymentId: pendingPayments[0].id, adminUserId: user.id });
      if (!result.ok && !result.conflict) return serverError(result.error);
    } else {
      // Sem pedido pendente — aprova diretamente no perfil (fallback legado)
      const { data: plans } = await listPlans(db);
      const plan = plans?.[0];
      const now = new Date().toISOString();
      const expiresAt = plan ? new Date(Date.now() + plan.duration_days * 86400000).toISOString() : '2099-12-31T23:59:59.000Z';
      await db.from('perfis').update({
        assinante: true, plano: plan?.name ?? 'Vitalício',
        assinatura_inicio: now, assinatura_fim: expiresAt, atualizado_em: now
      }).eq('id', userId);
    }
    return ok({});
  }

  // action === 'remove'
  await cancelSubscription(db, userId);
  await syncProfileSubscription(db, { userId, subscription: null });
  return ok({});
}

export async function onRequest({ request }) {
  if (['GET', 'POST'].includes(request.method)) return;
  return methodNotAllowed('GET, POST');
}
