// functions/api/admin-users.js
// GET  /api/admin-users         — lista usuários (admin)
// POST /api/admin-users         — aprova ou remove acesso (admin)
//
// Admin é validado pelo e-mail registrado em env.ADMIN_EMAIL (variável privada da Cloudflare).
// Nunca depende de variável pública do frontend.

import { createClient } from '@supabase/supabase-js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

function readToken(request) {
  const header = (request.headers.get('Authorization') || '').trim();
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

// Valida que o solicitante é o admin cadastrado em env.ADMIN_EMAIL
async function getAdminUser(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.ADMIN_EMAIL) return null;

  const token = readToken(request);
  if (!token) return null;

  const anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await anonClient.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.email) return null;

  // Comparação case-insensitive com variável de ambiente privada
  if (user.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return null;

  return user;
}

// GET /api/admin-users
export async function onRequestGet({ request, env }) {
  const admin = await getAdminUser(request, env);
  if (!admin) return json({ error: 'Acesso negado.' }, 403);

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('admin-users: SUPABASE_SERVICE_ROLE_KEY ausente');
    return json({ error: 'Serviço temporariamente indisponível.' }, 503);
  }

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Busca por query opcional
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);

  let query = adminClient
    .from('perfis')
    .select('id,email,nome,usuario,telegram,assinante,plano,assinatura_inicio,assinatura_fim,criado_em')
    .order('criado_em', { ascending: false })
    .limit(200);

  if (q) {
    // ilike para busca parcial — evita wildcards perigosos do usuário
    const safe = q.replace(/[%_]/g, '\\$&');
    query = query.or(`email.ilike.%${safe}%,nome.ilike.%${safe}%,usuario.ilike.%${safe}%`);
  }

  const { data: profiles, error: profilesError } = await query;
  if (profilesError) {
    console.error('admin-users GET profiles error:', profilesError);
    return json({ error: 'Não foi possível carregar os perfis.' }, 500);
  }

  // Pega último pedido de cada usuário para cruzar
  const { data: orders, error: ordersError } = await adminClient
    .from('pedidos_acesso')
    .select('user_id,status,plano,valor,criado_em')
    .order('criado_em', { ascending: false });

  if (ordersError) {
    console.error('admin-users GET orders error:', ordersError);
    // Não fatal — continua sem dados de pedidos
  }

  const latestByUser = new Map();
  (orders || []).forEach((item) => {
    if (!latestByUser.has(item.user_id)) latestByUser.set(item.user_id, item);
  });

  const now = Date.now();
  const users = (profiles || []).map((item) => {
    const order   = latestByUser.get(item.id);
    const active  =
      !!item.assinante &&
      (!item.assinatura_fim || new Date(item.assinatura_fim).getTime() > now);
    return {
      id:              item.id,
      email:           item.email,
      nome:            item.nome,
      usuario:         item.usuario,
      telegram:        item.telegram,
      assinante:       item.assinante,
      plano:           item.plano,
      assinatura_inicio: item.assinatura_inicio,
      assinatura_fim:  item.assinatura_fim,
      criado_em:       item.criado_em,
      pedido_status:   order?.status  ?? null,
      pedido_plano:    order?.plano   ?? null,
      pedido_valor:    order?.valor   ?? null,
      pedido_em:       order?.criado_em ?? null,
      assinante_ativo: active
    };
  });

  return json({ users });
}

// POST /api/admin-users — ações: approve | remove
export async function onRequestPost({ request, env }) {
  const admin = await getAdminUser(request, env);
  if (!admin) return json({ error: 'Acesso negado.' }, 403);

  // Valida Content-Type
  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!ct.includes('application/json')) {
    return json({ error: 'Formato de requisição inválido.' }, 415);
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('admin-users: SUPABASE_SERVICE_ROLE_KEY ausente');
    return json({ error: 'Serviço temporariamente indisponível.' }, 503);
  }

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let body = {};
  try { body = await request.json(); } catch (_) {
    return json({ error: 'Requisição inválida.' }, 400);
  }

  const userId = String(body.user_id || '').trim();
  const action = String(body.action  || '').trim();

  // Valida UUID básico + ação permitida
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return json({ error: 'Parâmetros inválidos.' }, 400);
  }
  if (!['approve', 'remove'].includes(action)) {
    return json({ error: 'Ação não reconhecida.' }, 400);
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    const { error: profileErr } = await adminClient
      .from('perfis')
      .update({
        assinante:         true,
        plano:             'Vitalício',
        assinatura_inicio: now,
        assinatura_fim:    '2099-12-31T23:59:59.000Z',
        atualizado_em:     now
      })
      .eq('id', userId);

    if (profileErr) {
      console.error('admin-users approve profile error:', profileErr);
      return json({ error: 'Não foi possível liberar o acesso.' }, 500);
    }

    // Marca pedidos pendentes como aprovados
    const { error: ordErr } = await adminClient
      .from('pedidos_acesso')
      .update({ status: 'aprovado', atualizado_em: now })
      .eq('user_id', userId)
      .eq('status', 'pendente');

    if (ordErr) {
      // Não é fatal — o perfil já foi atualizado
      console.warn('admin-users approve orders warning:', ordErr);
    }

    return json({ ok: true });
  }

  // action === 'remove'
  const { error: removeErr } = await adminClient
    .from('perfis')
    .update({
      assinante:         false,
      plano:             null,
      assinatura_inicio: null,
      assinatura_fim:    null,
      atualizado_em:     now
    })
    .eq('id', userId);

  if (removeErr) {
    console.error('admin-users remove profile error:', removeErr);
    return json({ error: 'Não foi possível remover o acesso.' }, 500);
  }

  await adminClient
    .from('pedidos_acesso')
    .update({ status: 'cancelado', atualizado_em: now })
    .eq('user_id', userId)
    .eq('status', 'pendente');

  return json({ ok: true });
}

// Qualquer outro método
export async function onRequest({ request }) {
  const method = request.method;
  if (method === 'GET' || method === 'POST') return;
  return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'GET, POST' }
  });
}
