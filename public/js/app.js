(function () {
  'use strict';

  // ─── CONFIG CENTRAL ──────────────────────────────────────────
  var CONTACT = {
    instagram: 'https://instagram.com/lopes.beeatrizz',
    telegram: 'https://t.me/' + (window.TELEGRAM_USERNAME || 'talespwk').replace('@', '')
  };

  var sb = null;
  var _realtimeChannel = null;

  // ─── UTILITÁRIOS ─────────────────────────────────────────────
  function byId(id)       { return document.getElementById(id); }
  function qs(sel, root)  { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
    if (!configured()) throw new Error('Serviço não disponível. Recarregue a página.');
    sb = window.createSupabaseClient();
    if (!sb) throw new Error('Não foi possível carregar o site. Recarregue a página.');
    return sb;
  }

  function telegramLink(text) {
    var user = String(window.TELEGRAM_USERNAME || 'talespwk').replace('@', '').trim();
    return 'https://t.me/' + user + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  function isActiveSubscriber(profile) {
    if (!profile || !profile.assinante) return false;
    if (!profile.assinatura_fim) return true;
    var end = new Date(profile.assinatura_fim);
    return !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
  }

  // ─── TOAST ───────────────────────────────────────────────────
  function toast(type, message) {
    var container = byId('toastContainer');
    if (!container) {
      // Fallback: usa caixas de mensagem legadas
      qsa('[data-message]').forEach(function (box) {
        box.textContent = message || '';
        box.className   = 'message-box';
        if (message) box.classList.add(type === 'error' ? 'is-error' : 'is-success');
      });
      return;
    }
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  // Alias legado
  function showMessage(type, text) { toast(type === 'error' ? 'error' : 'success', text); }

  // ─── MENU MOBILE ─────────────────────────────────────────────
  function setMenuOpen(open) {
    var menu   = byId('mobileMenu');
    var toggle = byId('mobileMenuToggle');
    if (!menu || !toggle) return;
    menu.dataset.open = open ? 'true' : 'false';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', !!open);
  }

  // ─── AUTH ─────────────────────────────────────────────────────
  async function getSession() {
    try {
      var res = await requireClient().auth.getSession();
      return res.data.session || null;
    } catch (e) { return null; }
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
    } catch (e) { return null; }
  }

  async function ensureAuth(options) {
    var opts    = options || {};
    var session = await getSession();
    if (!session || !session.user) {
      if (opts.redirect !== false) window.location.href = '/login.html';
      return { user: null, profile: null, token: null };
    }
    var profile = await getProfile(session.user.id);
    return { user: session.user, profile: profile, token: session.access_token };
  }

  async function getToken() {
    var session = await getSession();
    return session ? session.access_token : null;
  }

  // ─── NAV ──────────────────────────────────────────────────────
  async function refreshNav() {
    var session = configured() ? await getSession() : null;
    var user    = session ? session.user : null;
    var profile = user ? await getProfile(user.id) : null;
    var vip     = isActiveSubscriber(profile);
    // Link de admin não é exibido na navbar (segurança — não revela o alvo)
    // Administrador acessa /admin.html diretamente pela URL

    qsa('[data-guest-only]').forEach(function (el) { el.hidden = !!user; });
    qsa('[data-auth-only]').forEach( function (el) { el.hidden = !user; });
    qsa('[data-admin-only]').forEach(function (el) { el.hidden = true; }); // sempre oculto

    var displayName =
      (profile && (profile.usuario || profile.nome)) ||
      (user && user.email && user.email.split('@')[0]) || 'conta';
    qsa('[data-user-name]').forEach(function (el) { el.textContent = displayName; });

    qsa('[data-member-link]').forEach(function (el) {
      el.href = vip ? '/conteudo.html' : '/assinar.html';
    });

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

    var miniState = byId('miniState');
    if (miniState) {
      if (!user)     miniState.textContent = 'Prévia livre 🔥';
      else if (vip)  miniState.textContent = 'Acesso liberado 😈';
      else           miniState.textContent = 'Falta pouco pra entrar 💋';
    }

    // Suporte: configura links do widget
    var tgLinks = qsa('#supportTelegram');
    tgLinks.forEach(function (el) { el.href = CONTACT.telegram; });
  }

  // ─── FORMULÁRIOS: CADASTRO ───────────────────────────────────
  async function signUp() {
    var nome     = ((byId('nome')     && byId('nome').value)     || '').trim();
    var email    = ((byId('email')    && byId('email').value)    || '').trim();
    var usuario  = ((byId('usuario')  && byId('usuario').value)  || '').trim().replace(/^@+/, '');
    var telegram = ((byId('telegram') && byId('telegram').value) || '').trim().replace(/^@+/, '');
    var senha    = (byId('senha') && byId('senha').value) || '';

    if (!nome || !email || !usuario || !senha) {
      toast('error', 'Preencha nome, e-mail, usuário e senha.'); return;
    }
    if (senha.length < 6) {
      toast('error', 'Use uma senha com pelo menos 6 caracteres.'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('error', 'Informe um e-mail válido.'); return;
    }

    var btn = qs('#signupForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando…'; }

    try {
      var res = await requireClient().auth.signUp({
        email: email, password: senha,
        options: { data: { nome: nome, usuario: usuario, telegram: telegram } }
      });
      if (res.error) {
        var msg = res.error.message || '';
        if (msg.includes('already registered') || msg.includes('already been registered')) {
          toast('error', 'Esse e-mail já está cadastrado. Tenta entrar com ele.');
        } else if (msg.includes('password')) {
          toast('error', 'Escolha uma senha mais forte (mínimo 6 caracteres).');
        } else {
          toast('error', 'Não foi possível criar sua conta agora. Tente novamente.');
        }
        return;
      }
      toast('success', 'Conta criada 💖 redirecionando…');
      setTimeout(function () { window.location.href = '/login.html'; }, 1200);
    } catch (e) {
      toast('error', 'Não foi possível criar sua conta agora. Tente novamente.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Criar conta 😈'; }
    }
  }

  // ─── FORMULÁRIOS: LOGIN ──────────────────────────────────────
  async function login() {
    var email = ((byId('email') && byId('email').value) || '').trim();
    var senha =  (byId('senha') && byId('senha').value) || '';
    if (!email || !senha) { toast('error', 'Digite seu e-mail e sua senha.'); return; }

    var btn = qs('#loginForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }

    try {
      var res = await requireClient().auth.signInWithPassword({ email: email, password: senha });
      if (res.error) { toast('error', 'E-mail ou senha incorretos. Confere e tenta de novo.'); return; }
      window.location.href = '/index.html';
    } catch (e) {
      toast('error', 'Não foi possível entrar agora. Tente novamente.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar 😈'; }
    }
  }

  // ─── FORMULÁRIOS: LOGOUT ─────────────────────────────────────
  async function logout() {
    try { if (configured()) await requireClient().auth.signOut(); } catch (_) {}
    window.location.href = '/index.html';
  }
  window.logout = logout;

  // ─── FORMULÁRIOS: RESET DE SENHA ─────────────────────────────
  async function sendReset() {
    var email = ((byId('email') && byId('email').value) || '').trim();
    if (!email) { toast('error', 'Informe seu e-mail.'); return; }

    var btn = qs('#resetForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

    try {
      var res = await requireClient().auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/redefinir-senha.html'
      });
      if (res.error) { toast('error', 'Não conseguimos enviar o link agora. Tente em breve.'); return; }
      toast('success', 'Se o e-mail existir, o link foi enviado 💌');
    } catch (e) {
      toast('error', 'Não conseguimos enviar o link agora. Tente em breve.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar link'; }
    }
  }

  async function updatePassword() {
    var senha     = (byId('senha')    && byId('senha').value)    || '';
    var confirmar = (byId('confirmar') && byId('confirmar').value) || '';
    if (senha.length < 6) { toast('error', 'Use uma senha com pelo menos 6 caracteres.'); return; }
    if (senha !== confirmar) { toast('error', 'As senhas não coincidem.'); return; }

    var btn = qs('#newPasswordForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

    try {
      var res = await requireClient().auth.updateUser({ password: senha });
      if (res.error) { toast('error', 'Não foi possível salvar a nova senha. Tente pelo link novamente.'); return; }
      toast('success', 'Senha atualizada! Redirecionando…');
      setTimeout(function () { window.location.href = '/login.html'; }, 1500);
    } catch (e) {
      toast('error', 'Não foi possível salvar a nova senha. Tente pelo link novamente.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar nova senha'; }
    }
  }

  // ─── FORMULÁRIOS: PERFIL ─────────────────────────────────────
  async function updateProfile() {
    var auth = await ensureAuth({ redirect: false });
    if (!auth.user) { toast('error', 'Sessão expirada. Faça login novamente.'); return; }

    var payload = {
      nome:     ((byId('nome')     && byId('nome').value)     || '').trim()                   || null,
      usuario:  ((byId('usuario')  && byId('usuario').value)  || '').trim().replace(/^@+/, '') || null,
      telegram: ((byId('telegram') && byId('telegram').value) || '').trim().replace(/^@+/, '') || null,
      bio:      ((byId('bio')      && byId('bio').value)      || '').trim()                   || null
    };

    var btn = qs('#accountForm button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

    try {
      var res = await requireClient().from('perfis').update(payload).eq('id', auth.user.id);
      if (res.error) { toast('error', 'Não foi possível salvar agora. Tente novamente.'); return; }
      toast('success', 'Perfil atualizado 💖');
      await renderMyAccount();
      await refreshNav();
    } catch (e) {
      toast('error', 'Não foi possível salvar agora. Tente novamente.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    }
  }

  // ─── PEDIDO DE ACESSO ────────────────────────────────────────
  async function requestAccess(planId) {
    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    var button = byId('buyButton') || byId('buyButtonRetry');
    var original = button ? button.textContent : '';
    if (button) {
      button.disabled    = true;
      button.innerHTML   = '<span class="spinner"></span>Enviando…';
    }

    try {
      var token = auth.token;
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      var body = {};
      if (planId) body.plan_id = planId;

      var res = await fetch('/payments/request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body:    JSON.stringify(body)
      });

      var result = {};
      try { result = await res.json(); } catch (_) {}

      if (!res.ok) throw new Error(result.error || 'Não foi possível enviar seu pedido.');

      toast('success', 'Pedido enviado 😈 me chama no Telegram com o comprovante!');

      var planName = (result.plan && result.plan.name) || 'Vitalício';
      var planPrice = (result.plan && result.plan.price) || 5.90;
      var tgUrl = telegramLink(
        'Oi Beatriz! Acabei de pedir o acesso ' + planName + ' de ' + money(planPrice) + ' no site.'
      );
      setTimeout(function () { window.open(tgUrl, '_blank', 'noopener,noreferrer'); }, 400);

      await renderSubscriptionPage();
    } catch (err) {
      toast('error', (err && err.message) || 'Não foi possível enviar seu pedido agora.');
    } finally {
      if (button) { button.disabled = false; button.textContent = original; }
    }
  }

  // ─── PÁGINA: HOME ─────────────────────────────────────────────
  async function renderHome() {
    // refreshNav já cuida do hero
    if (!configured()) {
      var s = byId('miniState');
      if (s) s.textContent = 'Volta daqui a pouquinho 💖';
    }
  }

  // ─── PÁGINA: ASSINAR ─────────────────────────────────────────
  async function renderSubscriptionPage() {
    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    // Busca planos do backend
    try {
      var plansRes = await fetch('/payments/plans');
      var plansData = {};
      try { plansData = await plansRes.json(); } catch (_) {}
      var plans = plansData.plans || [];
      var plan  = plans[0];
      if (plan) {
        var nameEl  = byId('planName');  if (nameEl)  nameEl.textContent  = plan.name;
        var priceEl = byId('planPrice'); if (priceEl) priceEl.textContent = money(plan.price);
      }
    } catch (_) {}

    var welcome = byId('buyerName');
    if (welcome) {
      welcome.textContent =
        (auth.profile && (auth.profile.nome || auth.profile.usuario)) ||
        (auth.user.email && auth.user.email.split('@')[0]) || 'linda';
    }

    // Se já é assinante ativo
    if (isActiveSubscriber(auth.profile)) {
      var already = byId('alreadyActive');
      var card    = byId('planCard');
      if (already) already.hidden = false;
      if (card)    card.classList.add('is-active');
    }

    // Busca status dos pedidos via backend
    try {
      var token = auth.token;
      if (token) {
        var statusRes = await fetch('/payments/status', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        var statusData = {};
        try { statusData = await statusRes.json(); } catch (_) {}

        if (statusRes.ok) {
          var payments = statusData.payments || [];
          var latestPayment = payments[0] || null;

          var stateNoPedido = byId('stateNoPedido');
          var statePendente = byId('statePendente');
          var stateRecusado = byId('stateRecusado');

          if (stateNoPedido) stateNoPedido.hidden = true;
          if (statePendente) statePendente.hidden = true;
          if (stateRecusado) stateRecusado.hidden = true;

          if (!latestPayment || isActiveSubscriber(auth.profile)) {
            if (stateNoPedido) stateNoPedido.hidden = false;
          } else if (latestPayment.status === 'pending') {
            if (statePendente) statePendente.hidden = false;
            var tgFollowUp = byId('telgramFollowUpBtn');
            if (tgFollowUp) tgFollowUp.href = telegramLink('Oi Beatriz! Estou aguardando a aprovação do meu acesso.');
          } else if (latestPayment.status === 'rejected') {
            if (stateRecusado) stateRecusado.hidden = false;
            var motivoEl = byId('recusadoMotivo');
            if (motivoEl && latestPayment.rejection_reason) {
              motivoEl.textContent = 'Motivo: ' + latestPayment.rejection_reason;
            }
          } else {
            if (stateNoPedido) stateNoPedido.hidden = false;
          }
        }
      }
    } catch (_) {}

    var btn = byId('buyButton');
    if (btn) btn.addEventListener('click', function () { requestAccess(); });

    var btnRetry = byId('buyButtonRetry');
    if (btnRetry) btnRetry.addEventListener('click', function () { requestAccess(); });
  }

  // ─── PÁGINA: CONTEÚDO ────────────────────────────────────────
  async function renderContentPage() {
    var gate    = byId('accessGate');
    var content = byId('contentArea');
    if (gate)    gate.hidden    = true;
    if (content) content.hidden = true;

    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    // Dupla verificação: frontend usa perfil, mas backend é a fonte de verdade
    // Para conteúdo, validamos via /payments/status
    var hasAccess = isActiveSubscriber(auth.profile);

    try {
      var token = auth.token;
      if (token) {
        var res = await fetch('/payments/status', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          var data = {};
          try { data = await res.json(); } catch (_) {}
          // Backend é fonte de verdade — sobrepõe o frontend
          hasAccess = !!data.has_access;
        } else {
          // Fail-safe: se backend falhar, nega acesso (fail closed)
          hasAccess = false;
        }
      } else {
        hasAccess = false;
      }
    } catch (_) {
      // Fail-safe: qualquer erro nega acesso
      hasAccess = false;
    }

    if (gate)    gate.hidden    = hasAccess;
    if (content) content.hidden = !hasAccess;

    var nameEl = byId('contentBuyerName');
    if (nameEl) {
      nameEl.textContent =
        (auth.profile && (auth.profile.nome || auth.profile.usuario)) ||
        (auth.user.email && auth.user.email.split('@')[0]) || 'você';
    }

    // Realtime: escuta mudanças na assinatura
    if (hasAccess && configured()) {
      setupRealtimeSubscription(auth.user.id);
    }
  }

  // ─── REALTIME ─────────────────────────────────────────────────
  function setupRealtimeSubscription(userId) {
    if (_realtimeChannel) return; // Já configurado

    try {
      var client = requireClient();
      _realtimeChannel = client
        .channel('subscription-watch-' + userId)
        .on('postgres_changes', {
          event:  'UPDATE',
          schema: 'public',
          table:  'perfis',
          filter: 'id=eq.' + userId
        }, function (payload) {
          var newData = payload.new;
          var now = Date.now();
          var stillActive =
            !!newData.assinante &&
            (!newData.assinatura_fim || new Date(newData.assinatura_fim).getTime() > now);

          if (!stillActive) {
            // Acesso revogado — revalida via backend (fail closed)
            renderContentPage();
          }
        })
        .on('postgres_changes', {
          event:  '*',
          schema: 'public',
          table:  'subscriptions',
          filter: 'user_id=eq.' + userId
        }, function () {
          // Qualquer mudança na assinatura — revalida via backend
          renderContentPage();
        })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            console.log('[realtime] canal ativo');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn('[realtime] canal fechado, usando fallback');
            _realtimeChannel = null;
            // Fallback: revalida via backend após delay
            setTimeout(renderContentPage, 1500); // Revalida rápido via backend (fail-safe)
          }
        });
    } catch (e) {
      console.warn('[realtime] falha ao configurar:', e);
    }
  }

  // ─── PÁGINA: MINHA CONTA ─────────────────────────────────────
  async function renderMyAccount() {
    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    var p = auth.profile || {};

    // Preenche formulário
    var fNome     = byId('nome');     if (fNome)     fNome.value     = p.nome     || '';
    var fUsuario  = byId('usuario');  if (fUsuario)  fUsuario.value  = p.usuario  || '';
    var fTelegram = byId('telegram'); if (fTelegram) fTelegram.value = p.telegram || '';
    var fBio      = byId('bio');      if (fBio)      fBio.value      = p.bio      || '';

    // Status de assinatura
    var statusEl = byId('memberStatus');
    var isActive = isActiveSubscriber(p);

    if (statusEl) {
      statusEl.className = 'subscription-status-card ' + (isActive ? 'active' : 'inactive');
      var label = statusEl.querySelector('.subscription-status-label');
      if (!label) {
        label = document.createElement('div');
        label.className = 'subscription-status-label';
        statusEl.appendChild(label);
      }
      if (isActive) {
        label.textContent = '✅ Acesso liberado' + (p.plano ? ' · ' + p.plano : '');
      } else {
        label.textContent = '🔒 Acesso ainda não liberado';
      }
    }

    // Data de expiração
    var expiresEl = byId('subscriptionExpires');
    var detailsEl = byId('subscriptionDetails');
    if (expiresEl && detailsEl) {
      if (isActive && p.assinatura_fim) {
        var exp = new Date(p.assinatura_fim);
        // Se vitalício (~2099), não mostra data
        if (exp.getFullYear() < 2090) {
          expiresEl.textContent = 'Expira em ' + fmtDate(p.assinatura_fim);
          detailsEl.hidden = false;
        }
      }
    }

    // Botões de ação
    var upgradeBtn = byId('upgradeBtn');
    var contentBtn = byId('contentBtn');
    if (upgradeBtn) upgradeBtn.hidden = isActive;
    if (contentBtn) contentBtn.hidden = !isActive;

    // Busca pedidos via backend autenticado
    var ordersBox = byId('requestHistory');
    if (ordersBox) {
      ordersBox.innerHTML = '<div class="empty-state"><span class="spinner"></span>Carregando…</div>';
      try {
        var token = auth.token;
        if (token) {
          var res = await fetch('/payments/status', {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          var data = {};
          try { data = await res.json(); } catch (_) {}
          var payments = (data && data.payments) || [];

          var statusLabel = function (s) {
            // Whitelist de status — nunca renderiza valor bruto do banco
            if (s === 'approved') return '<span class="tag-ativo">✅ Aprovado</span>';
            if (s === 'rejected') return '<span class="tag-sem">❌ Recusado</span>';
            if (s === 'canceled') return '<span class="tag-sem">Cancelado</span>';
            if (s === 'pending')  return '<span class="tag-pendente">⏳ Em análise</span>';
            return '<span class="tag-sem">-</span>'; // fallback seguro sem valor bruto
          };

          if (!payments.length) {
            ordersBox.innerHTML = '<div class="empty-state">Nenhum pedido ainda. <a href="/assinar.html" style="color:var(--accent);">Pedir acesso</a></div>';
          } else {
            ordersBox.innerHTML = payments.map(function (item) {
              var rejReason = item.rejection_reason
                ? '<div class="order-rejection-reason">Motivo: ' + escHtml(item.rejection_reason) + '</div>'
                : '';
              return '<div class="order-item">' +
                '<div class="order-item-info">' +
                  '<div class="order-item-plan">' + escHtml(item.plan_id || 'Vitalício') + '</div>' +
                  '<div class="order-item-date">' + fmtDate(item.created_at) + '</div>' +
                  rejReason +
                '</div>' +
                '<div class="order-item-right">' +
                  '<div class="order-item-amount">' + money(item.amount) + '</div>' +
                  statusLabel(item.status) +
                '</div>' +
              '</div>';
            }).join('');
          }
        }
      } catch (e) {
        ordersBox.innerHTML = '<div class="empty-state">Não foi possível carregar pedidos agora.</div>';
      }
    }

    // Realtime para minha-conta: configura apenas uma vez por sessão
    if (configured() && !window._accountRealtimeSet) {
      window._accountRealtimeSet = true;
      try {
        var client = requireClient();
        client
          .channel('account-watch-' + auth.user.id)
          .on('postgres_changes', {
            event:  'UPDATE',
            schema: 'public',
            table:  'perfis',
            filter: 'id=eq.' + auth.user.id
          }, function () { renderMyAccount(); })
          .on('postgres_changes', {
            event:  '*',
            schema: 'public',
            table:  'subscriptions',
            filter: 'user_id=eq.' + auth.user.id
          }, function () { renderMyAccount(); })
          .subscribe();
      } catch (_) {}
    }
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── PÁGINA: ADMIN ───────────────────────────────────────────
  var _currentRejectPaymentId = null;

  async function loadAdminPayments(forceRefresh) {
    var auth = await ensureAuth({ redirect: true });
    if (!auth.user) return;

    // A verificação real de admin é feita pelo backend (env.ADMIN_EMAIL).
    // O frontend não redireciona baseado em e-mail — qualquer um pode tentar acessar /admin.html,
    // mas o backend retornará 403 para não-admins em todas as chamadas de dados.

    var token      = auth.token;
    var search     = ((byId('adminSearch') && byId('adminSearch').value) || '').trim();
    var status     = ((byId('filterStatus') && byId('filterStatus').value) || '').trim();
    var params     = new URLSearchParams();
    if (search) params.set('q', search);
    if (status) params.set('status', status);
    var url = '/admin/payments' + (params.toString() ? '?' + params.toString() : '');

    var container = byId('adminPayments');
    if (container) container.innerHTML = '<div class="empty-state"><span class="spinner"></span>Carregando…</div>';

    try {
      var res    = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      var result = {};
      try { result = await res.json(); } catch (_) {}

      if (!res.ok) {
  toast('error', result.error || 'Não foi possível carregar os pedidos.');
  if (container) {
    container.innerHTML = '<div class="empty-state">Não foi possível carregar os pedidos.</div>';
  }
  return;
  } 
      if (!container) return;
      var payments = result.payments || [];

      if (!payments.length) {
        container.innerHTML = '<div class="empty-state">Nenhum pedido encontrado.</div>';
        return;
      }

      // Delegação de eventos: evita onclick inline com dados externos
      container.addEventListener('click', function handler(e) {
        var btn = e.target.closest('[data-payment-id]');
        if (!btn) return;
        var pid = btn.getAttribute('data-payment-id');
        var act = btn.getAttribute('data-action');
        if (!pid || !/^[0-9a-f-]{36}$/i.test(pid)) return; // valida UUID no frontend também
        if (act === 'approve') window.adminApprove(pid);
        if (act === 'reject')  window.adminOpenReject(pid);
      }, { once: true }); // rebind a cada carregamento

      container.innerHTML = payments.map(function (p) {
        var statusBadge = {
          pending:  '<span class="tag-pendente">⏳ Pendente</span>',
          approved: '<span class="tag-ativo">✅ Aprovado</span>',
          rejected: '<span class="tag-sem">❌ Recusado</span>',
          canceled: '<span class="tag-sem">Cancelado</span>',
          expired:  '<span class="tag-sem">Expirado</span>'
        }[p.status] || '<span class="tag-sem">' + escHtml(p.status) + '</span>';

        var userInfo = escHtml(p.user_nome || p.user_email || 'Sem nome');
        var emailInfo = p.user_nome ? escHtml(p.user_email) : '';
        var tgInfo = p.user_telegram ? '@' + escHtml(p.user_telegram) : '';
        var proofInfo = p.proof_text ? '<p style="font-size:.8rem;color:var(--muted);margin-top:6px;">📝 ' + escHtml(p.proof_text) + '</p>' : '';
        var rejInfo = p.rejection_reason ? '<p style="font-size:.8rem;color:#ffb3b3;margin-top:4px;">Motivo recusa: ' + escHtml(p.rejection_reason) + '</p>' : '';
        var approvedInfo = p.approved_at ? '<p style="font-size:.78rem;color:var(--muted);">Aprovado em ' + fmtDate(p.approved_at) + '</p>' : '';
        var rejectedInfo = p.rejected_at ? '<p style="font-size:.78rem;color:var(--muted);">Recusado em ' + fmtDate(p.rejected_at) + '</p>' : '';

        // Usando data-id em vez de onclick com string interpolada (evita XSS)
        var actions = p.status === 'pending'
          ? '<button class="btn-approve" data-payment-id="' + escHtml(p.id) + '" data-action="approve">✅ Aprovar</button>' +
            '<button class="btn-reject"  data-payment-id="' + escHtml(p.id) + '" data-action="reject">❌ Recusar</button>'
          : '';

        return '<div class="payment-card" id="pcard-' + p.id + '">' +
          '<div class="payment-card-header">' +
            '<div>' +
              '<strong>' + userInfo + '</strong>' +
              (emailInfo ? '<div class="payment-card-meta">' + emailInfo + '</div>' : '') +
              (tgInfo    ? '<div class="payment-card-meta">' + tgInfo    + '</div>' : '') +
            '</div>' +
            '<div style="text-align:right;">' +
              statusBadge +
              '<div style="font-size:.9rem;font-weight:700;margin-top:6px;">' + money(p.amount) + '</div>' +
              '<div style="font-size:.78rem;color:var(--muted);">' + escHtml(p.plan_name || '') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="payment-card-meta" style="margin-top:8px;">' +
            'Pedido em ' + fmtDate(p.created_at) +
          '</div>' +
          proofInfo + rejInfo + approvedInfo + rejectedInfo +
          (actions ? '<div class="payment-card-actions">' + actions + '</div>' : '') +
        '</div>';
      }).join('');

      // Realtime para admin: atualiza lista quando payments mudar
      setupAdminRealtime(token);

    } catch (e) {
  console.error('[loadAdminPayments]', e);
  toast('error', 'Não foi possível carregar os pedidos. Tente novamente.');
  if (container) {
    container.innerHTML = '<div class="empty-state">Erro ao carregar os pedidos.</div>';
    }
  }

  }

  function setupAdminRealtime(token) {
    if (_realtimeChannel) return;
    try {
      var client = requireClient();
      _realtimeChannel = client
        .channel('admin-payments-watch')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, function () {
          loadAdminPayments();
        })
        .subscribe();
    } catch (_) {}
  }

  window.adminApprove = async function (paymentId) {
    if (!confirm('Aprovar este pedido e liberar o acesso do usuário?')) return;

    var btn = qs('#pcard-' + paymentId + ' .btn-approve');
    if (btn) { btn.disabled = true; btn.textContent = 'Aprovando…'; }

    var token = await getToken();
    try {
      var res = await fetch('/admin/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body:    JSON.stringify({ action: 'approve', payment_id: paymentId })
      });
      var result = {};
      try { result = await res.json(); } catch (_) {}

      if (!res.ok) {
        toast('error', result.error || 'Não foi possível aprovar.');
        if (btn) { btn.disabled = false; btn.textContent = '✅ Aprovar'; }
        return;
      }
      toast('success', 'Acesso liberado com sucesso ✅');
      await loadAdminPayments();
    } catch (e) {
      toast('error', 'Não foi possível aprovar. Tente novamente.');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Aprovar'; }
    }
  };

  window.adminOpenReject = function (paymentId) {
    _currentRejectPaymentId = paymentId;
    var modal = byId('rejectModal');
    var reason = byId('rejectReason');
    if (modal)  modal.style.display  = 'flex';
    if (reason) reason.value = '';
    setTimeout(function () { if (reason) reason.focus(); }, 50);
  };

  window.closeRejectModal = function () {
    var modal = byId('rejectModal');
    if (modal) modal.style.display = 'none';
    _currentRejectPaymentId = null;
  };

  window.confirmReject = async function () {
    var paymentId = _currentRejectPaymentId;
    if (!paymentId) return;

    var reason = ((byId('rejectReason') && byId('rejectReason').value) || '').trim();
    if (!reason) { toast('error', 'Informe o motivo da recusa.'); return; }

    var btn = byId('rejectConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Recusando…'; }

    var token = await getToken();
    try {
      var res = await fetch('/admin/payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body:    JSON.stringify({ action: 'reject', payment_id: paymentId, reason: reason })
      });
      var result = {};
      try { result = await res.json(); } catch (_) {}

      if (!res.ok) {
        toast('error', result.error || 'Não foi possível recusar.');
        if (btn) { btn.disabled = false; btn.textContent = 'Confirmar recusa'; }
        return;
      }
      window.closeRejectModal();
      toast('info', 'Pedido recusado.');
      await loadAdminPayments();
    } catch (e) {
      toast('error', 'Não foi possível recusar. Tente novamente.');
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar recusa'; }
    }
  };

  // Alias legado
  window.loadAdminUsers = loadAdminPayments;
  window.loadAdminPayments = loadAdminPayments;

  // ─── WIDGET DE SUPORTE ────────────────────────────────────────
  function initSupportWidget() {
    var btn   = byId('supportToggle');
    var panel = byId('supportPanel');
    if (!btn || !panel) return;

    // Configura link do Telegram
    var tgEl = byId('supportTelegram');
    if (tgEl) tgEl.href = CONTACT.telegram;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
      }
    });
  }

  // ─── RESET DE SENHA ──────────────────────────────────────────
  function checkResetUrl() {
    var hash   = window.location.hash   || '';
    var search = window.location.search || '';
    return (
      hash.includes('type=recovery')   ||
      hash.includes('access_token')    ||
      search.includes('type=recovery')
    );
  }

  function showResetStep2() {
    var step1 = byId('resetForm-wrap');
    var step2 = byId('newPassword-wrap');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
  }

  // ─── HOOKS DE FORMULÁRIOS ────────────────────────────────────
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
    hook('adminSearchForm', function () { loadAdminPayments(); });
  }

  // ─── BOOT ────────────────────────────────────────────────────
  async function boot() {
    try {
      if (!window.createSupabaseClient || !window.supabase) {
        toast('error', 'Não consegui carregar o site agora. Recarregue a página.');
        return;
      }
      if (configured()) sb = window.createSupabaseClient();

      hookForms();
      initSupportWidget();

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

      // Fecha modal de recusa clicando fora
      var modal = byId('rejectModal');
      if (modal) {
        modal.addEventListener('click', function (e) {
          if (e.target === modal) window.closeRejectModal();
        });
      }

      var page = (document.body.dataset && document.body.dataset.page) || '';

      // Página de reset
      if (page === 'reset' && configured()) {
        if (checkResetUrl()) showResetStep2();
        requireClient().auth.onAuthStateChange(function (event) {
          if (event === 'PASSWORD_RECOVERY') showResetStep2();
        });
      }

      // Nav + listener de auth
      if (configured()) {
        await refreshNav();
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
      if (page === 'admin')     await loadAdminPayments();

    } catch (err) {
      console.error('[boot]', err);
      toast('error', (err && err.message) || 'Algo deu errado. Recarregue a página.');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
