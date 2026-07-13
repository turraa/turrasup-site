(function () {
  function saveOAuthState(provider, state, mode) {
    sessionStorage.setItem(
      'turravpn_oauth',
      JSON.stringify({ provider, state, mode: mode || 'login', ts: Date.now() }),
    );
  }

  function loadOAuthState() {
    try {
      const raw = sessionStorage.getItem('turravpn_oauth');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.ts > 10 * 60 * 1000) {
        sessionStorage.removeItem('turravpn_oauth');
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function clearOAuthState() {
    sessionStorage.removeItem('turravpn_oauth');
  }

  function applyAuthResponse(auth) {
    const api = window.TurraApi;
    if (auth?.user?.email && auth.user.email_verified === false) {
      api.storage.clear();
      throw new Error('Подтвердите email по ссылке из письма, затем войдите снова.');
    }
    if (auth?.access_token) api.storage.access = auth.access_token;
    if (auth?.refresh_token) api.storage.refresh = auth.refresh_token;
  }

  function authErrorMessage(err) {
    return err?.message || 'Не удалось выполнить вход. Попробуйте снова.';
  }

  function redirectToMerge(mergeToken) {
    location.replace(`/auth/merge/?token=${encodeURIComponent(mergeToken)}`);
  }

  window.TurraAuth = {
    saveOAuthState,
    loadOAuthState,
    clearOAuthState,
    applyAuthResponse,
    authErrorMessage,
    redirectToMerge,
  };
})();
