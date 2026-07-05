(function () {
  const cfg = () => window.TURRA_CONFIG;
  const api = () => window.TurraApi;
  const sec = () => window.TurraSecurity;
  const $ = (id) => document.getElementById(id);

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

  function renderProfile(user, subscription, balanceKopeks) {
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
    $('cabinet-sub-status').textContent = active ? 'Активна' : 'Нет подписки';
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

    $('profile-loading').classList.add('hidden');
    $('profile-content').classList.remove('hidden');
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
    await initLinks();

    try {
      const [me, subscription, opts] = await Promise.all([
        api().getMe(),
        api().getSubscription(),
        api().getPurchaseOptions().catch(() => null),
      ]);

      const user = me.user || me;
      renderProfile(user, subscription, opts?.balance_kopeks);
    } catch (e) {
      if (e?.status === 401) {
        const again = await api().restoreSession();
        if (again) {
          try {
            const [me, subscription, opts] = await Promise.all([
              api().getMe(),
              api().getSubscription(),
              api().getPurchaseOptions().catch(() => null),
            ]);
            renderProfile(me.user || me, subscription, opts?.balance_kopeks);
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
