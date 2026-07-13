(function () {
  const cfg = () => window.TURRA_CONFIG;
  const api = () => window.TurraApi;
  const sec = () => window.TurraSecurity;
  const $ = (id) => document.getElementById(id);

  let deviceCount = 1;
  let subscriptionData = null;
  let trialInfo = null;
  let purchaseOptions = null;

  function formatRub(kopeks) {
    return `${(kopeks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
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

  function userDisplayName(u) {
    if (!u) return 'Пользователь';
    return (
      [u.first_name, u.last_name].filter(Boolean).join(' ') ||
      u.username ||
      u.email ||
      'Пользователь'
    );
  }

  function buildDeepLink(subUrl) {
    if (!sec().isSafeSubscriptionUrl(subUrl)) {
      throw new Error('Недопустимая ссылка подписки');
    }
    return `${cfg().deepLinkScheme}://import?sub=${encodeURIComponent(subUrl)}`;
  }

  function subscriptionDetails(subscription) {
    return subscription?.subscription || null;
  }

  function isSubscriptionActive(subscription) {
    if (!subscription) return false;
    if (subscription.has_subscription === true) return true;

    const sub = subscriptionDetails(subscription);
    if (!sub) return false;

    if (sub.is_active === true || sub.is_limited === true) return true;
    if (sub.subscription_url) return true;
    if (sub.status === 'active' || sub.status === 'limited' || sub.status === 'ACTIVE') return true;

    const expires =
      sub.end_date || sub.expires_at || sub.expire_at;
    if (expires) {
      const end = new Date(expires);
      if (!Number.isNaN(end.getTime()) && end.getTime() > Date.now()) return true;
    }

    return false;
  }

  function canBuyAddons(subscription) {
    const sub = subscriptionDetails(subscription);
    if (!isSubscriptionActive(subscription) || !sub) return false;
    if (sub.is_trial) return false;
    return sub.is_active !== false || sub.is_limited === true || subscription.has_subscription === true;
  }

  function normalizePackages(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.packages)) return data.packages;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }

  function buildPackagesFromTariff(subscription) {
    if (!purchaseOptions || purchaseOptions.sales_mode !== 'tariffs') return [];

    const sub = subscriptionDetails(subscription);
    const tariffId = sub?.tariff_id ?? purchaseOptions.current_tariff_id;
    const tariff =
      purchaseOptions.tariffs?.find((t) => t.id === tariffId) ||
      purchaseOptions.tariffs?.find((t) => t.is_current) ||
      purchaseOptions.tariffs?.[0];

    if (!tariff?.traffic_topup_enabled || !tariff.traffic_topup_packages?.length) return [];

    const pricePerGb = tariff.traffic_price_per_gb_kopeks || 0;
    if (pricePerGb <= 0) return [];

    return tariff.traffic_topup_packages.map((gb) => ({
      gb,
      is_unlimited: false,
      price_kopeks: gb * pricePerGb,
      price_rubles: (gb * pricePerGb) / 100,
    }));
  }

  function showError(msg) {
    $('profile-loading').classList.add('hidden');
    $('profile-content').classList.add('hidden');
    const el = $('profile-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function showMsg(text, ok) {
    const el = $('cabinet-msg');
    if (!el) return;
    if (!text) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = text;
    el.classList.remove('hidden', 'alert--ok', 'alert--err');
    el.classList.add(ok ? 'alert--ok' : 'alert--err');
  }

  function setBlockVisible(id, visible) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('hidden', !visible);
  }

  async function refreshDevicePrice() {
    const priceEl = $('cabinet-dev-price');
    const buyBtn = $('cabinet-dev-buy');
    const devicesBlock = $('cabinet-devices-block');
    if (!priceEl || !buyBtn) return;

    $('cabinet-dev-count').textContent = String(deviceCount);
    priceEl.textContent = 'Расчёт…';
    buyBtn.disabled = true;

    try {
      const info = await api().getDevicePrice(deviceCount);
      if (info.available === false) {
        priceEl.textContent = info.reason || 'Докупка устройств недоступна для вашего тарифа';
        devicesBlock?.classList.remove('hidden');
        return;
      }
      priceEl.textContent = info.total_price_label || formatRub(info.total_price_kopeks || 0);
      buyBtn.disabled = false;
      devicesBlock?.classList.remove('hidden');
    } catch (e) {
      priceEl.textContent = e?.message || 'Не удалось рассчитать цену';
      devicesBlock?.classList.remove('hidden');
    }
  }

  function renderTrafficPackages(packages, subscription) {
    const root = $('cabinet-traffic-packages');
    const trafficBlock = $('cabinet-traffic-block');
    if (!root) return;

    root.innerHTML = '';
    const sub = subscriptionDetails(subscription);
    const unlimitedTraffic =
      sub?.traffic_limit_gb === 0 ||
      sub?.traffic_limit_gb >= 99999 ||
      purchaseOptions?.tariffs?.some(
        (t) => t.id === sub?.tariff_id && t.is_unlimited_traffic,
      );

    if (unlimitedTraffic) {
      root.innerHTML =
        '<p class="muted small">У вас безлимитный тариф — докупка трафика не требуется.</p>';
      trafficBlock?.classList.remove('hidden');
      return;
    }

    if (!packages?.length) {
      root.innerHTML =
        '<p class="muted small">Пакеты трафика пока недоступны. Если нужна докупка — напишите в поддержку или включите «Докупка трафика» в тарифе Bedolaga.</p>';
      trafficBlock?.classList.remove('hidden');
      return;
    }

    packages.forEach((pkg) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cabinet-package-btn';
      const label = pkg.is_unlimited ? 'Безлимит' : `+${pkg.gb} ГБ`;
      const price = pkg.price_rubles != null ? `${pkg.price_rubles} ₽` : formatRub(pkg.price_kopeks);
      btn.innerHTML = `<strong>${label}</strong><span>${price}</span>`;
      btn.addEventListener('click', async () => {
        if (!confirm(`Купить ${label} за ${price}? Списание с баланса.`)) return;
        showMsg('', true);
        btn.disabled = true;
        try {
          const res = await api().purchaseTraffic(pkg.gb);
          showMsg(res.message || 'Трафик добавлен', true);
          await reloadProfile();
        } catch (e) {
          showMsg(e?.message || 'Не удалось купить трафик', false);
          btn.disabled = false;
        }
      });
      root.appendChild(btn);
    });

    trafficBlock?.classList.remove('hidden');
  }

  function renderTrialSection() {
    const block = $('cabinet-trial');
    const desc = $('cabinet-trial-desc');
    const btn = $('cabinet-trial-btn');
    if (!block || !trialInfo) return;

    if (!trialInfo.is_available || isSubscriptionActive(subscriptionData)) {
      block.classList.add('hidden');
      return;
    }

    const price =
      trialInfo.requires_payment && trialInfo.price_kopeks
        ? formatRub(trialInfo.price_kopeks)
        : 'Бесплатно';

    desc.textContent = `${price} · ${trialInfo.duration_days} дн. · ${trialInfo.traffic_limit_gb} ГБ · до ${trialInfo.device_limit} устр.`;
    block.classList.remove('hidden');

    btn.onclick = async () => {
      btn.disabled = true;
      showMsg('', true);
      try {
        await api().activateTrial();
        showMsg('Пробный период активирован!', true);
        await reloadProfile();
      } catch (e) {
        showMsg(e?.message || 'Не удалось активировать trial', false);
        btn.disabled = false;
      }
    };
  }

  function renderUsage(subscription) {
    const usage = $('cabinet-usage');
    const sub = subscriptionDetails(subscription);
    if (!usage || !isSubscriptionActive(subscription) || !sub) {
      usage?.classList.add('hidden');
      return;
    }

    const used = sub.traffic_used_gb ?? 0;
    const limit = sub.traffic_limit_gb;
    const trafficText =
      limit != null && limit > 0 && limit < 99999
        ? `${used} / ${limit} ГБ`
        : `${used} ГБ · безлимит`;

    $('cabinet-traffic').textContent = trafficText;
    $('cabinet-devices').textContent =
      sub.device_limit != null ? `до ${sub.device_limit}` : '—';
    usage.classList.remove('hidden');
  }

  function renderAddons(subscription) {
    const block = $('cabinet-addons');
    if (!block) return;

    if (!canBuyAddons(subscription)) {
      block.classList.add('hidden');
      return;
    }

    block.classList.remove('hidden');
  }

  function renderProfile(user, subscription, balanceKopeks) {
    subscriptionData = subscription;
    const name = userDisplayName(user);
    const initial = (name[0] || '?').toUpperCase();

    $('cabinet-name').textContent = name;
    $('cabinet-avatar').textContent = initial;

    const emailEl = $('cabinet-email');
    if (user.email) {
      emailEl.textContent = user.email;
    } else if (user.username) {
      emailEl.textContent = `@${user.username}`;
    } else {
      emailEl.textContent = '';
    }

    const balance = user.balance_kopeks ?? balanceKopeks;
    $('cabinet-balance').textContent = balance != null ? formatRub(balance) : '—';

    const active = isSubscriptionActive(subscription);
    const sub = subscriptionDetails(subscription);

    $('cabinet-sub-status').textContent = active
      ? sub?.is_trial
        ? 'Trial'
        : 'Активна'
      : 'Нет подписки';
    $('cabinet-sub-status').style.color = active ? '#86efac' : '';

    const expires = sub?.end_date || sub?.expires_at || sub?.expire_at;
    $('cabinet-sub-expires').textContent = active ? formatDateRu(expires) : '—';

    const subUrl = sub?.subscription_url;
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

    renderUsage(subscription);
    renderTrialSection();
    renderAddons(subscription);

    $('profile-loading').classList.add('hidden');
    $('profile-content').classList.remove('hidden');
  }

  async function loadAddons() {
    if (!canBuyAddons(subscriptionData)) return;

    renderAddons(subscriptionData);
    setBlockVisible('cabinet-addons', true);

    const root = $('cabinet-traffic-packages');
    if (root) root.innerHTML = '<p class="muted small">Загрузка пакетов…</p>';

    let packages = [];
    let packagesError = null;

    try {
      packages = normalizePackages(await api().getTrafficPackages());
    } catch (e) {
      packagesError = e;
      packages = [];
    }

    if (!packages.length) {
      packages = buildPackagesFromTariff(subscriptionData);
    }

    if (!packages.length && packagesError) {
      if (root) {
        root.innerHTML = `<p class="muted small">${packagesError.message || 'Не удалось загрузить пакеты трафика'}</p>`;
      }
      setBlockVisible('cabinet-traffic-block', true);
    } else {
      renderTrafficPackages(packages, subscriptionData);
    }

    deviceCount = 1;
    await refreshDevicePrice();
  }

  async function reloadProfile() {
    const [me, subscription, opts, trial] = await Promise.all([
      api().getMe(),
      api().getSubscription(),
      api().getPurchaseOptions().catch(() => null),
      api().getTrialInfo().catch(() => null),
    ]);
    purchaseOptions = opts;
    trialInfo = trial;
    const user = me.user || me;
    renderProfile(user, subscription, opts?.balance_kopeks);
    await Promise.all([loadAddons(), loadLinkedAccounts()]);
  }

  function providerLabel(name) {
    const map = {
      telegram: 'Telegram',
      yandex: 'Яндекс',
      email: 'Email',
      google: 'Google',
      discord: 'Discord',
      vk: 'VK',
    };
    return map[name] || name;
  }

  async function loadLinkedAccounts() {
    const root = $('cabinet-linked-list');
    const linkBtn = $('cabinet-link-yandex');
    const hint = $('cabinet-accounts-msg');
    if (!root) return;

    hint?.classList.add('hidden');

    try {
      const data = await api().getLinkedProviders();
      const providers = data.providers || [];
      root.innerHTML = '';

      if (!providers.length) {
        root.innerHTML = '<p class="muted small">Способы входа недоступны.</p>';
        linkBtn?.classList.remove('hidden');
        return;
      }

      providers.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'cabinet-linked-row';
        const idText = item.identifier ? ` · ${item.identifier}` : '';
        row.innerHTML = item.linked
          ? `<strong>${providerLabel(item.provider)}</strong><span class="cabinet-linked-row__ok">Привязан${idText}</span>`
          : `<strong>${providerLabel(item.provider)}</strong><span class="cabinet-linked-row__off">Не привязан</span>`;
        root.appendChild(row);
      });

      const yandex = providers.find((p) => p.provider === 'yandex');
      if (yandex?.linked) {
        linkBtn?.classList.add('hidden');
        if (hint) {
          hint.textContent =
            'Яндекс привязан — входите на сайт кнопкой «Войти через Яндекс» на главной странице.';
          hint.classList.remove('hidden');
        }
      } else {
        linkBtn?.classList.remove('hidden');
      }
    } catch (e) {
      root.innerHTML = `<p class="muted small">${e?.message || 'Не удалось загрузить способы входа'}</p>`;
      linkBtn?.classList.remove('hidden');
    }
  }

  async function startLinkYandex() {
    const btn = $('cabinet-link-yandex');
    if (btn) btn.disabled = true;
    showMsg('', true);
    try {
      const { authorize_url, state } = await api().linkProviderInit('yandex');
      window.TurraAuth.saveOAuthState('yandex', state, 'link');
      location.href = authorize_url;
    } catch (e) {
      if (btn) btn.disabled = false;
      showMsg(e?.message || 'Не удалось начать привязку Яндекса', false);
    }
  }

  function logout() {
    api().storage.clear();
    location.href = '/#pricing';
  }

  async function initLinks() {
    const c = cfg();
    const el = $('link-support');
    if (!el || !sec().isSafeNavUrl(c.supportUrl)) return;
    el.href = c.supportUrl;
    try {
      const info = await api().getServiceInfo();
      if (info?.support_telegram) {
        const tg = info.support_telegram.startsWith('http')
          ? info.support_telegram
          : `https://t.me/${info.support_telegram.replace(/^@/, '')}`;
        if (sec().isSafeNavUrl(tg)) el.href = tg;
      }
    } catch {
      /* fallback */
    }
  }

  async function boot() {
    const legacyAccess = localStorage.getItem('turravpn_access');
    if (legacyAccess && !api().storage.access) {
      api().storage.access = legacyAccess;
      localStorage.removeItem('turravpn_access');
    }

    const mergeReturn = sessionStorage.getItem('turravpn_merge_return');
    if (mergeReturn) {
      sessionStorage.removeItem('turravpn_merge_return');
      location.replace(`/auth/merge/?token=${encodeURIComponent(mergeReturn)}`);
      return;
    }

    const restored = await api().restoreSession();
    if (!restored && !api().storage.access) {
      location.replace('/#pricing');
      return;
    }

    $('cabinet-logout').addEventListener('click', logout);

    $('cabinet-buy-renew')?.addEventListener('click', () => {
      sessionStorage.setItem('turravpn_checkout_renew', '1');
    });

    $('cabinet-link-yandex')?.addEventListener('click', () => {
      void startLinkYandex();
    });

    $('cabinet-dev-minus')?.addEventListener('click', () => {
      deviceCount = Math.max(1, deviceCount - 1);
      void refreshDevicePrice();
    });
    $('cabinet-dev-plus')?.addEventListener('click', () => {
      deviceCount = Math.min(10, deviceCount + 1);
      void refreshDevicePrice();
    });
    $('cabinet-dev-buy')?.addEventListener('click', async () => {
      showMsg('', true);
      const btn = $('cabinet-dev-buy');
      btn.disabled = true;
      try {
        const res = await api().purchaseDevices(deviceCount);
        showMsg(res.message || 'Устройства добавлены', true);
        await reloadProfile();
      } catch (e) {
        showMsg(e?.message || 'Не удалось купить устройства', false);
        btn.disabled = false;
      }
    });

    await initLinks();

    try {
      await reloadProfile();
      if (location.hash === '#addons') {
        $('cabinet-addons')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (location.hash === '#accounts') {
        $('cabinet-accounts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      if (e?.status === 401) {
        const again = await api().restoreSession();
        if (again) {
          try {
            await reloadProfile();
            return;
          } catch {
            /* fall through */
          }
        }
        api().storage.clear();
        location.replace('/#pricing');
        return;
      }
      showError(e?.message || 'Не удалось загрузить профиль. Попробуйте обновить страницу.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
