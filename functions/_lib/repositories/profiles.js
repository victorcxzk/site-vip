// _lib/repositories/profiles.js
// Queries de banco para tabela perfis e plans

export async function getProfile(db, userId) {
  const { data, error } = await db
    .from('perfis')
    .select('id,email,nome,usuario,telegram,bio,assinante,plano,assinatura_inicio,assinatura_fim,criado_em')
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
}

export async function listProfiles(db, { search, page = 1, limit = 100 } = {}) {
  let query = db
    .from('perfis')
    .select('id,email,nome,usuario,telegram,assinante,plano,assinatura_inicio,assinatura_fim,criado_em')
    .order('criado_em', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (search) {
    const safe = search.replace(/[%_\\]/g, '\\$&');
    query = query.or(`email.ilike.%${safe}%,nome.ilike.%${safe}%,usuario.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  return { data, error };
}

export async function syncProfileSubscription(db, { userId, subscription, planName }) {
  const payload = subscription
    ? {
        assinante: true,
        plano: planName || 'Vitalício',
        assinatura_inicio: subscription.started_at,
        assinatura_fim: subscription.expires_at,
        atualizado_em: new Date().toISOString()
      }
    : {
        assinante: false,
        plano: null,
        assinatura_inicio: null,
        assinatura_fim: null,
        atualizado_em: new Date().toISOString()
      };

  const { error } = await db.from('perfis').update(payload).eq('id', userId);
  return { error };
}

// ─── Plans ───────────────────────────────────────────────────

export async function listPlans(db) {
  const { data, error } = await db
    .from('plans')
    .select('id,name,duration_days,price,is_active')
    .eq('is_active', true)
    .order('price');
  return { data, error };
}

export async function getPlanById(db, planId) {
  const { data, error } = await db
    .from('plans')
    .select('id,name,duration_days,price,is_active')
    .eq('id', planId)
    .maybeSingle();
  return { data, error };
}

// Versão que exige plano ativo — usada na aprovação de pedidos
export async function getActivePlanById(db, planId) {
  const { data, error } = await db
    .from('plans')
    .select('id,name,duration_days,price,is_active')
    .eq('id', planId)
    .eq('is_active', true)
    .maybeSingle();
  return { data, error };
}
