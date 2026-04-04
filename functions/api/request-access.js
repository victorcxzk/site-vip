// functions/api/request-access.js
// POST /api/request-access
// Registra pedido de acesso do usuário autenticado.
// Validações: token JWT real, user_id do token (nunca do body), anti-duplicata.

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

// Apenas POST é permitido nesta rota
export async function onRequestPost({ request, env }) {
  try {
    // 1. Variáveis de ambiente obrigatórias
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('request-access: variáveis de ambiente ausentes');
      return json({ error: 'Serviço temporariamente indisponível.' }, 503);
    }

    // 2. Lê e valida token
    const token = readToken(request);
    if (!token) return json({ error: 'Faça login para continuar.' }, 401);

    // 3. Valida Content-Type
    const ct = (request.headers.get('Content-Type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return json({ error: 'Formato de requisição inválido.' }, 415);
    }

    // 4. Verifica o usuário via anon key (valida o JWT sem bypassar RLS)
    const anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user?.id) {
      return json({ error: 'Sessão expirada. Faça login novamente.' }, 401);
    }

    // 5. Operações no banco via service role (bypassa RLS — seguro no servidor)
    const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 6. Lê e saneia body — user_id vem SEMPRE do token, nunca do body
    let body = {};
    try { body = await request.json(); } catch (_) { /* body opcional */ }
    const plano = String(body.plano || 'Vitalício').trim().slice(0, 80);
    const valor = Math.max(0, Math.min(Number(body.valor || 5.9), 9999.99));

    // 7. Verifica pedido existente (pendente ou aprovado)
    const { data: existing, error: checkError } = await adminClient
      .from('pedidos_acesso')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pendente', 'aprovado'])
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.error('request-access check error:', checkError);
      return json({ error: 'Não foi possível verificar seu pedido.' }, 500);
    }

    if (existing) {
      // Pedido já existe — retorna sucesso sem criar duplicata
      // O frontend vai abrir o Telegram normalmente
      return json({ ok: true, status: existing.status, duplicated: true });
    }

    // 8. Insere pedido novo
    const { data: inserted, error: insertError } = await adminClient
      .from('pedidos_acesso')
      .insert({ user_id: user.id, plano, valor, status: 'pendente' })
      .select('id, status')
      .single();

    if (insertError) {
      console.error('request-access insert error:', insertError);
      return json({ error: 'Não foi possível registrar seu pedido. Tente novamente.' }, 500);
    }

    return json({ ok: true, request: inserted });

  } catch (err) {
    console.error('request-access unexpected error:', err);
    return json({ error: 'Não foi possível enviar seu pedido.' }, 500);
  }
}

// Qualquer outro método retorna 405
export async function onRequest({ request }) {
  if (request.method === 'POST') return; // já tratado acima
  return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' }
  });
}
