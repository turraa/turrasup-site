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
  };

  const $ = (id) => document.getElementById(id);

  function showAlert(msg, type = 'error') {
    const el = $('alert');
    el.textContent = msg;
    el.className = `alert alert-${type}`;
    el.classList.remove('hidden');
  }

  function hideAlert() {
    $('alert').classList.add('hidden');
  }

  function setStep(step) {
    const order = ['login', 'tariff', 'payment', 'done'];
    const idx = order.indexOf(step);
    document.querySelectorAll('.step-pill').forEach((pill) => {
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

  async function initLinks() {
    const c = cfg();
    const set = (id, url) => {
      const el = $(id);
      if (el) el.href = url;
    };
    set('link-bot', c.telegramUrl);
    set('link-support', c.supportUrl);
    set('footer-bot', c.telegramUrl);
    set('footer-support', c.supportUrl);
    ['btn-download', 'btn-download-main', 'btn-download-hero'].forEach((id) => {
      set(id, c.downloadUrl);
    });
  }

  async function handleAuthSuccess(auth) {
    window.TurraAuth.applyAuthResponse(auth);
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
        showAlert(window.TurraAuth.authErrorMessage(err));
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
        btn.className = 'btn ' + (p.name === 'yandex' ? 'btn-yandex' : 'btn-secondary');
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
    const name =
      [u.first_name, u.last_name].filter(Boolean).join(' ') ||
      u.username ||
      u.email ||
      'Пользователь';
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
      if (sub.has_subscription && sub.subscription?.subscription_url) {
        showExistingSubscription(sub.subscription.subscription_url);
      }
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

  function renderTariffCard(tariff, container) {
    const card = document.createElement('div');
    card.className = 'tariff-card';
    card.dataset.id = String(tariff.id);

    const traffic =
      tariff.is_unlimited_traffic || tariff.traffic_limit_gb >= 99999
        ? 'Безлимит'
        : `${tariff.traffic_limit_gb} ГБ`;
    card.innerHTML = `
      <h4>${escapeHtml(tariff.name)}</h4>
      <div class="tariff-meta">${traffic} · ${tariff.device_limit} устр.</div>
      <div class="period-list"></div>
    `;

    const periods = tariff.periods || [];
    const periodList = card.querySelector('.period-list');
    periods.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'period-btn';
      btn.dataset.days = String(p.days);
      btn.dataset.price = String(p.price_kopeks);
      btn.textContent = `${p.label} — ${p.price_label || formatRub(p.price_kopeks)}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectTariff(tariff.id, p.days, p.price_kopeks, card, btn);
      });
      periodList.appendChild(btn);
    });

    card.addEventListener('click', () => {
      if (periods[0]) selectTariff(tariff.id, periods[0].days, periods[0].price_kopeks, card, periodList.firstChild);
    });

    container.appendChild(card);
  }

  function renderTariffs(tariffs) {
    const grid = $('tariff-grid');
    grid.innerHTML = '';
    tariffs.filter((t) => t.is_available !== false).forEach((t) => renderTariffCard(t, grid));
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

    document.querySelectorAll('.tariff-card').forEach((c) => c.classList.remove('selected'));
    document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('selected'));
    cardEl.classList.add('selected');
    if (periodBtn) periodBtn.classList.add('selected');

    renderPaymentMethods();
    setStep('payment');
  }

  function renderPaymentMethods() {
    const methods = (state.paymentMethods || []).filter((m) => m.is_available !== false);
    const grid = $('payment-grid');
    grid.innerHTML = '';

    if (!methods.length) {
      grid.innerHTML = '<p style="color:var(--muted)">Способы оплаты временно недоступны. Напишите в поддержку.</p>';
      return;
    }

    methods.forEach((m, i) => {
      const id = m.method_id || m.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'payment-card';
      card.dataset.id = id;
      card.innerHTML = `<div class="name">${escapeHtml(m.display_name || m.name)}</div>
        <div class="desc">${escapeHtml(m.description || '')}</div>`;
      card.addEventListener('click', () => selectPaymentMethod(m, card));
      grid.appendChild(card);
      if (i === 0) selectPaymentMethod(m, card);
    });

    const tariff = getTariffsList().find((t) => t.id === state.selectedTariffId);
    const period = tariff?.periods?.find((p) => p.days === state.selectedPeriodDays);
    const priceLabel = period?.price_label || formatRub(state.selectedPriceKopeks || 0);
    $('checkout-summary').textContent = `${tariff?.name || 'Тариф'} · ${period?.label || state.selectedPeriodDays + ' дн.'} — ${priceLabel}`;
    $('btn-pay').disabled = false;
  }

  function selectPaymentMethod(method, cardEl) {
    state.selectedMethod = method.method_id || method.id;
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

  function paymentMethodString() {
    let m = state.selectedMethod;
    if (state.selectedSubOption) m = `${m}_${state.selectedSubOption}`;
    return m;
  }

  async function handlePay() {
    hideAlert();
    $('btn-pay').disabled = true;

    try {
      if (cfg().mode === 'landing') {
        await payLanding();
      } else {
        await payAuth();
      }
    } catch (e) {
      showAlert(e.message || 'Ошибка при создании оплаты');
      $('btn-pay').disabled = false;
    }
  }

  async function payAuth() {
    const price = state.selectedPriceKopeks;
    const balance = state.purchaseOptions?.balance_kopeks ?? state.user?.balance_kopeks ?? 0;

    savePendingPurchase({
      tariffId: state.selectedTariffId,
      periodDays: state.selectedPeriodDays,
      priceKopeks: price,
    });

    if (balance >= price) {
      const result = await api().purchaseTariff(state.selectedTariffId, state.selectedPeriodDays);
      clearPendingPurchase();
      await showSubscriptionFromApi();
      showAlert(result.message || 'Подписка оформлена!', 'success');
      return;
    }

    const topUpAmount = price - balance;
    const topUp = await api().createTopUp(topUpAmount, paymentMethodString());
    state.paymentUrl = topUp.payment_url;
    state.paymentMeta = {
      method: state.selectedMethod,
      paymentId: topUp.payment_id,
      mode: 'auth',
    };
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
      payment_method: paymentMethodString(),
      is_gift: false,
    });

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
      if (state.paymentUrl) window.open(state.paymentUrl, '_blank', 'noopener,noreferrer');
    };
    if (state.paymentUrl) window.open(state.paymentUrl, '_blank', 'noopener,noreferrer');
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
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function logout() {
    stopPolling();
    api().storage.clear();
    clearPendingPurchase();
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
      state.user = { balance_kopeks: opts.balance_kopeks };
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
        state.selectedTariffId = pending.tariffId;
        state.selectedPeriodDays = pending.periodDays;
        state.selectedPriceKopeks = pending.priceKopeks;
        setStep('payment');
        $('payment-wait').classList.remove('hidden');
        $('btn-pay').classList.add('hidden');
        startPaymentPolling();
        return;
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
    await initLinks();
    initAuthTabs();
    $('btn-pay').addEventListener('click', handlePay);
    $('btn-logout').addEventListener('click', logout);
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
