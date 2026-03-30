import { createClient } from '@supabase/supabase-js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function createClients(env) {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAIL'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);

  return {
    publicClient: createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY),
    adminClient: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  };
}

async function requireAdmin(request, env, publicClient) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data, error } = await publicClient.auth.getUser(token);
  if (error || !data.user) return null;
  const email = String(data.user.email || '').trim().toLowerCase();
  if (email !== String(env.ADMIN_EMAIL || '').trim().toLowerCase()) return null;
  return data.user;
}

async function listUsers(adminClient, searchTerm = '') {
  const [profilesResult, requestsResult, paymentsResult, authUsersResult] = await Promise.all([
    adminClient.from('perfis').select('*').order('criado_em', { ascending: false }),
    adminClient.from('solicitacoes_assinatura').select('*').order('atualizado_em', { ascending: false }),
    adminClient.from('pagamentos').select('*').order('atualizado_em', { ascending: false }),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  if (authUsersResult.error) throw authUsersResult.error;

  const emailMap = new Map((authUsersResult.data.users || []).map((user) => [user.id, user.email || '']));
  const latestRequest = new Map();
  for (const row of requestsResult.data || []) if (!latestRequest.has(row.user_id)) latestRequest.set(row.user_id, row);
  const latestPayment = new Map();
  for (const row of paymentsResult.data || []) if (!latestPayment.has(row.user_id)) latestPayment.set(row.user_id, row);

  const query = searchTerm.trim().toLowerCase();
  return (profilesResult.data || [])
    .map((profile) => {
      const request = latestRequest.get(profile.id) || null;
      const payment = latestPayment.get(profile.id) || null;
      return {
        ...profile,
        email: profile.email || emailMap.get(profile.id) || '',
        request_status: request?.status || null,
        valor_sugerido: request?.valor_sugerido ?? payment?.valor ?? null,
        observacao: request?.observacao || payment?.observacao || null,
        last_payment_status: payment?.status || null
      };
    })
    .filter((profile) => {
      if (!query) return true;
      return [profile.nome, profile.email, profile.usuario, profile.telegram, profile.plano]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
}

function normalizeDate(value, fallbackToEndOfDay = false) {
  if (!value) return null;
  const suffix = fallbackToEndOfDay ? 'T23:59:59.000Z' : 'T00:00:00.000Z';
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function upsertRequest(adminClient, userId, payload) {
  const { data: existing, error: fetchError } = await adminClient
    .from('solicitacoes_assinatura')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing?.id) {
    const { error } = await adminClient.from('solicitacoes_assinatura').update(payload).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await adminClient.from('solicitacoes_assinatura').insert({ user_id: userId, ...payload });
    if (error) throw error;
  }
}

async function activate(adminClient, body) {
  const userId = body.user_id;
  const plan = String(body.plan || 'Mensal VIP').trim();
  const start = normalizeDate(body.start_date) || new Date().toISOString();
  const end = normalizeDate(body.end_date, true);
  const price = Number(body.price || 0) || null;
  const note = String(body.note || '').trim() || null;

  const { error: profileError } = await adminClient.from('perfis').update({
    assinante: true,
    plano: plan,
    assinatura_inicio: start,
    assinatura_fim: end
  }).eq('id', userId);
  if (profileError) throw profileError;

  await upsertRequest(adminClient, userId, {
    plano: plan,
    valor_sugerido: price,
    status: 'aprovada',
    observacao: note
  });

  const { error: paymentError } = await adminClient.from('pagamentos').insert({
    user_id: userId,
    valor: price,
    status: 'aprovado_manual',
    plano: plan,
    referencia: `manual-${Date.now()}`,
    observacao: note
  });
  if (paymentError) throw paymentError;
}

async function deactivate(adminClient, body) {
  const userId = body.user_id;
  const note = String(body.note || '').trim() || null;
  const { error: profileError } = await adminClient.from('perfis').update({
    assinante: false,
    plano: null,
    assinatura_inicio: null,
    assinatura_fim: null
  }).eq('id', userId);
  if (profileError) throw profileError;

  await upsertRequest(adminClient, userId, {
    plano: body.plan || null,
    valor_sugerido: Number(body.price || 0) || null,
    status: 'negada',
    observacao: note
  });

  const { error: paymentError } = await adminClient.from('pagamentos').insert({
    user_id: userId,
    valor: Number(body.price || 0) || null,
    status: 'cancelado_manual',
    plano: body.plan || null,
    referencia: `manual-${Date.now()}`,
    observacao: note
  });
  if (paymentError) throw paymentError;
}

async function markPending(adminClient, body) {
  await upsertRequest(adminClient, body.user_id, {
    plano: body.plan || null,
    valor_sugerido: Number(body.price || 0) || null,
    status: 'pendente',
    observacao: String(body.note || '').trim() || null
  });
}

export async function onRequestGet(context) {
  try {
    const { publicClient, adminClient } = createClients(context.env || {});
    const admin = await requireAdmin(context.request, context.env || {}, publicClient);
    if (!admin) return json({ error: 'Acesso negado.' }, 403);
    const url = new URL(context.request.url);
    const users = await listUsers(adminClient, url.searchParams.get('search') || '');
    return json({ users });
  } catch (error) {
    return json({ error: error.message || 'Erro inesperado.' }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { publicClient, adminClient } = createClients(context.env || {});
    const admin = await requireAdmin(context.request, context.env || {}, publicClient);
    if (!admin) return json({ error: 'Acesso negado.' }, 403);
    const body = await context.request.json().catch(() => ({}));
    if (!body.user_id) return json({ error: 'user_id é obrigatório.' }, 400);

    if (body.action === 'activate_subscription') {
      await activate(adminClient, body);
      return json({ ok: true });
    }
    if (body.action === 'deactivate_subscription') {
      await deactivate(adminClient, body);
      return json({ ok: true });
    }
    if (body.action === 'mark_pending') {
      await markPending(adminClient, body);
      return json({ ok: true });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    return json({ error: error.message || 'Erro inesperado.' }, 500);
  }
}
