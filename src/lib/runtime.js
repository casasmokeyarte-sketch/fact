export function isElectronFileRuntime() {
  return typeof window !== 'undefined' && String(window.location?.protocol || '') === 'file:';
}

export function getAdminUsersUrl() {
  const explicitBase = getAdminApiBase();
  if (explicitBase) {
    return `${explicitBase}/api/admin-users`;
  }

  if (isElectronFileRuntime()) {
    return null;
  }

  return '/api/admin-users';
}

export function getAdminApiBase() {
  return String(import.meta.env?.VITE_ADMIN_API_BASE_URL || '').trim().replace(/\/+$/, '');
}

export function getAssetUrl(assetPath) {
  const normalized = String(assetPath || '').trim().replace(/^\/+/, '');
  if (!normalized) return '';

  const baseHref = typeof window !== 'undefined' && window.location?.href
    ? window.location.href
    : 'http://localhost/';

  return new URL(normalized, baseHref).href;
}
