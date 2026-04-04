// _lib/services/payment-service.js
// Regras de negócio para pedidos de pagamento
// Esta camada não conhece HTTP — só lógica e dados

import { approvePayment, rejectPayment, createPayment, getPendingPaymentByUser } from '../repositories/payments.js';
import { createOrRenewSubscription } from '../repositories/subscriptions.js';
import { syncProfileSubscription, getActivePlanById } from '../repositories/profiles.js';
import { logAudit } from '../repositories/audit.js';

/**
 * Aprova um pedido de pagamento.
 * Cria/renova assinatura, sincroniza perfil, registra auditoria.
 * Operação idempotente: falha se já aprovado.
 */
export async function approvePaymentService(db, { paymentId, adminUserId }) {
  // 1. Tenta aprovar atomicamente (só se status === 'pending')
  const { data: payment, error: approveErr, updated } = await approvePayment(db, {
    paymentId,
    adminUserId
  });

  if (approveErr) {
    console.error('[payment-service] approvePayment error:', approveErr);
    return { ok: false, error: 'Erro ao aprovar pedido.' };
  }

  if (!updated || !payment) {
    // Pedido não estava pendente — conflito (já aprovado/recusado)
    return { ok: false, conflict: true, error: 'Pedido já foi processado ou não existe.' };
  }

  // 2. Busca plano ativo para saber duração (rejeita planos desativados)
  const { data: plan } = await getActivePlanById(db, payment.plan_id);
  if (!plan) {
    return { ok: false, error: 'Plano do pedido não está mais ativo. Contate o suporte.' };
  }
  const durationDays = plan?.duration_days ?? 36500; // Padrão: vitalício (~100 anos)
  const planName = plan?.name ?? 'Vitalício';

  // 3. Cria ou renova assinatura
  const { data: subscription, error: subErr } = await createOrRenewSubscription(db, {
    userId: payment.user_id,
    planId: payment.plan_id,
    paymentId: payment.id,
    durationDays
  });

  if (subErr) {
    console.error('[payment-service] subscription error:', subErr);
    // Pedido foi aprovado mas assinatura falhou — registra para investigação
    await logAudit(db, {
      actorUserId: adminUserId,
      action: 'subscription_create_failed',
      targetType: 'payment',
      targetId: paymentId,
      metadata: { error: subErr.message, payment_id: paymentId }
    });
    return { ok: false, error: 'Pedido aprovado mas erro ao criar assinatura. Contate suporte.' };
  }

  // 4. Sincroniza perfil (campo assinante e assinatura_fim)
  await syncProfileSubscription(db, {
    userId: payment.user_id,
    subscription,
    planName
  });

  // 5. Auditoria
  await logAudit(db, {
    actorUserId: adminUserId,
    action: 'payment_approved',
    targetType: 'payment',
    targetId: paymentId,
    oldValue: { status: 'pending' },
    newValue: { status: 'approved', subscription_id: subscription?.id },
    metadata: { plan_name: planName, duration_days: durationDays, user_id: payment.user_id }
  });

  return { ok: true, payment, subscription };
}

/**
 * Recusa um pedido de pagamento.
 * Operação idempotente: falha se já processado.
 */
export async function rejectPaymentService(db, { paymentId, adminUserId, reason }) {
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    return { ok: false, error: 'Motivo da recusa é obrigatório.' };
  }

  const { data: payment, error: rejectErr, updated } = await rejectPayment(db, {
    paymentId,
    adminUserId,
    reason: trimmedReason
  });

  if (rejectErr) {
    console.error('[payment-service] rejectPayment error:', rejectErr);
    return { ok: false, error: 'Erro ao recusar pedido.' };
  }

  if (!updated || !payment) {
    return { ok: false, conflict: true, error: 'Pedido já foi processado ou não existe.' };
  }

  await logAudit(db, {
    actorUserId: adminUserId,
    action: 'payment_rejected',
    targetType: 'payment',
    targetId: paymentId,
    oldValue: { status: 'pending' },
    newValue: { status: 'rejected', reason: trimmedReason },
    metadata: { user_id: payment.user_id }
  });

  return { ok: true, payment };
}

/**
 * Cria um novo pedido de pagamento.
 * Impede duplicata se já houver pedido pendente ou aprovado.
 */
export async function createPaymentService(db, { userId, planId, amount, proofText, notes }) {
  // Verifica duplicata
  const { data: existing, error: checkErr } = await getPendingPaymentByUser(db, userId);

  if (checkErr) {
    console.error('[payment-service] check error:', checkErr);
    return { ok: false, error: 'Não foi possível verificar seu pedido.' };
  }

  if (existing) {
    return { ok: true, payment: existing, duplicated: true };
  }

  const { data: payment, error: insertErr } = await createPayment(db, {
    userId,
    planId,
    amount,
    proofText,
    notes
  });

  if (insertErr) {
    console.error('[payment-service] insert error:', insertErr);
    return { ok: false, error: 'Não foi possível registrar seu pedido.' };
  }

  await logAudit(db, {
    actorUserId: userId,
    action: 'payment_created',
    targetType: 'payment',
    targetId: payment.id,
    newValue: { status: 'pending', plan_id: planId, amount },
    metadata: { plan_id: planId }
  });

  return { ok: true, payment, duplicated: false };
}
