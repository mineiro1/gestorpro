import { Capacitor } from '@capacitor/core';

export const PROD_API_BASE_URL = 'https://www.rspiscinas.app.br';

/**
 * Retorna a URL completa para chamadas de API, garantindo funcionamento tanto
 * na web convencional quanto dentro do APK Android nativo (Capacitor), onde
 * o host local não possui servidor Express/Vercel embutido.
 */
export function getApiUrl(endpoint: string): string {
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (typeof window === 'undefined') {
    return cleanPath;
  }

  const isNative = Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:';
  const isCapacitorLocalhost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '3000';

  if (isNative || isCapacitorLocalhost) {
    const customBase = import.meta.env.VITE_API_BASE_URL || PROD_API_BASE_URL;
    return `${customBase.replace(/\/$/, '')}${cleanPath}`;
  }

  return cleanPath;
}
