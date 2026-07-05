(function () {
  /** Доверенные хосты платёжных систем (ответ API topup) */
  const PAYMENT_HOST_SUFFIXES = [
    'yookassa.ru',
    'yoomoney.ru',
    'yookassa.com',
    'platega.io',
    'platima.ru',
    'crypt.bot',
    'heleket.com',
    'mulenpay.ru',
    'pal24.pro',
    'freekassa.ru',
    'cloudpayments.ru',
    'ckassa.ru',
    'payeer.com',
    'wata.pro',
    'severpay.io',
    'tribute.tg',
    'lava.ru',
    'overpay.io',
    'aurapay.io',
    'riopay.co',
    'kassa.ai',
    'donationalerts.com',
  ];

  const OAUTH_HOSTS = {
    yandex: ['oauth.yandex.ru', 'login.yandex.ru'],
    google: ['accounts.google.com'],
    discord: ['discord.com'],
    vk: ['oauth.vk.com', 'id.vk.com'],
  };

  function hostAllowed(hostname, suffixes) {
    const host = String(hostname || '').toLowerCase();
    return suffixes.some((s) => host === s || host.endsWith('.' + s));
  }

  function isHttpsUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'https:') return true;
      return u.protocol === 'http:' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    } catch {
      return false;
    }
  }

  function isSafePaymentUrl(url) {
    if (!url || !isHttpsUrl(url)) return false;
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' && hostAllowed(u.hostname, ['t.me', 'telegram.org'])) return true;
      return hostAllowed(u.hostname, PAYMENT_HOST_SUFFIXES);
    } catch {
      return false;
    }
  }

  function isSafeOAuthUrl(url, provider) {
    if (!url || !isHttpsUrl(url)) return false;
    try {
      const u = new URL(url);
      const list = OAUTH_HOSTS[String(provider || '').toLowerCase()];
      if (!list?.length) return false;
      return hostAllowed(u.hostname, list);
    } catch {
      return false;
    }
  }

  function isSafeSubscriptionUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }

  function isSafeExternalUrl(url) {
    if (!url || !isHttpsUrl(url)) return false;
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }

  function isSafeNavUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url, location.origin);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
      if (u.origin === location.origin) return true;
      const host = u.hostname.toLowerCase();
      return (
        host.endsWith('.turrasup.ru') ||
        host === 'turrasup.ru' ||
        host === 't.me' ||
        host.endsWith('.telegram.org')
      );
    } catch {
      return false;
    }
  }

  function openTrustedUrl(url, target) {
    if (!isSafePaymentUrl(url) && !isSafeNavUrl(url)) {
      throw new Error('Недопустимая ссылка');
    }
    const features = target === '_blank' ? 'noopener,noreferrer' : undefined;
    const w = window.open(url, target || '_blank', features);
    if (w) w.opener = null;
    return w;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(el, text) {
    if (el) el.textContent = text == null ? '' : String(text);
  }

  window.TurraSecurity = {
    isSafePaymentUrl,
    isSafeOAuthUrl,
    isSafeSubscriptionUrl,
    isSafeNavUrl,
    isSafeExternalUrl,
    openTrustedUrl,
    escapeHtml,
    setText,
  };
})();
