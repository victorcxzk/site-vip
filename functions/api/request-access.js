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

export async function onRequestPost({ request, env }) {
  try {
    const token = readToken(request);
    if (!token) return json({ error: 'Faça login para continuar.' }, 401);

    const publicClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const userResult = await publicClient.auth.getUser(token);
    const user = userResult.data.user;
    if (!user) return json({ error: 'Sessão inválida.' }, 401);

    const body = await request.json().catch(() => ({}));
    const plano = String(body.plano || 'Vitalício').slice(0, 80);
    const valor = Number(body.valor || 5.9);

    const existing = await adminClient
      .from('pedidos_acesso')
      .select('id, status')
      .eq('user_id', user.id)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.data && (existing.data.status === 'pendente' || existing.data.status === 'aprovado')) {
      return json({ ok: true, status: existing.data.status, duplicated: true });
    }

    const insert = await adminClient.from('pedidos_acesso').insert({
      user_id: user.id,
      plano,
      valor,
      status: 'pendente'
    }).select('id, status').single();

    if (insert.error) return json({ error: 'Não foi possível guardar seu pedido.' }, 500);
    return json({ ok: true, request: insert.data });
  } catch (error) {
    return json({ error: 'Não foi possível enviar seu pedido.' }, 500);
  }
}
