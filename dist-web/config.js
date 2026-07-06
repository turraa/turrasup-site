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
  /** Файл лежит в корне сайта (public/TurraVPN.exe → dist-web после сборки) */
  downloadUrl: '/TurraVPN.exe',
  downloadFileName: 'TurraVPN.exe',

  /** Deep link для Windows-клиента */
  deepLinkScheme: 'turravpn',

  pollIntervalMs: 3000,
  paymentPollMaxMs: 20 * 60 * 1000,
};
