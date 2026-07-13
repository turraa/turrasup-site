(function () {
  const cfg = () => window.TURRA_CONFIG;
  const api = () => window.TurraApi;
  const sec = () => window.TurraSecurity;
  const $ = (id) => document.getElementById(id);

  let deviceCount = 1;
  let subscriptionData = null;
  let trialInfo = null;

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

  async function refreshDevicePrice() {
    const priceEl = $('cabinet-dev-price');
    const buyBtn = $('cabinet-dev-buy');
    if (!priceEl || !buyBtn) return;

    $('cabinet-dev-count').textContent = String(deviceCount);
    priceEl.textContent = 'Расчёт…';
    buyBtn.disabled = true;

    try {
      const info = await api().getDevicePrice(deviceCount);
      if (!info.available) {
        priceEl.textContent = info.reason || 'Докупка недоступна';
        return;
      }
      priceEl.textContent = info.total_price_label || formatRub(info.total_price_kopeks || 0);
      buyBtn.disabled = false;
    } catch (e) {
      priceEl.textContent = e?.message || 'Не удалось рассчитать цену';
    }
  }

  function renderTrafficPackages(packages) {
    const root = $('cabinet-traffic-packages');
    if (!root) return;
    root.innerHTML = '';

    if (!packages?.length) {
      root.innerHTML = '<p class="muted small">Пакеты трафика недоступны.</p>';
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
        if (!confirm(`Купить ${label} за ${price}?`)) return;
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
  }

  function renderTrialSection() {
    const block = $('cabinet-trial');
    const desc = $('cabinet-trial-desc');
    const btn = $('cabinet-trial-btn');
    if (!block || !trialInfo) return;

    if (!trialInfo.is_available || subscriptionData?.has_subscription) {
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
    const sub = subscription?.subscription;
    if (!usage || !subscription?.has_subscription || !sub) {
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

  function renderAddons(hasSubscription) {
    const block = $('cabinet-addons');
    if (!block) return;
    if (hasSubscription) {
      block.classList.remove('hidden');
    } else {
      block.classList.add('hidden');
    }
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

    const active = subscription?.has_subscription;
    $('cabinet-sub-status').textContent = active
      ? subscription?.subscription?.is_trial
        ? 'Trial'
        : 'Активна'
      : 'Нет подписки';
    $('cabinet-sub-status').style.color = active ? '#86efac' : '';

    const expires =
      subscription?.subscription?.expires_at ||
      subscription?.subscription?.expire_at ||
      subscription?.subscription?.end_date;
    $('cabinet-sub-expires').textContent = active ? formatDateRu(expires) : '—';

    const subUrl = subscription?.subscription?.subscription_url;
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
    renderAddons(!!active);

    $('profile-loading').classList.add('hidden');
    $('profile-content').classList.remove('hidden');
  }

  async function loadAddons() {
    if (!subscriptionData?.has_subscription) return;

    const root = $('cabinet-traffic-packages');
    if (root) root.innerHTML = '<p class="muted small">Загрузка пакетов…</p>';

    try {
      const packages = await api().getTrafficPackages();
      renderTrafficPackages(packages);
    } catch (e) {
      renderTrafficPackages([]);
      if (root) {
        root.innerHTML = `<p class="muted small">${e?.message || 'Не удалось загрузить пакеты трафика'}</p>`;
      }
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
    trialInfo = trial;
    const user = me.user || me;
    renderProfile(user, subscription, opts?.balance_kopeks);
    await loadAddons();
  }

  function logout() {
    api().storage.clear();
    location.href = '/#buy';
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

    const restored = await api().restoreSession();
    if (!restored && !api().storage.access) {
      location.replace('/#buy');
      return;
    }

    $('cabinet-logout').addEventListener('click', logout);

    $('cabinet-buy-renew')?.addEventListener('click', () => {
      sessionStorage.setItem('turravpn_checkout_renew', '1');
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
        location.replace('/#buy');
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
