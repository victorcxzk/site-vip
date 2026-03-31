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

    // Verifica o usuário via token (anon key, lê o JWT)
    const publicClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const userResult = await publicClient.auth.getUser(token);
    const user = userResult.data?.user;
    if (!user?.id) return json({ error: 'Sessão inválida. Faça login novamente.' }, 401);

    // Operações no banco via service role (bypassa RLS)
    const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const body = await request.json().catch(() => ({}));
    const plano = String(body.plano || 'Vitalício').slice(0, 80);
    const valor = Number(body.valor || 5.9);

    // Verifica se já existe pedido pendente ou aprovado
    const { data: existing } = await adminClient
      .from('pedidos_acesso')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pendente', 'aprovado'])
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Retorna ok sem erro — pedido já existe, Telegram vai abrir normalmente
      return json({ ok: true, status: existing.status, duplicated: true });
    }

    // Insere pedido novo
    const { data: inserted, error: insertError } = await adminClient
      .from('pedidos_acesso')
      .insert({ user_id: user.id, plano, valor, status: 'pendente' })
      .select('id, status')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return json({ error: 'Não foi possível registrar seu pedido.' }, 500);
    }

    return json({ ok: true, request: inserted });
  } catch (err) {
    console.error('request-access error:', err);
    return json({ error: 'Não foi possível enviar seu pedido.' }, 500);
  }
}
