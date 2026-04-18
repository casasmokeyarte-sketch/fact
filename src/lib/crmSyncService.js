import { supabase } from './supabaseClient';

const CRM_SYNC_URL = import.meta.env.VITE_CRM_SYNC_URL || '';
const CRM_SYNC_SECRET = import.meta.env.VITE_CRM_SYNC_SECRET || '';
const CRM_ORGANIZATION_ID = import.meta.env.VITE_CRM_ORGANIZATION_ID || '';
const CRM_BRANCH_ID = import.meta.env.VITE_CRM_BRANCH_ID || '';
const CRM_SYNC_AUTH_TOKEN =
  import.meta.env.VITE_CRM_SYNC_AUTH_TOKEN || import.meta.env.VITE_CRM_SYNC_ANON_KEY || '';
const APP_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const APP_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function getHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function parseJwtHeader(token) {
  try {
    const [headerChunk] = String(token || '').split('.');
    if (!headerChunk) return null;

    const base64 = headerChunk.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isUnsupportedSupabaseGatewayJwt(token) {
  const alg = String(parseJwtHeader(token)?.alg || '').toUpperCase();
  return alg === 'ES256' || alg === 'ES384' || alg === 'ES512';
}

function isSupabaseFunctionUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('.supabase.co') && parsed.pathname.includes('/functions/v1/');
  } catch {
    return false;
  }
}

function usesDifferentSupabaseProject() {
  const syncHost = getHostname(CRM_SYNC_URL);
  const appHost = getHostname(APP_SUPABASE_URL);
  return !!syncHost && !!appHost && syncHost !== appHost;
}

async function buildSyncHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'x-sync-secret': CRM_SYNC_SECRET,
  };

  if (CRM_SYNC_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${CRM_SYNC_AUTH_TOKEN}`;
    return headers;
  }

  // Solo usar session token cuando app y function viven en el mismo proyecto.
  if (usesDifferentSupabaseProject()) {
    return headers;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || APP_SUPABASE_ANON_KEY;
    if (accessToken && !isUnsupportedSupabaseGatewayJwt(accessToken)) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    if (APP_SUPABASE_ANON_KEY) {
      headers.Authorization = `Bearer ${APP_SUPABASE_ANON_KEY}`;
    }
  }

  if (!headers.Authorization && APP_SUPABASE_ANON_KEY) {
    headers.Authorization = `Bearer ${APP_SUPABASE_ANON_KEY}`;
  }

  return headers;
}

export async function syncFactMovement(type, data) {
  if (!CRM_SYNC_URL || !CRM_SYNC_SECRET || !CRM_ORGANIZATION_ID) {
    return;
  }

  const headers = await buildSyncHeaders();

  if (isSupabaseFunctionUrl(CRM_SYNC_URL) && !headers.Authorization) {
    throw new Error(
      'CRM sync sin Authorization valida. Configure VITE_CRM_SYNC_AUTH_TOKEN (o VITE_CRM_SYNC_ANON_KEY) con un JWT del proyecto donde vive VITE_CRM_SYNC_URL.'
    );
  }

  const response = await fetch(CRM_SYNC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: 'FACT',
      organizationId: CRM_ORGANIZATION_ID,
      branchId: CRM_BRANCH_ID || null,
      type,
      data,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const targetHost = getHostname(CRM_SYNC_URL) || 'unknown-host';
    throw new Error(text || `CRM sync failed with status ${response.status} at ${targetHost}`);
  }

  return response.json().catch(() => null);
}
