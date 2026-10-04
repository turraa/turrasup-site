(function () {
  const OAUTH_KEY = 'turravpn_oauth';
  const OAUTH_PENDING_KEY = 'turravpn_oauth_pending';
  const OAUTH_TTL_MS = 15 * 60 * 1000;

  function writeOAuthRaw(key, value) {
    const raw = JSON.stringify(value);
    try {
      localStorage.setItem(key, raw);
    } catch {
      /* ignore quota */
    }
    sessionStorage.setItem(key, raw);
  }

  function readOAuthRaw(key) {
    let raw = null;
    try {
      raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    } catch {
      raw = sessionStorage.getItem(key);
    }
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data?.ts || Date.now() - data.ts > OAUTH_TTL_MS) {
        clearOAuthPending();
        if (key === OAUTH_KEY) clearOAuthState();
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function saveOAuthState(provider, state, mode) {
    writeOAuthRaw(OAUTH_KEY, { provider, state, mode: mode || 'login', ts: Date.now() });
  }

  function loadOAuthState() {
    return readOAuthRaw(OAUTH_KEY);
  }

  function clearOAuthState() {
    sessionStorage.removeItem(OAUTH_KEY);
    try {
      localStorage.removeItem(OAUTH_KEY);
    } catch {
      /* ignore */
    }
  }

  function saveOAuthPending(code, state, deviceId) {
    writeOAuthRaw(OAUTH_PENDING_KEY, { code, state, deviceId: deviceId || null, ts: Date.now() });
  }

  function loadOAuthPending() {
    return readOAuthRaw(OAUTH_PENDING_KEY);
  }

  function clearOAuthPending() {
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
    try {
      localStorage.removeItem(OAUTH_PENDING_KEY);
    } catch {
      /* ignore */
    }
  }

  function applyAuthResponse(auth) {
    const api = window.TurraApi;
    if (auth?.user?.email && auth.user.email_verified === false) {
      api.storage.clear();
      throw new Error('Подтвердите email по ссылке из письма, затем войдите снова.');
    }
    api.storage.clear();
    if (auth?.access_token) api.storage.access = auth.access_token;
    if (auth?.refresh_token) api.storage.refresh = auth.refresh_token;
  }

  function authErrorMessage(err) {
    return err?.message || 'Не удалось выполнить вход. Попробуйте снова.';
  }

  function redirectToMerge(mergeToken) {
    location.replace(`/auth/merge/?token=${encodeURIComponent(mergeToken)}`);
  }

  function extractMergeToken(payload) {
    if (!payload) return null;
    const body = payload.data ?? payload;
    const nested = body?.detail && typeof body.detail === 'object' ? body.detail : null;
    for (const item of [body, nested]) {
      if (!item) continue;
      if (item.merge_required && item.merge_token) return item.merge_token;
    }
    return null;
  }

  function redirectMergeIfNeeded(payload) {
    const token = extractMergeToken(payload);
    if (!token) return false;
    redirectToMerge(token);
    return true;
  }

  window.TurraAuth = {
    saveOAuthState,
    loadOAuthState,
    clearOAuthState,
    saveOAuthPending,
    loadOAuthPending,
    clearOAuthPending,
    applyAuthResponse,
    authErrorMessage,
    redirectToMerge,
    extractMergeToken,
    redirectMergeIfNeeded,
  };
})();
