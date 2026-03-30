import { createClient } from '@supabase/supabase-js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function getEnv(context) {
  const env = context.env || {};
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);
  return env;
}

function telegramUrl(username, plan) {
  const clean = String(username || '').replace('@', '').trim();
  if (!clean) return null;
  const text = encodeURIComponent(`Olá, quero concluir a assinatura ${plan || ''}`.trim());
  return `https://t.me/${clean}?text=${text}`;
}

async function getViewer(context, env) {
  const auth = context.request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function onRequestPost(context) {
  try {
    const env = getEnv(context);
    const user = await getViewer(context, env);
    if (!user) return json({ error: 'Sessão inválida.' }, 401);

    const body = await context.request.json().catch(() => ({}));
    const plan = String(body.plan || 'Mensal VIP').trim();
    const price = Number(body.price || 0) || null;
    const note = String(body.note || '').trim() || null;

    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const requestPayload = {
      user_id: user.id,
      plano: plan,
      valor_sugerido: price,
      status: 'pendente',
      observacao: note
    };

    const { data: existingRequest } = await admin
      .from('solicitacoes_assinatura')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingRequest?.id) {
      const { error } = await admin
        .from('solicitacoes_assinatura')
        .update(requestPayload)
        .eq('id', existingRequest.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('solicitacoes_assinatura').insert(requestPayload);
      if (error) throw error;
    }

    const { error: paymentError } = await admin.from('pagamentos').insert({
      user_id: user.id,
      valor: price,
      status: 'aguardando_contato',
      plano: plan,
      referencia: `telegram-${Date.now()}`,
      observacao: note
    });
    if (paymentError) throw paymentError;

    return json({
      ok: true,
      telegram_url: telegramUrl(env.TELEGRAM_USERNAME || '', plan)
    });
  } catch (error) {
    return json({ error: error.message || 'Erro inesperado.' }, 500);
  }
}
