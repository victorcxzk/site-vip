(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // CONSTANTES
  // ────────────────────────────────────────────────────────────
  var PLAN_NAME  = 'Vitalício';
  var PLAN_PRICE = 5.9;

  var sb = null;

  // ────────────────────────────────────────────────────────────
  // UTILITÁRIOS
  // ────────────────────────────────────────────────────────────
  function byId(id)      { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }

  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function showMessage(type, text) {
    qsa('[data-message]').forEach(function (box) {
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
    if (!configured()) throw new Error('Serviço não disponível no momento. Recarregue a página.');
    sb = window.createSupabaseClient();
    if (!sb) throw new Error('Não foi possível carregar o site. Recarregue a página.');
    return sb;
  }

  function telegramLink(text) {
    var user = String(window.TELEGRAM_USERNAME || '').replace('@', '').trim();
    if (!user) return 'https://t.me/talespwk';
    return 'https://t.me/' + user + '?text=' + encodeURIComponent(text);
  }

  function isActiveSubscriber(profile) {
    if (!profile || !profile.assinante) return false;
    if (!profile.assinatura_fim)        return true;
    var end = new Date(profile.assinatura_fim);
    return !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
  }

  // ────────────────────────────────────────────────────────────
  // MENU MOBILE
  // ────────────────────────────────────────────────────────────
  function setMenuOpen(open) {
    var menu   = byId('mobileMenu');
    var toggle = byId('mobileMenuToggle');
    if (!menu || !toggle) return;
    menu.dataset.open = open ? 'true' : 'false';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', !!open);
  }

  // ────────────────────────────────────────────────────────────
  // AUTH — leituras
  // ────────────────────────────────────────────────────────────
  async function getSession() {
    // Sempre usa getUser() para ter a sessão validada pelo servidor
    // getSession() só lê o cache local e pode estar desatualizado
    try {
      var res = await requireClient().auth.getSession();
      return res.data.session || null;
    } catch (e) {
      return null;
    }
  }

  async function getProfile(userId) {
    if (!userId) return null;
    try {
      var res = await requireClient()
        .from('perfis')
        .select('id,email,nome,usuario,telegram,bio,assinante,plano,assinatura_inicio,assinatura_fim')
        .eq('id', userId)
        .maybeSingle();
      return res.data || null;
    } catch (e) {
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────
  // NAV — atualiza header coerente em todas as páginas
  // ────────────────────────────────────────────────────────────
  async function refreshNav() {
    var session = configured() ? await getSession() : null;
    var user    = session ? session.user : null;
    var profile = user ? await getProfile(user.id) : null;
    var vip     = isActiveSubscriber(profile);
    var hintEmail = String(window.ADMIN_EMAIL_HINT || '').toLowerCase();
    var isAdmin = !!(user && user.email && hintEmail &&
      user.email.toLowerCase() === hintEmail);

    // Visibilidade condicional
    qsa('[data-guest-only]').forEach(function (el) { el.hidden = !!user; });
    qsa('[data-auth-only]').forEach( function (el) { el.hidden = !user; });
    qsa('[data-admin-only]').forEach(function (el) { el.hidden = !isAdmin; });

    // Nome do usuário em todos os slots
    var displayName =
      (profile && (profile.usuario || profile.nome)) ||
      (user && user.email && user.email.split('@')[0]) ||
      'conta';
    qsa('[data-user-name]').forEach(function (el) { el.textContent = displayName; });

    // Link de conteúdo — destino muda conforme situação
    qsa('[data-member-link]').forEach(function (el) {
      el.href = vip ? '/conteudo.html' : '/assinar.html';
    });

    // CTA hero
    var heroBtn = byId('heroAction');
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
    var miniState = byId('miniState');
    if (miniState) {
      if (!user)       miniState.textContent = 'Prévia livre 🔥';
      else if (vip)    miniState.textContent = 'Acesso liberado 😈';
      else             miniState.textContent = 'Falta pouco pra entrar 💋';
    }
  }

  // ────────────────────────────────────────────────────────────
  // AUTH — garante sessão ou redireciona
  // ────────────────────────────────────────────────────────────
  async function ensureAuth(options) {
    var opts    = options || {};
    var session = await getSession();
    if (!session || !session.user) {
      if (opts.redirect !== false) window.location.href = '/login.html';
      return { user: null, profile: null };
    }
    var profile = await getProfile(session.user.id);
    return { user: session.user, profile: profile };
  }

  // ────────────────────────────────────────────────────────────
  // FORMULÁRIOS — Cadastro
  // ────────────────────────────────────────────────────────────
  async function signUp() {
    var nome     = ((byId('nome')     && byId('nome').value)     || '').trim();
    var email    = ((byId('email')    && byId('email').value)    || '').trim();
    var usuario  = ((byId('usuario')  && byId('usuario').value)  || '').trim().replace(/^@+/, '');
    var telegram = ((byId('telegram') && byId('telegram').value) || '').trim().replace(/^@+/, '');
    var senha    = (byId('senha') && byId('senha').value) || '';

    if (!nome || !email || !usuario || !senha) {
      showMessage('error', 'Preencha nome, e-mail, usuário e senha.');
      return;
    }
    if (senha.length < 6) {
      showMessage('error', 'Use uma senha com pelo menos 6 caracteres.');
      return;
    }
    // Validação básica de e-mail no front
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage('error', 'Informe um e-mail válido.');
      return;
    }

    var btn = qs('#signupForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }

    try {
      var res = await requireClient().auth.signUp({
        email:    email,
        password: senha,
        options:  { data: { nome: nome, usuario: usuario, telegram: telegram } }
      });

      if (res.error) {
        var msg = res.error.message;
        if (msg && (msg.includes('already registered') || msg.includes('already been registered'))) {
          showMessage('error', 'Esse e-mail já está cadastrado. Tenta entrar com ele.');
        } else if (msg && msg.includes('password')) {
          showMessage('error', 'Escolha uma senha mais forte (mínimo 6 caracteres).');
        } else {
          showMessage('error', 'Não foi possível criar sua conta agora. Tente novamente.');
        }
        return;
      }

      showMessage('success', 'Conta criada 💖 redirecionando para o login…');
      setTimeout(function () { window.location.href = '/login.html'; }, 1200);
    } catch (e) {
      showMessage('error', 'Não foi possível criar sua conta agora. Tente novamente.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Criar conta 😈'; }
    }
  }

  // ────────────────────────────────────────────────────────────
  // FORMULÁRIOS — Login
  // ────────────────────────────────────────────────────────────
  async function login() {
    var email = ((byId('email') && byId('email').value) || '').trim();
    var senha =  (byId('senha') && byId('senha').value) || '';
    if (!email || !senha) {
      showMessage('error', 'Digite seu e-mail e sua senha.');
      return;
    }

    var btn = qs('#loginForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

    try {
      var res = await requireClient().auth.signInWithPassword({
        email: email, password: senha
      });
      if (res.error) {
        showMessage('error', 'E-mail ou senha incorretos. Confere e tenta de novo.');
        return;
      }
      window.location.href = '/index.html';
    } catch (e) {
      showMessage('error', 'Não foi possível entrar agora. Tente novamente.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar 😈'; }
    }
  }

  // ────────────────────────────────────────────────────────────
  // FORMULÁRIOS — Logout
  // ────────────────────────────────────────────────────────────
  async function logout() {
    try {
      if (configured()) await requireClient().auth.signOut();
    } catch (_) { /* ignora */ }
    window.location.href = '/index.html';
  }
  window.logout = logout;

  // ────────────────────────────────────────────────────────────
  // FORMULÁRIOS — Recuperação de senha (pede e-mail)
  // ────────────────────────────────────────────────────────────
  async function sendReset() {
    var email = ((byId('email') && byId('email').value) || '').trim();
    if (!email) {
      showMessage('error', 'Informe seu e-mail.');
      return;
    }

    var btn = qs('#resetForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    try {
      var res = await requireClient().auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/redefinir-senha.html'
      });
      if (res.error) {
        showMessage('error', 'Não conseguimos enviar o link agora. Tente em breve.');
        return;
      }
      showMessage('success', 'Se o e-mail existir, o link de recuperação já foi enviado 💌');
    } catch (e) {
      showMessage('error', 'Não conseguimos enviar o link agora. Tente em breve.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar link'; }
    }
  }

  // ────────────────────────────────────────────────────────────
  // FORMULÁRIOS — Nova senha (após clicar no link do e-mail)
  // ────────────────────────────────────────────────────────────
  async function updatePassword() {
    var senha    = (byId('senha')    && byId('senha').value)    || '';
    var confirmar = (byId('confirmar') && byId('confirmar').value) || '';
    if (senha.length < 6) {
      showMessage('error', 'Use uma senha com pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmar) {
      showMessage('error', 'As senhas não coincidem.');
      return;
    }

    var btn = qs('#newPasswordForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var res = await requireClient().auth.updateUser({ password: senha });
      if (res.error) {
        showMessage('error', 'Não foi possível salvar a nova senha. Tente pelo link novamente.');
        return;
      }
      showMessage('success', 'Senha atualizada com sucesso! Redirecionando…');
      setTimeout(function () { window.location.href = '/login.html'; }, 1500);
    } catch (e) {
      showMessage('error', 'Não foi possível salvar a nova senha. Tente pelo link novamente.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar nova senha'; }
    }
  }

  // ────────────────────────────────────────────────────────────
  // FORMULÁRIOS — Atualizar perfil
  // ────────────────────────────────────────────────────────────
  async function updateProfile() {
    var auth = await ensureAuth({ redirect: false });
    if (!auth.user) {
      showMessage('error', 'Sessão expirada. Faça login novamente.');
      return;
    }
    var payload = {
      nome:     ((byId('nome')     && byId('nome').value)     || '').trim()                         || null,
      usuario:  ((byId('usuario')  && byId('usuario').value)  || '').trim().replace(/^@+/, '')       || null,
      telegram: ((byId('telegram') && byId('telegram').value) || '').trim().replace(/^@+/, '')       || null,
      bio:      ((byId('bio')      && byId('bio').value)      || '').trim()                          || null
    };

    var btn = qs('#accountForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var res = await requireClient()
        .from('perfis')
        .update(payload)
        .eq('id', auth.user.id);
      if (res.error) {
        showMessage('error', 'Não foi possível salvar agora. Tente novamente.');
        return;
      }
      showMessage('success', 'Perfil atualizado 💖');
      await renderMyAccount();
      await refreshNav();
    } catch (e) {
      showMessage('error', 'Não foi possível salvar agora. Tente novamente.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    }
  }

  // ────────────────────────────────────────────────────────────
  // PEDIDO DE ACESSO
  // ────────────────────────────────────────────────────────────
  async function requestAccess() {
    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    var button   = byId('buyButton');
    var original = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Enviando...'; }

    try {
      var sessionRes = await requireClient().auth.getSession();
      var token = sessionRes.data && sessionRes.data.session
        ? sessionRes.data.session.access_token : '';
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      var res = await fetch('/api/request-access', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ plano: PLAN_NAME, valor: PLAN_PRICE })
      });

      var result = {};
      try { result = await res.json(); } catch (_) {}

      if (!res.ok) throw new Error(result.error || 'Não foi possível enviar seu pedido.');

      showMessage('success', 'Pedido enviado 😈 agora me chama no Telegram pra liberar mais rápido!');

      var tgUrl = telegramLink(
        'Oi Beatriz! Acabei de pedir o acesso ' + PLAN_NAME + ' de ' + money(PLAN_PRICE) + ' no site.'
      );
      // Abre Telegram depois de pequeno delay para garantir que o toast aparece
      setTimeout(function () {
        window.open(tgUrl, '_blank', 'noopener,noreferrer');
      }, 400);

      await renderMyAccount();
    } catch (err) {
      showMessage('error', (err && err.message) || 'Não foi possível enviar seu pedido agora.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  // ────────────────────────────────────────────────────────────
  // PÁGINAS — Home
  // ────────────────────────────────────────────────────────────
  async function renderHome() {
    var ctaPrice = byId('ctaPrice');
    if (ctaPrice) ctaPrice.textContent = PLAN_NAME + ' · ' + money(PLAN_PRICE);

    if (!configured()) {
      var s = byId('miniState');
      if (s) s.textContent = 'Volta daqui a pouquinho 💖';
    }
    // refreshNav() já atualiza miniState e heroAction
  }

  // ────────────────────────────────────────────────────────────
  // PÁGINAS — Assinar
  // ────────────────────────────────────────────────────────────
  async function renderSubscriptionPage() {
    // Preenche preços antes de verificar auth (sem piscar)
    qsa('[data-plan-price]').forEach(function (el) { el.textContent = money(PLAN_PRICE); });
    qsa('[data-plan-name]').forEach( function (el) { el.textContent = PLAN_NAME; });

    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    var welcome = byId('buyerName');
    if (welcome) {
      welcome.textContent =
        (auth.profile && (auth.profile.nome || auth.profile.usuario)) ||
        (auth.user.email && auth.user.email.split('@')[0]) ||
        'linda';
    }

    if (isActiveSubscriber(auth.profile)) {
      var already = byId('alreadyActive');
      var card    = byId('planCard');
      if (already) already.hidden = false;
      if (card)    card.classList.add('is-active');
    }

    var btn = byId('buyButton');
    if (btn) btn.addEventListener('click', requestAccess);
  }

  // ────────────────────────────────────────────────────────────
  // PÁGINAS — Conteúdo (área premium)
  // ────────────────────────────────────────────────────────────
  async function renderContentPage() {
    // Esconde tudo imediatamente até a sessão ser verificada
    var gate    = byId('accessGate');
    var content = byId('contentArea');
    if (gate)    gate.hidden    = true;   // oculta gate também inicialmente
    if (content) content.hidden = true;   // conteúdo começa oculto

    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    var locked = !isActiveSubscriber(auth.profile);
    if (gate)    gate.hidden    = !locked;
    if (content) content.hidden =  locked;

    var nameEl = byId('contentBuyerName');
    if (nameEl) {
      nameEl.textContent =
        (auth.profile && (auth.profile.nome || auth.profile.usuario)) ||
        (auth.user.email && auth.user.email.split('@')[0]) ||
        'você';
    }
  }

  // ────────────────────────────────────────────────────────────
  // PÁGINAS — Minha conta
  // ────────────────────────────────────────────────────────────
  async function renderMyAccount() {
    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    var p = auth.profile || {};

    // Preenche campos do formulário
    var fNome     = byId('nome');     if (fNome)     fNome.value     = p.nome     || '';
    var fUsuario  = byId('usuario');  if (fUsuario)  fUsuario.value  = p.usuario  || '';
    var fTelegram = byId('telegram'); if (fTelegram) fTelegram.value = p.telegram || '';
    var fBio      = byId('bio');      if (fBio)      fBio.value      = p.bio      || '';

    // Status de assinatura
    var statusEl = byId('memberStatus');
    if (statusEl) {
      if (isActiveSubscriber(p)) {
        statusEl.textContent  = 'Acesso liberado 😈' + (p.plano ? ' · ' + p.plano : '');
        statusEl.style.background   = 'rgba(54,208,159,0.15)';
        statusEl.style.borderColor  = 'rgba(54,208,159,0.4)';
        statusEl.style.color        = '#b8ffd9';
      } else {
        statusEl.textContent  = 'Acesso ainda não liberado 💋';
        statusEl.style.background   = '';
        statusEl.style.borderColor  = '';
        statusEl.style.color        = '';
      }
    }

    // Histórico de pedidos
    var ordersBox = byId('requestHistory');
    if (ordersBox) {
      var ordRes = await requireClient()
        .from('pedidos_acesso')
        .select('id,plano,valor,status,criado_em')
        .eq('user_id', auth.user.id)
        .order('criado_em', { ascending: false });

      var statusLabel = function (s) {
        if (s === 'aprovado')  return '✅ Aprovado';
        if (s === 'cancelado') return '❌ Cancelado';
        return '⏳ Em análise';
      };

      var orders = ordRes.data || [];
      ordersBox.innerHTML = orders.length === 0
        ? '<div class="empty-state">Assim que você pedir o acesso, ele aparece aqui 😈</div>'
        : orders.map(function (item) {
            return '<div class="mini-card">' +
              '<strong>' + (item.plano || PLAN_NAME) + '</strong>' +
              '<span>' + money(item.valor) + '</span>' +
              '<p>' + statusLabel(item.status) + '</p>' +
              '</div>';
          }).join('');
    }
  }

  // ────────────────────────────────────────────────────────────
  // PÁGINAS — Admin
  // ────────────────────────────────────────────────────────────
  async function loadAdminUsers() {
    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    // Verificação frontend: só visual — backend valida de verdade com ADMIN_EMAIL privado
    var hintEmail = String(window.ADMIN_EMAIL_HINT || '').toLowerCase();
    if (!hintEmail || !auth.user.email ||
        auth.user.email.toLowerCase() !== hintEmail) {
      window.location.href = '/index.html';
      return;
    }

    var sessionRes = await requireClient().auth.getSession();
    var token      = sessionRes.data && sessionRes.data.session
      ? sessionRes.data.session.access_token : '';
    var search     = ((byId('adminSearch') && byId('adminSearch').value) || '').trim();
    var url        = '/api/admin-users' + (search ? '?q=' + encodeURIComponent(search) : '');

    var table = byId('adminUsers');
    if (table) table.innerHTML = '<div class="empty-state">Carregando…</div>';

    try {
      var res    = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      var result = {};
      try { result = await res.json(); } catch (_) {}

      if (!res.ok) {
        showMessage('error', result.error || 'Não foi possível carregar a lista.');
        return;
      }

      if (!table) return;

      var rows = (result.users || []).map(function (u) {
        var statusLabel = u.assinante_ativo
          ? '<span class="tag-ativo">Ativo</span>'
          : u.pedido_status === 'pendente'
            ? '<span class="tag-pendente">Pedido pendente</span>'
            : '<span class="tag-sem">Sem acesso</span>';

        var tg = u.telegram ? '<p>Telegram: @' + u.telegram + '</p>' : '';
        var us = u.usuario  ? '<p>@' + u.usuario + '</p>' : '';

        return '<div class="admin-row">' +
          '<div class="admin-col-user">' +
            '<strong>' + (u.nome || u.email || 'Sem nome') + '</strong>' +
            '<p>' + (u.email || '') + '</p>' +
            us + tg +
          '</div>' +
          '<div class="admin-col-status">' +
            statusLabel +
            (u.plano ? '<p>' + u.plano + '</p>' : '') +
          '</div>' +
          '<div class="admin-col-actions">' +
            '<button class="button small" onclick="window.adminSet(\'' + u.id + '\',\'approve\')">Aprovar</button>' +
            '<button class="button ghost small" onclick="window.adminSet(\'' + u.id + '\',\'remove\')">Remover</button>' +
          '</div>' +
        '</div>';
      }).join('');

      table.innerHTML = rows || '<div class="empty-state">Nenhuma conta encontrada.</div>';
    } catch (e) {
      showMessage('error', 'Não foi possível carregar a lista. Tente novamente.');
    }
  }

  async function adminSet(userId, action) {
    var sessionRes = await requireClient().auth.getSession();
    var token      = sessionRes.data && sessionRes.data.session
      ? sessionRes.data.session.access_token : '';

    try {
      var res = await fetch('/api/admin-users', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ user_id: userId, action: action, plano: PLAN_NAME, valor: PLAN_PRICE })
      });
      var result = {};
      try { result = await res.json(); } catch (_) {}
      if (!res.ok) {
        showMessage('error', result.error || 'Não foi possível salvar.');
        return;
      }
      showMessage('success', action === 'approve' ? 'Acesso liberado ✅' : 'Acesso removido.');
      await loadAdminUsers();
    } catch (e) {
      showMessage('error', 'Não foi possível salvar. Tente novamente.');
    }
  }
  window.adminSet = adminSet;

  // ────────────────────────────────────────────────────────────
  // HOOK DE FORMULÁRIOS
  // ────────────────────────────────────────────────────────────
  function hookForms() {
    function hook(id, fn) {
      var el = byId(id);
      if (el) el.addEventListener('submit', function (e) { e.preventDefault(); fn(); });
    }
    hook('signupForm',      signUp);
    hook('loginForm',       login);
    hook('resetForm',       sendReset);
    hook('newPasswordForm', updatePassword);
    hook('accountForm',     updateProfile);
    hook('adminSearchForm', loadAdminUsers);
  }

  // ────────────────────────────────────────────────────────────
  // RESET DE SENHA — detecta URL de recovery com hash ou query
  // Deve rodar ANTES do boot para não perder o evento
  // ────────────────────────────────────────────────────────────
  function checkResetUrl() {
    var hash   = window.location.hash   || '';
    var search = window.location.search || '';
    return (
      hash.includes('type=recovery') ||
      hash.includes('access_token')  ||
      search.includes('type=recovery')
    );
  }

  function showResetStep2() {
    var step1 = byId('resetForm-wrap');
    var step2 = byId('newPassword-wrap');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
  }

  // ────────────────────────────────────────────────────────────
  // BOOT
  // ────────────────────────────────────────────────────────────
  async function boot() {
    try {
      if (!window.createSupabaseClient || !window.supabase) {
        showMessage('error', 'Não consegui carregar o site agora. Recarregue a página.');
        return;
      }
      if (configured()) sb = window.createSupabaseClient();

      hookForms();

      // Menu mobile
      var toggle = byId('mobileMenuToggle');
      if (toggle) {
        toggle.addEventListener('click', function () {
          var menu = byId('mobileMenu');
          setMenuOpen(!menu || menu.dataset.open !== 'true');
        });
      }
      qsa('[data-close-menu]').forEach(function (el) {
        el.addEventListener('click', function () { setMenuOpen(false); });
      });

      var page = (document.body.dataset && document.body.dataset.page) || '';

      // Página de reset: registra listener de auth ANTES de refreshNav
      // para não perder o evento PASSWORD_RECOVERY
      if (page === 'reset' && configured()) {
        // Verifica URL primeiro (hash/query) — caso mais confiável
        if (checkResetUrl()) {
          showResetStep2();
        }
        // Listener para o evento do Supabase (pode chegar após o pageload)
        requireClient().auth.onAuthStateChange(function (event) {
          if (event === 'PASSWORD_RECOVERY') showResetStep2();
        });
      }

      // Nav + listener de estado de auth em todas as páginas
      if (configured()) {
        await refreshNav();
        // onAuthStateChange para atualizar nav quando sessão muda
        // (não registrar de novo na página reset — já foi registrado acima)
        if (page !== 'reset') {
          requireClient().auth.onAuthStateChange(async function () {
            await refreshNav();
          });
        }
      }

      // Renderizações por página
      if (page === 'home')      await renderHome();
      if (page === 'subscribe') await renderSubscriptionPage();
      if (page === 'content')   await renderContentPage();
      if (page === 'account')   await renderMyAccount();
      if (page === 'admin')     await loadAdminUsers();

    } catch (err) {
      console.error('[boot]', err);
      showMessage('error', (err && err.message) || 'Algo não saiu como esperado. Recarregue a página.');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
