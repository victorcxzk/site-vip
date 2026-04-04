// _lib/repositories/payments.js
// Queries de banco para tabela payments (pedidos de pagamento)

export async function getPaymentById(db, id) {
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return { data, error };
}

export async function getPaymentsByUser(db, userId) {
  const { data, error } = await db
    .from('payments')
    .select('id,plan_id,amount,status,proof_url,proof_text,notes,created_at,updated_at,approved_at,rejected_at,rejection_reason')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function getPendingPaymentByUser(db, userId) {
  const { data, error } = await db
    .from('payments')
    .select('id,status')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}

export async function createPayment(db, { userId, planId, amount, proofText, notes }) {
  const { data, error } = await db
    .from('payments')
    .insert({
      user_id: userId,
      plan_id: planId,
      amount,
      status: 'pending',
      proof_text: proofText || null,
      notes: notes || null
    })
    .select('id,status,plan_id,amount,created_at')
    .single();
  return { data, error };
}

export async function approvePayment(db, { paymentId, adminUserId }) {
  const now = new Date().toISOString();
  // Operação atômica: só atualiza se status for exatamente 'pending'
  const { data, error, count } = await db
    .from('payments')
    .update({
      status: 'approved',
      approved_at: now,
      approved_by: adminUserId
    })
    .eq('id', paymentId)
    .eq('status', 'pending') // Idempotência — protege contra dupla aprovação
    .select('*');
  return { data: data?.[0] || null, error, updated: (data?.length || 0) > 0 };
}

export async function rejectPayment(db, { paymentId, adminUserId, reason }) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('payments')
    .update({
      status: 'rejected',
      rejected_at: now,
      rejected_by: adminUserId,
      rejection_reason: reason || null
    })
    .eq('id', paymentId)
    .eq('status', 'pending') // Idempotência — protege contra dupla recusa
    .select('*');
  return { data: data?.[0] || null, error, updated: (data?.length || 0) > 0 };
}

export async function listAllPayments(db, { status, search, page = 1, limit = 50 } = {}) {
  let query = db
    .from('payments')
    .select(`
      id,
      user_id,
      plan_id,
      amount,
      status,
      proof_url,
      proof_text,
      notes,
      created_at,
      approved_at,
      approved_by,
      rejected_at,
      rejected_by,
      rejection_reason,
      perfis!payments_user_id_fkey(email,nome,usuario,telegram),
      plans!payments_plan_id_fkey(name,duration_days)
    `)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq('status', status);
  if (search) {
    const safe = search.replace(/[%_\\]/g, '\\$&');
    query = query.or(`perfis.email.ilike.%${safe}%,perfis.nome.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  return { data, error, count };
}
