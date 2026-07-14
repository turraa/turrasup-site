/** Настройки сайта — меняй только этот файл при деплое */
window.TURRA_CONFIG = {
  /** База Cabinet API (у тебя: /api на cab.turrasup.net) */
  apiBase: 'https://cab.turrasup.net/api',

  /**
   * Режим покупки:
   * - 'auth'    — вход через Telegram Widget + JWT (рекомендуется)
   * - 'landing' — публичный лендинг Bedolaga (нужен slug в админке)
   */
  mode: 'auth',

  /** Slug лендинга из админки Bedolaga (только для mode: 'landing') */
  landingSlug: null,

  /** Бот для Telegram Login Widget (подтягивается с API, это fallback) */
  botUsername: 'TurraVpnbot',

  /** Публичный адрес этого сайта (поддомен — VPN-сервер не трогаем) */
  siteUrl: 'https://buy.turrasup.ru',

  telegramUrl: 'https://t.me/TurraVpnbot',
  supportUrl: 'https://t.me/turravpn_sup',
  newsUrl: 'https://t.me/turravpnnews',
  /** Всегда последний Release на GitHub — при новом exe на Releases ссылка обновится сама */
  downloadUrl: 'https://github.com/turraa/turrasup-site/releases/latest/download/TurraVPN.exe',
  downloadFileName: 'TurraVPN.exe',

  /** Deep link для Windows-клиента */
  deepLinkScheme: 'turravpn',

  pollIntervalMs: 3000,
  paymentPollMaxMs: 20 * 60 * 1000,

  /** Публичная папка с видеоинструкцией на Яндекс.Диске */
  setupVideoPublicUrl: 'https://disk.yandex.ru/d/ghOU8icASWFLrQ',

  /** Ссылки на мобильные клиенты */
  setupApps: [
    {
      label: 'Happ',
      ios: 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973',
      android: 'https://play.google.com/store/apps/details?id=com.happproxy',
    },
    {
      label: 'INCY',
      ios: 'https://apps.apple.com/ru/app/incy/id6756943388',
      android: 'https://play.google.com/store/apps/details?id=llc.itdev.incy',
    },
  ],
};
