(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // CONSTANTES DO SITE
  // ──────────────────────────────────────────────
  const PLAN_NAME  = 'Vitalício';
  const PLAN_PRICE = 5.9;

  let sb = null;

  // ──────────────────────────────────────────────
  // UTILITÁRIOS
  // ──────────────────────────────────────────────
  function byId(id)             { return document.getElementById(id); }
  function qs(sel, root)        { return (root || document).querySelector(sel); }
  function qsa(sel, root)       { return Array.from((root || document).querySelectorAll(sel)); }

  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function showMessage(type, text) {
    qsa('[data-message]').forEach((box) => {
      box.textContent = text || '';
      box.className   = 'message-box';
      if (text) box.classList.add(type === 'error' ? 'is-error' : 'is-success');
    });
  }

  function configured() {
    return (
      !!window.SUPABASE_URL &&
      !!window.SUPABASE_ANON_KEY &&
      !String(window.SUPABASE_URL).includes('COLE_AQUI') &&
      !String(window.SUPABASE_ANON_KEY).includes('COLE_AQUI')
    );
  }

  function requireClient() {
    if (sb) return sb;
    if (!configured()) throw new Error('Site ainda não está configurado. Tente novamente em breve.');
    sb = window.createSupabaseClient();
    if (!sb) throw new Error('Não foi possível carregar o site. Recarregue a página.');
    return sb;
  }

  function telegramLink(text) {
    const user = String(window.TELEGRAM_USERNAME || '').replace('@', '').trim();
    if (!user) return 'https://t.me/talespwk';
    return `https://t.me/${user}?text=${encodeURIComponent(text)}`;
  }

  function isActiveSubscriber(profile) {
    if (!profile || !profile.assinante) return false;
    if (!profile.assinatura_fim)        return true;
    const end = new Date(profile.assinatura_fim);
    return !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
  }

  // ──────────────────────────────────────────────
  // MENU MOBILE
  // ──────────────────────────────────────────────
  function setMenuOpen(open) {
    const menu   = byId('mobileMenu');
    const toggle = byId('mobileMenuToggle');
    if (!menu || !toggle) return;
    menu.dataset.open = open ? 'true' : 'false';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', !!open);
  }

  // ──────────────────────────────────────────────
  // AUTH — leituras seguras
  // ──────────────────────────────────────────────
  async function getSession() {
    const { data } = await requireClient().auth.getSession();
    return data.session || null;
  }

  async function getProfile(userId) {
    if (!userId) return null;
    const { data } = await requireClient()
      .from('perfis')
      .select('id,email,nome,usuario,telegram,bio,assinante,plano,assinatura_inicio,assinatura_fim')
      .eq('id', userId)
      .maybeSingle();
    return data || null;
  }

  // ──────────────────────────────────────────────
  // NAV — atualiza header de forma coerente
  // ──────────────────────────────────────────────
  async function refreshNav() {
    const session = configured() ? await getSession() : null;
    const user    = session?.user || null;
    const profile = user ? await getProfile(user.id) : null;
    const vip     = isActiveSubscriber(profile);
    const isAdmin = !!user?.email &&
      user.email.toLowerCase() === String(window.ADMIN_EMAIL_HINT || '').toLowerCase();

    // Visibilidade condicional
    qsa('[data-guest-only]').forEach((el) => { el.hidden = !!user; });
    qsa('[data-auth-only]').forEach( (el) => { el.hidden = !user; });
    qsa('[data-admin-only]').forEach((el) => { el.hidden = !isAdmin; });

    // Nome do usuário em todos os slots
    const displayName =
      profile?.usuario || profile?.nome || user?.email?.split('@')[0] || 'conta';
    qsa('[data-user-name]').forEach((el) => { el.textContent = displayName; });

    // Link de conteúdo — muda destino conforme situação
    qsa('[data-member-link]').forEach((el) => {
      el.href = vip ? '/conteudo.html' : '/assinar.html';
    });

    // CTA hero
    const heroBtn = byId('heroAction');
    if (heroBtn) {
      if (!user) {
        heroBtn.textContent = 'Quero meu acesso agora 😈';
        heroBtn.href        = '/criar-conta.html';
      } else if (vip) {
        heroBtn.textContent = 'Entrar nos conteúdos 😈';
        heroBtn.href        = '/conteudo.html';
      } else {
        heroBtn.textContent = 'Liberar meu acesso 😈';
        heroBtn.href        = '/assinar.html';
      }
    }

    // Badge de estado no hero
    const miniState = byId('miniState');
    if (miniState) {
      if (!user)  miniState.textContent = 'Prévia livre 🔥';
      else if (vip) miniState.textContent = 'Acesso liberado 😈';
      else         miniState.textContent = 'Falta pouco pra entrar 💋';
    }
  }

  // ──────────────────────────────────────────────
  // AUTH — garante sessão ou redireciona
  // ──────────────────────────────────────────────
  async function ensureAuth(options) {
    const opts    = options || {};
    const session = await getSession();
    if (!session?.user) {
      if (opts.redirect !== false) window.location.href = '/login.html';
      return { user: null, profile: null };
    }
    const profile = await getProfile(session.user.id);
    return { user: session.user, profile };
  }

  // ──────────────────────────────────────────────
  // FORMULÁRIOS
  // ──────────────────────────────────────────────
  async function signUp() {
    const nome     = (byId('nome')?.value     || '').trim();
    const email    = (byId('email')?.value    || '').trim();
    const usuario  = (byId('usuario')?.value  || '').trim().replace(/^@+/, '');
    const telegram = (byId('telegram')?.value || '').trim().replace(/^@+/, '');
    const senha    = byId('senha')?.value || '';

    if (!nome || !email || !usuario || !senha) {
      showMessage('error', 'Preencha nome, e-mail, usuário e senha.');
      return;
    }
    if (senha.length < 6) {
      showMessage('error', 'Use uma senha com pelo menos 6 caracteres.');
      return;
    }

    const { error } = await requireClient().auth.signUp({
      email,
      password: senha,
      options: { data: { nome, usuario, telegram } }
    });

    if (error) {
      const msg = error.message?.includes('already registered')
        ? 'Esse e-mail já está cadastrado. Tenta entrar com ele.'
        : 'Não foi possível criar sua conta agora. Tente novamente.';
      showMessage('error', msg);
      return;
    }
    showMessage('success', 'Conta criada 💖 agora é só entrar!');
    setTimeout(() => { window.location.href = '/login.html'; }, 900);
  }

  async function login() {
    const email = (byId('email')?.value || '').trim();
    const senha =  byId('senha')?.value || '';
    if (!email || !senha) {
      showMessage('error', 'Digite seu e-mail e sua senha.');
      return;
    }
    const { error } = await requireClient().auth.signInWithPassword({
      email, password: senha
    });
    if (error) {
      showMessage('error', 'E-mail ou senha incorretos. Confere e tenta de novo.');
      return;
    }
    window.location.href = '/index.html';
  }

  async function logout() {
    try { await requireClient().auth.signOut(); } catch (_) { /* ignora */ }
    window.location.href = '/index.html';
  }
  window.logout = logout;

  async function sendReset() {
    const email = (byId('email')?.value || '').trim();
    if (!email) {
      showMessage('error', 'Informe seu e-mail.');
      return;
    }
    const { error } = await requireClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha.html`
    });
    if (error) {
      showMessage('error', 'Não conseguimos enviar o link agora. Tente em breve.');
      return;
    }
    showMessage('success', 'Se o e-mail existir, o link de recuperação já foi enviado 💌');
  }

  async function updatePassword() {
    const senha    = byId('senha')?.value    || '';
    const confirmar = byId('confirmar')?.value || '';
    if (senha.length < 6) {
      showMessage('error', 'Use uma senha com pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmar) {
      showMessage('error', 'As senhas não coincidem.');
      return;
    }
    const { error } = await requireClient().auth.updateUser({ password: senha });
    if (error) {
      showMessage('error', 'Não foi possível salvar a nova senha. Tente pelo link novamente.');
      return;
    }
    showMessage('success', 'Senha atualizada com sucesso!');
    setTimeout(() => { window.location.href = '/login.html'; }, 1200);
  }

  async function updateProfile() {
    const auth = await ensureAuth({ redirect: false });
    if (!auth.user) {
      showMessage('error', 'Sessão expirada. Faça login novamente.');
      return;
    }
    const payload = {
      nome:     (byId('nome')?.value     || '').trim() || null,
      usuario:  (byId('usuario')?.value  || '').trim().replace(/^@+/, '') || null,
      telegram: (byId('telegram')?.value || '').trim().replace(/^@+/, '') || null,
      bio:      (byId('bio')?.value      || '').trim() || null
    };
    const { error } = await requireClient()
      .from('perfis')
      .update(payload)
      .eq('id', auth.user.id);
    if (error) {
      showMessage('error', 'Não foi possível salvar agora. Tente novamente.');
      return;
    }
    showMessage('success', 'Perfil atualizado com sucesso!');
    await renderMyAccount();
    await refreshNav();
  }

  // ──────────────────────────────────────────────
  // PEDIDO DE ACESSO
  // ──────────────────────────────────────────────
  async function requestAccess() {
    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    const button   = byId('buyButton');
    const original = button?.textContent || '';
    if (button) { button.disabled = true; button.textContent = 'Enviando...'; }

    try {
      const session = await requireClient().auth.getSession();
      const token   = session.data?.session?.access_token || '';
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch('/api/request-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plano: PLAN_NAME, valor: PLAN_PRICE })
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Não foi possível enviar seu pedido.');

      showMessage('success', 'Pedido enviado 😈 agora me chama no Telegram pra liberar mais rápido!');

      const tgUrl = telegramLink(
        `Oi Beatriz! Acabei de pedir o acesso ${PLAN_NAME} de ${money(PLAN_PRICE)} no site.`
      );
      window.open(tgUrl, '_blank', 'noopener,noreferrer');

      await renderMyAccount();
    } catch (err) {
      showMessage('error', err.message || 'Não foi possível enviar seu pedido agora.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  // ──────────────────────────────────────────────
  // PÁGINAS — renderizações específicas
  // ──────────────────────────────────────────────
  async function renderHome() {
    const ctaPrice = byId('ctaPrice');
    if (ctaPrice) ctaPrice.textContent = `${PLAN_NAME} · ${money(PLAN_PRICE)}`;

    if (!configured()) {
      const s = byId('miniState');
      if (s) s.textContent = 'Volta daqui a pouquinho 💖';
      return;
    }
    // refreshNav já atualiza miniState e heroAction
  }

  async function renderSubscriptionPage() {
    // Preenche preços antes da verificação de auth (sem piscar)
    qsa('[data-plan-price]').forEach((el) => { el.textContent = money(PLAN_PRICE); });
    qsa('[data-plan-name]').forEach( (el) => { el.textContent = PLAN_NAME; });

    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    const welcome = byId('buyerName');
    if (welcome) {
      welcome.textContent =
        auth.profile?.nome || auth.profile?.usuario ||
        auth.user.email?.split('@')[0] || 'linda';
    }

    if (isActiveSubscriber(auth.profile)) {
      const already = byId('alreadyActive');
      const card    = byId('planCard');
      if (already) already.hidden = false;
      if (card)    card.classList.add('is-active');
    }

    const btn = byId('buyButton');
    if (btn) btn.addEventListener('click', requestAccess);
  }

  async function renderContentPage() {
    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    const locked  = !isActiveSubscriber(auth.profile);
    const gate    = byId('accessGate');
    const content = byId('contentArea');
    if (gate)    gate.hidden    = !locked;
    if (content) content.hidden =  locked;

    const nameEl = byId('contentBuyerName');
    if (nameEl) {
      nameEl.textContent =
        auth.profile?.nome || auth.profile?.usuario ||
        auth.user.email?.split('@')[0] || 'você';
    }
  }

  async function renderMyAccount() {
    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    const p = auth.profile || {};

    // Preenche campos do formulário
    const fNome     = byId('nome');     if (fNome)     fNome.value     = p.nome     || '';
    const fUsuario  = byId('usuario');  if (fUsuario)  fUsuario.value  = p.usuario  || '';
    const fTelegram = byId('telegram'); if (fTelegram) fTelegram.value = p.telegram || '';
    const fBio      = byId('bio');      if (fBio)      fBio.value      = p.bio      || '';

    // Status de assinatura
    const statusEl = byId('memberStatus');
    if (statusEl) {
      if (isActiveSubscriber(p)) {
        statusEl.textContent = `Acesso liberado 😈${p.plano ? ` · ${p.plano}` : ''}`;
        statusEl.style.background = 'rgba(54,208,159,0.15)';
        statusEl.style.borderColor = 'rgba(54,208,159,0.4)';
        statusEl.style.color = '#b8ffd9';
      } else {
        statusEl.textContent = 'Acesso ainda não liberado 💋';
      }
    }

    // Histórico de pedidos
    const ordersBox = byId('requestHistory');
    if (ordersBox) {
      const { data } = await requireClient()
        .from('pedidos_acesso')
        .select('id,plano,valor,status,criado_em')
        .eq('user_id', auth.user.id)
        .order('criado_em', { ascending: false });

      const statusLabel = (s) =>
        s === 'aprovado' ? '✅ Aprovado' :
        s === 'cancelado' ? '❌ Cancelado' : '⏳ Em análise';

      ordersBox.innerHTML =
        (data || []).length === 0
          ? '<div class="empty-state">Assim que você pedir o acesso, ele aparece aqui 😈</div>'
          : (data || []).map((item) => `
              <div class="mini-card">
                <strong>${item.plano || PLAN_NAME}</strong>
                <span>${money(item.valor)}</span>
                <p>${statusLabel(item.status)}</p>
              </div>
            `).join('');
    }
  }

  // ──────────────────────────────────────────────
  // ADMIN
  // ──────────────────────────────────────────────
  async function loadAdminUsers() {
    const auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    // Verificação frontend (camada visual apenas — backend valida de verdade)
    const hintEmail = String(window.ADMIN_EMAIL_HINT || '').toLowerCase();
    if (!hintEmail || auth.user.email?.toLowerCase() !== hintEmail) {
      window.location.href = '/index.html';
      return;
    }

    const session = await requireClient().auth.getSession();
    const token   = session.data?.session?.access_token || '';
    const search  = (byId('adminSearch')?.value || '').trim();

    const url = '/api/admin-users' + (search ? `?q=${encodeURIComponent(search)}` : '');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage('error', result.error || 'Não foi possível carregar a lista.');
      return;
    }

    const table = byId('adminUsers');
    if (!table) return;

    const rows = (result.users || []).map((u) => {
      const statusLabel = u.assinante_ativo
        ? '<span class="tag-ativo">Ativo</span>'
        : u.pedido_status === 'pendente'
          ? '<span class="tag-pendente">Pedido pendente</span>'
          : '<span class="tag-sem">Sem acesso</span>';

      return `
        <div class="admin-row">
          <div class="admin-col-user">
            <strong>${u.nome || u.email || 'Sem nome'}</strong>
            <p>${u.email || ''}</p>
            ${u.usuario ? `<p>@${u.usuario}</p>` : ''}
          </div>
          <div class="admin-col-status">
            ${statusLabel}
            ${u.plano ? `<p>${u.plano}</p>` : ''}
          </div>
          <div class="admin-col-actions">
            <button class="button small" onclick="window.adminSet('${u.id}','approve')">Aprovar</button>
            <button class="button ghost small" onclick="window.adminSet('${u.id}','remove')">Remover</button>
          </div>
        </div>
      `;
    }).join('');

    table.innerHTML = rows || '<div class="empty-state">Nenhuma conta encontrada.</div>';
  }

  async function adminSet(userId, action) {
    const session = await requireClient().auth.getSession();
    const token   = session.data?.session?.access_token || '';

    const res = await fetch('/api/admin-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ user_id: userId, action, plano: PLAN_NAME, valor: PLAN_PRICE })
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      showMessage('error', result.error || 'Não foi possível salvar.');
      return;
    }
    showMessage('success', action === 'approve' ? 'Acesso liberado ✅' : 'Acesso removido.');
    await loadAdminUsers();
  }
  window.adminSet = adminSet;

  // ──────────────────────────────────────────────
  // HOOK DE FORMULÁRIOS
  // ──────────────────────────────────────────────
  function hookForms() {
    const hook = (id, fn) => {
      const el = byId(id);
      if (el) el.addEventListener('submit', (e) => { e.preventDefault(); fn(); });
    };
    hook('signupForm',      signUp);
    hook('loginForm',       login);
    hook('resetForm',       sendReset);
    hook('newPasswordForm', updatePassword);
    hook('accountForm',     updateProfile);
    hook('adminSearchForm', loadAdminUsers);
  }

  // ──────────────────────────────────────────────
  // BOOT
  // ──────────────────────────────────────────────
  async function boot() {
    try {
      if (!window.createSupabaseClient || !window.supabase) {
        showMessage('error', 'Não consegui carregar o site agora. Recarregue a página.');
        return;
      }
      if (configured()) sb = window.createSupabaseClient();

      hookForms();

      // Menu mobile
      const toggle = byId('mobileMenuToggle');
      if (toggle) {
        toggle.addEventListener('click', () => {
          setMenuOpen(qs('#mobileMenu')?.dataset.open !== 'true');
        });
      }
      qsa('[data-close-menu]').forEach((el) =>
        el.addEventListener('click', () => setMenuOpen(false))
      );

      // Nav + listener de estado de auth
      if (configured()) {
        await refreshNav();
        requireClient().auth.onAuthStateChange(async () => {
          await refreshNav();
        });
      }

      // Renderizações por página
      const page = document.body.dataset.page || '';
      if (page === 'home')      await renderHome();
      if (page === 'subscribe') await renderSubscriptionPage();
      if (page === 'content')   await renderContentPage();
      if (page === 'account')   await renderMyAccount();
      if (page === 'admin')     await loadAdminUsers();

      // Redefinição de senha — detecta token de recovery via onAuthStateChange
      if (page === 'reset') {
        requireClient().auth.onAuthStateChange(async (event) => {
          if (event === 'PASSWORD_RECOVERY') {
            const wrap1 = byId('resetForm-wrap');
            const wrap2 = byId('newPassword-wrap');
            if (wrap1) wrap1.style.display = 'none';
            if (wrap2) wrap2.style.display = 'block';
          }
        });
      }
    } catch (err) {
      console.error('[boot]', err);
      showMessage('error', err.message || 'Algo não saiu como esperado. Recarregue a página.');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
