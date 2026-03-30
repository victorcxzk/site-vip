const sb = window.sb;

function byId(id) { return document.getElementById(id); }
function qs(sel, el = document) { return el.querySelector(sel); }
function qsa(sel, el = document) { return [...el.querySelectorAll(sel)]; }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateBR(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function money(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return 'R$ 0,00';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showFlash(type, text) {
  const boxes = qsa('.flash');
  boxes.forEach((box) => {
    box.textContent = '';
    box.classList.remove('show', 'flash-error', 'flash-success');
  });
  if (!text) return;
  const box = qs('[data-flash]');
  if (!box) return;
  box.textContent = text;
  box.classList.add('show', type === 'error' ? 'flash-error' : 'flash-success');
}

function setInlineMessage(target, type, text) {
  if (!target) return;
  target.textContent = text || '';
  target.className = `inline-message ${type || ''}`.trim();
}

function requireSupabase() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || String(window.SUPABASE_URL).includes('COLE_AQUI') || String(window.SUPABASE_ANON_KEY).includes('COLE_AQUI')) {
    throw new Error('Configure js/supabase-config.js antes de usar o site.');
  }
}

function getTelegramUrl(planName) {
  const username = String(window.TELEGRAM_USERNAME || '').replace('@', '').trim();
  if (!username) return '';
  const text = encodeURIComponent(`Olá, quero concluir a assinatura ${planName || ''}`.trim());
  return `https://t.me/${username}?text=${text}`;
}

function hasActiveSubscription(profile) {
  if (!profile?.assinante) return false;
  if (!profile?.assinatura_fim) return true;
  const end = new Date(profile.assinatura_fim);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

function isAdminEmail(email) {
  const admin = String(window.ADMIN_EMAIL_HINT || '').trim().toLowerCase();
  return !!email && !!admin && String(email).trim().toLowerCase() === admin;
}

function toggleMobileMenu(force) {
  const menu = qs('[data-mobile-menu]');
  const button = qs('[data-mobile-toggle]');
  if (!menu || !button) return;
  const next = typeof force === 'boolean' ? force : menu.dataset.open !== 'true';
  menu.dataset.open = String(next);
  button.setAttribute('aria-expanded', String(next));
  document.body.classList.toggle('menu-open', next);
}

async function getSession() {
  requireSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) return null;
  return data.session || null;
}

async function getUser() {
  const { data, error } = await sb.auth.getUser();
  if (error) return null;
  return data.user || null;
}

async function getProfile(userId) {
  if (!userId) return null;
  const { data, error } = await sb
    .from('perfis')
    .select('id, email, nome, usuario, telegram, bio, avatar_url, assinante, plano, assinatura_inicio, assinatura_fim, criado_em, atualizado_em')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function refreshNavigation() {
  const session = await getSession();
  const user = session?.user || null;
  const profile = user ? await getProfile(user.id) : null;
  const signed = hasActiveSubscription(profile);
  const admin = isAdminEmail(user?.email || '');

  qsa('[data-guest-only]').forEach((el) => {
    el.hidden = !!user;
    el.classList.toggle('is-hidden', !!user);
  });

  qsa('[data-auth-only]').forEach((el) => {
    el.hidden = !user;
    el.classList.toggle('is-hidden', !user);
  });

  qsa('[data-admin-only]').forEach((el) => {
    el.hidden = !admin;
    el.classList.toggle('is-hidden', !admin);
  });

  qsa('[data-user-email]').forEach((el) => { el.textContent = user?.email || 'Minha conta'; });
  qsa('[data-user-name]').forEach((el) => { el.textContent = profile?.nome || user?.email?.split('@')[0] || 'Sua conta'; });
  qsa('[data-user-badge]').forEach((el) => { el.textContent = signed ? 'VIP ativo' : 'Conta'; });
  qsa('[data-content-link]').forEach((el) => { el.href = signed ? 'conteudo.html' : 'assinar.html'; });

  const status = qs('[data-nav-status]');
  if (status) {
    status.textContent = user ? (signed ? 'Acesso liberado' : 'Conta conectada') : 'Prévia aberta';
  }
}

async function signUp() {
  const nome = byId('nome')?.value.trim() || '';
  const email = byId('email')?.value.trim() || '';
  const usuario = (byId('usuario')?.value || '').trim().replace(/^@+/, '');
  const senha = byId('senha')?.value || '';
  const telegram = (byId('telegram')?.value || '').trim().replace(/^@+/, '');
  const aceitar = byId('aceitar')?.checked || false;

  if (!nome || !email || !usuario || !senha) {
    showFlash('error', 'Preencha nome, e-mail, @usuário e senha.');
    return;
  }
  if (senha.length < 6) {
    showFlash('error', 'Use uma senha com pelo menos 6 caracteres.');
    return;
  }
  if (!aceitar) {
    showFlash('error', 'Confirme os termos para continuar.');
    return;
  }

  const { error } = await sb.auth.signUp({
    email,
    password: senha,
    options: { data: { nome, usuario, telegram } }
  });

  if (error) {
    showFlash('error', error.message || 'Não foi possível criar sua conta.');
    return;
  }

  showFlash('success', 'Conta criada. Agora é só entrar.');
  setTimeout(() => { window.location.href = 'login.html'; }, 900);
}

async function login() {
  const email = byId('email')?.value.trim() || '';
  const senha = byId('senha')?.value || '';
  if (!email || !senha) {
    showFlash('error', 'Digite seu e-mail e sua senha.');
    return;
  }
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) {
    showFlash('error', 'Não foi possível entrar com esses dados.');
    return;
  }
  window.location.href = 'index.html';
}

