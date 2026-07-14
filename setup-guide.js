/**
 * Блок «Как подключиться» — видео и пошаговая инструкция.
 * Используется в личном кабинете (public/profile).
 */
(function setupGuideModule(global) {
  const cfg = () => global.TURRA_CONFIG || {};

  function setupApps() {
    return Array.isArray(cfg().setupApps) ? cfg().setupApps : [];
  }

  function setupVideoPublicUrl() {
    return cfg().setupVideoPublicUrl || '';
  }

  function downloadUrl() {
    return cfg().downloadUrl || '/#download';
  }

  const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv)$/i;

  function isVideoFile(item) {
    if (item?.mime_type?.startsWith('video/')) return true;
    return VIDEO_EXT.test(item?.name || '');
  }

  function findVideoItem(resource) {
    if (resource?.type === 'file' && isVideoFile(resource)) return resource;
    const items = resource?._embedded?.items || [];
    return items.find((item) => item.type === 'file' && isVideoFile(item)) || null;
  }

  async function resolveYandexPublicVideoUrl(publicUrl) {
    if (!publicUrl) return null;

    const metaRes = await fetch(
      `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(publicUrl)}&limit=30`,
    );
    if (!metaRes.ok) return null;

    const meta = await metaRes.json();
    const videoItem = findVideoItem(meta);
    if (!videoItem?.name) return null;
    if (videoItem.file) return videoItem.file;

    const downloadUrlApi = new URL(
      'https://cloud-api.yandex.net/v1/disk/public/resources/download',
    );
    downloadUrlApi.searchParams.set('public_key', publicUrl);
    if (meta.type === 'dir') {
      downloadUrlApi.searchParams.set('path', videoItem.name);
    }

    const dlRes = await fetch(downloadUrlApi.toString());
    if (!dlRes.ok) return null;

    const dl = await dlRes.json();
    return dl.href || null;
  }

  function storeLink(href, label) {
    return `<a class="setup-guide__store-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }

  function renderAppsList(apps) {
    return apps
      .map((app, index) => {
        const prefix = index > 0 ? ' или ' : '';
        return (
          `${prefix}<strong>${app.label}</strong> (` +
          `${storeLink(app.ios, 'App Store')}, ${storeLink(app.android, 'Google Play')})`
        );
      })
      .join('');
  }

  function renderTextPanel(apps) {
    const appsHtml = renderAppsList(apps);
    const winUrl = downloadUrl();

    return `
      <div class="setup-guide__panel" role="tabpanel">
        <div class="setup-guide__cards">
          <article class="setup-guide__card">
            <h4 class="setup-guide__card-title">iPhone и Android</h4>
            <ol class="setup-guide__steps">
              <li>Установите приложение ${appsHtml}.</li>
              <li>Откройте приложение и добавьте подписку по ссылке из поля «Ключ подключения» выше.</li>
              <li>Выберите сервер и включите подключение — VPN готов к работе.</li>
            </ol>
          </article>
          <article class="setup-guide__card">
            <h4 class="setup-guide__card-title">Windows</h4>
            <ol class="setup-guide__steps">
              <li>Скачайте <a href="${winUrl}" target="_blank" rel="noopener noreferrer">лаунчер TurraVPN</a> для Windows.</li>
              <li>Установите приложение и вставьте ссылку подписки из поля «Ключ подключения».</li>
              <li>Выберите сервер и подключитесь — можно пользоваться VPN на компьютере.</li>
            </ol>
          </article>
        </div>
        <p class="setup-guide__note">
          Ссылка подписки одна для всех устройств. Скопируйте её один раз и используйте в нужном приложении.
        </p>
      </div>
    `;
  }

  function renderVideoPanel(diskUrl) {
    return `
      <div class="setup-guide__panel" role="tabpanel" data-setup-video-panel>
        <div class="setup-guide__video-wrap">
          <div class="setup-guide__video-placeholder" data-setup-video-loading>
            <div class="spinner" aria-hidden="true"></div>
            <p class="muted small">Загружаем видео…</p>
          </div>
          <div class="setup-guide__video-fallback hidden" data-setup-video-fallback>
            <p class="muted small">Не удалось встроить видео на страницу.</p>
            <a class="setup-guide__video-link" href="${diskUrl}" target="_blank" rel="noopener noreferrer">
              Открыть видео на Яндекс.Диске
            </a>
          </div>
        </div>
      </div>
    `;
  }

  function render(root) {
    const apps = setupApps();
    const diskUrl = setupVideoPublicUrl();

    root.innerHTML = `
      <section class="setup-guide" aria-labelledby="setup-guide-title">
        <div class="setup-guide__head">
          <h2 id="setup-guide-title" class="h3 section-title-sm">Как подключиться</h2>
          <p class="muted small setup-guide__lead">
            Выберите удобный формат: посмотрите видео или следуйте пошаговой инструкции ниже.
          </p>
        </div>
        <div class="setup-guide__tabs" role="tablist" aria-label="Формат инструкции">
          <button type="button" role="tab" class="setup-guide__tab is-active" data-setup-tab="video" aria-selected="true">
            Видеоинструкция
          </button>
          <button type="button" role="tab" class="setup-guide__tab" data-setup-tab="text" aria-selected="false">
            Пошаговая инструкция
          </button>
        </div>
        <div data-setup-panel="video">${renderVideoPanel(diskUrl)}</div>
        <div class="hidden" data-setup-panel="text">${renderTextPanel(apps)}</div>
      </section>
    `;

    const tabs = root.querySelectorAll('[data-setup-tab]');
    const panels = root.querySelectorAll('[data-setup-panel]');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.getAttribute('data-setup-tab');
        tabs.forEach((btn) => {
          const active = btn.getAttribute('data-setup-tab') === id;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach((panel) => {
          panel.classList.toggle('hidden', panel.getAttribute('data-setup-panel') !== id);
        });
      });
    });

    void loadVideo(root, diskUrl);
  }

  async function loadVideo(root, diskUrl) {
    const wrap = root.querySelector('.setup-guide__video-wrap');
    const loading = root.querySelector('[data-setup-video-loading]');
    const fallback = root.querySelector('[data-setup-video-fallback]');
    if (!wrap || !diskUrl) {
      loading?.classList.add('hidden');
      fallback?.classList.remove('hidden');
      return;
    }

    try {
      const url = await resolveYandexPublicVideoUrl(diskUrl);
      loading?.classList.add('hidden');

      if (!url) {
        fallback?.classList.remove('hidden');
        return;
      }

      const video = document.createElement('video');
      video.className = 'setup-guide__video';
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = url;
      video.textContent = 'Ваш браузер не поддерживает воспроизведение видео.';
      wrap.appendChild(video);
    } catch {
      loading?.classList.add('hidden');
      fallback?.classList.remove('hidden');
    }
  }

  global.TurraSetupGuide = { render };
})(window);
