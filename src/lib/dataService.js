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
    }));
  },

  async saveProduct(product) {
    const userId = product?.user_id || await getAuthUserId();
    const payload = {
      ...product,
      barcode: normalizeNumericBarcode(product.barcode) || null,
      user_id: product.user_id || userId,
    };

    if (isUuid(payload.id)) {
      // Do not overwrite owner on existing products.
      const { user_id, ...updatePayload } = payload;
      const { data, error } = await withRetry(() => supabase.from('products').upsert(updatePayload).select());
      if (!error) return data;

      if (!isBarcodeUniqueError(error) || !payload.barcode) throw error;

      const fallbackUpdatePayload = removeInvalidUuidId(updatePayload);
      const { data: byBarcodeData, error: byBarcodeError } = await withRetry(() =>
        supabase.from('products').update(fallbackUpdatePayload).eq('barcode', payload.barcode).select()
      );
      if (byBarcodeError) throw byBarcodeError;
      return byBarcodeData;
    }

    const insertPayload = removeInvalidUuidId(payload);
    const hasBarcode = !!insertPayload.barcode;

    if (hasBarcode) {
      const updatePayload = removeInvalidUuidId(insertPayload);
      const { data: existingByBarcode, error: existingByBarcodeError } = await withRetry(() =>
        supabase.from('products').update(updatePayload).eq('barcode', insertPayload.barcode).select()
      );
      if (existingByBarcodeError) throw existingByBarcodeError;
      if ((existingByBarcode || []).length > 0) return existingByBarcode;
    }

    const { data, error } = await withRetry(() => supabase.from('products').insert(insertPayload).select());
    if (!error) return data;

    if (!isBarcodeUniqueError(error) || !insertPayload.barcode) throw error;

    const fallbackUpdatePayload = removeInvalidUuidId(insertPayload);
    const { data: byBarcodeData, error: byBarcodeError } = await withRetry(() =>
      supabase.from('products').update(fallbackUpdatePayload).eq('barcode', insertPayload.barcode).select()
    );
    if (byBarcodeError) throw byBarcodeError;
    return byBarcodeData;
  },

  async updateProductStockById(productId, changes) {
    if (!isUuid(productId)) {
      throw new Error('ID de producto invalido para actualizar stock');
    }

    // Stock updates must not reassign product owner.
    const payload = { ...changes };

    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', productId)
      .select();

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
      active: c.active ?? true,
    }));
  },

  async saveClient(client) {
    const userId = client?.user_id || await getAuthUserId();
    const document = String(client?.document ?? '').trim();
    let existingByDocument = null;

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

    const providedCreditLevel = client.creditLevel ?? client.credit_level;
    const providedCreditLimit = client.creditLimit ?? client.credit_limit;
    const providedApprovedTerm = client.approvedTerm ?? client.approved_term;
    const providedDiscount = client.discount;
    const existingLevel = normalizeCreditLevel(resolveCreditLevel(existingByDocument?.credit_level || 'ESTANDAR'));
    const incomingLevel = normalizeCreditLevel(resolveCreditLevel(providedCreditLevel || 'ESTANDAR'));
    const incomingLimit = Number(providedCreditLimit ?? 0);
    const incomingDiscount = Number(providedDiscount ?? 0);

    // Protect against accidental downgrade to ESTANDAR/0 produced by partial payloads.
    const accidentalDowngradeToStandard =
      existingByDocument &&
      existingLevel !== 'ESTANDAR' &&
      incomingLevel === 'ESTANDAR' &&
      incomingLimit <= 0 &&
      incomingDiscount <= 0;

    const resolvedCreditLevel = accidentalDowngradeToStandard
      ? resolveCreditLevel(existingByDocument.credit_level)
      : resolveCreditLevel(providedCreditLevel ?? existingByDocument?.credit_level ?? 'ESTANDAR');

    const resolvedCreditLimit = accidentalDowngradeToStandard
      ? Number(existingByDocument?.credit_limit ?? 0)
      : Number(providedCreditLimit ?? existingByDocument?.credit_limit ?? 0);

    const resolvedApprovedTerm = accidentalDowngradeToStandard
      ? Number(existingByDocument?.approved_term ?? 30)
      : Number(providedApprovedTerm ?? existingByDocument?.approved_term ?? 30);

    const resolvedDiscount = accidentalDowngradeToStandard
      ? Number(existingByDocument?.discount ?? 0)
      : Number(providedDiscount ?? existingByDocument?.discount ?? 0);

    const payload = {
      id: client.id,
      user_id: client.user_id || userId,
      name: client.name ?? '',
      document,
      phone: client.phone ?? null,
      email: client.email ?? null,
      address: client.address ?? null,
      credit_level: resolvedCreditLevel,
      credit_limit: resolvedCreditLimit,
      approved_term: resolvedApprovedTerm,
      discount: resolvedDiscount,
      active: client.active ?? existingByDocument?.active ?? true,
    };

    if (isUuid(payload.id)) {
      const { data, error } = await withRetry(() => supabase.from('clients').upsert(payload).select());
      if (!error) return data;

      if (!isClientDocumentUniqueError(error) || !payload.document) throw error;

      const fallbackUpdatePayload = removeInvalidUuidId(payload);
      const { data: byDocData, error: byDocError } = await withRetry(() =>
        supabase.from('clients').update(fallbackUpdatePayload).eq('document', payload.document).select()
      );
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

    if (!isClientDocumentUniqueError(error) || !insertPayload.document) throw error;

    const { data: byDocData, error: byDocError } = await withRetry(() =>
      supabase.from('clients').update(insertPayload).eq('document', insertPayload.document).select()
    );
    if (byDocError) throw byDocError;
    return byDocData;
  },

  async deleteClient(client) {
    const id = client?.id;
    const document = String(client?.document ?? '').trim();

    if (isUuid(id)) {
      const { error } = await withRetry(() => supabase.from('clients').delete().eq('id', id));
      if (error) throw error;
      return;
    }

    if (document) {
      const { error } = await withRetry(() => supabase.from('clients').delete().eq('document', document));
      if (error) throw error;
      return;
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
        clientId: inv.client_id ?? null,
        clientName: inv.client_name ?? 'Cliente Ocasional',
        clientDoc: inv.client_doc ?? 'N/A',
        subtotal: Number(inv.subtotal ?? 0),
        deliveryFee: Number(inv.delivery_fee ?? 0),
        total: Number(inv.total ?? 0),
        paymentMode: inv.payment_mode ?? 'Efectivo',
        mixedDetails: inv.mixed_details ?? null,
        date: inv.date,
        dueDate: inv.due_date ?? null,
        status: inv.status ?? 'pagado',
        items: mappedItems,
        balance: (inv.status ?? 'pagado') === 'pendiente' ? Number(inv.total ?? 0) : 0,
      };
    });
  },

  async saveInvoice(invoice, items) {
    const userId = invoice?.user_id || await getAuthUserId();

    const invoicePayload = {
      user_id: invoice.user_id || userId,
      client_id: isUuid(invoice.client_id) ? invoice.client_id : null,
      client_name: invoice.client_name ?? invoice.clientName ?? null,
      client_doc: invoice.client_doc ?? invoice.clientDoc ?? null,
      subtotal: Number(invoice.subtotal || 0),
      delivery_fee: Number(invoice.delivery_fee ?? invoice.deliveryFee ?? 0),
      total: Number(invoice.total || 0),
      payment_mode: invoice.payment_mode ?? invoice.paymentMode ?? null,
      mixed_details: invoice.mixed_details ?? invoice.mixedDetails ?? null,
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

    const { data: invData, error: invError } = await invoiceQuery;
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
      type: e.category ?? 'Otros',
      beneficiary: '',
      docId: '',
    }));
  },

  async saveExpense(expense) {
    const userId = expense?.user_id || await getAuthUserId();
    const payload = {
      id: expense.id,
      user_id: expense.user_id || userId,
      date: expense.date || new Date().toISOString(),
      category: expense.category ?? expense.type ?? 'Otros',
      amount: Number(expense.amount ?? 0),
      description: expense.description ?? null,
    };

    const insertPayload = removeInvalidUuidId(payload);
    const { data, error } = await supabase.from('expenses').insert(insertPayload).select();
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
    const payload = {
      id: purchase.id,
      user_id: purchase.user_id || userId,
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
    const { data, error } = await supabase.from('purchases').insert(insertPayload).select();
    if (error) throw error;
    return data;
  },

  // AUDIT LOGS
  async getAuditLogs() {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  },

  async saveAuditLog(log) {
    const payload = {
      user_id: log.user_id,
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
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map((s) => ({
      id: s.id,
      startTime: s.start_time,
      endTime: s.end_time,
      initialCash: Number(s.initial_cash ?? 0),
      salesTotal: Number(s.sales_total ?? 0),
      theoreticalBalance: Number(s.theoretical_balance ?? 0),
      physicalCash: Number(s.physical_cash ?? 0),
      discrepancy: Number(s.discrepancy ?? 0),
      authorized: !!s.authorized,
      reportText: s.report_text ?? '',
      user: 'Sistema',
    }));
  },

  async saveShift(shift) {
    const userId = shift?.user_id || await getAuthUserId();
    const payload = {
      id: shift.id,
      user_id: shift.user_id || userId,
      start_time: shift.start_time ?? shift.startTime ?? null,
      end_time: shift.end_time ?? shift.endTime ?? new Date().toISOString(),
      initial_cash: Number(shift.initial_cash ?? shift.initialCash ?? 0),
      sales_total: Number(shift.sales_total ?? shift.salesTotal ?? 0),
      theoretical_balance: Number(shift.theoretical_balance ?? shift.theoreticalBalance ?? 0),
      physical_cash: Number(shift.physical_cash ?? shift.physicalCash ?? 0),
      discrepancy: Number(shift.discrepancy ?? 0),
      authorized: !!shift.authorized,
      report_text: shift.report_text ?? shift.reportText ?? '',
    };

    if (isUuid(payload.id)) {
      const { data, error } = await supabase.from('shift_history').upsert(payload).select();
      if (error) throw error;
      return data;
    }

    const insertPayload = removeInvalidUuidId(payload);
    const { data, error } = await supabase.from('shift_history').insert(insertPayload).select();
    if (error) throw error;
    return data;
  },
};
