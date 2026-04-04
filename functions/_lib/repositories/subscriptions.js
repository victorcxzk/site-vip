// _lib/repositories/subscriptions.js
// Queries de banco para tabela subscriptions

export async function getActiveSubscription(db, userId) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('expires_at', now)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}

export async function getSubscriptionByUser(db, userId) {
  const { data, error } = await db
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}

export async function createOrRenewSubscription(db, { userId, planId, paymentId, durationDays }) {
  // Usa funcao SQL atomica para evitar race condition TOCTOU.
  // A funcao faz UPDATE + INSERT em uma unica transacao no banco.
  const { data, error } = await db.rpc('renew_or_create_subscription', {
    p_user_id:      userId,
    p_plan_id:      planId,
    p_payment_id:   paymentId,
    p_duration_days: durationDays
  });

  if (error) return { data: null, error };

  // Busca a assinatura criada/atualizada pelo ID retornado
  const { data: sub, error: fetchErr } = await db
    .from('subscriptions')
    .select('*')
    .eq('id', data)
    .single();

  return { data: sub, error: fetchErr };
}

export async function cancelSubscription(db, userId) {
  const { data, error } = await db
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active')
    .select('id');
  return { data, error };
}
