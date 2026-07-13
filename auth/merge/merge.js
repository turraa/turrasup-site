(function () {
  const api = () => window.TurraApi;
  const auth = () => window.TurraAuth;
  const $ = (id) => document.getElementById(id);

  let preview = null;
  let selectedUserId = null;
  let expiresAt = 0;
  let timerId = null;

  function formatRub(kopeks) {
    return `${(kopeks / 100).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
  }

  function formatDateRu(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
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

  function accountTitle(user) {
    return (
      [user.first_name, user.username && `@${user.username}`].filter(Boolean).join(' · ') ||
      user.email ||
      `Аккаунт #${user.id}`
    );
  }

  function showError(msg) {
    $('merge-loading').classList.add('hidden');
    $('merge-content').classList.add('hidden');
    $('merge-error-text').textContent = msg;
    $('merge-error').classList.remove('hidden');
  }

  function renderAccountCard(user, label) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'merge-account-card';
    card.dataset.userId = String(user.id);

    const methods = user.auth_methods?.map(providerLabel).join(', ') || '—';
    const sub = user.subscription;
    let subText = 'Нет активной подписки';
    if (sub) {
      const name = sub.tariff_name || sub.status;
      const until = sub.end_date ? ` до ${formatDateRu(sub.end_date)}` : '';
      subText = `${name}${until}`;
    }

    card.innerHTML = `
      <span class="merge-account-card__label">${label}</span>
      <strong class="merge-account-card__title">${accountTitle(user)}</strong>
      <span class="muted small">Вход: ${methods}</span>
      <span class="muted small">Подписка: ${subText}</span>
      <span class="muted small">Баланс: ${formatRub(user.balance_kopeks || 0)}</span>
    `;

    card.addEventListener('click', () => selectUser(user.id));
    return card;
  }

  function selectUser(userId) {
    selectedUserId = userId;
    document.querySelectorAll('.merge-account-card').forEach((el) => {
      el.classList.toggle('is-selected', el.dataset.userId === String(userId));
    });
    $('merge-confirm').disabled = false;

    const bothHaveSub =
      preview?.primary?.subscription && preview?.secondary?.subscription;
    $('merge-sub-warning').classList.toggle('hidden', !bothHaveSub);
  }

  function autoSelectSubscription() {
    if (!preview) return;
    const p = preview.primary.subscription;
    const s = preview.secondary.subscription;

    if (p && !s) selectUser(preview.primary.id);
    else if (!p && s) selectUser(preview.secondary.id);
    else if (!p && !s) selectUser(preview.primary.id);
    else {
      $('merge-pick-hint').classList.remove('hidden');
      selectedUserId = null;
      $('merge-confirm').disabled = true;
    }
  }

  function renderPreview(data) {
    preview = data;
    const root = $('merge-accounts');
    root.innerHTML = '';
    root.appendChild(renderAccountCard(data.primary, 'Текущий аккаунт'));
    root.appendChild(renderAccountCard(data.secondary, 'Аккаунт Яндекса'));

    const total = (data.primary.balance_kopeks || 0) + (data.secondary.balance_kopeks || 0);
    $('merge-balance-sum').textContent = `балансы суммируются (итого ~${formatRub(total)});`;

    autoSelectSubscription();
  }

  function updateTimer() {
    const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    if (left <= 0) {
      clearInterval(timerId);
      showError('Время на подтверждение истекло. Начните привязку заново из личного кабинета.');
      return;
    }
    const min = Math.floor(left / 60);
    const sec = String(left % 60).padStart(2, '0');
    $('merge-timer').textContent = `Подтвердите в течение ${min}:${sec}`;
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (!token) {
      showError('Неверная ссылка объединения.');
      return;
    }

    const restored = await api().restoreSession();
    if (!restored && !api().storage.access) {
      sessionStorage.setItem('turravpn_merge_return', token);
      location.replace('/#pricing');
      return;
    }

    try {
      const data = await api().getMergePreview(token);
      expiresAt = Date.now() + data.expires_in_seconds * 1000;
      renderPreview(data);
      $('merge-loading').classList.add('hidden');
      $('merge-content').classList.remove('hidden');
      updateTimer();
      timerId = setInterval(updateTimer, 1000);
    } catch (e) {
      showError(e?.message || 'Ссылка объединения недействительна или истекла.');
    }

    $('merge-confirm').addEventListener('click', async () => {
      if (!selectedUserId) return;
      const btn = $('merge-confirm');
      btn.disabled = true;
      $('merge-msg').classList.add('hidden');

      try {
        const res = await api().executeMerge(token, selectedUserId);
        if (!res.success) throw new Error('Не удалось объединить аккаунты');
        auth().applyAuthResponse(res);
        location.replace('/profile/#accounts');
      } catch (e) {
        $('merge-msg').textContent = e?.message || 'Ошибка объединения';
        $('merge-msg').classList.remove('hidden');
        btn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
