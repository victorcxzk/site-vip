import { createClient } from '@supabase/supabase-js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function readToken(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

async function getAuthenticatedUser(request, env) {
  const token = readToken(request);
  if (!token) return null;
  const publicClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const result = await publicClient.auth.getUser(token);
  return result.data.user || null;
}

function endOfLifeDate() {
  return '2099-12-31T23:59:59.000Z';
}

export async function onRequestGet({ request, env }) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ error: 'Sessão inválida.' }, 401);
  if ((user.email || '').toLowerCase() !== (env.ADMIN_EMAIL || '').toLowerCase()) {
    return json({ error: 'Acesso negado.' }, 403);
  }

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  let query = adminClient
    .from('perfis')
    .select('id,email,nome,usuario,assinante,plano,assinatura_inicio,assinatura_fim,criado_em')
    .order('criado_em', { ascending: false })
    .limit(100);

  if (q) query = query.or(`email.ilike.%${q}%,nome.ilike.%${q}%,usuario.ilike.%${q}%`);
  const profiles = await query;
  if (profiles.error) return json({ error: 'Não foi possível carregar os perfis.' }, 500);

  const requests = await adminClient
    .from('pedidos_acesso')
    .select('user_id,status,plano,valor,criado_em')
    .order('criado_em', { ascending: false });

  const latestByUser = new Map();
  (requests.data || []).forEach((item) => {
    if (!latestByUser.has(item.user_id)) latestByUser.set(item.user_id, item);
  });

  const users = (profiles.data || []).map((item) => {
    const order = latestByUser.get(item.id);
    const active = !!item.assinante && (!item.assinatura_fim || new Date(item.assinatura_fim).getTime() > Date.now());
    return {
      ...item,
      pedido_status: order?.status || null,
      pedido_plano: order?.plano || null,
      pedido_valor: order?.valor || null,
      assinante_ativo: active
    };
  });

  return json({ users });
}

export async function onRequestPost({ request, env }) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ error: 'Sessão inválida.' }, 401);
  if ((user.email || '').toLowerCase() !== (env.ADMIN_EMAIL || '').toLowerCase()) {
    return json({ error: 'Acesso negado.' }, 403);
  }

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id || '');
  const action = String(body.action || '');
  if (!userId || !['approve', 'remove'].includes(action)) {
    return json({ error: 'Pedido inválido.' }, 400);
  }

  if (action === 'approve') {
    const now = new Date().toISOString();
    const profileUpdate = await adminClient.from('perfis').update({
      assinante: true,
      plano: 'Vitalício',
      assinatura_inicio: now,
      assinatura_fim: endOfLifeDate(),
      atualizado_em: now
    }).eq('id', userId);
    if (profileUpdate.error) return json({ error: 'Não foi possível liberar o acesso.' }, 500);

    await adminClient.from('pedidos_acesso')
      .update({ status: 'aprovado', atualizado_em: now })
      .eq('user_id', userId)
      .eq('status', 'pendente');

    return json({ ok: true });
  }

  const now = new Date().toISOString();
  const removeUpdate = await adminClient.from('perfis').update({
    assinante: false,
    plano: null,
    assinatura_inicio: null,
    assinatura_fim: null,
    atualizado_em: now
  }).eq('id', userId);
  if (removeUpdate.error) return json({ error: 'Não foi possível remover o acesso.' }, 500);

  await adminClient.from('pedidos_acesso')
    .update({ status: 'cancelado', atualizado_em: now })
    .eq('user_id', userId)
    .eq('status', 'pendente');

  return json({ ok: true });
}
