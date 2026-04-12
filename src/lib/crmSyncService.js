const CRM_SYNC_URL = import.meta.env.VITE_CRM_SYNC_URL || '';
const CRM_SYNC_SECRET = import.meta.env.VITE_CRM_SYNC_SECRET || '';
const CRM_ORGANIZATION_ID = import.meta.env.VITE_CRM_ORGANIZATION_ID || '';
const CRM_BRANCH_ID = import.meta.env.VITE_CRM_BRANCH_ID || '';

export async function syncFactMovement(type, data) {
  if (!CRM_SYNC_URL || !CRM_SYNC_SECRET || !CRM_ORGANIZATION_ID) {
    return;
  }

  const response = await fetch(CRM_SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'x-sync-secret': CRM_SYNC_SECRET,
    },
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
    throw new Error(text || `CRM sync failed with status ${response.status}`);
  }

  return response.json().catch(() => null);
}
