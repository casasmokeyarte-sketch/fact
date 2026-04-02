const EXTERNAL_CASH_RECEIPT_MARKER = 'FACT_EXTERNAL_CASH_RECEIPT::';

export const EXTERNAL_CASH_RECEIPT_MODULE = 'Recibo de Caja externos';
export const EXTERNAL_CASH_RECEIPT_ACTION = 'Crear Recibo de Caja Externo';

function normalizePaymentMethod(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized.includes('efectivo') || normalized.includes('contado') || normalized.includes('cash')) {
    return 'Efectivo';
  }
  if (normalized.includes('transfer')) {
    return 'Transferencia';
  }
  if (normalized.includes('tarjeta') || normalized.includes('card')) {
    return 'Tarjeta';
  }
  return 'Otro';
}

export function buildExternalCashReceiptDetails(receipt) {
  const payload = {
    receiptCode: String(receipt?.receiptCode || '').trim(),
    thirdPartyName: String(receipt?.thirdPartyName || '').trim(),
    thirdPartyDocument: String(receipt?.thirdPartyDocument || '').trim(),
    amount: Number(receipt?.amount || 0),
    concept: String(receipt?.concept || '').trim(),
    paymentMethod: normalizePaymentMethod(receipt?.paymentMethod),
    paymentReference: String(receipt?.paymentReference || '').trim(),
    notes: String(receipt?.notes || '').trim(),
    date: receipt?.date || new Date().toISOString(),
  };

  return `${EXTERNAL_CASH_RECEIPT_MARKER}${JSON.stringify(payload)}`;
}

export function parseExternalCashReceiptLog(log) {
  const details = String(log?.details || '');
  if (!details.startsWith(EXTERNAL_CASH_RECEIPT_MARKER)) return null;

  try {
    const payload = JSON.parse(details.slice(EXTERNAL_CASH_RECEIPT_MARKER.length));
    const amount = Number(payload?.amount || 0);
    if (!payload?.receiptCode || !Number.isFinite(amount) || amount <= 0) return null;

    return {
      id: log?.id || payload.receiptCode,
      receiptCode: String(payload.receiptCode || '').trim(),
      thirdPartyName: String(payload.thirdPartyName || '').trim(),
      thirdPartyDocument: String(payload.thirdPartyDocument || '').trim(),
      amount,
      concept: String(payload.concept || '').trim(),
      paymentMethod: normalizePaymentMethod(payload.paymentMethod),
      paymentReference: String(payload.paymentReference || '').trim(),
      notes: String(payload.notes || '').trim(),
      date: payload.date || log?.timestamp || new Date().toISOString(),
      timestamp: log?.timestamp || payload.date || new Date().toISOString(),
      user_id: log?.user_id || null,
      user_name: log?.user_name || log?.user || 'Sistema',
      module: log?.module || EXTERNAL_CASH_RECEIPT_MODULE,
      action: log?.action || EXTERNAL_CASH_RECEIPT_ACTION,
      rawLog: log,
    };
  } catch {
    return null;
  }
}

export function normalizeExternalCashReceiptRecord(record) {
  const amount = Number(record?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const receiptCode = String(record?.receipt_code || record?.receiptCode || '').trim();
  if (!receiptCode) return null;

  return {
    id: record?.id || receiptCode,
    receiptCode,
    thirdPartyName: String(record?.third_party_name || record?.thirdPartyName || '').trim(),
    thirdPartyDocument: String(record?.third_party_document || record?.thirdPartyDocument || '').trim(),
    amount,
    concept: String(record?.concept || '').trim(),
    paymentMethod: normalizePaymentMethod(record?.payment_method || record?.paymentMethod),
    paymentReference: String(record?.payment_reference || record?.paymentReference || '').trim(),
    notes: String(record?.notes || '').trim(),
    date: record?.date || new Date().toISOString(),
    timestamp: record?.created_at || record?.date || new Date().toISOString(),
    user_id: record?.user_id || null,
    user_name: record?.user_name || record?.user || 'Sistema',
    module: EXTERNAL_CASH_RECEIPT_MODULE,
    action: EXTERNAL_CASH_RECEIPT_ACTION,
    rawLog: record,
  };
}

export function isExternalCashReceiptLog(log) {
  return !!parseExternalCashReceiptLog(log);
}

export function collectExternalCashReceipts(logs = []) {
  return (Array.isArray(logs) ? logs : [])
    .map(parseExternalCashReceiptLog)
    .filter(Boolean)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function mergeExternalCashReceipts(...sources) {
  const merged = [];
  const seen = new Set();

  sources.flat().forEach((item) => {
    const normalized = item?.receiptCode ? normalizeExternalCashReceiptRecord(item) || item : null;
    const receipt = normalized || parseExternalCashReceiptLog(item);
    if (!receipt?.receiptCode) return;
    const key = String(receipt.receiptCode).trim().toUpperCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(receipt);
  });

  return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getNextExternalCashReceiptCode(logs = [], prefix = 'SSOT-RC') {
  const safePrefix = String(prefix || 'SSOT-RC').trim().toUpperCase();
  const matcher = new RegExp(`^${safePrefix}-(\\d+)$`, 'i');

  const maxNumber = mergeExternalCashReceipts(logs).reduce((max, receipt) => {
    const match = String(receipt?.receiptCode || '').match(matcher);
    const current = match ? Number(match[1] || 0) : 0;
    return Math.max(max, current);
  }, 0);

  return `${safePrefix}-${String(maxNumber + 1).padStart(3, '0')}`;
}

export function getExternalCashReceiptBreakdown(receipt) {
  const amount = Number(receipt?.amount || 0);
  const breakdown = { total: amount, cash: 0, transfer: 0, card: 0, other: 0 };
  const paymentMethod = normalizePaymentMethod(receipt?.paymentMethod);

  if (paymentMethod === 'Efectivo') breakdown.cash = amount;
  else if (paymentMethod === 'Transferencia') breakdown.transfer = amount;
  else if (paymentMethod === 'Tarjeta') breakdown.card = amount;
  else breakdown.other = amount;

  return breakdown;
}
