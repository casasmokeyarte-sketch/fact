import { supabase } from './supabaseClient';
import { CREDIT_LEVELS } from '../constants';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function formatDbError(error, scope) {
  const msg = [
    scope,
    error?.message,
    error?.code ? `code=${error.code}` : null,
    error?.details ? `details=${error.details}` : null,
    error?.hint ? `hint=${error.hint}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
  return new Error(msg || `${scope} fallo`);
}

function isBarcodeUniqueError(error) {
  return (
    String(error?.code || '') === '23505' &&
    /barcode/i.test(`${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`)
  );
}

function isClientDocumentUniqueError(error) {
  return String(error?.code || '') === '23505' && String(error?.message || '').includes('clients_document_key');
}

function isForeignKeyConstraintError(error) {
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return String(error?.code || '') === '23503' || blob.includes('foreign key');
}

function isNetworkFetchError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('fetch');
}

function isAuthSessionError(error) {
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    blob.includes('no hay sesion activa') ||
    blob.includes('auth.getsession') ||
    blob.includes('auth.getuser') ||
    blob.includes('jwt') ||
    blob.includes('token') ||
    blob.includes('session') ||
    blob.includes('invalid refresh token') ||
    code === 'pgrst301'
  );
}

function raiseSessionExpired(error) {
  const wrapped = new Error('Sesion no valida o expirada. Cierre sesion e inicie nuevamente.');
  wrapped.code = 'SESSION_INVALID';
  wrapped.cause = error || null;
  throw wrapped;
}

function isUndefinedColumnError(error) {
  const code = String(error?.code || '');
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    blob.includes("could not find the 'user_name' column") ||
    blob.includes("could not find the 'company_id' column")
  );
}

function isMissingIsVisibleColumnError(error) {
  const code = String(error?.code || '');
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42703' || code === 'PGRST204' || blob.includes('is_visible');
}

function isMissingFullPriceOnlyColumnError(error) {
  const code = String(error?.code || '');
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42703' || code === 'PGRST204' || blob.includes('full_price_only');
}

function isMissingImageUrlColumnError(error) {
  const code = String(error?.code || '');
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42703' || code === 'PGRST204' || blob.includes('image_url');
}

function stripUnsupportedProductFields(payload, error) {
  if (!payload || typeof payload !== 'object') return payload;

  let nextPayload = { ...payload };
  let changed = false;

  const errorBlob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const errorCode = String(error?.code || '');
  const isMissingColumn = errorCode === '42703' || errorCode === 'PGRST204' || errorBlob.includes('does not exist') || errorBlob.includes('not found');

  if (!isMissingColumn) return null;

  // If any missing column error is detected, we strip all known "optional/newer" columns
  // that might be missing from the schema to ensure the update succeeds.
  
  if (Object.prototype.hasOwnProperty.call(nextPayload, 'is_visible')) {
    const { is_visible, ...rest } = nextPayload;
    nextPayload = rest;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'full_price_only')) {
    const { full_price_only, ...rest } = nextPayload;
    nextPayload = rest;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'image_url')) {
    const { image_url, ...rest } = nextPayload;
    nextPayload = rest;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'stock')) {
    const { stock, ...rest } = nextPayload;
    nextPayload = rest;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(nextPayload, 'warehouse_stock')) {
    const { warehouse_stock, ...rest } = nextPayload;
    nextPayload = rest;
    changed = true;
  }

  return changed ? nextPayload : null;
}

function isMissingRelationError(error) {
  const code = String(error?.code || '');
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42P01' || blob.includes('relation') || blob.includes('does not exist');
}

function isMissingTableOrColumnError(error) {
  return isMissingRelationError(error) || isUndefinedColumnError(error);
}

function reportClientSyncIssue(scope, payload, error) {
  const details = {
    scope,
    message: error?.message || String(error || 'Error desconocido'),
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
    payload,
    at: new Date().toISOString(),
  };

  console.error(`[SYNC:${scope}]`, details);

  if (typeof window === 'undefined') return;

  try {
    const now = Date.now();
    const lastShownAt = Number(window.__factLastSyncAlertAt || 0);
    if (now - lastShownAt < 12000) return;
    window.__factLastSyncAlertAt = now;
    window.alert(
      `Error sincronizando ${scope}.\n\n` +
      `Mensaje: ${details.message}\n` +
      `${details.code ? `Codigo: ${details.code}\n` : ''}` +
      'Revise la consola del navegador para mas detalle.'
    );
  } catch {
    // noop
  }
}

function buildClientUpdateDebugMessage(payload, userId) {
  return [
    `client.id=${String(payload?.id || '').trim() || 'N/A'}`,
    `client.document=${String(payload?.document || '').trim() || 'N/A'}`,
    `client.user_id=${String(payload?.user_id || '').trim() || 'N/A'}`,
    `client.company_id=${String(payload?.company_id || '').trim() || 'N/A'}`,
    `auth.user_id=${String(userId || '').trim() || 'N/A'}`,
  ].join(' | ');
}

async function getAuthDebugSnapshot() {
  let user = null;
  let session = null;
  let userError = null;
  let sessionError = null;
  let currentCompanyId = null;
  let currentCompanyIdError = null;

  try {
    const userResult = await supabase.auth.getUser();
    user = userResult?.data?.user || null;
    userError = userResult?.error?.message || null;
  } catch (error) {
    userError = String(error?.message || error || 'Error desconocido');
  }

  try {
    const sessionResult = await supabase.auth.getSession();
    session = sessionResult?.data?.session || null;
    sessionError = sessionResult?.error?.message || null;
  } catch (error) {
    sessionError = String(error?.message || error || 'Error desconocido');
  }

  try {
    const { data, error } = await supabase.rpc('current_company_id');
    if (!error && isUuid(data)) {
      currentCompanyId = data;
    } else if (error) {
      currentCompanyIdError = error?.message || null;
    }
  } catch (error) {
    currentCompanyIdError = String(error?.message || error || 'Error desconocido');
  }

  return {
    user: user
      ? {
          id: user.id || null,
          email: user.email || null,
          role: user.role || null,
        }
      : null,
    session: session
      ? {
          userId: session.user?.id || null,
          expiresAt: session.expires_at || null,
          tokenType: session.token_type || null,
          hasAccessToken: !!session.access_token,
        }
      : null,
    userError,
    sessionError,
    currentCompanyId,
    currentCompanyIdError,
  };
}

async function withRetry(operation, retries = 2, delayMs = 450) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isNetworkFetchError(error) || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

async function getAuthUserId() {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) throw formatDbError(sessionError, 'auth.getSession');

    const sessionUserId = session?.user?.id;
    if (sessionUserId) return sessionUserId;

    const { data, error } = await supabase.auth.getUser();
    if (error) throw formatDbError(error, 'auth.getUser');
    const userId = data?.user?.id;
    if (!userId) throw new Error('No hay sesion activa');
    return userId;
  } catch (error) {
    if (isAuthSessionError(error)) {
      raiseSessionExpired(error);
    }
    throw error;
  }
}

async function getCurrentCompanyId(userId) {
  try {
    const { data, error } = await supabase.rpc('current_company_id');
    if (!error && isUuid(data)) return data;
  } catch {
    // noop
  }

  if (!isUuid(userId)) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return isUuid(data?.company_id) ? data.company_id : null;
  } catch {
    return null;
  }
}

function removeInvalidUuidId(payload) {
  if (isUuid(payload?.id)) return payload;
  const { id, ...rest } = payload || {};
  return rest;
}

function normalizeNumericBarcode(value) {
  const raw = String(value ?? '').trim();
  return /^\d+$/.test(raw) ? raw : '';
}

function normalizeSignatureText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildProductSignature(product) {
  const name = normalizeSignatureText(product?.name);
  const category = normalizeSignatureText(product?.category);
  const price = Number(product?.price ?? 0);
  if (!name) return null;
  return { name, category, price };
}

function normalizeShiftInventoryRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const productId = String(item?.productId || item?.product_id || '').trim();
      if (!productId) return null;
      return {
        productId,
        productName: item?.productName || 'Producto',
        quantity: Number(item?.quantity ?? item?.assignedQty ?? 0) || 0,
        assignedQty: Number(item?.assignedQty ?? item?.quantity ?? 0) || 0,
        soldQty: Number(item?.soldQty ?? 0) || 0,
        expectedQty: Number(item?.expectedQty ?? 0) || 0,
        returnedQty: Number(item?.returnedQty ?? 0) || 0,
        differenceQty: Number(item?.differenceQty ?? 0) || 0,
        availableInSystem: Number(item?.availableInSystem ?? 0) || 0,
      };
    })
    .filter(Boolean);
}

function normalizeInventoryTransferRequestRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    productId: row.product_id ?? '',
    productName: row.product_name ?? 'Producto',
    quantity: Number(row.quantity ?? 0),
    targetUserId: row.target_user_id ?? null,
    targetUserKey: row.target_user_key ?? '',
    targetUserName: row.target_user_name ?? '',
    status: row.status ?? 'PENDING',
    source: row.source_location ?? 'bodega',
    destination: row.destination_location ?? 'ventas',
    createdAt: row.created_at ?? null,
    createdBy: {
      id: row.created_by ?? null,
      name: row.created_by_name ?? null,
    },
    resolvedAt: row.resolved_at ?? null,
    resolvedBy: {
      id: row.resolved_by ?? null,
      name: row.resolved_by_name ?? null,
    },
  };
}

function normalizeCommercialNoteRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    createdBy: {
      id: row.user_id ?? null,
      name: row.user_name ?? null,
    },
    date: row.date ?? null,
    noteClass: row.note_class ?? 'AJUSTE',
    scope: row.scope ?? 'CLIENTE',
    reasonCode: row.reason_code ?? '',
    reasonLabel: row.reason_label ?? '',
    direction: row.direction ?? 'NEUTRO',
    amount: Number(row.amount ?? 0),
    quantity: Number(row.quantity ?? 0),
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? '',
    clientDocument: row.client_document ?? '',
    invoiceId: row.invoice_id ?? null,
    invoiceCode: row.invoice_code ?? '',
    productId: row.product_id ?? null,
    productName: row.product_name ?? '',
    description: row.description ?? '',
    status: row.status ?? 'ACTIVA',
  };
}

function normalizeCreditLevel(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeCreditLevelKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function resolveCreditLevel(value) {
  const normalized = normalizeCreditLevelKey(value || 'ESTANDAR');
  if (CREDIT_LEVELS[normalized]) return normalized;
  const byLabel = Object.entries(CREDIT_LEVELS).find(([, level]) =>
    normalizeCreditLevelKey(level?.label) === normalized
  );
  return byLabel?.[0] || 'ESTANDAR';
}

export const dataService = {
  async getNextInvoiceCode(prefix = 'SSOT') {
    const safePrefix = String(prefix || 'SSOT').toUpperCase();

    // Preferred path: atomic sequence in DB via RPC.
    try {
      const { data, error } = await supabase.rpc('next_invoice_code', { p_prefix: safePrefix });
      if (!error && data) return String(data);
    } catch {
      // fallback below
    }

    // Fallback: infer from existing invoices in DB.
    const { data, error } = await supabase
      .from('invoices')
      .select('id, mixed_details, date')
      .order('date', { ascending: false })
      .limit(5000);
    if (error) throw error;

    const maxN = (data || []).reduce((max, inv) => {
      const a = String(inv?.mixed_details?.invoiceCode || '');
      const b = String(inv?.id || '');
      const mA = a.match(new RegExp(`^${safePrefix}-(\\d+)$`, 'i'));
      const mB = b.match(new RegExp(`^${safePrefix}-(\\d+)$`, 'i'));
      const nA = mA ? Number(mA[1] || 0) : 0;
      const nB = mB ? Number(mB[1] || 0) : 0;
      return Math.max(max, nA, nB);
    }, 0);

    return `${safePrefix}-${String(maxN + 1).padStart(4, '0')}`;
  },

  // PRODUCTS
  async getProducts() {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) throw error;
    return (data || [])
      .filter((p) => (p?.status ?? 'activo') !== 'inactivo')
      .map((p) => ({
      ...p,
      barcode: normalizeNumericBarcode(p.barcode),
      status: String(p?.status || 'activo'),
      reorder_level: Number(p?.reorder_level ?? 10),
      is_visible: p?.is_visible !== false,
      image_url: String(p?.image_url || '').trim(),
    }));
  },

  async saveProduct(product) {
    const userId = product?.user_id || await getAuthUserId();
    const companyId = await getCurrentCompanyId(userId);
    const payload = {
      ...product,
      barcode: normalizeNumericBarcode(product.barcode) || null,
      status: String(product?.status || 'activo'),
      reorder_level: Number(product?.reorder_level ?? 10),
      user_id: product.user_id || userId,
    };
    
    if (isUuid(companyId)) {
      payload.company_id = companyId;
    }
    
    // Add optional columns only if explicitly provided to minimize schema cache errors (PGRST204)
    if (Object.prototype.hasOwnProperty.call(product, 'is_visible')) {
      payload.is_visible = product.is_visible;
    }
    if (Object.prototype.hasOwnProperty.call(product, 'full_price_only')) {
      payload.full_price_only = product.full_price_only;
    }
    if (Object.prototype.hasOwnProperty.call(product, 'image_url')) {
      payload.image_url = String(product?.image_url || '').trim() || null;
    }

    if (isUuid(payload.id)) {
      // Do not overwrite primary key, owner or creation timestamp on existing products.
      const { id, user_id, created_at, ...updatePayload } = payload;
      let { data: updatedData, error: updateError } = await withRetry(() =>
        supabase.from('products').update(updatePayload).eq('id', payload.id).select()
      );
      if (updateError) {
        const fallbackPayload = stripUnsupportedProductFields(updatePayload, updateError);
        if (fallbackPayload) {
        const retry = await withRetry(() =>
          supabase.from('products').update(fallbackPayload).eq('id', payload.id).select()
        );
        updatedData = retry.data;
        updateError = retry.error;
        }
      }
      if (updateError) throw updateError;
      if ((updatedData || []).length > 0) return updatedData;

      const insertWithIdPayload = { ...removeInvalidUuidId(payload), id: payload.id };
      let { data: insertedData, error: insertError } = await withRetry(() =>
        supabase.from('products').insert(insertWithIdPayload).select()
      );
      if (insertError) {
        const fallbackPayload = stripUnsupportedProductFields(insertWithIdPayload, insertError);
        if (fallbackPayload) {
        const retry = await withRetry(() =>
          supabase.from('products').insert(fallbackPayload).select()
        );
        insertedData = retry.data;
        insertError = retry.error;
        }
      }
      if (!insertError) return insertedData;

      if (!isBarcodeUniqueError(insertError) || !payload.barcode) throw insertError;

      const fallbackUpdatePayload = removeInvalidUuidId(updatePayload);
      let { data: byBarcodeData, error: byBarcodeError } = await withRetry(() =>
        supabase.from('products').update(fallbackUpdatePayload).eq('barcode', payload.barcode).select()
      );
      if (byBarcodeError) {
        const retryPayload = stripUnsupportedProductFields(fallbackUpdatePayload, byBarcodeError);
        if (retryPayload) {
          const retry = await withRetry(() =>
            supabase.from('products').update(retryPayload).eq('barcode', payload.barcode).select()
          );
          byBarcodeData = retry.data;
          byBarcodeError = retry.error;
        }
      }
      if (byBarcodeError) throw byBarcodeError;
      return byBarcodeData;
    }

    const insertPayload = removeInvalidUuidId(payload);
    const hasBarcode = !!insertPayload.barcode;
    const signature = buildProductSignature(insertPayload);

    if (hasBarcode) {
      const updatePayload = removeInvalidUuidId(insertPayload);
      let { data: existingByBarcode, error: existingByBarcodeError } = await withRetry(() =>
        supabase.from('products').update(updatePayload).eq('barcode', insertPayload.barcode).select()
      );
      if (existingByBarcodeError) {
        const fallbackPayload = stripUnsupportedProductFields(updatePayload, existingByBarcodeError);
        if (fallbackPayload) {
        const retry = await withRetry(() =>
          supabase.from('products').update(fallbackPayload).eq('barcode', insertPayload.barcode).select()
        );
        existingByBarcode = retry.data;
        existingByBarcodeError = retry.error;
        }
      }
      if (existingByBarcodeError) throw existingByBarcodeError;
      if ((existingByBarcode || []).length > 0) return existingByBarcode;
    }

    if (signature) {
      let signatureQuery = supabase
        .from('products')
        .select('*')
        .neq('status', 'inactivo')
        .eq('price', signature.price);

      if (insertPayload.category) {
        signatureQuery = signatureQuery.eq('category', insertPayload.category);
      } else {
        signatureQuery = signatureQuery.or('category.is.null,category.eq.');
      }

      const { data: samePriceRows, error: samePriceRowsError } = await withRetry(() => signatureQuery);
      if (samePriceRowsError) throw samePriceRowsError;

      const existingBySignature = (samePriceRows || []).find((row) => {
        const rowSignature = buildProductSignature(row);
        return rowSignature
          && rowSignature.name === signature.name
          && rowSignature.category === signature.category
          && rowSignature.price === signature.price;
      });

      if (existingBySignature?.id) {
        const updatePayload = removeInvalidUuidId(insertPayload);
        let { data: existingRows, error: existingRowsError } = await withRetry(() =>
          supabase.from('products').update(updatePayload).eq('id', existingBySignature.id).select()
        );
        if (existingRowsError) {
          const fallbackPayload = stripUnsupportedProductFields(updatePayload, existingRowsError);
          if (fallbackPayload) {
          const retry = await withRetry(() =>
            supabase.from('products').update(fallbackPayload).eq('id', existingBySignature.id).select()
          );
          existingRows = retry.data;
          existingRowsError = retry.error;
          }
        }
        if (existingRowsError) throw existingRowsError;
        if ((existingRows || []).length > 0) return existingRows;
      }
    }

    let { data, error } = await withRetry(() => supabase.from('products').insert(insertPayload).select());
    if (error) {
      const fallbackPayload = stripUnsupportedProductFields(insertPayload, error);
      if (fallbackPayload) {
        const retry = await withRetry(() => supabase.from('products').insert(fallbackPayload).select());
        data = retry.data;
        error = retry.error;
      }
    }
    if (!error) return data;

    if (!isBarcodeUniqueError(error) || !insertPayload.barcode) throw error;

    const fallbackUpdatePayload = removeInvalidUuidId(insertPayload);
    let { data: byBarcodeData, error: byBarcodeError } = await withRetry(() =>
      supabase.from('products').update(fallbackUpdatePayload).eq('barcode', insertPayload.barcode).select()
    );
    if (byBarcodeError) {
      const retryPayload = stripUnsupportedProductFields(fallbackUpdatePayload, byBarcodeError);
      if (retryPayload) {
        const retry = await withRetry(() =>
          supabase.from('products').update(retryPayload).eq('barcode', insertPayload.barcode).select()
        );
        byBarcodeData = retry.data;
        byBarcodeError = retry.error;
      }
    }
    if (byBarcodeError) throw byBarcodeError;
    return byBarcodeData;
  },

  async updateProductStockById(productId, changes) {
    if (!isUuid(productId)) {
      throw new Error('ID de producto invalido para actualizar stock');
    }

    // Stock updates must not reassign product owner.
    const payload = { ...changes };

    const { id, user_id, created_at, ...updatePayload } = payload;
    let { data, error } = await withRetry(() =>
      supabase.from('products').update(updatePayload).eq('id', productId).select()
    );

    if (error) {
      const fallbackPayload = stripUnsupportedProductFields(updatePayload, error);
      if (fallbackPayload) {
        const retry = await withRetry(() =>
          supabase.from('products').update(fallbackPayload).eq('id', productId).select()
        );
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) throw error;
    return data;
  },

  async deleteProduct(product) {
    const id = product?.id;
    const barcode = normalizeNumericBarcode(product?.barcode);

    if (isUuid(id)) {
      const { error } = await withRetry(() => supabase.from('products').delete().eq('id', id));
      if (error) {
        if (isForeignKeyConstraintError(error)) {
          const { error: archiveError } = await withRetry(() =>
            supabase.from('products').update({ status: 'inactivo' }).eq('id', id)
          );
          if (archiveError) throw archiveError;
          return { archived: true };
        }
        throw error;
      }
      return;
    }

    if (barcode) {
      const { error } = await withRetry(() => supabase.from('products').delete().eq('barcode', barcode));
      if (error) {
        if (isForeignKeyConstraintError(error)) {
          const { error: archiveError } = await withRetry(() =>
            supabase.from('products').update({ status: 'inactivo' }).eq('barcode', barcode)
          );
          if (archiveError) throw archiveError;
          return { archived: true };
        }
        throw error;
      }
      return;
    }

    throw new Error('No se pudo eliminar producto: id/barcode invalido');
  },

  // CLIENTS
  async getClients() {
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (error) throw error;

    return (data || []).map((c) => ({
      ...c,
      creditLevel: resolveCreditLevel(c.credit_level ?? 'ESTANDAR'),
      creditLimit: Number(c.credit_limit ?? 0),
      approvedTerm: Number(c.approved_term ?? 30),
      discount: Number(c.discount ?? 0),
      referrerDocument: c.referrer_document ?? '',
      referrerName: c.referrer_name ?? '',
      referralRewardGranted: c.referral_reward_granted === true,
      referralCreditsAvailable: Math.max(0, Number(c.referral_credits_available ?? 0) || 0),
      referralPoints: Math.max(0, Number(c.referral_points ?? 0) || 0),
      successfulReferralCount: Math.max(0, Number(c.successful_referral_count ?? 0) || 0),
      active: c.active ?? true,
      blocked: c.active === false,
    }));
  },

  async saveClient(client) {
    const userId = client?.user_id || await getAuthUserId();
    const companyId = await getCurrentCompanyId(userId);
    const document = String(client?.document ?? '').trim();
    let existingByDocument = null;
    const existingClientId = isUuid(client?.id) ? client.id : null;

    if (document) {
      const { data: existing, error: existingError } = await withRetry(() =>
        supabase
          .from('clients')
          .select('*')
          .eq('document', document)
          .maybeSingle()
      );
      if (existingError) throw existingError;
      existingByDocument = existing || null;
    }

    let existingById = null;
    if (existingClientId) {
      const { data: existing, error: existingError } = await withRetry(() =>
        supabase
          .from('clients')
          .select('*')
          .eq('id', existingClientId)
          .maybeSingle()
      );
      if (existingError) throw existingError;
      existingById = existing || null;
    }

    const hasConflictingExistingByDocument =
      !!existingClientId &&
      !!existingByDocument?.id &&
      String(existingByDocument.id) !== String(existingClientId);

    if (hasConflictingExistingByDocument) {
      console.warn('[SYNC:clients] Conflicto id/documento detectado; se prioriza client.id para evitar actualizar otra fila.', {
        incomingClientId: existingClientId,
        existingByDocumentId: existingByDocument?.id || null,
        document,
      });
    }

    const existingRecord = existingById || (hasConflictingExistingByDocument ? null : existingByDocument) || null;

    const providedCreditLevel = client.creditLevel ?? client.credit_level;
    const providedCreditLimit = client.creditLimit ?? client.credit_limit;
    const providedApprovedTerm = client.approvedTerm ?? client.approved_term;
    const providedDiscount = client.discount;
    const existingLevel = normalizeCreditLevel(resolveCreditLevel(existingRecord?.credit_level || 'ESTANDAR'));
    const incomingLevel = normalizeCreditLevel(resolveCreditLevel(providedCreditLevel || 'ESTANDAR'));
    const incomingLimit = Number(providedCreditLimit ?? 0);
    const incomingDiscount = Number(providedDiscount ?? 0);

    // Protect against accidental downgrade to ESTANDAR/0 produced by partial payloads.
    const accidentalDowngradeToStandard =
      existingRecord &&
      existingLevel !== 'ESTANDAR' &&
      incomingLevel === 'ESTANDAR' &&
      incomingLimit <= 0 &&
      incomingDiscount <= 0;

    const resolvedCreditLevel = accidentalDowngradeToStandard
      ? resolveCreditLevel(existingRecord.credit_level)
      : resolveCreditLevel(providedCreditLevel ?? existingRecord?.credit_level ?? 'ESTANDAR');

    const resolvedCreditLimit = accidentalDowngradeToStandard
      ? Number(existingRecord?.credit_limit ?? 0)
      : Number(providedCreditLimit ?? existingRecord?.credit_limit ?? 0);

    const resolvedApprovedTerm = accidentalDowngradeToStandard
      ? Number(existingRecord?.approved_term ?? 30)
      : Number(providedApprovedTerm ?? existingRecord?.approved_term ?? 30);

    const resolvedDiscount = accidentalDowngradeToStandard
      ? Number(existingRecord?.discount ?? 0)
      : Number(providedDiscount ?? existingRecord?.discount ?? 0);
    const hasIncomingBlocked = typeof client?.blocked === 'boolean';
    const resolvedActive = hasIncomingBlocked
      ? client.blocked !== true
      : (client.active ?? existingRecord?.active ?? true);

    const payload = {
      id: existingRecord?.id || client.id,
      user_id: existingRecord?.user_id || client.user_id || userId,
      name: client.name ?? '',
      document,
      phone: client.phone ?? null,
      email: client.email ?? null,
      address: client.address ?? null,
      credit_level: resolvedCreditLevel,
      credit_limit: resolvedCreditLimit,
      approved_term: resolvedApprovedTerm,
      discount: resolvedDiscount,
      referrer_document: client.referrerDocument ?? existingRecord?.referrer_document ?? '',
      referrer_name: client.referrerName ?? existingRecord?.referrer_name ?? '',
      referral_reward_granted: client.referralRewardGranted ?? existingRecord?.referral_reward_granted ?? false,
      referral_credits_available: Math.max(0, Number(client.referralCreditsAvailable ?? existingRecord?.referral_credits_available ?? 0) || 0),
      referral_points: Math.max(0, Number(client.referralPoints ?? existingRecord?.referral_points ?? 0) || 0),
      successful_referral_count: Math.max(0, Number(client.successfulReferralCount ?? existingRecord?.successful_referral_count ?? 0) || 0),
      active: resolvedActive,
      updated_at: new Date().toISOString(),
    };

    if (isUuid(existingRecord?.company_id)) {
      payload.company_id = existingRecord.company_id;
    } else {
      const incomingCompanyId = client?.company_id ?? client?.companyId;
      if (isUuid(incomingCompanyId)) {
        payload.company_id = incomingCompanyId;
      } else if (isUuid(companyId)) {
        payload.company_id = companyId;
      }
    }

    if (isUuid(payload.id)) {
      // Exclude primary key, owner and creation timestamp from update payload to avoid 400 errors.
      const { id, user_id, created_at, ...updatePayload } = payload;
      let { data, error } = await withRetry(() =>
        supabase.from('clients').update(updatePayload).eq('id', payload.id).select()
      );
      if (!error && Array.isArray(data) && data.length === 0) {
        let authUserIdForDebug = '';
        try {
          authUserIdForDebug = await getAuthUserId();
        } catch (authError) {
          if (String(authError?.code || '') === 'SESSION_INVALID') throw authError;
        }
        const authDebugSnapshot = await getAuthDebugSnapshot();
        console.error('[AUTH_PROBE:clients.update.0rows]', {
          clientId: payload.id || null,
          document: payload.document || null,
          authUserId: authUserIdForDebug || null,
          currentCompanyIdFromPayload: payload.company_id || null,
          ...authDebugSnapshot,
        });
        if (payload.document) {
          let byDocResult = await withRetry(() =>
            supabase.from('clients').update(updatePayload).eq('document', payload.document).select()
          );
          if (byDocResult?.error && isUndefinedColumnError(byDocResult.error)) {
            const {
              referrer_document,
              referrer_name,
              referral_reward_granted,
              referral_credits_available,
              referral_points,
              successful_referral_count,
              ...legacyPayload
            } = updatePayload;
            byDocResult = await withRetry(() =>
              supabase.from('clients').update(legacyPayload).eq('document', payload.document).select()
            );
          }
          if (!byDocResult?.error && Array.isArray(byDocResult?.data) && byDocResult.data.length > 0) {
            console.warn('[SYNC:clients] update por id no encontro fila; recuperado por document.', {
              clientId: payload.id,
              document: payload.document,
              authUserId: authUserIdForDebug || null,
            });
            return byDocResult.data;
          }
        }
        throw new Error(
          'No se pudo actualizar el cliente en Supabase (0 filas afectadas). Esto suele pasar por permisos/RLS cuando el cliente fue creado por otro usuario. ' +
          'Solucion: aplicar la migracion de empresa compartida (ver shared_company_migration.sql) o ajustar policies de clients. ' +
          buildClientUpdateDebugMessage(payload, authUserIdForDebug)
        );
      }
      if (error && isUndefinedColumnError(error)) {
        const {
          referrer_document,
          referrer_name,
          referral_reward_granted,
          referral_credits_available,
          referral_points,
          successful_referral_count,
          ...fallbackPayload
        } = payload;
        const legacyUpdatePayload = { ...fallbackPayload };
        const retry = await withRetry(() => supabase.from('clients').update(legacyUpdatePayload).eq('id', payload.id).select());
        data = retry.data;
        error = retry.error;
        if (!error && Array.isArray(data) && data.length === 0) {
          let authUserIdForDebug = '';
          try {
            authUserIdForDebug = await getAuthUserId();
          } catch (authError) {
            if (String(authError?.code || '') === 'SESSION_INVALID') throw authError;
          }
          const authDebugSnapshot = await getAuthDebugSnapshot();
          console.error('[AUTH_PROBE:clients.legacyUpdate.0rows]', {
            clientId: payload.id || null,
            document: payload.document || null,
            authUserId: authUserIdForDebug || null,
            currentCompanyIdFromPayload: payload.company_id || null,
            ...authDebugSnapshot,
          });
          if (payload.document) {
            const byDocRetry = await withRetry(() =>
              supabase.from('clients').update(legacyUpdatePayload).eq('document', payload.document).select()
            );
            if (!byDocRetry?.error && Array.isArray(byDocRetry?.data) && byDocRetry.data.length > 0) {
              console.warn('[SYNC:clients] legacy update por id no encontro fila; recuperado por document.', {
                clientId: payload.id,
                document: payload.document,
                authUserId: authUserIdForDebug || null,
              });
              return byDocRetry.data;
            }
          }
          throw new Error(
            'No se pudo actualizar el cliente en Supabase (0 filas afectadas). Esto suele pasar por permisos/RLS. ' +
            'Solucion: aplicar shared_company_migration.sql o ajustar policies. ' +
            buildClientUpdateDebugMessage(payload, authUserIdForDebug)
          );
        }
      }
      if (!error) return data;

      const insertWithIdPayload = { ...removeInvalidUuidId(payload), id: payload.id };
      let { data: insertedData, error: insertError } = await withRetry(() =>
        supabase.from('clients').insert(insertWithIdPayload).select()
      );
      if (insertError && isUndefinedColumnError(insertError)) {
        const {
          referrer_document,
          referrer_name,
          referral_reward_granted,
          referral_credits_available,
          referral_points,
          successful_referral_count,
          ...fallbackPayload
        } = insertWithIdPayload;
        const legacyInsertPayload = { ...fallbackPayload };
        const retry = await withRetry(() => supabase.from('clients').insert(legacyInsertPayload).select());
        insertedData = retry.data;
        insertError = retry.error;
      }
      if (!insertError) return insertedData;

      if (!isClientDocumentUniqueError(insertError) || !payload.document) throw insertError;

      const fallbackUpdatePayload = removeInvalidUuidId(updatePayload);
      const { id: _i, user_id: _u, created_at: _c, ...updateBody } = fallbackUpdatePayload;
      let { data: byDocData, error: byDocError } = await withRetry(() =>
        supabase.from('clients').update(updateBody).eq('document', payload.document).select()
      );
      if (byDocError && isUndefinedColumnError(byDocError)) {
        const {
          referrer_document,
          referrer_name,
          referral_reward_granted,
          referral_credits_available,
          referral_points,
          successful_referral_count,
          ...legacyPayload
        } = fallbackUpdatePayload;
        // Strip PK/metadata from legacy body too
        const { id: _i, user_id: _u, created_at: _c, ...legacyUpdateBody } = legacyPayload;
        const retry = await withRetry(() =>
          supabase.from('clients').update(legacyUpdateBody).eq('document', payload.document).select()
        );
        byDocData = retry.data;
        byDocError = retry.error;
      }
      if (byDocError) throw byDocError;
      return byDocData;
    }

    const insertPayload = removeInvalidUuidId(payload);
    const hasDocument = !!String(insertPayload.document || '').trim();
    const query = hasDocument
      ? supabase.from('clients').upsert(insertPayload, { onConflict: 'document' }).select()
      : supabase.from('clients').insert(insertPayload).select();

    const { data, error } = await withRetry(() => query);
    if (!error) return data;

    if (isUndefinedColumnError(error)) {
      const {
        referrer_document,
        referrer_name,
        referral_reward_granted,
        referral_credits_available,
        referral_points,
        successful_referral_count,
        ...fallbackPayload
      } = insertPayload;
      const fallbackQuery = hasDocument
        ? supabase.from('clients').upsert(fallbackPayload, { onConflict: 'document' }).select()
        : supabase.from('clients').insert(fallbackPayload).select();
      const retry = await withRetry(() => fallbackQuery);
      if (!retry.error) return retry.data;
    }

    if (!isClientDocumentUniqueError(error) || !insertPayload.document) throw error;

    const { id: _i, user_id: _u, created_at: _c, ...insertUpdateBody } = insertPayload;
    let { data: byDocData, error: byDocError } = await withRetry(() =>
      supabase.from('clients').update(insertUpdateBody).eq('document', insertPayload.document).select()
    );
    if (byDocError && isUndefinedColumnError(byDocError)) {
      const {
        referrer_document,
        referrer_name,
        referral_reward_granted,
        referral_credits_available,
        referral_points,
        successful_referral_count,
        ...legacyPayload
      } = insertPayload;
      // Strip PK/metadata from legacy body too
      const { id: _i, user_id: _u, created_at: _c, ...legacyInsertUpdateBody } = legacyPayload;
      const retry = await withRetry(() =>
        supabase.from('clients').update(legacyInsertUpdateBody).eq('document', insertPayload.document).select()
      );
      byDocData = retry.data;
      byDocError = retry.error;
    }
    if (byDocError) throw byDocError;
    return byDocData;
  },

  async deleteClient(client) {
    const id = client?.id;
    const document = String(client?.document ?? '').trim();
    const deleteByDocument = async () => {
      if (!document) return [];
      const { data, error } = await withRetry(() =>
        supabase.from('clients').delete().eq('document', document).select('id, document')
      );
      if (error) throw error;
      return data || [];
    };

    if (isUuid(id)) {
      const { data, error } = await withRetry(() =>
        supabase.from('clients').delete().eq('id', id).select('id, document')
      );
      if (error) throw error;
      if ((data || []).length > 0) return data;

      const byDocumentRows = await deleteByDocument();
      if (byDocumentRows.length > 0) return byDocumentRows;

      throw new Error(
        'No se pudo eliminar el cliente en Supabase (0 filas afectadas). ' +
        'Revise permisos/RLS o aplique shared_company_migration.sql para policies por empresa.'
      );
    }

    if (document) {
      const byDocumentRows = await deleteByDocument();
      if (byDocumentRows.length > 0) return byDocumentRows;
      throw new Error(
        'No se pudo eliminar el cliente en Supabase (0 filas afectadas). ' +
        'Revise permisos/RLS o aplique shared_company_migration.sql para policies por empresa.'
      );
    }

    throw new Error('No se pudo eliminar cliente: id/documento invalido');
  },

  // INVOICES & CARTERA
  async getInvoices() {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map((inv) => {
      const mappedItems = (inv.invoice_items || []).map((it) => ({
        id: it.id,
        productId: it.product_id ?? null,
        name: it.name ?? 'Producto',
        quantity: Number(it.quantity ?? 0),
        price: Number(it.price ?? 0),
        total: Number(it.total ?? 0),
      }));

      return {
        id: inv?.mixed_details?.invoiceCode || inv?.mixed_details?.invoice_code || inv.id,
        db_id: inv.id,
        user_id: inv.user_id,
        user_name: inv?.mixed_details?.user_name || inv?.mixed_details?.user || null,
        user: inv?.mixed_details?.user || inv?.mixed_details?.user_name || null,
        clientId: inv.client_id ?? null,
        clientName: inv.client_name ?? 'Cliente Ocasional',
        clientDoc: inv.client_doc ?? 'N/A',
        subtotal: Number(inv.subtotal ?? 0),
        deliveryFee: Number(inv.delivery_fee ?? 0),
        promoDiscountAmount: Number(inv?.mixed_details?.discount?.promoAmount ?? 0),
        promotion: inv?.mixed_details?.discount?.promotion ?? null,
        automaticDiscountPercent: Number(inv?.mixed_details?.discount?.automaticPercent ?? 0),
        automaticDiscountAmount: Number(inv?.mixed_details?.discount?.automaticAmount ?? 0),
        extraDiscount: Number(inv?.mixed_details?.discount?.extraAmount ?? 0),
        totalDiscount: Number(inv?.mixed_details?.discount?.totalAmount ?? 0),
        total: Number(inv.total ?? 0),
        paymentMode: inv.payment_mode ?? 'Efectivo',
        mixedDetails: inv.mixed_details ?? null,
        authorization: inv?.mixed_details?.authorization ?? null,
        date: inv.date,
        dueDate: inv.due_date ?? null,
        status: inv.status ?? 'pagado',
        items: mappedItems,
        balance: (() => {
          const stored = Number(inv?.mixed_details?.cartera?.balance);
          if (Number.isFinite(stored) && stored >= 0) return stored;
          return (inv.status ?? 'pagado') === 'pendiente' ? Number(inv.total ?? 0) : 0;
        })(),
        abonos: Array.isArray(inv?.mixed_details?.cartera?.abonos) ? inv.mixed_details.cartera.abonos : [],
      };
    });
  },

  async saveInvoice(invoice, items) {
    const userId = invoice?.user_id || await getAuthUserId();
    const userName = invoice?.user_name || invoice?.user || null;

    const baseMixedDetails = invoice.mixed_details ?? invoice.mixedDetails ?? null;
    const mergedMixedDetails = {
      ...(baseMixedDetails && typeof baseMixedDetails === 'object' ? baseMixedDetails : {}),
      user_name: userName || undefined,
      discount: {
        promotion:
          invoice?.promotion ??
          baseMixedDetails?.discount?.promotion ??
          null,
        promoAmount: Number(
          invoice?.promoDiscountAmount ??
          baseMixedDetails?.discount?.promoAmount ??
          0
        ),
        automaticPercent: Number(
          invoice?.automaticDiscountPercent ??
          baseMixedDetails?.discount?.automaticPercent ??
          0
        ),
        automaticAmount: Number(
          invoice?.automaticDiscountAmount ??
          baseMixedDetails?.discount?.automaticAmount ??
          0
        ),
        extraAmount: Number(
          invoice?.extraDiscount ??
          baseMixedDetails?.discount?.extraAmount ??
          0
        ),
        totalAmount: Number(
          invoice?.totalDiscount ??
          baseMixedDetails?.discount?.totalAmount ??
          0
        ),
      },
      authorization:
        invoice?.authorization ??
        baseMixedDetails?.authorization ??
        null,
    };

    const companyId = await getCurrentCompanyId(userId);
    const invoicePayload = {
      user_id: invoice.user_id || userId,
      company_id: isUuid(invoice.company_id) ? invoice.company_id : (isUuid(companyId) ? companyId : null),
      client_id: isUuid(invoice.client_id) ? invoice.client_id : null,
      client_name: invoice.client_name ?? invoice.clientName ?? null,
      client_doc: invoice.client_doc ?? invoice.clientDoc ?? null,
      subtotal: Number(invoice.subtotal || 0),
      delivery_fee: Number(invoice.delivery_fee ?? invoice.deliveryFee ?? 0),
      total: Number(invoice.total || 0),
      payment_mode: invoice.payment_mode ?? invoice.paymentMode ?? null,
      mixed_details: mergedMixedDetails,
      date: invoice.date || new Date().toISOString(),
      due_date: invoice.due_date ?? invoice.dueDate ?? null,
      status: invoice.status || 'pagado',
    };

    const isUpdate = isUuid(invoice.id);
    const invoiceQuery = (
      isUpdate
        ? supabase.from('invoices').upsert({ id: invoice.id, ...invoicePayload })
        : supabase.from('invoices').insert(invoicePayload)
    ).select();

    let { data: invData, error: invError } = await invoiceQuery;
    if (invError) throw formatDbError(invError, 'invoices.insert/upsert');

    const invoiceId = invData[0].id;
    const itemsToInsert = (items || []).map((item) => ({
      invoice_id: invoiceId,
      product_id: isUuid(item.product_id)
        ? item.product_id
        : isUuid(item.id)
          ? item.id
          : null,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
    }));

    if (!isUpdate && itemsToInsert.length > 0) {
      const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
      if (itemsError) throw formatDbError(itemsError, 'invoice_items.insert');
    }

    return invData[0];
  },

  // EXPENSES
  async getExpenses() {
    const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
    if (error) throw error;

    return (data || []).map((e) => ({
      ...e,
      type: e.category ?? e.type ?? 'Otros',
      beneficiary: e.beneficiary ?? '',
      docId: e.doc_id ?? e.docId ?? '',
      status: e.status ?? 'Pagado',
      paidAmount: Number(e.paid_amount ?? e.paidAmount ?? e.amount ?? 0),
      paymentMethod: e.payment_method ?? e.paymentMethod ?? '',
      paymentReference: e.payment_reference ?? e.paymentReference ?? '',
      balance: Math.max(0, Number(e.amount ?? 0) - Number(e.paid_amount ?? e.paidAmount ?? e.amount ?? 0)),
    }));
  },

  async saveExpense(expense) {
    const userId = expense?.user_id || await getAuthUserId();
    const amount = Number(expense.amount ?? 0);
    const paidAmount = Math.max(0, Number(expense.paid_amount ?? expense.paidAmount ?? amount));
    const companyId = await getCurrentCompanyId(userId);
    const payload = {
      id: expense.id,
      user_id: expense.user_id || userId,
      company_id: isUuid(expense.company_id) ? expense.company_id : (isUuid(companyId) ? companyId : null),
      user_name: expense.user_name ?? expense.user ?? null,
      date: expense.date || new Date().toISOString(),
      category: expense.category ?? expense.type ?? 'Otros',
      amount,
      description: expense.description ?? null,
      beneficiary: expense.beneficiary ?? null,
      doc_id: expense.doc_id ?? expense.docId ?? null,
      status: expense.status ?? 'Pagado',
      paid_amount: paidAmount,
      payment_method: expense.payment_method ?? expense.paymentMethod ?? null,
      payment_reference: expense.payment_reference ?? expense.paymentReference ?? null,
    };

    const insertPayload = removeInvalidUuidId(payload);
    let { data, error } = await supabase.from('expenses').insert(insertPayload).select();
    if (error && isUndefinedColumnError(error)) {
      const {
        user_name,
        beneficiary,
        doc_id,
        status,
        paid_amount,
        payment_method,
        payment_reference,
        ...fallbackPayload
      } = insertPayload;
      const retry = await supabase.from('expenses').insert(fallbackPayload).select();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return data;
  },

  async updateExpense(expenseId, expense) {
    if (!expenseId) throw new Error('expenseId requerido');
    const amount = Number(expense.amount ?? 0);
    const paidAmount = Math.max(0, Number(expense.paid_amount ?? expense.paidAmount ?? amount));
    const payload = {
      date: expense.date || new Date().toISOString(),
      category: expense.category ?? expense.type ?? 'Otros',
      amount,
      description: expense.description ?? null,
      beneficiary: expense.beneficiary ?? null,
      doc_id: expense.doc_id ?? expense.docId ?? null,
      status: expense.status ?? 'Pagado',
      paid_amount: paidAmount,
      payment_method: expense.payment_method ?? expense.paymentMethod ?? null,
      payment_reference: expense.payment_reference ?? expense.paymentReference ?? null,
    };

    let { data, error } = await supabase.from('expenses').update(payload).eq('id', expenseId).select();
    if (error && isUndefinedColumnError(error)) {
      const {
        beneficiary,
        doc_id,
        status,
        paid_amount,
        payment_method,
        payment_reference,
        ...fallbackPayload
      } = payload;
      const retry = await supabase.from('expenses').update(fallbackPayload).eq('id', expenseId).select();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return data;
  },

  async getExternalCashReceipts() {
    const { data, error } = await supabase
      .from('external_cash_receipts')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      if (isMissingTableOrColumnError(error)) return [];
      throw error;
    }

    return data || [];
  },

  async saveExternalCashReceipt(receipt) {
    const userId = receipt?.user_id || await getAuthUserId();
    const companyId = await getCurrentCompanyId(userId);
    const payload = {
      id: receipt?.id,
      user_id: receipt?.user_id || userId,
      company_id: isUuid(receipt?.company_id) ? receipt?.company_id : (isUuid(companyId) ? companyId : null),
      user_name: receipt?.user_name ?? receipt?.user ?? null,
      date: receipt?.date || new Date().toISOString(),
      receipt_code: receipt?.receipt_code ?? receipt?.receiptCode ?? null,
      third_party_name: receipt?.third_party_name ?? receipt?.thirdPartyName ?? null,
      third_party_document: receipt?.third_party_document ?? receipt?.thirdPartyDocument ?? null,
      amount: Number(receipt?.amount ?? 0),
      payment_method: receipt?.payment_method ?? receipt?.paymentMethod ?? null,
      payment_reference: receipt?.payment_reference ?? receipt?.paymentReference ?? null,
      concept: receipt?.concept ?? null,
      notes: receipt?.notes ?? null,
    };

    const insertPayload = removeInvalidUuidId(payload);
    let { data, error } = await supabase.from('external_cash_receipts').insert(insertPayload).select();
    if (error && isUndefinedColumnError(error)) {
      const { user_name, ...fallbackPayload } = insertPayload;
      const retry = await supabase.from('external_cash_receipts').insert(fallbackPayload).select();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return data;
  },

  // PURCHASES
  async getPurchases() {
    const { data, error } = await supabase.from('purchases').select('*').order('date', { ascending: false });
    if (error) throw error;

    return (data || []).map((p) => ({
      ...p,
      invoiceNumber: p.invoice_number ?? '',
      productId: p.product_id ?? '',
      productName: p.product_name ?? '',
      unitCost: Number(p.unit_cost ?? 0),
    }));
  },

  async savePurchase(purchase) {
    const userId = purchase?.user_id || await getAuthUserId();
    const companyId = await getCurrentCompanyId(userId);
    const payload = {
      id: purchase.id,
      user_id: purchase.user_id || userId,
      company_id: isUuid(purchase.company_id) ? purchase.company_id : (isUuid(companyId) ? companyId : null),
      user_name: purchase.user_name ?? purchase.user ?? null,
      invoice_number: purchase.invoice_number ?? purchase.invoiceNumber ?? null,
      supplier: purchase.supplier ?? null,
      product_id: isUuid(purchase.product_id)
        ? purchase.product_id
        : isUuid(purchase.productId)
          ? purchase.productId
          : null,
      product_name: purchase.product_name ?? purchase.productName ?? null,
      quantity: Number(purchase.quantity ?? 0),
      unit_cost: Number(purchase.unit_cost ?? purchase.unitCost ?? 0),
      date: purchase.date || new Date().toISOString(),
    };

    const insertPayload = removeInvalidUuidId(payload);
    let { data, error } = await supabase.from('purchases').insert(insertPayload).select();
    if (error && isUndefinedColumnError(error)) {
      const { user_name, ...fallbackPayload } = insertPayload;
      const retry = await supabase.from('purchases').insert(fallbackPayload).select();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return data;
  },

  // AUDIT LOGS
  async getAuditLogs() {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(2000);
    if (error) throw error;
    return data || [];
  },

  async saveAuditLog(log) {
    const userId = log?.user_id || await getAuthUserId();
    const companyId = await getCurrentCompanyId(userId);
    const payload = {
      user_id: log.user_id || userId,
      company_id: isUuid(log.company_id) ? log.company_id : (isUuid(companyId) ? companyId : null),
      timestamp: log.timestamp ?? new Date().toISOString(),
      module: log.module ?? null,
      action: log.action ?? null,
      details: log.details ?? null,
    };
    const { error } = await supabase.from('audit_logs').insert(payload);
    if (error) throw error;
  },

  // SHIFT HISTORY
  async getShiftHistory() {
    const { data, error } = await supabase
      .from('shift_history')
      .select('*')
      .order('end_time', { ascending: false });
    if (error) throw error;

    return (data || [])
      .filter((s) => s?.end_time)
      .map((s) => ({
      id: s.id,
      user_id: s.user_id ?? null,
      user_name: s.user_name ?? s.user ?? null,
      startTime: s.start_time,
      endTime: s.end_time,
      initialCash: Number(s.initial_cash ?? 0),
      salesTotal: Number(s.sales_total ?? 0),
      theoreticalBalance: Number(s.theoretical_balance ?? 0),
      physicalCash: Number(s.physical_cash ?? 0),
      discrepancy: Number(s.discrepancy ?? 0),
      authorized: !!s.authorized,
      openingReportText: s.opening_report_text ?? '',
      reportText: s.report_text ?? '',
      user: s.user_name ?? s.user ?? null,
      inventoryAssignment: normalizeShiftInventoryRows(s.inventory_assignment),
      inventoryAssignedAt: s.inventory_assigned_at ?? null,
      inventoryClosure: {
        rows: normalizeShiftInventoryRows(s.inventory_closure?.rows),
        supervisorNote: s.inventory_closure?.supervisorNote ?? '',
      },
      inventoryStatus: s.inventory_status ?? '',
    }));
  },

  async getOpenShiftForUser(userId) {
    if (!userId) return null;

    const { data, error } = await withRetry(() => (
      supabase
        .from('shift_history')
        .select('*')
        .eq('user_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle()
    ));

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      user_id: data.user_id ?? null,
      user_name: data.user_name ?? data.user ?? null,
      startTime: data.start_time,
      endTime: data.end_time,
      initialCash: Number(data.initial_cash ?? 0),
      salesTotal: Number(data.sales_total ?? 0),
      theoreticalBalance: Number(data.theoretical_balance ?? 0),
      physicalCash: Number(data.physical_cash ?? 0),
      discrepancy: Number(data.discrepancy ?? 0),
      authorized: !!data.authorized,
      openingReportText: data.opening_report_text ?? '',
      reportText: data.report_text ?? '',
      user: data.user_name ?? data.user ?? null,
      inventoryAssignments: normalizeShiftInventoryRows(data.inventory_assignment),
      inventoryAssignedAt: data.inventory_assigned_at ?? null,
      inventoryClosure: {
        rows: normalizeShiftInventoryRows(data.inventory_closure?.rows),
        supervisorNote: data.inventory_closure?.supervisorNote ?? '',
      },
      inventoryStatus: data.inventory_status ?? '',
    };
  },

  async saveShift(shift) {
    const userId = shift?.user_id || await getAuthUserId();
    const companyId = await getCurrentCompanyId(userId);
    const hasEndTime = Object.prototype.hasOwnProperty.call(shift || {}, 'end_time') || Object.prototype.hasOwnProperty.call(shift || {}, 'endTime');
    const resolvedEndTime = Object.prototype.hasOwnProperty.call(shift || {}, 'end_time')
      ? shift.end_time
      : (Object.prototype.hasOwnProperty.call(shift || {}, 'endTime') ? shift.endTime : null);
    const normalizedInventoryClosure = (() => {
      const raw = shift.inventory_closure ?? shift.inventoryClosure;
      if (raw && typeof raw === 'object') {
        return {
          rows: normalizeShiftInventoryRows(raw.rows),
          supervisorNote: String(raw.supervisorNote ?? raw.supervisor_note ?? '').trim(),
        };
      }
      return {
        rows: [],
        supervisorNote: '',
      };
    })();
    const payload = {
      id: shift.id ?? shift.db_id,
      user_id: shift.user_id || userId,
      company_id: isUuid(shift.company_id) ? shift.company_id : (isUuid(companyId) ? companyId : null),
      user_name: shift.user_name ?? shift.user ?? null,
      start_time: shift.start_time ?? shift.startTime ?? null,
      end_time: hasEndTime ? resolvedEndTime : new Date().toISOString(),
      initial_cash: Number(shift.initial_cash ?? shift.initialCash ?? 0),
      sales_total: Number(shift.sales_total ?? shift.salesTotal ?? 0),
      theoretical_balance: Number(shift.theoretical_balance ?? shift.theoreticalBalance ?? 0),
      physical_cash: Number(shift.physical_cash ?? shift.physicalCash ?? 0),
      discrepancy: Number(shift.discrepancy ?? 0),
      authorized: !!shift.authorized,
      opening_report_text: shift.opening_report_text ?? shift.openingReportText ?? '',
      report_text: shift.report_text ?? shift.reportText ?? '',
      inventory_assignment: normalizeShiftInventoryRows(shift.inventory_assignment ?? shift.inventoryAssignment),
      inventory_assigned_at: shift.inventory_assigned_at ?? shift.inventoryAssignedAt ?? null,
      inventory_closure: normalizedInventoryClosure,
      inventory_status: shift.inventory_status ?? shift.inventoryStatus ?? null,
    };

    if (companyId) {
      payload.company_id = companyId;
    }

    if (isUuid(payload.id)) {
      let { data, error } = await withRetry(() => supabase.from('shift_history').upsert(payload).select());
      if (error && isUndefinedColumnError(error)) {
        const {
          user_name,
          company_id,
          opening_report_text,
          inventory_assignment,
          inventory_assigned_at,
          inventory_closure,
          inventory_status,
          ...fallbackPayload
        } = payload;
        const retry = await withRetry(() => supabase.from('shift_history').upsert(fallbackPayload).select());
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      return data;
    }

    const insertPayload = removeInvalidUuidId(payload);
    let { data, error } = await withRetry(() => supabase.from('shift_history').insert(insertPayload).select());
    if (error && isUndefinedColumnError(error)) {
      const {
        user_name,
        company_id,
        opening_report_text,
        inventory_assignment,
        inventory_assigned_at,
        inventory_closure,
        inventory_status,
        ...fallbackPayload
      } = insertPayload;
      const retry = await withRetry(() => supabase.from('shift_history').insert(fallbackPayload).select());
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return data;
  },

  async getUserCashBalances() {
    try {
      const { data, error } = await supabase
        .from('user_cash_balances')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []).reduce((acc, row) => {
        const cashKey = String(row?.cash_key || row?.user_id || '').trim();
        if (!cashKey) return acc;
        acc[cashKey] = Number(row?.balance ?? 0);
        return acc;
      }, {});
    } catch (error) {
      if (isMissingRelationError(error)) {
        console.warn('Tabla user_cash_balances no existe aun en Supabase. Se usa respaldo local.');
        return {};
      }
      throw error;
    }
  },

  async saveUserCashBalance({ cashKey, balance, userId = null, userName = null, companyId = null }) {
    if (!cashKey) return null;

    const authUserId = await getAuthUserId();
    const payload = {
      cash_key: String(cashKey).trim(),
      user_id: isUuid(userId) ? userId : authUserId,
      user_name: userName ?? null,
      balance: Number(balance || 0),
      company_id: isUuid(companyId) ? companyId : null,
      updated_by: authUserId,
      updated_at: new Date().toISOString(),
    };

    try {
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { data, error } = await supabase
          .from('user_cash_balances')
          .upsert(payload, { onConflict: 'cash_key' })
          .select();

        if (!error) {
          if (attempt > 1) {
            console.warn(`[SYNC:user_cash_balances] recuperado en intento ${attempt}`, payload);
          }
          return data;
        }

        lastError = error;
        console.warn(`[SYNC:user_cash_balances] intento ${attempt} fallido`, {
          payload,
          message: error?.message || null,
          code: error?.code || null,
          details: error?.details || null,
          hint: error?.hint || null,
        });

        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
        }
      }

      throw lastError;
    } catch (error) {
      if (isMissingRelationError(error)) {
        console.warn('No se pudo sincronizar user_cash_balances porque la tabla no existe aun.');
        return null;
      }
      reportClientSyncIssue('user_cash_balances', payload, error);
      throw error;
    }
  },

  async getInventoryTransferRequests(companyId = null) {
    try {
      let query = supabase
        .from('inventory_transfer_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (isUuid(companyId)) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || [])
        .map(normalizeInventoryTransferRequestRow)
        .filter(Boolean);
    } catch (error) {
      if (isMissingRelationError(error)) {
        console.warn('Tabla inventory_transfer_requests no existe aun en Supabase. Se usa respaldo local.');
        return null;
      }
      throw error;
    }
  },

  async saveInventoryTransferRequest(request) {
    const authUserId = await getAuthUserId();
    const companyId = await getCurrentCompanyId(authUserId);
    const payload = {
      id: request?.id,
      company_id: isUuid(request?.companyId) ? request.companyId : (isUuid(companyId) ? companyId : null),
      product_id: isUuid(request?.productId) ? request.productId : null,
      product_name: request?.productName ?? 'Producto',
      quantity: Number(request?.quantity ?? 0),
      target_user_id: isUuid(request?.targetUserId) ? request.targetUserId : null,
      target_user_key: String(request?.targetUserKey || '').trim(),
      target_user_name: request?.targetUserName ?? null,
      status: request?.status ?? 'PENDING',
      source_location: request?.source ?? 'bodega',
      destination_location: request?.destination ?? 'ventas',
      created_at: request?.createdAt ?? new Date().toISOString(),
      created_by: isUuid(request?.createdBy?.id) ? request.createdBy.id : authUserId,
      created_by_name: request?.createdBy?.name ?? null,
      resolved_at: request?.resolvedAt ?? null,
      resolved_by: isUuid(request?.resolvedBy?.id) ? request.resolvedBy.id : null,
      resolved_by_name: request?.resolvedBy?.name ?? null,
      updated_at: new Date().toISOString(),
    };

    try {
      const hasResolution =
        payload.status !== 'PENDING' ||
        !!payload.resolved_at ||
        !!payload.resolved_by;

      const mutation = hasResolution
        ? supabase
            .from('inventory_transfer_requests')
            .update({
              status: payload.status,
              resolved_at: payload.resolved_at,
              resolved_by: payload.resolved_by,
              resolved_by_name: payload.resolved_by_name,
              updated_at: payload.updated_at,
            })
            .eq('id', payload.id)
        : supabase
            .from('inventory_transfer_requests')
            .insert(payload);

      const { data, error } = await mutation.select();

      if (error) throw error;
      return (data || []).map(normalizeInventoryTransferRequestRow).filter(Boolean);
    } catch (error) {
      if (isMissingRelationError(error)) {
        console.warn('No se pudo sincronizar inventory_transfer_requests porque la tabla no existe aun.');
        return null;
      }
      reportClientSyncIssue('inventory_transfer_requests', payload, error);
      throw error;
    }
  },

  async getCommercialNotes(companyId = null) {
    try {
      let query = supabase
        .from('commercial_notes')
        .select('*')
        .order('date', { ascending: false })
        .limit(300);

      if (isUuid(companyId)) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(normalizeCommercialNoteRow).filter(Boolean);
    } catch (error) {
      if (isMissingRelationError(error)) {
        console.warn('Tabla commercial_notes no existe aun en Supabase. Se usa respaldo local.');
        return null;
      }
      throw error;
    }
  },

  async saveCommercialNote(note) {
    const authUserId = await getAuthUserId();
    const companyId = await getCurrentCompanyId(authUserId);
    const payload = {
      id: note?.id,
      company_id: isUuid(note?.companyId) ? note.companyId : (isUuid(companyId) ? companyId : null),
      user_id: isUuid(note?.createdBy?.id) ? note.createdBy.id : authUserId,
      user_name: note?.createdBy?.name ?? null,
      date: note?.date ?? new Date().toISOString(),
      note_class: note?.noteClass ?? 'AJUSTE',
      scope: note?.scope ?? 'CLIENTE',
      reason_code: note?.reasonCode ?? '',
      reason_label: note?.reasonLabel ?? '',
      direction: note?.direction ?? 'NEUTRO',
      amount: Number(note?.amount ?? 0),
      quantity: Number(note?.quantity ?? 0),
      client_id: note?.clientId ?? null,
      client_name: note?.clientName ?? null,
      client_document: note?.clientDocument ?? null,
      invoice_id: note?.invoiceId ?? null,
      invoice_code: note?.invoiceCode ?? null,
      product_id: isUuid(note?.productId) ? note.productId : null,
      product_name: note?.productName ?? null,
      description: note?.description ?? null,
      status: note?.status ?? 'ACTIVA',
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('commercial_notes')
        .upsert(payload, { onConflict: 'id' })
        .select();

      if (error) throw error;
      return (data || []).map(normalizeCommercialNoteRow).filter(Boolean);
    } catch (error) {
      if (isMissingRelationError(error)) {
        console.warn('No se pudo sincronizar commercial_notes porque la tabla no existe aun.');
        return null;
      }
      reportClientSyncIssue('commercial_notes', payload, error);
      throw error;
    }
  },
};
