(function () {
  const cfg = () => window.TURRA_CONFIG;
  const api = () => window.TurraApi;

  const state = {
    user: null,
    purchaseOptions: null,
    landingConfig: null,
    paymentMethods: null,
    selectedTariffId: null,
    selectedPeriodDays: null,
    selectedPriceKopeks: null,
    selectedMethod: null,
    selectedSubOption: null,
    pendingPurchase: null,
    paymentUrl: null,
    paymentMeta: null,
    pollTimer: null,
    telegramUser: null,
    subscription: null,
  };

  const $ = (id) => document.getElementById(id);

  function showAlert(msg, type = 'error') {
    const el = $('alert');
    el.textContent = msg;
    el.className = `alert ${type === 'success' || type === 'info' ? 'alert--ok' : ''}`;
    el.classList.remove('hidden');
  }

  function hideAlert() {
    $('alert').classList.add('hidden');
  }

  function setStep(step) {
    const order = ['login', 'tariff', 'payment', 'done'];
    const idx = order.indexOf(step);
    document.querySelectorAll('.step').forEach((pill) => {
      const s = pill.dataset.step;
      const i = order.indexOf(s);
      pill.classList.toggle('active', s === step);
      pill.classList.toggle('done', i < idx);
    });

    $('step-login').classList.toggle('hidden', step !== 'login');
    $('step-tariff').classList.toggle('hidden', step !== 'tariff');
    $('step-payment').classList.toggle('hidden', step !== 'payment');
    $('step-done').classList.toggle('hidden', step !== 'done');
  }

  function formatRub(kopeks) {
    return `${(kopeks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
  }

  function buildDeepLink(subUrl) {
    if (!sec().isSafeSubscriptionUrl(subUrl)) {
      throw new Error('Недопустимая ссылка подписки');
    }
    const encoded = encodeURIComponent(subUrl);
    return `${cfg().deepLinkScheme}://import?sub=${encoded}`;
  }

  function savePendingPurchase(data) {
    sessionStorage.setItem('turravpn_pending', JSON.stringify(data));
  }

  function loadPendingPurchase() {
    try {
      return JSON.parse(sessionStorage.getItem('turravpn_pending') || 'null');
    } catch {
      return null;
    }
  }

  function clearPendingPurchase() {
    sessionStorage.removeItem('turravpn_pending');
  }

  function savePaymentMeta(meta) {
    sessionStorage.setItem('turravpn_payment', JSON.stringify(meta));
  }

  function loadPaymentMeta() {
    try {
      return JSON.parse(sessionStorage.getItem('turravpn_payment') || 'null');
    } catch {
      return null;
    }
  }

  function clearPaymentMeta() {
    sessionStorage.removeItem('turravpn_payment');
  }

  function isTelegramWebApp() {
    return !!(window.Telegram?.WebApp?.initData);
  }

  function methodId(m) {
    return m.method_id || m.id;
  }

  function isWebPaymentMethod(m) {
    const id = String(methodId(m) || '').toLowerCase();
    if (!isTelegramWebApp() && (id === 'telegram_stars' || id.includes('stars'))) return false;
    return m.is_available !== false;
  }

  function resetPaymentWaitUi() {
    $('payment-wait').classList.add('hidden');
    $('btn-pay').classList.remove('hidden');
    $('btn-pay').disabled = false;
  }

  const sec = () => window.TurraSecurity;

  async function initLinks() {
    const c = cfg();
    const set = (id, url) => {
      const el = $(id);
      if (!el || !sec().isSafeNavUrl(url)) return;
      el.href = url;
      if (url.startsWith('http')) {
        el.setAttribute('rel', 'noopener noreferrer');
      }
    };
    set('link-bot', c.telegramUrl);
    set('link-support', c.supportUrl);
    set('footer-bot', c.telegramUrl);
    set('footer-support', c.supportUrl);
    set('link-support-mobile', c.supportUrl);
    initDownloadButtons();

    try {
      const info = await api().getServiceInfo();
      if (info?.support_telegram) {
        const tg = info.support_telegram.startsWith('http')
          ? info.support_telegram
          : `https://t.me/${info.support_telegram.replace(/^@/, '')}`;
        if (sec().isSafeNavUrl(tg)) {
          set('link-support', tg);
          set('link-support-mobile', tg);
          set('footer-support', tg);
        }
      }
      if (info?.website && sec().isSafeNavUrl(info.website)) {
        /* optional external site link */
      }
    } catch {
      /* fallback config */
    }
  }

  function initDownloadButtons() {
    const main = $('btn-download-main');
    const url = cfg().downloadUrl;
    if (main && sec().isSafeNavUrl(url)) {
      main.href = url;
      if (cfg().downloadFileName) main.setAttribute('download', cfg().downloadFileName);
      main.setAttribute('rel', 'noopener');
    }

    document.querySelectorAll('[data-scroll-download]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById('download');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeMobileNav();
      });
    });
  }

  function closeMobileNav() {
    const burger = $('burger');
    const mobile = $('nav-mobile');
    if (!burger || !mobile) return;
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    mobile.classList.add('hidden');
  }

  function userDisplayName(u) {
    if (!u) return 'Пользователь';
    return (
      [u.first_name, u.last_name].filter(Boolean).join(' ') ||
      u.username ||
      u.email ||
      'Пользователь'
    );
  }

  function formatDateRu(value) {
    if (!value) return '—';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  function updateHeaderAuth(loggedIn) {
    $('header-guest')?.classList.toggle('hidden', loggedIn);
    $('header-user')?.classList.toggle('hidden', !loggedIn);
    $('link-cabinet-mobile')?.classList.toggle('hidden', !loggedIn);
    $('cabinet')?.classList.toggle('hidden', !loggedIn);
  }

  function renderCabinet() {
    const u = state.user;
    if (!u) {
      updateHeaderAuth(false);
      return;
    }

    const name = userDisplayName(u);
    const initial = (name[0] || '?').toUpperCase();

    $('cabinet-name').textContent = name;
    $('cabinet-avatar').textContent = initial;
    $('header-avatar').textContent = initial;
    $('header-username').textContent = name.split(' ')[0] || 'Кабинет';

    const emailEl = $('cabinet-email');
    if (u.email) {
      emailEl.textContent = u.email;
      emailEl.classList.remove('hidden');
    } else if (u.username) {
      emailEl.textContent = `@${u.username}`;
      emailEl.classList.remove('hidden');
    } else {
      emailEl.textContent = '';
      emailEl.classList.add('hidden');
    }

    const balance = u.balance_kopeks ?? state.purchaseOptions?.balance_kopeks;
    $('cabinet-balance').textContent = balance != null ? formatRub(balance) : '—';

    const sub = state.subscription;
    const active = sub?.has_subscription;
    $('cabinet-sub-status').textContent = active ? 'Активна' : 'Нет подписки';
    $('cabinet-sub-status').style.color = active ? '#86efac' : '';

    const expires =
      sub?.subscription?.expires_at ||
      sub?.subscription?.expire_at ||
      sub?.subscription?.end_date;
    $('cabinet-sub-expires').textContent = active ? formatDateRu(expires) : '—';

    const subUrl = sub?.subscription?.subscription_url;
    const keyBlock = $('cabinet-key');
    if (active && subUrl && sec().isSafeSubscriptionUrl(subUrl)) {
      keyBlock.classList.remove('hidden');
      $('cabinet-sub-link').value = subUrl;
      $('cabinet-btn-copy').onclick = async () => {
        await navigator.clipboard.writeText(subUrl);
        $('cabinet-btn-copy').textContent = 'Скопировано!';
        setTimeout(() => {
          $('cabinet-btn-copy').textContent = 'Копировать';
        }, 2000);
      };
      $('cabinet-btn-open-app').onclick = () => {
        window.location.href = buildDeepLink(subUrl);
      };
    } else {
      keyBlock.classList.add('hidden');
    }

    updateHeaderAuth(true);
  }

  async function refreshCabinetData() {
    if (!api().storage.access) return;
    try {
      const me = await api().getMe();
      state.user = me.user || me;
    } catch {
      /* keep existing user */
    }
    try {
      state.subscription = await api().getSubscription();
    } catch {
      state.subscription = null;
    }
    if (state.purchaseOptions?.balance_kopeks != null && state.user) {
      state.user.balance_kopeks = state.purchaseOptions.balance_kopeks;
    }
    renderCabinet();
  }

  function initMobileNav() {
    const burger = $('burger');
    const mobile = $('nav-mobile');
    if (!burger || !mobile) return;

    const close = () => {
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      mobile.classList.add('hidden');
    };

    burger.addEventListener('click', () => {
      const open = mobile.classList.toggle('hidden');
      burger.classList.toggle('is-open', !open);
      burger.setAttribute('aria-expanded', String(!open));
    });

    mobile.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  function initEmailExtras() {
    const loginForm = $('form-email-login');
    const forgotForm = $('form-forgot');
    const registerForm = $('form-email-register');
    const btnForgotToggle = $('btn-forgot-toggle');
    const btnForgotBack = $('btn-forgot-back');
    const btnResend = $('btn-resend-verify');

    btnForgotToggle?.addEventListener('click', () => {
      loginForm.classList.add('hidden');
      forgotForm.classList.remove('hidden');
      hideAlert();
    });

    btnForgotBack?.addEventListener('click', () => {
      forgotForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      hideAlert();
    });

    forgotForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const fd = new FormData(forgotForm);
      const btn = forgotForm.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await api().forgotPassword(fd.get('email'));
        showAlert('Если аккаунт существует, письмо со ссылкой отправлено. Проверьте почту и спам.', 'success');
        forgotForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
      } catch (err) {
        showAlert(window.TurraAuth.authErrorMessage(err));
      } finally {
        btn.disabled = false;
      }
    });

    btnResend?.addEventListener('click', async () => {
      hideAlert();
      const email =
        state.lastRegisterEmail ||
        loginForm?.querySelector('input[name=email]')?.value;
      if (!email) {
        showAlert('Введите email в форме входа');
        return;
      }
      btnResend.disabled = true;
      try {
        await api().resendVerification(email);
        showAlert('Письмо отправлено повторно. Проверьте почту и спам.', 'success');
      } catch (err) {
        showAlert(window.TurraAuth.authErrorMessage(err));
      } finally {
        setTimeout(() => {
          btnResend.disabled = false;
        }, 60000);
      }
    });
  }

  async function handleAuthSuccess(auth) {
    try {
      window.TurraAuth.applyAuthResponse(auth);
    } catch (e) {
      showAlert(e.message);
      return;
    }
    state.user = auth.user;
    await afterLogin();
  }

  function initAuthTabs() {
    const panes = {
      telegram: $('auth-telegram'),
      email: $('auth-email'),
    };
    document.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        Object.values(panes).forEach((p) => p.classList.add('hidden'));
        panes[tab.dataset.tab].classList.remove('hidden');
      });
    });

    const loginForm = $('form-email-login');
    const registerForm = $('form-email-register');
    document.querySelectorAll('.auth-subtab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-subtab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const isLogin = tab.dataset.emailMode === 'login';
        loginForm.classList.toggle('hidden', !isLogin);
        registerForm.classList.toggle('hidden', isLogin);
        $('form-forgot')?.classList.add('hidden');
      });
    });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const fd = new FormData(loginForm);
      const btn = loginForm.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const auth = await api().loginEmail(fd.get('email'), fd.get('password'));
        await handleAuthSuccess(auth);
      } catch (err) {
        const msg = window.TurraAuth.authErrorMessage(err);
        showAlert(msg);
        if (/verif|подтверд|confirm/i.test(msg)) {
          $('btn-resend-verify')?.classList.remove('hidden');
        }
      } finally {
        btn.disabled = false;
      }
    });

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const fd = new FormData(registerForm);
      const btn = registerForm.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const res = await api().registerEmailStandalone({
          email: fd.get('email'),
          password: fd.get('password'),
          first_name: fd.get('first_name') || undefined,
          language: 'ru',
        });
        state.lastRegisterEmail = fd.get('email');
        $('btn-resend-verify')?.classList.remove('hidden');
        showAlert(
          res.message || 'Письмо отправлено. Откройте ссылку в почте, чтобы подтвердить регистрацию.',
          'success',
        );
      } catch (err) {
        showAlert(window.TurraAuth.authErrorMessage(err));
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function initOAuthProviders() {
    const row = $('oauth-providers');
    try {
      const { providers } = await api().getOAuthProviders();
      if (!providers?.length) return;

      row.classList.remove('hidden');
      providers.forEach((p) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--wide ' + (p.name === 'yandex' ? 'btn-yandex' : 'btn--ghost');
        btn.style.width = '100%';
        btn.textContent =
          p.name === 'yandex' ? 'Войти через Яндекс' : `Войти через ${p.display_name || p.name}`;
        btn.addEventListener('click', () => startOAuth(p.name));
        row.appendChild(btn);
      });
    } catch {
      /* OAuth не настроен на сервере */
    }
  }

  async function startOAuth(provider) {
    hideAlert();
    try {
      const { authorize_url, state } = await api().getOAuthAuthorizeUrl(provider);
      if (!sec().isSafeOAuthUrl(authorize_url, provider)) {
        throw new Error('Недопустимый адрес OAuth. Обратитесь в поддержку.');
      }
      window.TurraAuth.saveOAuthState(provider, state);
      window.location.href = authorize_url;
    } catch (err) {
      showAlert(window.TurraAuth.authErrorMessage(err));
    }
  }

  async function initTelegramWidget() {
    let botUsername = cfg().botUsername;
    try {
      const widgetCfg = await api().getWidgetConfig();
      botUsername = widgetCfg.bot_username || botUsername;
    } catch {
      /* fallback */
    }

    window.onTelegramAuth = async (user) => {
      hideAlert();
      state.telegramUser = user;
      try {
        if (cfg().mode === 'auth') {
          const auth = await api().loginTelegramWidget(user);
          await handleAuthSuccess(auth);
        } else {
          state.user = {
            first_name: user.first_name,
            last_name: user.last_name,
            username: user.username,
            telegram_id: user.id,
          };
          await afterLoginLanding();
        }
      } catch (e) {
        showAlert(e.message || 'Не удалось войти через Telegram');
      }
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    $('telegram-login').appendChild(script);
  }

  function renderUserChip() {
    const u = state.user;
    if (!u) return;
    const name = userDisplayName(u);
    $('user-name').textContent =
      name + (u.username ? ` (@${u.username})` : u.email ? ` (${u.email})` : '');
    const balance = u.balance_kopeks ?? state.purchaseOptions?.balance_kopeks;
    $('user-balance').textContent =
      balance != null ? `Баланс: ${formatRub(balance)}` : 'Вы вошли';
    $('user-avatar').textContent = (name[0] || '?').toUpperCase();
    $('user-chip').classList.remove('hidden');
    $('auth-tabs')?.classList.add('hidden');
    $('auth-telegram')?.classList.add('hidden');
    $('auth-email')?.classList.add('hidden');
    $('oauth-providers')?.classList.add('hidden');
    $('btn-logout').classList.remove('hidden');
    $('panel-subtitle').textContent = 'Выберите тариф и оплатите подписку';
    renderCabinet();
  }

  async function afterLogin() {
    renderUserChip();
    try {
      const opts = await api().getPurchaseOptions();
      state.purchaseOptions = opts;
      if (opts.sales_mode !== 'tariffs' || !opts.tariffs?.length) {
        showAlert('Тарифы временно недоступны. Попробуйте позже или напишите в поддержку.', 'info');
        return;
      }
      state.paymentMethods = await api().getPaymentMethods();
      renderTariffs(opts.tariffs);
      setStep('tariff');

      const sub = await api().getSubscription();
      state.subscription = sub;
      if (sub.has_subscription && sub.subscription?.subscription_url) {
        showExistingSubscription(sub.subscription.subscription_url);
      }
      renderCabinet();
    } catch (e) {
      showAlert(e.message || 'Не удалось загрузить тарифы');
    }
  }

  async function afterLoginLanding() {
    renderUserChip();
    const slug = cfg().landingSlug;
    if (!slug) {
      showAlert('Покупка временно недоступна. Напишите в поддержку.', 'info');
      return;
    }
    try {
      state.landingConfig = await api().getLandingConfig(slug);
      renderLandingTariffs(state.landingConfig.tariffs);
      state.paymentMethods = state.landingConfig.payment_methods;
      setStep('tariff');
    } catch (e) {
      showAlert('Не удалось загрузить тарифы. Попробуйте позже или напишите в поддержку.');
    }
  }

  function getTariffsList() {
    if (cfg().mode === 'landing') return state.landingConfig?.tariffs || [];
    return state.purchaseOptions?.tariffs?.filter((t) => t.is_available) || [];
  }

  function renderTariffCard(tariff, container, index) {
    const card = document.createElement('article');
    card.className = 'plan-card glass';
    if (index === 1) card.classList.add('plan-card--featured');
    card.dataset.id = String(tariff.id);

    const traffic =
      tariff.is_unlimited_traffic || tariff.traffic_limit_gb >= 99999
        ? 'Безлимит трафика'
        : `${tariff.traffic_limit_gb} ГБ трафика`;

    const periods = tariff.periods || [];
    const mainPeriod = periods[0];
    const priceLabel = mainPeriod
      ? mainPeriod.price_label || formatRub(mainPeriod.price_kopeks)
      : '—';
    const periodSuffix = mainPeriod?.days >= 360 ? '' : '/мес';

    card.innerHTML = `
      ${index === 1 ? '<span class="plan-badge">Популярный</span>' : ''}
      <h4 class="plan-name">${escapeHtml(tariff.name)}</h4>
      <div class="plan-price">${escapeHtml(priceLabel)}<span class="plan-period">${periodSuffix}</span></div>
      <ul class="plan-features">
        <li>${traffic}</li>
        <li>До ${tariff.device_limit} устройств</li>
        <li>Серверы Европа и США</li>
        <li>Поддержка 24/7</li>
      </ul>
      <div class="period-list"></div>
      <button type="button" class="btn btn--primary btn--wide plan-select">Выбрать план</button>
    `;

    const periodList = card.querySelector('.period-list');
    periods.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `period-btn${i === 0 ? ' selected' : ''}`;
      btn.dataset.days = String(p.days);
      btn.dataset.price = String(p.price_kopeks);
      btn.textContent = `${p.label} — ${p.price_label || formatRub(p.price_kopeks)}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectTariff(tariff.id, p.days, p.price_kopeks, card, btn);
      });
      periodList.appendChild(btn);
    });

    card.querySelector('.plan-select').addEventListener('click', (e) => {
      e.stopPropagation();
      if (periods[0]) {
        const firstBtn = periodList.querySelector('.period-btn');
        selectTariff(tariff.id, periods[0].days, periods[0].price_kopeks, card, firstBtn);
      }
    });

    container.appendChild(card);
  }

  function renderTariffs(tariffs) {
    const grid = $('tariff-grid');
    grid.innerHTML = '';
    tariffs
      .filter((t) => t.is_available !== false)
      .forEach((t, i) => renderTariffCard(t, grid, i));
  }

  function renderLandingTariffs(tariffs) {
    const mapped = tariffs.map((t) => ({
      ...t,
      is_unlimited_traffic: t.traffic_limit_gb >= 99999,
      periods: t.periods.map((p) => ({ ...p, price_label: p.price_label || formatRub(p.price_kopeks) })),
    }));
    renderTariffs(mapped);
  }

  function selectTariff(tariffId, days, priceKopeks, cardEl, periodBtn) {
    state.selectedTariffId = tariffId;
    state.selectedPeriodDays = days;
    state.selectedPriceKopeks = priceKopeks;

    document.querySelectorAll('.plan-card').forEach((c) => c.classList.remove('selected'));
    document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('selected'));
    cardEl.classList.add('selected');
    if (periodBtn) periodBtn.classList.add('selected');

    renderPaymentMethods();
    setStep('payment');
  }

  function renderPaymentMethods() {
    const methods = (state.paymentMethods || []).filter(isWebPaymentMethod);
    const grid = $('payment-grid');
    grid.innerHTML = '';

    if (!methods.length) {
      grid.innerHTML = '<p style="color:var(--muted)">Способы оплаты временно недоступны. Напишите в поддержку.</p>';
      state.selectedMethod = null;
      state.selectedSubOption = null;
      $('btn-pay').disabled = true;
      return;
    }

    const prefer = methods.find((m) => {
      const id = String(methodId(m)).toLowerCase();
      return id === 'yookassa' || id === 'platega';
    });
    let selectedCard = null;

    methods.forEach((m) => {
      const id = methodId(m);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'payment-card';
      card.dataset.id = id;
      card.innerHTML = `<div class="name">${escapeHtml(m.display_name || m.name)}</div>
        <div class="desc">${escapeHtml(m.description || '')}</div>`;
      card.addEventListener('click', () => selectPaymentMethod(m, card));
      grid.appendChild(card);
      if (!selectedCard && prefer && methodId(prefer) === id) selectedCard = card;
    });

    selectPaymentMethod(prefer || methods[0], selectedCard || grid.firstChild);

    const tariff = getTariffsList().find((t) => t.id === state.selectedTariffId);
    const period = tariff?.periods?.find((p) => p.days === state.selectedPeriodDays);
    const priceLabel = period?.price_label || formatRub(state.selectedPriceKopeks || 0);
    $('checkout-summary').textContent = `${tariff?.name || 'Тариф'} · ${period?.label || state.selectedPeriodDays + ' дн.'} — ${priceLabel}`;
    $('btn-pay').disabled = false;
  }

  function selectPaymentMethod(method, cardEl) {
    state.selectedMethod = methodId(method);
    document.querySelectorAll('.payment-card').forEach((c) => c.classList.remove('selected'));
    cardEl.classList.add('selected');

    const opts = method.sub_options || method.options;
    const subEl = $('sub-options');
    subEl.innerHTML = '';
    state.selectedSubOption = null;

    if (opts?.length) {
      subEl.classList.remove('hidden');
      opts.forEach((o, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'period-btn';
        btn.textContent = o.name;
        btn.dataset.id = o.id;
        btn.addEventListener('click', () => {
          state.selectedSubOption = o.id;
          subEl.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
        subEl.appendChild(btn);
        if (i === 0) btn.click();
      });
    } else {
      subEl.classList.add('hidden');
    }
  }

  function paymentMethodStringForLanding() {
    let m = state.selectedMethod;
    if (state.selectedSubOption) m = `${m}_${state.selectedSubOption}`;
    return m;
  }

  async function ensurePaymentMethodReady() {
    if (!state.selectedMethod) {
      throw new Error('Выберите способ оплаты');
    }
    const fresh = await api().getPaymentMethods();
    state.paymentMethods = fresh;
    const current = fresh.find((m) => methodId(m) === state.selectedMethod);
    if (!current || !isWebPaymentMethod(current)) {
      renderPaymentMethods();
      throw new Error('Этот способ оплаты недоступен на сайте. Выберите YooKassa или Platega.');
    }
    if (current.options?.length || current.sub_options?.length) {
      const opts = current.sub_options || current.options;
      const ok = opts.some((o) => o.id === state.selectedSubOption);
      if (!ok) state.selectedSubOption = opts[0]?.id || null;
    }
  }

  async function handlePay() {
    hideAlert();
    $('btn-pay').disabled = true;

    try {
      await ensurePaymentMethodReady();
      if (cfg().mode === 'landing') {
        await payLanding();
      } else {
        await payAuth();
      }
    } catch (e) {
      clearPendingPurchase();
      clearPaymentMeta();
      resetPaymentWaitUi();
      showAlert(e.message || 'Ошибка при создании оплаты');
    }
  }

  async function payAuth() {
    const price = state.selectedPriceKopeks;
    const balance = state.purchaseOptions?.balance_kopeks ?? state.user?.balance_kopeks ?? 0;

    if (balance >= price) {
      const result = await api().purchaseTariff(state.selectedTariffId, state.selectedPeriodDays);
      clearPendingPurchase();
      clearPaymentMeta();
      await showSubscriptionFromApi();
      showAlert(result.message || 'Подписка оформлена!', 'success');
      return;
    }

    const topUpAmount = price - balance;
    const topUp = await api().createTopUp(
      topUpAmount,
      state.selectedMethod,
      state.selectedSubOption || undefined,
    );

    if (!topUp?.payment_url || !sec().isSafePaymentUrl(topUp.payment_url)) {
      throw new Error('Получена недопустимая ссылка оплаты. Попробуйте другой способ.');
    }

    savePendingPurchase({
      tariffId: state.selectedTariffId,
      periodDays: state.selectedPeriodDays,
      priceKopeks: price,
    });

    state.paymentUrl = topUp.payment_url;
    state.paymentMeta = {
      method: state.selectedMethod,
      paymentId: topUp.payment_id,
      mode: 'auth',
      paymentUrl: topUp.payment_url,
    };
    savePaymentMeta(state.paymentMeta);
    showPaymentWait();
    startPaymentPolling();
  }

  async function payLanding() {
    const u = state.telegramUser || state.user;
    const contact =
      u.username ? `@${u.username.replace(/^@/, '')}` : String(u.telegram_id || u.id);

    const result = await api().createLandingPurchase(cfg().landingSlug, {
      tariff_id: state.selectedTariffId,
      period_days: state.selectedPeriodDays,
      contact_type: 'telegram',
      contact_value: contact,
      payment_method: paymentMethodStringForLanding(),
      is_gift: false,
    });

    if (!result?.payment_url || !sec().isSafePaymentUrl(result.payment_url)) {
      throw new Error('Получена недопустимая ссылка оплаты.');
    }

    state.paymentUrl = result.payment_url;
    state.paymentMeta = { token: result.purchase_token, mode: 'landing' };
    savePendingPurchase({ token: result.purchase_token, mode: 'landing' });
    showPaymentWait();
    startPaymentPolling();
  }

  function showPaymentWait() {
    $('payment-wait').classList.remove('hidden');
    $('btn-pay').classList.add('hidden');
    $('btn-open-payment').onclick = () => {
      try {
        if (state.paymentUrl) sec().openTrustedUrl(state.paymentUrl, '_blank');
      } catch (e) {
        showAlert(e.message || 'Ссылка оплаты недоступна');
      }
    };
    try {
      if (state.paymentUrl) sec().openTrustedUrl(state.paymentUrl, '_blank');
    } catch (e) {
      showAlert(e.message || 'Ссылка оплаты недоступна');
      resetPaymentWaitUi();
    }
  }

  function startPaymentPolling() {
    stopPolling();
    const started = Date.now();
    const maxMs = cfg().paymentPollMaxMs;

    state.pollTimer = setInterval(async () => {
      if (Date.now() - started > maxMs) {
        stopPolling();
        showAlert('Время ожидания истекло. Если оплата прошла — обновите страницу.', 'info');
        return;
      }

      try {
        if (state.paymentMeta?.mode === 'landing') {
          await pollLanding(state.paymentMeta.token);
        } else {
          await pollAuth();
        }
      } catch {
        /* retry */
      }
    }, cfg().pollIntervalMs);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  async function pollLanding(token) {
    let status = await api().getLandingPurchaseStatus(token);
    $('payment-status-text').textContent = 'Проверяем оплату…';

    if (status.status === 'pending_activation') {
      status = await api().activateLandingPurchase(token);
    }

    if (status.status === 'delivered' && status.subscription_url) {
      stopPolling();
      clearPendingPurchase();
      clearPaymentMeta();
      showSubscriptionLink(status.subscription_url);
    } else if (status.status === 'failed' || status.status === 'expired') {
      stopPolling();
      showAlert('Оплата не прошла или истекла. Попробуйте снова.');
    }
  }

  async function pollAuth() {
    const pending = loadPendingPurchase();
    if (!pending) return;

    if (state.paymentMeta?.paymentId) {
      try {
        await api().checkPayment(state.paymentMeta.method, state.paymentMeta.paymentId);
      } catch {
        /* not paid yet */
      }
    }

    const balance = await api().getBalance();
    if (balance.balance_kopeks >= pending.priceKopeks) {
      try {
        await api().purchaseTariff(pending.tariffId, pending.periodDays);
        stopPolling();
        clearPendingPurchase();
        clearPaymentMeta();
        await showSubscriptionFromApi();
      } catch (e) {
        if (!e.message?.includes('уже')) throw e;
      }
    } else {
      $('payment-status-text').textContent = `Ожидаем оплату… Баланс: ${formatRub(balance.balance_kopeks)}`;
    }
  }

  async function showSubscriptionFromApi() {
    const link = await api().getConnectionLink();
    const url = link.subscription_url || link.display_link;
    if (url) showSubscriptionLink(url);
    else {
      const sub = await api().getSubscription();
      if (sub.subscription?.subscription_url) showSubscriptionLink(sub.subscription.subscription_url);
      else showAlert('Подписка оформлена. Ключ появится через минуту — обновите страницу или напишите в поддержку.', 'info');
    }
  }

  function showExistingSubscription(url) {
    showSubscriptionLink(url);
    showAlert('У вас уже есть активная подписка — ссылка ниже.', 'info');
  }

  function showSubscriptionLink(url) {
    if (!sec().isSafeSubscriptionUrl(url)) {
      showAlert('Получена недопустимая ссылка. Напишите в поддержку.');
      return;
    }
    if (!state.subscription) state.subscription = { has_subscription: true, subscription: {} };
    state.subscription.has_subscription = true;
    state.subscription.subscription = {
      ...state.subscription.subscription,
      subscription_url: url,
    };
    renderCabinet();
    setStep('done');
    $('sub-link').value = url;
    $('btn-copy').onclick = async () => {
      await navigator.clipboard.writeText(url);
      $('btn-copy').textContent = 'Скопировано!';
      setTimeout(() => {
        $('btn-copy').textContent = 'Копировать';
      }, 2000);
    };
    $('btn-open-app').onclick = () => {
      window.location.href = buildDeepLink(url);
    };
  }

  function escapeHtml(s) {
    return sec().escapeHtml(s);
  }

  function logout() {
    stopPolling();
    api().storage.clear();
    clearPendingPurchase();
    clearPaymentMeta();
    state.user = null;
    state.purchaseOptions = null;
    location.reload();
  }

  async function resumeSession() {
    if (!api().storage.access) return;
    try {
      if (cfg().mode === 'landing') {
        await afterLoginLanding();
        return;
      }
      const opts = await api().getPurchaseOptions();
      state.purchaseOptions = opts;
      state.paymentMethods = await api().getPaymentMethods();
      const sub = await api().getSubscription();
      state.subscription = sub;
      try {
        const me = await api().getMe();
        state.user = me.user || me;
        if (state.user) state.user.balance_kopeks = opts.balance_kopeks;
      } catch {
        state.user = { balance_kopeks: opts.balance_kopeks };
      }
      renderUserChip();

      const pending = loadPendingPurchase();
      if (pending?.token && cfg().mode === 'landing') {
        state.paymentMeta = { token: pending.token, mode: 'landing' };
        setStep('payment');
        $('payment-wait').classList.remove('hidden');
        $('btn-pay').classList.add('hidden');
        startPaymentPolling();
        return;
      }

      if (pending?.tariffId) {
        const meta = loadPaymentMeta();
        if (meta?.paymentId && meta?.paymentUrl) {
          state.selectedTariffId = pending.tariffId;
          state.selectedPeriodDays = pending.periodDays;
          state.selectedPriceKopeks = pending.priceKopeks;
          state.paymentMeta = meta;
          state.paymentUrl = meta.paymentUrl;
          renderPaymentMethods();
          setStep('payment');
          showPaymentWait();
          startPaymentPolling();
          return;
        }
        clearPendingPurchase();
        clearPaymentMeta();
      }

      if (sub.has_subscription && sub.subscription?.subscription_url) {
        showExistingSubscription(sub.subscription.subscription_url);
      } else {
        renderTariffs(opts.tariffs || []);
        setStep('tariff');
      }
    } catch {
      api().storage.clear();
    }
  }

  async function boot() {
    const legacyAccess = localStorage.getItem('turravpn_access');
    if (legacyAccess && !api().storage.access) {
      api().storage.access = legacyAccess;
      localStorage.removeItem('turravpn_access');
    }
    await initLinks();
    initMobileNav();
    initAuthTabs();
    initEmailExtras();
    $('btn-pay').addEventListener('click', handlePay);
    $('btn-logout').addEventListener('click', logout);
    $('cabinet-logout')?.addEventListener('click', logout);
    $('btn-open-cabinet')?.addEventListener('click', () => {
      const el = document.getElementById('cabinet');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      closeMobileNav();
    });
    await initOAuthProviders();
    await initTelegramWidget();
    await resumeSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
