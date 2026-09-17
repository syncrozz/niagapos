/**
 * OFFICIAL KEDAI PAPA BRAND ASSETS
 * Authoritative Single Source of Truth:
 * https://github.com/syncrozz/syncrozz-assets/tree/main/logo/KedaiPAPA
 */

export const KEDAI_PAPA_ASSET_BASE =
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/KedaiPAPA';

export const KEDAI_PAPA_ASSETS = {
  // Official Logo / Vector Graphic (SVG)
  logoSvg: `${KEDAI_PAPA_ASSET_BASE}/favicon.svg`,

  // High-Resolution PNG Logomarks
  logo512: `${KEDAI_PAPA_ASSET_BASE}/android-chrome-512x512.png`,
  logo192: `${KEDAI_PAPA_ASSET_BASE}/android-chrome-192x192.png`,

  // PWA / App Icons
  icon192: `${KEDAI_PAPA_ASSET_BASE}/android-chrome-192x192.png`,
  icon512: `${KEDAI_PAPA_ASSET_BASE}/android-chrome-512x512.png`,
  androidChrome192: `${KEDAI_PAPA_ASSET_BASE}/android-chrome-192x192.png`,
  androidChrome512: `${KEDAI_PAPA_ASSET_BASE}/android-chrome-512x512.png`,
  appleTouchIcon: `${KEDAI_PAPA_ASSET_BASE}/apple-touch-icon.png`,
  webAppManifest192: `${KEDAI_PAPA_ASSET_BASE}/web-app-manifest-192x192.png`,
  webAppManifest512: `${KEDAI_PAPA_ASSET_BASE}/web-app-manifest-512x512.png`,

  // Favicons
  faviconIco: `${KEDAI_PAPA_ASSET_BASE}/favicon.ico`,
  faviconSvg: `${KEDAI_PAPA_ASSET_BASE}/favicon.svg`,
  favicon16: `${KEDAI_PAPA_ASSET_BASE}/favicon-16x16.png`,
  favicon32: `${KEDAI_PAPA_ASSET_BASE}/favicon-32x32.png`,
  favicon48: `${KEDAI_PAPA_ASSET_BASE}/favicon-48x48.png`,
  favicon96: `${KEDAI_PAPA_ASSET_BASE}/favicon-96x96.png`,

  // Windows / Microsoft Tiles
  mstile150: `${KEDAI_PAPA_ASSET_BASE}/mstile-150x150.png`,

  // Web App Manifest
  siteManifest: `${KEDAI_PAPA_ASSET_BASE}/site.webmanifest`,

  // Local fallback paths (servable from /public directory)
  local: {
    logoSvg: '/favicon.svg',
    androidChrome192: '/android-chrome-192x192.png',
    androidChrome512: '/android-chrome-512x512.png',
    appleTouchIcon: '/apple-touch-icon.png',
    faviconIco: '/favicon.ico',
    faviconSvg: '/favicon.svg',
    favicon96: '/favicon-96x96.png',
    manifest: '/site.webmanifest',
  },
} as const;
