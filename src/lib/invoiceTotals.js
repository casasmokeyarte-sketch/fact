const DISCOUNT_MIN_UNIT_PRICE = 50000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const getItemProductId = (item) => (
  item?.productId ?? item?.product_id ?? item?.id ?? null
);

const isFullPriceOnly = (item) => item?.full_price_only === true || item?.fullPriceOnly === true;

export const isClientDiscountEligibleItem = (item) => {
  if (isFullPriceOnly(item)) return false;
  const unitPrice = Number(item?.price || 0);
  return unitPrice > DISCOUNT_MIN_UNIT_PRICE;
};

export function normalizePromotion(raw) {
  const promo = raw && typeof raw === 'object' ? raw : {};
  const scope = String(promo.scope || 'ALL').toUpperCase() === 'PRODUCTS' ? 'PRODUCTS' : 'ALL';
  const discountType = String(promo.discountType || 'PERCENT').toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'PERCENT';
  const productIds = Array.isArray(promo.productIds) ? promo.productIds.map((id) => String(id)) : [];

  return {
    id: String(promo.id || ''),
    name: String(promo.name || '').trim(),
    enabled: promo.enabled !== false,
    scope,
    productIds,
    includeFullPriceOnly: promo.includeFullPriceOnly === true,
    discountType,
    percent: clamp(Number(promo.percent || 0), 0, 100),
    amount: Math.max(0, Number(promo.amount || 0)),
    startAt: promo.startAt ? String(promo.startAt) : '',
    endAt: promo.endAt ? String(promo.endAt) : '',
  };
}

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? d : null;
};

export function isPromotionActive(promotion, now = new Date()) {
  const promo = normalizePromotion(promotion);
  if (!promo.enabled) return false;
  const start = parseDate(promo.startAt);
  const end = parseDate(promo.endAt);
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  if (!Number.isFinite(nowMs)) return false;

  if (start && nowMs < start.getTime()) return false;
  if (end && nowMs > end.getTime()) return false;
  return true;
}

export function isPromoEligibleItem(promotion, item) {
  const promo = normalizePromotion(promotion);
  if (!promo.includeFullPriceOnly && isFullPriceOnly(item)) return false;

  if (promo.scope === 'PRODUCTS') {
    const pid = getItemProductId(item);
    if (!pid) return false;
    return promo.productIds.includes(String(pid));
  }

  return true;
}

export function computePromotionDiscount(promotion, items = []) {
  const promo = normalizePromotion(promotion);
  const eligibleSubtotal = (items || []).reduce((sum, item) => {
    const lineTotal = Number(item?.total || 0);
    if (!Number.isFinite(lineTotal) || lineTotal <= 0) return sum;
    return sum + (isPromoEligibleItem(promo, item) ? lineTotal : 0);
  }, 0);

  if (eligibleSubtotal <= 0) {
    return { promotion: promo, eligibleSubtotal: 0, discountAmount: 0 };
  }

  const discountAmount = promo.discountType === 'AMOUNT'
    ? Math.min(eligibleSubtotal, promo.amount)
    : Math.min(eligibleSubtotal, eligibleSubtotal * (promo.percent / 100));

  return {
    promotion: promo,
    eligibleSubtotal,
    discountAmount: Math.max(0, Number(discountAmount || 0))
  };
}

export function resolveBestActivePromotion(promotions = [], items = [], now = new Date()) {
  const active = (promotions || [])
    .map(normalizePromotion)
    .filter((p) => isPromotionActive(p, now));

  let best = null;
  for (const promo of active) {
    const computed = computePromotionDiscount(promo, items);
    if (!best || computed.discountAmount > best.discountAmount) best = computed;
  }

  if (!best) {
    return { promotion: null, eligibleSubtotal: 0, discountAmount: 0 };
  }

  return best;
}

export function computeInvoiceTotals({
  items = [],
  deliveryFee = 0,
  selectedClientDiscountPercent = 0,
  extraDiscount = 0,
  promotions = [],
  now = new Date(),
} = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const subtotal = safeItems.reduce((sum, item) => sum + (Number(item?.total || 0) || 0), 0);
  const safeDeliveryFee = Number(deliveryFee || 0) || 0;
  const automaticPercent = Math.max(0, Number(selectedClientDiscountPercent || 0) || 0);
  const allowPromotion = automaticPercent <= 0;

  const { promotion, eligibleSubtotal: promoEligibleSubtotal, discountAmount: promoDiscountAmount } =
    allowPromotion
      ? resolveBestActivePromotion(promotions, safeItems, now)
      : { promotion: null, eligibleSubtotal: 0, discountAmount: 0 };

  const discountableSubtotal = safeItems.reduce((sum, item) => {
    const lineTotal = Number(item?.total || 0);
    if (!Number.isFinite(lineTotal) || lineTotal <= 0) return sum;
    return sum + (isClientDiscountEligibleItem(item) ? lineTotal : 0);
  }, 0);

  const promoDiscountableSubtotal = promotion
    ? safeItems.reduce((sum, item) => {
        const lineTotal = Number(item?.total || 0);
        if (!Number.isFinite(lineTotal) || lineTotal <= 0) return sum;
        if (!isClientDiscountEligibleItem(item)) return sum;
        return sum + (isPromoEligibleItem(promotion, item) ? lineTotal : 0);
      }, 0)
    : 0;

  const promoDiscountOnDiscountableItems = promoEligibleSubtotal > 0
    ? promoDiscountAmount * (promoDiscountableSubtotal / promoEligibleSubtotal)
    : 0;

  const rawAutomatic = discountableSubtotal * (automaticPercent / 100);
  const maxAutomaticAllowed = Math.max(0, discountableSubtotal - promoDiscountOnDiscountableItems);
  const automaticDiscountAmount = Math.max(0, Math.min(rawAutomatic, maxAutomaticAllowed));

  const maxExtraDiscount = Math.max(0, discountableSubtotal - promoDiscountOnDiscountableItems - automaticDiscountAmount);
  const requestedExtraDiscount = Math.max(0, Number(extraDiscount || 0) || 0);
  const effectiveExtraDiscount = Math.max(0, Math.min(requestedExtraDiscount, maxExtraDiscount));

  const totalDiscount = Math.max(0, Number(promoDiscountAmount || 0)) + automaticDiscountAmount + effectiveExtraDiscount;
  const total = Math.max(0, subtotal + safeDeliveryFee - totalDiscount);

  return {
    now: (now instanceof Date ? now : new Date(now)).toISOString(),
    subtotal,
    deliveryFee: safeDeliveryFee,
    discountableSubtotal,
    promotion: promotion ? {
      id: promotion.id || '',
      name: promotion.name || '',
      scope: promotion.scope,
      discountType: promotion.discountType,
      percent: promotion.percent,
      amount: promotion.amount,
      includeFullPriceOnly: promotion.includeFullPriceOnly === true,
    } : null,
    promotionsBlockedByClientDiscount: !allowPromotion,
    promoEligibleSubtotal,
    promoDiscountAmount: Math.max(0, promoDiscountAmount || 0),
    promoDiscountOnDiscountableItems: Math.max(0, promoDiscountOnDiscountableItems || 0),
    automaticDiscountPercent: automaticPercent,
    automaticDiscountAmount,
    requestedExtraDiscount,
    maxExtraDiscount,
    effectiveExtraDiscount,
    totalDiscount,
    total,
  };
}
