// _lib/middleware/auth.js
// Middleware de autenticação e autorização
// Toda ação sensível passa por aqui antes de chegar no service

import { createClient } from '@supabase/supabase-js';
import { readBearerToken } from '../utils/validators.js';

/**
 * Valida o token JWT e retorna o usuário autenticado via Supabase.
 * Usa anon key para validar o JWT (não bypassa RLS).
 */
export async function requireAuth(request, env) {
  const token = readBearerToken(request);
  if (!token) return { user: null, error: 'Token ausente.' };

  const anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await anonClient.auth.getUser(token);
  const user = data?.user;

  if (error || !user?.id || !user?.email) {
    return { user: null, error: 'Sessão inválida ou expirada. Faça login novamente.' };
  }

  return { user, error: null };
}

/**
 * Valida o token E verifica se o e-mail corresponde ao admin registrado em env.ADMIN_EMAIL.
 * A verificação acontece APENAS no backend — nunca no frontend.
 */
export async function requireAdmin(request, env) {
  if (!env.ADMIN_EMAIL) {
    console.error('[requireAdmin] ADMIN_EMAIL não configurado');
    return { user: null, error: 'Serviço não configurado.' };
  }

  const { user, error } = await requireAuth(request, env);
  if (!user) return { user: null, error: error || 'Acesso negado.' };

  if (user.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) {
    console.warn(`[requireAdmin] Tentativa de acesso admin por: ${user.email}`);
    return { user: null, error: 'Acesso restrito a administradores.' };
  }

  return { user, error: null };
}

/**
 * Cria um cliente Supabase com service_role (usado apenas no backend).
 * NUNCA expor esta função ou chave no frontend.
 */
export function adminSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