async function logout() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}
window.logout = logout;

async function requestPasswordReset() {
  const email = byId('email')?.value.trim() || '';
  if (!email) {
    showFlash('error', 'Informe seu e-mail para receber o link.');
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha.html` });
  if (error) {
    showFlash('error', 'Não foi possível enviar o link agora.');
    return;
  }
  showFlash('success', 'Se o e-mail existir, o link já foi enviado.');
}

async function updatePassword() {
  const senha = byId('senha')?.value || '';
  const confirmar = byId('confirmarSenha')?.value || '';
  if (!senha || senha.length < 6) {
    showFlash('error', 'Use uma senha com pelo menos 6 caracteres.');
    return;
  }
  if (senha !== confirmar) {
    showFlash('error', 'As senhas não conferem.');
    return;
  }
  const { error } = await sb.auth.updateUser({ password: senha });
  if (error) {
    showFlash('error', 'Não foi possível atualizar sua senha.');
    return;
  }
  showFlash('success', 'Senha atualizada.');
  setTimeout(() => { window.location.href = 'login.html'; }, 900);
}

async function ensureAuth(redirect = 'login.html') {
  const session = await getSession();
  if (!session?.user) {
    window.location.href = redirect;
    return null;
  }
  return session.user;
}

async function loadHome() {
  const session = await getSession();
  const user = session?.user || null;
  const profile = user ? await getProfile(user.id) : null;
  const active = hasActiveSubscription(profile);
  const heroTitle = byId('heroTitle');
  const heroText = byId('heroText');
  const heroPrimary = byId('heroPrimary');
  const heroSecondary = byId('heroSecondary');
  const teaserStatus = byId('teaserStatus');

  if (!heroTitle || !heroText || !heroPrimary || !heroSecondary || !teaserStatus) return;

  if (!user) {
    heroTitle.textContent = 'Prévia liberada. O restante fica na área privada.';
    heroText.textContent = 'Entre ou crie sua conta para continuar e pedir o acesso completo.';
    heroPrimary.textContent = 'Entrar agora';
    heroPrimary.href = 'login.html';
    heroSecondary.textContent = 'Criar conta';
    heroSecondary.href = 'criar-conta.html';
    teaserStatus.textContent = 'Conta desconectada';
    return;
  }

  if (active) {
    heroTitle.textContent = 'Sua assinatura está ativa.';
    heroText.textContent = 'A área privada já está liberada com as fotos completas e atualizações reservadas.';
    heroPrimary.textContent = 'Abrir área privada';
    heroPrimary.href = 'conteudo.html';
    heroSecondary.textContent = 'Minha conta';
    heroSecondary.href = 'minha-conta.html';
    teaserStatus.textContent = 'Acesso VIP ativo';
    return;
  }

  heroTitle.textContent = 'Sua conta já está pronta para receber acesso.';
  heroText.textContent = 'Escolha o plano, envie o pedido e finalize comigo no Telegram.';
  heroPrimary.textContent = 'Assinar agora';
  heroPrimary.href = 'assinar.html';
  heroSecondary.textContent = 'Minha conta';
  heroSecondary.href = 'minha-conta.html';
  teaserStatus.textContent = 'Aguardando assinatura';
}

function choosePlan(plan, price, button) {
  localStorage.setItem('selectedPlanName', plan);
  localStorage.setItem('selectedPlanPrice', String(price));
  qsa('.plan-card').forEach((card) => card.classList.remove('selected'));
  button?.classList.add('selected');
  const cta = byId('homePlanCta');
  if (cta) cta.textContent = `Continuar com ${plan} • ${money(price)}`;
}
window.choosePlan = choosePlan;

function getStoredPlan() {
  return {
    plan: localStorage.getItem('selectedPlanName') || 'Mensal VIP',
    price: Number(localStorage.getItem('selectedPlanPrice') || 49.9)
  };
}

async function submitSubscriptionRequest() {
  const user = await ensureAuth('login.html');
  if (!user) return;

  const { plan, price } = getStoredPlan();
  const note = byId('pedidoObservacao')?.value.trim() || '';
  const button = byId('btnAssinar');
  const inline = byId('pedidoInline');

  if (button) button.disabled = true;
  setInlineMessage(inline, '', 'Enviando seu pedido...');

  try {
    const { data: { session } } = await sb.auth.getSession();
    const response = await fetch('/request-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`
      },
      body: JSON.stringify({ plan, price, note })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Não foi possível registrar o pedido.');
    }

    setInlineMessage(inline, 'success', 'Pedido enviado. Agora toque no botão abaixo para finalizar no Telegram.');
    const tg = payload.telegram_url || getTelegramUrl(plan);
    const tgButton = byId('btnTelegram');
    if (tgButton && tg) {
      tgButton.href = tg;
      tgButton.hidden = false;
    }
    await loadAccount();
  } catch (error) {
    setInlineMessage(inline, 'error', error.message || 'Erro ao enviar seu pedido.');
  } finally {
    if (button) button.disabled = false;
  }
}
window.submitSubscriptionRequest = submitSubscriptionRequest;

