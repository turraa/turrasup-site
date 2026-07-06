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
      return sessionStorage.getItem('turravpn_access');
    },
    set access(v) {
      if (v) sessionStorage.setItem('turravpn_access', v);
      else sessionStorage.removeItem('turravpn_access');
    },
    get refresh() {
      return localStorage.getItem('turravpn_refresh');
    },
    set refresh(v) {
      if (v) localStorage.setItem('turravpn_refresh', v);
      else localStorage.removeItem('turravpn_refresh');
    },
    clear() {
      sessionStorage.removeItem('turravpn_access');
      localStorage.removeItem('turravpn_refresh');
    },
  };

  const NO_REFRESH_PATHS = [
    '/cabinet/auth/email/login',
    '/cabinet/auth/email/register',
    '/cabinet/auth/telegram/widget',
    '/cabinet/auth/refresh',
    '/cabinet/auth/email/verify',
    '/cabinet/auth/password/forgot',
    '/cabinet/auth/password/reset',
  ];

  function shouldRetryRefresh(path) {
    if (NO_REFRESH_PATHS.some((p) => path === p || path.startsWith(p))) return false;
    if (path.includes('/cabinet/auth/oauth/') && path.includes('/callback')) return false;
    return !!storage.refresh;
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

    if (storage.access) {
      headers.Authorization = `Bearer ${storage.access}`;
    }

    let res = await fetch(`${cfg().apiBase}${path}`, { ...options, method, headers });

    if (res.status === 401 && shouldRetryRefresh(path)) {
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

  async function restoreSession() {
    if (storage.access) return true;
    if (!storage.refresh) return false;
    return !!(await refreshToken());
  }

  window.TurraApi = {
    storage,
    restoreSession,

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

    loginEmail(email, password) {
      return request('/cabinet/auth/email/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },

    registerEmailStandalone(data) {
      return request('/cabinet/auth/email/register/standalone', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    verifyEmail(token) {
      return request('/cabinet/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },

    getEmailAuthSettings() {
      return request('/cabinet/branding/email-auth');
    },

    resendVerification(email) {
      return request('/cabinet/auth/email/resend', {
        method: 'POST',
        body: JSON.stringify(email ? { email } : {}),
      });
    },

    forgotPassword(email) {
      return request('/cabinet/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },

    resetPassword(token, password) {
      return request('/cabinet/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
    },

    getOAuthProviders() {
      return request('/cabinet/auth/oauth/providers');
    },

    getOAuthAuthorizeUrl(provider) {
      return request(`/cabinet/auth/oauth/${encodeURIComponent(provider)}/authorize`);
    },

    oauthCallback(provider, code, state, deviceId) {
      return request(`/cabinet/auth/oauth/${encodeURIComponent(provider)}/callback`, {
        method: 'POST',
        body: JSON.stringify({
          code,
          state,
          device_id: deviceId || undefined,
        }),
      });
    },

    getMe() {
      return request('/cabinet/auth/me');
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
