// functions/admin/users.js  (substitui functions/api/admin-users.js)
// GET  /admin/users     — lista usuários com pedidos (admin)
// POST /admin/users     — ações: remove_access (admin)

import { requireAdmin, adminSupabase } from '../_lib/middleware/auth.js';
import { listProfiles, syncProfileSubscription } from '../_lib/repositories/profiles.js';
import { cancelSubscription } from '../_lib/repositories/subscriptions.js';
import { logAudit } from '../_lib/repositories/audit.js';
import { sanitizeSearch, isValidUUID, hasJsonContentType, validateEnvVars } from '../_lib/utils/validators.js';
import { ok, err, forbidden, serverError, unavailable, methodNotAllowed } from '../_lib/utils/response.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAIL'];

export async function onRequestGet({ request, env }) {
  const missing = validateEnvVars(env, REQUIRED_ENV);
  if (missing) { console.error(`admin/users: ${missing} ausente`); return unavailable(); }

  const { user, error } = await requireAdmin(request, env);
  if (!user) return forbidden(error);

  const db = adminSupabase(env);
  const url = new URL(request.url);
  const search = sanitizeSearch(url.searchParams.get('q') || '');
  const page   = Math.max(1, parseInt(url.searchParams.get('page') || '1'));

  const { data: profiles, error: profilesError } = await listProfiles(db, {
    search: search || undefined,
    page,
    limit: 100
  });

  if (profilesError) {
    console.error('[admin/users GET]', profilesError);
    return serverError('Não foi possível carregar os perfis.');
  }

  // Pega últimos pedidos por usuário
  const { data: orders } = await db
    .from('payments')
    .select('user_id,status,plan_id,amount,created_at,plans(name)')
    .order('created_at', { ascending: false });

  const latestByUser = new Map();
  (orders || []).forEach(item => {
    if (!latestByUser.has(item.user_id)) latestByUser.set(item.user_id, item);
  });

  const now = Date.now();
  const users = (profiles || []).map(p => {
    const order  = latestByUser.get(p.id);
    const active = !!p.assinante && (!p.assinatura_fim || new Date(p.assinatura_fim).getTime() > now);
    return {
      id:              p.id,
      email:           p.email,
      nome:            p.nome,
      usuario:         p.usuario,
      telegram:        p.telegram,
      assinante:       p.assinante,
      plano:           p.plano,
      assinatura_inicio: p.assinatura_inicio,
      assinatura_fim:  p.assinatura_fim,
      criado_em:       p.criado_em,
      assinante_ativo: active,
      pedido_status:   order?.status ?? null,
      pedido_plano:    order?.plans?.name ?? order?.plan_id ?? null,
      pedido_valor:    order?.amount ?? null,
      pedido_em:       order?.created_at ?? null
    };
  });

  return ok({ users, page });
}

export async function onRequestPost({ request, env }) {
  const missing = validateEnvVars(env, REQUIRED_ENV);
  if (missing) { console.error(`admin/users: ${missing} ausente`); return unavailable(); }

  if (!hasJsonContentType(request)) return err('Formato de requisição inválido.', 415);

  const { user, error } = await requireAdmin(request, env);
  if (!user) return forbidden(error);

  let body = {};
  try { body = await request.json(); } catch (_) { return err('Requisição inválida.'); }

  const userId = String(body.user_id || '').trim();
  const action = String(body.action  || '').trim();

  if (!isValidUUID(userId)) return err('Parâmetros inválidos.');
  if (action !== 'remove_access') return err('Ação não reconhecida.');

  const db = adminSupabase(env);

  // Cancela assinaturas ativas
  await cancelSubscription(db, userId);

  // Sincroniza perfil
  await syncProfileSubscription(db, { userId, subscription: null });

  // Registra auditoria
  await logAudit(db, {
    actorUserId: user.id,
    action: 'access_removed',
    targetType: 'user',
    targetId: userId,
    metadata: { removed_by: user.email }
  });

  return ok({ message: 'Acesso removido.' });
}

export async function onRequest({ request }) {
  if (['GET', 'POST'].includes(request.method)) return;
  return methodNotAllowed('GET, POST');
}
