(function () {
  const PLAN_NAME = 'Vitalício';
  const PLAN_PRICE = 5.9;
  const CREATOR_NAME = 'Beatriz Lopes';
  const INSTAGRAM_URL = 'https://instagram.com/lopes.beeatrizz';
  let sb = null;

  function byId(id) { return document.getElementById(id); }
  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function showMessage(type, text) {
    qsa('[data-message]').forEach((box) => {
      box.textContent = text || '';
      box.className = 'message-box';
      if (text) box.classList.add(type === 'error' ? 'is-error' : 'is-success');
    });
  }

  function configured() {
    return !!window.SUPABASE_URL
      && !!window.SUPABASE_ANON_KEY
      && !String(window.SUPABASE_URL).includes('COLE_AQUI')
      && !String(window.SUPABASE_ANON_KEY).includes('COLE_AQUI');
  }

  function requireClient() {
    if (sb) return sb;
    if (!configured()) throw new Error('O site ainda não foi conectado ao Supabase.');
    sb = window.createSupabaseClient();
    if (!sb) throw new Error('Biblioteca do Supabase não carregada.');
    return sb;
  }

  function telegramLink(text) {
    const user = String(window.TELEGRAM_USERNAME || '').replace('@', '').trim();
    if (!user) return '';
    return `https://t.me/${user}?text=${encodeURIComponent(text)}`;
  }

  function activeMember(profile) {
    if (!profile || !profile.assinante) return false;
    if (!profile.assinatura_fim) return true;
    const end = new Date(profile.assinatura_fim);
    return !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
  }

  function setMenuOpen(open) {
    const menu = byId('mobileMenu');
    const toggle = byId('mobileMenuToggle');
    if (!menu || !toggle) return;
    menu.dataset.open = open ? 'true' : 'false';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', !!open);
  }

  async function getSession() {
    const client = requireClient();
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  async function getUser() {
    const client = requireClient();
    const { data } = await client.auth.getUser();
    return data.user || null;
  }

  async function getProfile(userId) {
    if (!userId) return null;
    const client = requireClient();
    const { data } = await client
      .from('perfis')
      .select('id,email,nome,usuario,assinante,plano,assinatura_inicio,assinatura_fim,telegram,bio')
      .eq('id', userId)
      .maybeSingle();
    return data || null;
  }

  async function refreshNav() {
    const session = configured() ? await getSession() : null;
    const user = session?.user || null;
    const profile = user ? await getProfile(user.id) : null;
    const vip = activeMember(profile);
    const admin = !!user?.email && user.email.toLowerCase() === String(window.ADMIN_EMAIL_HINT || '').toLowerCase();

    qsa('[data-guest-only]').forEach((el) => { el.hidden = !!user; });
    qsa('[data-auth-only]').forEach((el) => { el.hidden = !user; });
    qsa('[data-admin-only]').forEach((el) => { el.hidden = !admin; });
    qsa('[data-user-name]').forEach((el) => { el.textContent = profile?.usuario || profile?.nome || user?.email?.split('@')[0] || 'minha-conta'; });
    qsa('[data-vip-state]').forEach((el) => { el.textContent = vip ? 'Acesso liberado' : 'Seu acesso'; });
    qsa('[data-member-link]').forEach((el) => { el.href = vip ? '/conteudo.html' : '/assinar.html'; });

    const action = byId('heroAction');
    if (action) {
      if (!user) {
        action.textContent = 'Quero meu acesso agora 😈';
        action.href = '/criar-conta.html';
      } else if (vip) {
        action.textContent = 'Entrar nos conteúdos 😈';
        action.href = '/conteudo.html';
      } else {
        action.textContent = 'Liberar meu acesso 😈';
        action.href = '/assinar.html';
      }
    }

    const mini = byId('miniState');
    if (mini) mini.textContent = !user ? 'Prévia livre 🔥' : vip ? 'Seu acesso já está liberado 😈' : 'Falta só liberar seu acesso 💋';
  }

  async function signUp() {
    const client = requireClient();
    const nome = byId('nome')?.value.trim();
    const email = byId('email')?.value.trim();
    const usuario = byId('usuario')?.value.trim().replace(/^@+/, '');
    const senha = byId('senha')?.value || '';
    const telegram = byId('telegram')?.value.trim().replace(/^@+/, '');

    if (!nome || !email || !usuario || !senha) {
      showMessage('error', 'Preencha nome, e-mail, usuário e senha.');
      return;
    }
    if (senha.length < 6) {
      showMessage('error', 'Use uma senha com pelo menos 6 caracteres.');
      return;
    }

    const { error } = await client.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, usuario, telegram }
      }
    });

    if (error) {
      showMessage('error', error.message || 'Não foi possível criar sua conta.');
      return;
    }
    showMessage('success', 'Conta criada 💖 agora é só entrar.');
    setTimeout(() => { window.location.href = '/login.html'; }, 900);
  }

  async function login() {
    const client = requireClient();
    const email = byId('email')?.value.trim();
    const senha = byId('senha')?.value || '';
    if (!email || !senha) {
      showMessage('error', 'Digite seu e-mail e sua senha.');
      return;
    }
    const { error } = await client.auth.signInWithPassword({ email, password: senha });
    if (error) {
      showMessage('error', 'Não consegui entrar com esses dados. Confere e tenta de novo.');
      return;
    }
    window.location.href = '/index.html';
  }

  async function logout() {
    const client = requireClient();
    await client.auth.signOut();
    window.location.href = '/index.html';
  }
  window.logout = logout;

  async function sendReset() {
    const client = requireClient();
    const email = byId('email')?.value.trim();
    if (!email) {
      showMessage('error', 'Informe seu e-mail.');
      return;
    }
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha.html` });
    if (error) {
      showMessage('error', 'Não conseguimos enviar o link agora.');
      return;
    }
    showMessage('success', 'Se o e-mail existir, o link já foi enviado.');
  }

  async function updatePassword() {
    const client = requireClient();
    const senha = byId('senha')?.value || '';
    const confirmar = byId('confirmar')?.value || '';
    if (senha.length < 6) {
      showMessage('error', 'Use uma senha com pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmar) {
      showMessage('error', 'As senhas não coincidem.');
      return;
    }
    const { error } = await client.auth.updateUser({ password: senha });
    if (error) {
      showMessage('error', 'Não foi possível salvar a nova senha.');
      return;
    }
    showMessage('success', 'Senha atualizada.');
    setTimeout(() => { window.location.href = '/login.html'; }, 1000);
  }

  async function ensureAuth(options = {}) {
    const session = await getSession();
    if (!session?.user) {
      if (options.redirect !== false) window.location.href = '/login.html';
      return { user: null, profile: null };
    }
    const profile = await getProfile(session.user.id);
    return { user: session.user, profile };
  }

  async function updateProfile() {
    const client = requireClient();
    const current = await ensureAuth({ redirect: false });
    if (!current.user) {
      showMessage('error', 'Faça login novamente.');
      return;
    }

    const payload = {
      nome: byId('nome')?.value.trim() || null,
      usuario: byId('usuario')?.value.trim().replace(/^@+/, '') || null,
      telegram: byId('telegram')?.value.trim().replace(/^@+/, '') || null,
      bio: byId('bio')?.value.trim() || null,
      atualizado_em: new Date().toISOString()
    };

    const { error } = await client.from('perfis').update(payload).eq('id', current.user.id);
    if (error) {
      showMessage('error', 'Não foi possível salvar agora.');
      return;
    }
    showMessage('success', 'Seu perfil foi atualizado.');
    await renderMyAccount();
    await refreshNav();
  }

  async function requestAccess() {
    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    const button = byId('buyButton');
    const original = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Enviando...';
    }

    try {
      const tokenData = await requireClient().auth.getSession();
      const token = tokenData.data.session?.access_token || '';
      const response = await fetch('/api/request-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ plano: PLAN_NAME, valor: PLAN_PRICE })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar seu pedido.');
      showMessage('success', 'Pedido enviado 😈 agora me chama no Telegram pra eu liberar mais rápido.');
      const url = telegramLink(`Oi, acabei de pedir o acesso ${PLAN_NAME} de ${money(PLAN_PRICE)} no site.`);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      await renderMyAccount();
    } catch (error) {
      showMessage('error', error.message || 'Não foi possível enviar seu pedido agora.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }

  async function renderHome() {
    const stateText = byId('miniState');
    const ctaPrice = byId('ctaPrice');
    if (ctaPrice) ctaPrice.textContent = `${PLAN_NAME} · ${money(PLAN_PRICE)}`;
    if (!configured()) {
      if (stateText) stateText.textContent = 'Volta daqui a pouquinho 💖';
      return;
    }
    const auth = await ensureAuth({ redirect: false });
    if (!auth.user) return;
    if (stateText) stateText.textContent = activeMember(auth.profile) ? 'Seu acesso já está liberado 😈' : 'Sua conta já está pronta pra entrar 💋';
  }

  async function renderSubscriptionPage() {
    const priceEls = qsa('[data-plan-price]');
    priceEls.forEach((el) => { el.textContent = money(PLAN_PRICE); });
    const planEls = qsa('[data-plan-name]');
    planEls.forEach((el) => { el.textContent = PLAN_NAME; });

    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    const welcome = byId('buyerName');
    if (welcome) welcome.textContent = auth.profile?.nome || auth.profile?.usuario || auth.user.email || 'seu perfil';

    const already = byId('alreadyActive');
    const card = byId('planCard');
    if (activeMember(auth.profile)) {
      if (already) already.hidden = false;
      if (card) card.classList.add('is-active');
    }

    const button = byId('buyButton');
    if (button) button.addEventListener('click', requestAccess);
  }

  async function renderContentPage() {
    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    const locked = !activeMember(auth.profile);
    const gate = byId('accessGate');
    const content = byId('contentArea');
    if (gate) gate.hidden = !locked;
    if (content) content.hidden = locked;

    const name = byId('contentBuyerName');
    if (name) name.textContent = auth.profile?.nome || auth.user.email || 'você';
  }

  async function renderMyAccount() {
    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;
    const profile = auth.profile || {};

    const name = byId('nome'); if (name) name.value = profile.nome || '';
    const user = byId('usuario'); if (user) user.value = profile.usuario || '';
    const telegram = byId('telegram'); if (telegram) telegram.value = profile.telegram || '';
    const bio = byId('bio'); if (bio) bio.value = profile.bio || '';

    const status = byId('memberStatus');
    if (status) {
      if (activeMember(profile)) {
        status.textContent = `Acesso liberado 😈${profile.plano ? ` · ${profile.plano}` : ''}`;
      } else {
        status.textContent = 'Seu acesso ainda não foi liberado 💋';
      }
    }

    const ordersBox = byId('requestHistory');
    if (ordersBox) {
      const { data } = await requireClient()
        .from('pedidos_acesso')
        .select('id, plano, valor, status, criado_em')
        .eq('user_id', auth.user.id)
        .order('criado_em', { ascending: false });
      ordersBox.innerHTML = (data || []).map((item) => `
        <div class="mini-card">
          <strong>${item.plano || PLAN_NAME}</strong>
          <span>${money(item.valor)}</span>
          <p>${item.status === 'aprovado' ? 'Aprovado' : item.status === 'cancelado' ? 'Cancelado' : 'Em análise'}</p>
        </div>
      `).join('') || '<div class="empty-state">Assim que você pedir o acesso, ele aparece aqui 😈</div>';
    }
  }

  async function loadAdminUsers() {
    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;
    if (!auth.user.email || auth.user.email.toLowerCase() !== String(window.ADMIN_EMAIL_HINT || '').toLowerCase()) {
      window.location.href = '/index.html';
      return;
    }

    const tokenData = await requireClient().auth.getSession();
    const token = tokenData.data.session?.access_token || '';
    const search = byId('adminSearch')?.value.trim() || '';
    const response = await fetch(`/api/admin-users${search ? `?q=${encodeURIComponent(search)}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showMessage('error', result.error || 'Não foi possível carregar a lista.');
      return;
    }

    const table = byId('adminUsers');
    const rows = (result.users || []).map((item) => `
      <div class="admin-row">
        <div>
          <strong>${item.nome || item.email || 'Sem nome'}</strong>
          <p>${item.email || ''}</p>
        </div>
        <div>
          <span>${item.assinante_ativo ? 'Ativo' : 'Sem acesso'}</span>
          <p>${item.plano || '-'}</p>
        </div>
        <div>
          <button class="button small" onclick="window.adminSet('${item.id}','approve')">Aprovar</button>
          <button class="button ghost small" onclick="window.adminSet('${item.id}','remove')">Remover</button>
        </div>
      </div>
    `).join('');
    table.innerHTML = rows || '<div class="empty-state">Nenhuma conta encontrada.</div>';
  }

  async function adminSet(userId, action) {
    const tokenData = await requireClient().auth.getSession();
    const token = tokenData.data.session?.access_token || '';
    const response = await fetch('/api/admin-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ user_id: userId, action, plano: PLAN_NAME, valor: PLAN_PRICE })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showMessage('error', result.error || 'Não foi possível salvar.');
      return;
    }
    showMessage('success', action === 'approve' ? 'Acesso liberado com sucesso.' : 'Acesso removido.');
    await loadAdminUsers();
  }
  window.adminSet = adminSet;

  function hookForms() {
    const signUpForm = byId('signupForm');
    if (signUpForm) signUpForm.addEventListener('submit', (event) => { event.preventDefault(); signUp(); });

    const loginForm = byId('loginForm');
    if (loginForm) loginForm.addEventListener('submit', (event) => { event.preventDefault(); login(); });

    const resetForm = byId('resetForm');
    if (resetForm) resetForm.addEventListener('submit', (event) => { event.preventDefault(); sendReset(); });

    const newPasswordForm = byId('newPasswordForm');
    if (newPasswordForm) newPasswordForm.addEventListener('submit', (event) => { event.preventDefault(); updatePassword(); });

    const accountForm = byId('accountForm');
    if (accountForm) accountForm.addEventListener('submit', (event) => { event.preventDefault(); updateProfile(); });

    const adminForm = byId('adminSearchForm');
    if (adminForm) adminForm.addEventListener('submit', (event) => { event.preventDefault(); loadAdminUsers(); });
  }

  async function boot() {
    try {
      if (!window.createSupabaseClient || !window.supabase) {
        showMessage('error', 'Não consegui carregar o site agora. Recarrega a página.');
        return;
      }
      if (configured()) sb = window.createSupabaseClient();
      hookForms();

      const toggle = byId('mobileMenuToggle');
      if (toggle) toggle.addEventListener('click', () => setMenuOpen(qs('#mobileMenu')?.dataset.open !== 'true'));
      qsa('[data-close-menu]').forEach((link) => link.addEventListener('click', () => setMenuOpen(false)));

      if (configured()) {
        await refreshNav();
        sb.auth.onAuthStateChange(async () => { await refreshNav(); });
      }

      if (document.body.dataset.page === 'home') await renderHome();
      if (document.body.dataset.page === 'subscribe' && configured()) await renderSubscriptionPage();
      if (document.body.dataset.page === 'content' && configured()) await renderContentPage();
      if (document.body.dataset.page === 'account' && configured()) await renderMyAccount();
      if (document.body.dataset.page === 'admin' && configured()) await loadAdminUsers();
    } catch (error) {
      console.error(error);
      showMessage('error', error.message || 'Algo não saiu como eu queria.');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
