// _lib/repositories/audit.js
// Acesso ao banco para registros de auditoria

/**
 * Registra uma ação de auditoria.
 * Nunca lança erro — auditoria falha silenciosamente para não bloquear operações.
 */
export async function logAudit(db, {
  actorUserId,
  action,
  targetType,
  targetId,
  oldValue = null,
  newValue = null,
  metadata = null
}) {
  try {
    const { error } = await db.from('audit_logs').insert({
      actor_user_id: actorUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: newValue ? JSON.stringify(newValue) : null,
      metadata: metadata ? JSON.stringify(metadata) : null
    });
    if (error) console.warn('[audit] falha ao registrar:', error.message);
  } catch (e) {
    console.warn('[audit] exceção ao registrar:', e);
  }
}