async function loadPlansPage() {
  const { plan, price } = getStoredPlan();
  const planName = byId('planName');
  const planPrice = byId('planPrice');
  if (planName) planName.textContent = plan;
  if (planPrice) planPrice.textContent = money(price);

  qsa('[data-plan-select]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextPlan = btn.dataset.planSelect;
      const nextPrice = Number(btn.dataset.price || 0);
      choosePlan(nextPlan, nextPrice, btn.closest('.plan-card'));
      if (planName) planName.textContent = nextPlan;
      if (planPrice) planPrice.textContent = money(nextPrice);
    });
  });

  const tg = getTelegramUrl(plan);
  const tgButton = byId('btnTelegram');
  if (tgButton && tg) tgButton.href = tg;
}

async function loadAccount() {
  const user = await ensureAuth('login.html');
  if (!user) return;
  const profile = await getProfile(user.id);
  const active = hasActiveSubscription(profile);

  const nameEl = byId('accountName');
  const tagEl = byId('accountTag');
  const statusEl = byId('accountStatus');
  const planEl = byId('accountPlan');
  const periodEl = byId('accountPeriod');
  const form = byId('perfilForm');

  if (nameEl) nameEl.textContent = profile?.nome || user.email.split('@')[0];
  if (tagEl) tagEl.textContent = `@${profile?.usuario || 'perfil'}`;
  if (statusEl) statusEl.textContent = active ? 'Acesso ativo' : 'Ainda sem acesso';
  if (planEl) planEl.textContent = profile?.plano || 'Aguardando aprovação manual';
  if (periodEl) periodEl.textContent = active ? `${formatDateBR(profile?.assinatura_inicio)} até ${formatDateBR(profile?.assinatura_fim)}` : 'Quando eu aprovar, o período aparece aqui.';

  if (form) {
    form.nome.value = profile?.nome || '';
    form.usuario.value = profile?.usuario || '';
    form.telegram.value = profile?.telegram || '';
    form.bio.value = profile?.bio || '';
  }

  const { data: request } = await sb
    .from('solicitacoes_assinatura')
    .select('id, plano, status, observacao, criado_em, atualizado_em')
    .eq('user_id', user.id)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  const requestBox = byId('requestStatus');
  if (requestBox) {
    if (request?.id) {
      requestBox.textContent = `Pedido: ${request.status} • ${request.plano || 'plano'} • atualizado em ${formatDateBR(request.atualizado_em)}`;
    } else {
      requestBox.textContent = 'Nenhum pedido enviado ainda.';
    }
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const user = await ensureAuth('login.html');
  if (!user) return;
  const form = event.currentTarget;
  const payload = {
    nome: form.nome.value.trim(),
    usuario: form.usuario.value.trim().replace(/^@+/, ''),
    telegram: form.telegram.value.trim().replace(/^@+/, ''),
    bio: form.bio.value.trim()
  };
  const { error } = await sb.from('perfis').update(payload).eq('id', user.id);
  if (error) {
    showFlash('error', 'Não foi possível salvar agora.');
    return;
  }
  showFlash('success', 'Perfil atualizado.');
  await refreshNavigation();
  await loadAccount();
}
window.saveProfile = saveProfile;

async function loadContent() {
  const user = await ensureAuth('login.html');
  if (!user) return;
  const profile = await getProfile(user.id);
  const active = hasActiveSubscription(profile);
  const locked = byId('lockedArea');
  const unlocked = byId('unlockedArea');
  const status = byId('contentStatus');

  if (status) status.textContent = active ? 'Acesso liberado' : 'Prévia aberta';
  if (locked) locked.hidden = active;
  if (unlocked) unlocked.hidden = !active;
}

function renderAdminUserCard(user) {
  const active = !!user.assinante && (!user.assinatura_fim || new Date(user.assinatura_fim).getTime() > Date.now());
  return `
    <article class="admin-user-card ${active ? 'active' : ''}" data-admin-card>
      <div class="admin-user-main">
        <div>
          <h3>${escapeHtml(user.nome || user.email || 'Usuário')}</h3>
          <p>@${escapeHtml(user.usuario || 'sem-usuario')}</p>
        </div>
        <span class="admin-badge ${active ? 'on' : 'off'}">${active ? 'ativo' : 'sem acesso'}</span>
      </div>
      <div class="admin-user-meta">
        <span>${escapeHtml(user.email || '')}</span>
        <span>${escapeHtml(user.telegram ? '@' + user.telegram : 'sem telegram')}</span>
      </div>
      <div class="admin-user-form-grid">
        <label>Plano<input type="text" name="plan" value="${escapeHtml(user.plano || 'Mensal VIP')}"></label>
        <label>Início<input type="date" name="start" value="${escapeHtml(toDateInput(user.assinatura_inicio))}"></label>
        <label>Fim<input type="date" name="end" value="${escapeHtml(toDateInput(user.assinatura_fim))}"></label>
        <label>Valor<input type="number" step="0.01" name="price" value="${escapeHtml(user.valor_sugerido || '')}"></label>
      </div>
      <label class="admin-full">Observação<textarea name="note" rows="3">${escapeHtml(user.observacao || '')}</textarea></label>
      <div class="admin-user-meta compact">
        <span>Pedido: ${escapeHtml(user.request_status || 'nenhum')}</span>
        <span>Último pagamento: ${escapeHtml(user.last_payment_status || '—')}</span>
      </div>
      <div class="admin-actions">
        <button class="button" type="button" onclick="adminActivate('${user.id}', this.closest('[data-admin-card]'))">Ativar</button>
        <button class="secondary-button" type="button" onclick="adminDeactivate('${user.id}', this.closest('[data-admin-card]'))">Remover</button>
        <button class="pill-button" type="button" onclick="adminMarkPending('${user.id}', this.closest('[data-admin-card]'))">Marcar pendente</button>
      </div>
    </article>`;
}

async function adminFetchUsers(search = '') {
  const user = await ensureAuth('login.html');
  if (!user || !isAdminEmail(user.email)) {
    window.location.href = 'index.html';
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  const response = await fetch(`/admin-users${search ? `?search=${encodeURIComponent(search)}` : ''}`, {
    headers: { Authorization: `Bearer ${session?.access_token || ''}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Erro ao buscar usuários.');
  return payload.users || [];
}

async function loadAdmin() {
  const user = await ensureAuth('login.html');
  if (!user || !isAdminEmail(user.email)) {
    window.location.href = 'index.html';
    return;
  }
  const list = byId('adminUsers');
  if (!list) return;
  list.innerHTML = '<div class="card soft-card">Carregando usuários...</div>';
  try {
    const users = await adminFetchUsers(byId('adminSearch')?.value.trim() || '');
    list.innerHTML = users.length ? users.map(renderAdminUserCard).join('') : '<div class="card soft-card">Nenhum usuário encontrado.</div>';
  } catch (error) {
    list.innerHTML = `<div class="card soft-card">${escapeHtml(error.message)}</div>`;
  }
}

function collectAdminPayload(userId, card) {
  return {
    user_id: userId,
    plan: qs('input[name="plan"]', card)?.value.trim() || 'Mensal VIP',
    start_date: qs('input[name="start"]', card)?.value || null,
    end_date: qs('input[name="end"]', card)?.value || null,
    price: Number(qs('input[name="price"]', card)?.value || 0) || null,
    note: qs('textarea[name="note"]', card)?.value.trim() || null
  };
}

async function adminAction(action, userId, card) {
  const { data: { session } } = await sb.auth.getSession();
  const response = await fetch('/admin-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`
    },
    body: JSON.stringify({ action, ...collectAdminPayload(userId, card) })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a ação.');
}

window.adminActivate = async (userId, card) => {
  try {
    await adminAction('activate_subscription', userId, card);
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
};

window.adminDeactivate = async (userId, card) => {
  try {
    await adminAction('deactivate_subscription', userId, card);
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
};

window.adminMarkPending = async (userId, card) => {
  try {
    await adminAction('mark_pending', userId, card);
    await loadAdmin();
  } catch (error) {
    alert(error.message);
  }
};

async function setupPage() {
  try {
    requireSupabase();
  } catch (error) {
    const fatal = byId('fatalConfig');
    if (fatal) fatal.textContent = error.message;
    return;
  }

  await refreshNavigation();

  const page = document.body.dataset.page;
  if (page === 'home') await loadHome();
  if (page === 'planos') await loadPlansPage();
  if (page === 'minha-conta') await loadAccount();
  if (page === 'conteudo') await loadContent();
  if (page === 'admin') await loadAdmin();

  const signUpForm = byId('signupForm');
  if (signUpForm) signUpForm.addEventListener('submit', (e) => { e.preventDefault(); signUp(); });

  const loginForm = byId('loginForm');
  if (loginForm) loginForm.addEventListener('submit', (e) => { e.preventDefault(); login(); });

  const resetForm = byId('resetRequestForm');
  if (resetForm) resetForm.addEventListener('submit', (e) => { e.preventDefault(); requestPasswordReset(); });

  const updatePasswordForm = byId('updatePasswordForm');
  if (updatePasswordForm) updatePasswordForm.addEventListener('submit', (e) => { e.preventDefault(); updatePassword(); });

  const profileForm = byId('perfilForm');
  if (profileForm) profileForm.addEventListener('submit', saveProfile);

  const search = byId('adminSearch');
  if (search) search.addEventListener('input', () => { clearTimeout(window.__adminSearchTimer); window.__adminSearchTimer = setTimeout(loadAdmin, 250); });
}

document.addEventListener('DOMContentLoaded', setupPage);
document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-mobile-toggle]');
  if (toggle) {
    toggleMobileMenu();
    return;
  }
  const menu = qs('[data-mobile-menu]');
  if (!menu) return;
  if (menu.dataset.open === 'true' && !event.target.closest('.mobile-panel')) {
    toggleMobileMenu(false);
  }
});

sb.auth.onAuthStateChange(async () => {
  await refreshNavigation();
});
