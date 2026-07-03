(function () {
  const cfg = () => window.TURRA_CONFIG;
  const CSRF_COOKIE = 'csrf_token';
  const CSRF_HEADER = 'X-CSRF-Token';

  function getCsrf() {
    const m = document.cookie.match(new RegExp(`(^| )${CSRF_COOKIE}=([^;]+)`));
    return m ? m[2] : null;
  }

  function ensureCsrf() {
    let t = getCsrf();
    if (!t) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      document.cookie = `${CSRF_COOKIE}=${t}; path=/; SameSite=Strict; Secure`;
    }
    return t;
  }

  const storage = {
    get access() {
      return localStorage.getItem('turravpn_access');
    },
    set access(v) {
      if (v) localStorage.setItem('turravpn_access', v);
      else localStorage.removeItem('turravpn_access');
    },
    get refresh() {
      return localStorage.getItem('turravpn_refresh');
    },
    set refresh(v) {
      if (v) localStorage.setItem('turravpn_refresh', v);
      else localStorage.removeItem('turravpn_refresh');
    },
    clear() {
      this.access = null;
      this.refresh = null;
    },
  };

  const AUTH_PREFIXES = [
    '/cabinet/auth/',
    '/cabinet/landing/',
  ];

  function isPublic(path) {
    return AUTH_PREFIXES.some((p) => path.startsWith(p));
  }

  async function refreshToken() {
    if (!storage.refresh) return null;
    const res = await fetch(`${cfg().apiBase}/cabinet/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER]: ensureCsrf(),
      },
      body: JSON.stringify({ refresh_token: storage.refresh }),
    });
    if (!res.ok) {
      storage.clear();
      return null;
    }
    const data = await res.json();
    storage.access = data.access_token;
    storage.refresh = data.refresh_token;
    return data.access_token;
  }

  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };

    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers[CSRF_HEADER] = ensureCsrf();
    }

    if (!isPublic(path) && storage.access) {
      headers.Authorization = `Bearer ${storage.access}`;
    }

    let res = await fetch(`${cfg().apiBase}${path}`, { ...options, method, headers });

    if (res.status === 401 && !isPublic(path) && storage.refresh) {
      const token = await refreshToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        res = await fetch(`${cfg().apiBase}${path}`, { ...options, method, headers });
      }
    }

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text };
    }

    if (!res.ok) {
      const msg =
        data?.detail?.message ||
        (typeof data?.detail === 'string' ? data.detail : null) ||
        data?.message ||
        `Ошибка ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.TurraApi = {
    storage,

    getWidgetConfig() {
      return request('/cabinet/branding/telegram-widget');
    },

    getServiceInfo() {
      return request('/cabinet/info/service');
    },

    loginTelegramWidget(user) {
      return request('/cabinet/auth/telegram/widget', {
        method: 'POST',
        body: JSON.stringify(user),
      });
    },

    getPurchaseOptions() {
      return request('/cabinet/subscription/purchase-options');
    },

    getPaymentMethods() {
      return request('/cabinet/balance/payment-methods');
    },

    getBalance() {
      return request('/cabinet/balance');
    },

    purchaseTariff(tariffId, periodDays, trafficGb) {
      return request('/cabinet/subscription/purchase-tariff', {
        method: 'POST',
        body: JSON.stringify({
          tariff_id: tariffId,
          period_days: periodDays,
          traffic_gb: trafficGb ?? null,
        }),
      });
    },

    createTopUp(amountKopeks, paymentMethod, paymentOption) {
      const body = { amount_kopeks: amountKopeks, payment_method: paymentMethod, language: 'ru' };
      if (paymentOption) body.payment_option = paymentOption;
      return request('/cabinet/balance/topup', { method: 'POST', body: JSON.stringify(body) });
    },

    checkPayment(method, paymentId) {
      return request(
        `/cabinet/balance/pending-payments/${encodeURIComponent(method)}/${encodeURIComponent(paymentId)}/check`,
        { method: 'POST' },
      );
    },

    getConnectionLink() {
      return request('/cabinet/subscription/connection-link');
    },

    getSubscription() {
      return request('/cabinet/subscription');
    },

    // --- Landing mode ---
    getLandingConfig(slug) {
      return request(`/cabinet/landing/${slug}`);
    },

    createLandingPurchase(slug, data) {
      return request(`/cabinet/landing/${slug}/purchase`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    getLandingPurchaseStatus(token) {
      return request(`/cabinet/landing/purchase/${token}`);
    },

    activateLandingPurchase(token) {
      return request(`/cabinet/landing/activate/${token}`, { method: 'POST' });
    },
  };
})();
