import { supabase } from './supabaseClient';

const CRM_SYNC_URL = import.meta.env.VITE_CRM_SYNC_URL || '';
const CRM_SYNC_SECRET = import.meta.env.VITE_CRM_SYNC_SECRET || '';
const CRM_ORGANIZATION_ID = import.meta.env.VITE_CRM_ORGANIZATION_ID || '';
const CRM_BRANCH_ID = import.meta.env.VITE_CRM_BRANCH_ID || '';
const APP_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const APP_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function getHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

async function buildSyncHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'x-sync-secret': CRM_SYNC_SECRET,
  };

  const crmHost = getHostname(CRM_SYNC_URL);
  const appHost = getHostname(APP_SUPABASE_URL);
  const isSameSupabaseProject = !!crmHost && crmHost === appHost;

  if (!isSameSupabaseProject) {
    return headers;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || APP_SUPABASE_ANON_KEY;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    if (APP_SUPABASE_ANON_KEY) {
      headers.Authorization = `Bearer ${APP_SUPABASE_ANON_KEY}`;
    }
  }

  return headers;
}

export async function syncFactMovement(type, data) {
  if (!CRM_SYNC_URL || !CRM_SYNC_SECRET || !CRM_ORGANIZATION_ID) {
    return;
  }

  const headers = await buildSyncHeaders();
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
