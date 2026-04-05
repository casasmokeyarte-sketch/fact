import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './design-system.css'
import { CLIENT_OCASIONAL, PAYMENT_MODES, COMPANY_INFO } from './constants'
import { AuthPage } from './components/AuthPage'
import { onAuthStateChange, getCurrentUser, signOut } from './lib/authService'
import { ClientSelector } from './components/ClientSelector'
import { ProductSelector } from './components/ProductSelector'
import { InvoiceTable } from './components/InvoiceTable'
import { PaymentSummary } from './components/PaymentSummary'
import { computeInvoiceTotals } from './lib/invoiceTotals.js'

// New Modules
import { CarteraModule } from './components/CarteraModule'
import { PurchasingModule } from './components/PurchasingModule'
import { ClientModule } from './components/ClientModule'
import { AuditLog } from './components/AuditLog'
import { BarcodeModule } from './components/BarcodeModule'
import { MainCashier } from './components/MainCashier'
import { SettingsModule } from './components/SettingsModule'
import { InventoryModule } from './components/InventoryModule'
import { ShiftManager } from './components/ShiftManager'
import { TruequeModule } from './components/TruequeModule'
import { GastosModule } from './components/GastosModule'
import { ExternalCashReceiptModule } from './components/ExternalCashReceiptModule'
import { NotasModule } from './components/NotasModule'
import { HistorialModule } from './components/HistorialModule'
import { ReportsModule } from './components/ReportsModule'
import { ShiftHistoryModule } from './components/ShiftHistoryModule'
import { SystemHelpBubble } from './components/SystemHelpBubble'
import { OperationsBoardBubble } from './components/OperationsBoardBubble'
import { printShiftClosure, printShiftOpening } from './lib/printReports'

import { dataService } from './lib/dataService'
import { getProfile } from './lib/databaseService'
import { initEmailJS } from './lib/emailService'
import { playSound, setSoundEnabled as setAppSoundEnabled, setSoundVolume as setAppSoundVolume, setNotifyPreset as setAppNotifyPreset } from './lib/soundService'
import { supabase } from './lib/supabaseClient'
import { useProfile } from './lib/useSupabase'
import { syncFactMovement } from './lib/crmSyncService'
import {
  buildExternalCashReceiptDetails,
  getExternalCashReceiptBreakdown,
  collectExternalCashReceipts,
  mergeExternalCashReceipts,
  normalizeExternalCashReceiptRecord,
} from './lib/externalCashReceipts'
import modulesBg from './assets/modules-bg.png'

const DEFAULT_PERMISSIONS = {
  facturacion: true,
  cartera: true,
  compras: true,
  clientes: true,
  caja: true,
  inventario: true,
  codigos: true,
  reportes: true,
  bitacora: true,
  config: true,
  trueque: true,
  gastos: true,
  recibosCajaExternos: true,
  notas: true,
  historial: true,
  cierres: true
};

const normalizeRole = (role) => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return 'Administrador';
  if (normalized === 'administrador' || normalized === 'admin') return 'Administrador';
  if (normalized.includes('supervisor')) return 'Supervisor';
  if (normalized.includes('cajer')) return 'Cajero';
  return String(role).trim();
};

const parsePermissionString = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'si') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'null' || normalized === 'undefined') return false;

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const normalizePermissionValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const parsed = parsePermissionString(value);
    if (typeof parsed === 'boolean') return parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return normalizePermissionValue(parsed);
    return undefined;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const normalizedObject = {};
    Object.entries(value).forEach(([key, nestedValue]) => {
      const normalizedNested = normalizePermissionValue(nestedValue);
      normalizedObject[key] = normalizedNested === undefined ? nestedValue : normalizedNested;
    });
    return normalizedObject;
  }

  return undefined;
};

const normalizePermissions = (permissions) => {
  let source = permissions;

  if (typeof source === 'string') {
    const parsed = parsePermissionString(source);
    source = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { ...DEFAULT_PERMISSIONS };
  }

  const candidate = source.modules && typeof source.modules === 'object' && !Array.isArray(source.modules)
    ? source.modules
    : source;

  const normalized = { ...DEFAULT_PERMISSIONS };
  Object.keys(DEFAULT_PERMISSIONS).forEach((key) => {
    const normalizedValue = normalizePermissionValue(candidate[key]);
    if (normalizedValue !== undefined) {
      normalized[key] = normalizedValue;
    }
  });

  return normalized;
};

const normalizePermissionsForRole = (role, permissions) => {
  const normalizedRole = normalizeRole(role);
  const base = normalizePermissions(permissions);

  if (normalizedRole === 'Cajero') {
    return {
      ...base,
      inventario: true,
      codigos: true,
      compras: false
    };
  }

  if (normalizedRole === 'Supervisor') {
    return {
      ...base,
      inventario: true,
      codigos: true,
      reportes: true,
      bitacora: true,
      facturacion: true,
      clientes: true,
      cartera: true,
      caja: true,
      compras: true,
      historial: true,
      gastos: true,
      recibosCajaExternos: true,
      notas: true,
      config: false
    };
  }

  return base;
};

const MENU_ITEMS = [
  { id: 'facturacion', label: 'Facturacion', icon: '\uD83E\uDDFE', tab: 'facturacion' },
  { id: 'inventario', label: 'Inventario', icon: '\uD83D\uDCE6', tab: 'inventario' },
  { id: 'compras', label: 'Compras', icon: '\uD83D\uDED2', tab: 'compras' },
  { id: 'clientes', label: 'Clientes', icon: '\uD83D\uDC65', tab: 'clientes' },
  { id: 'caja', label: 'Caja', icon: '\uD83D\uDCB0', tab: 'caja' },
  { id: 'cartera', label: 'Cartera', icon: '\uD83D\uDCC1', tab: 'cartera' },
  { id: 'reportes', label: 'Reportes', icon: '\uD83D\uDCCA', tab: 'reportes' },
  { id: 'bitacora', label: 'Bitacora', icon: '\uD83D\uDCDD', tab: 'bitacora' },
  { id: 'codigos', label: 'Codigos', icon: '\uD83C\uDFF7\uFE0F', tab: 'codigos' },
  { id: 'trueque', label: 'Trueque', icon: '\uD83D\uDD04', tab: 'trueque' },
  { id: 'gastos', label: 'Gastos', icon: '\uD83D\uDCB8', tab: 'gastos' },
  { id: 'recibosCajaExternos', label: 'Recibo Caja externos', icon: '\uD83E\uDDFE', tab: 'recibosCajaExternos' },
  { id: 'notas', label: 'Notas', icon: '\uD83D\uDCD2', tab: 'notas' },
  { id: 'historial', label: 'Historial', icon: '\u23F3', tab: 'historial' },
  { id: 'cierres', label: 'Cierres', icon: '\uD83D\uDD12', tab: 'cierres' },
  { id: 'config', label: 'Configuracion', icon: '\u2699\uFE0F', tab: 'config' },
];

const getAllowedMenuItemsForUser = (user) => {
  const currentRole = normalizeRole(user?.role);
  const isCashierRole = currentRole === 'Cajero';
  const isSupervisorRole = currentRole === 'Supervisor';

  if (currentRole === 'Administrador') return MENU_ITEMS;

  if (isCashierRole) {
    return MENU_ITEMS.filter((item) => (
      ['facturacion', 'inventario', 'codigos', 'clientes', 'cartera', 'historial', 'caja', 'trueque', 'gastos', 'recibosCajaExternos', 'notas']
        .includes(item.tab)
    ));
  }

  if (isSupervisorRole) {
    return MENU_ITEMS.filter((item) => {
      const permission = user?.permissions?.[item.tab];
      return permission === true || (typeof permission === 'object' && permission !== null);
    });
  }

  return MENU_ITEMS.filter((item) => {
    const permission = user?.permissions?.[item.tab];
    return permission === true || (typeof permission === 'object' && permission !== null);
  });
};

const OPEN_SHIFT_STORAGE_KEY = 'fact_open_shift';
const ACTIVE_TAB_STORAGE_KEY = 'fact_active_tab';
const USER_CASH_BALANCES_STORAGE_KEY = 'fact_user_cash_balances';
const QUICK_TRAY_OPEN_STORAGE_KEY = 'fact_quick_tray_open';
const QUICK_LOOKUP_HISTORY_STORAGE_KEY = 'fact_quick_lookup_history';
const PRODUCTS_CACHE_STORAGE_KEY = 'fact_products_cache';
const CLIENTS_CACHE_STORAGE_KEY = 'fact_clients_cache';
const INVOICE_SEQUENCE_STORAGE_KEY = 'fact_invoice_sequence';
const REMOTE_AUTH_REQUESTS_STORAGE_KEY = 'fact_remote_auth_requests';
const SOUND_SETTINGS_STORAGE_KEY = 'fact_sound_settings';
const AUTH_REQUEST_LOG_PREFIX = 'AUTH_REQUEST_EVENT::';
const BOARD_NOTE_LOG_PREFIX = 'BOARD_NOTE_EVENT::';
const SHIFT_CLOSE_OVERRIDE_LOG_PREFIX = 'SHIFT_CLOSE_OVERRIDE::';
const INVOICE_DRAFTS_STORAGE_KEY = 'fact_invoice_drafts';
const INVOICE_COMPOSER_STORAGE_KEY = 'fact_invoice_composer';
const NOTIFICATIONS_SEEN_AT_STORAGE_KEY = 'fact_notifications_seen_at';
const BOARD_NOTES_SEEN_AT_STORAGE_KEY = 'fact_board_notes_seen_at';
const OPERATIONAL_DATE_SETTINGS_STORAGE_KEY = 'fact_operational_date_settings';
const LAST_SHIFT_CLOSE_BY_USER_STORAGE_KEY = 'fact_last_shift_close_by_user';
const INVENTORY_TRANSFER_REQUESTS_STORAGE_KEY = 'fact_inventory_transfer_requests';
const COMMERCIAL_NOTES_STORAGE_KEY = 'fact_commercial_notes';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OPEN_SHIFT_HOURS = 24;
const MAX_OPEN_SHIFT_MS = MAX_OPEN_SHIFT_HOURS * 60 * 60 * 1000;

const isUuid = (value) => typeof value === 'string' && UUID_REGEX.test(value);

const normalizeStoredOpenShift = (rawShift) => {
  if (!rawShift) return null;

  return {
    ...rawShift,
    db_id: rawShift?.db_id || rawShift?.id || null,
    startTime: rawShift?.startTime || rawShift?.start_time || null,
    initialCash: Number(rawShift?.initialCash ?? rawShift?.initial_cash ?? 0),
    user_id: rawShift?.user_id || null,
    user_name: rawShift?.user_name || rawShift?.user || null,
    inventoryAssignments: normalizeShiftInventoryAssignments(
      rawShift?.inventoryAssignments ?? rawShift?.inventory_assignment,
      [],
      {}
    ),
    inventoryAssignedAt: rawShift?.inventoryAssignedAt || rawShift?.inventory_assigned_at || null,
  };
};

const readBootstrappedOpenShift = () => {
  try {
    const raw = localStorage.getItem(OPEN_SHIFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const shift = normalizeStoredOpenShift(parsed?.shift);
    const startMs = new Date(shift?.startTime).getTime();
    const isValidStart = Number.isFinite(startMs) && !Number.isNaN(startMs);
    if (!isValidStart) return null;
    if (Date.now() - startMs > MAX_OPEN_SHIFT_MS) return null;
    return shift;
  } catch {
    return null;
  }
};

const normalizeBarcodeKey = (value) => {
  const raw = String(value ?? '').trim();
  return /^\d+$/.test(raw) ? raw : '';
};

const normalizeClientDraft = (client) => ({
  ...client,
  document: String(client?.document || '').trim(),
  name: String(client?.name || '').trim(),
  creditLevel: String(client?.creditLevel || client?.credit_level || 'ESTANDAR').trim() || 'ESTANDAR',
  creditLimit: Number(client?.creditLimit ?? client?.credit_limit ?? 0),
  approvedTerm: Number(client?.approvedTerm ?? client?.approved_term ?? 30),
  discount: Number(client?.discount ?? 0),
});

const dedupeClients = (rows) => {
  const byDoc = new Map();
  (rows || []).forEach((row) => {
    const normalized = normalizeClientDraft(row);
    if (!normalized.document) return;
    const existing = byDoc.get(normalized.document);
    byDoc.set(normalized.document, existing ? { ...existing, ...normalized } : normalized);
  });
  return Array.from(byDoc.values());
};

const dedupeProducts = (rows) => {
  const byId = new Map();
  const byBarcode = new Map();
  const bySignature = new Map();

  (rows || []).forEach((row) => {
    if (!row || typeof row !== 'object') return;

    const idKey = String(row.id || '').trim();
    const barcodeKey = normalizeBarcodeKey(row.barcode);
    const signature = `${String(row.name || '').trim().toLowerCase()}|${String(row.category || '').trim().toLowerCase()}|${Number(row.price || 0)}`;

    if (idKey && byId.has(idKey)) {
      byId.set(idKey, { ...byId.get(idKey), ...row });
      return;
    }

    if (barcodeKey && byBarcode.has(barcodeKey)) {
      const existing = byBarcode.get(barcodeKey);
      const merged = { ...existing, ...row };
      const mergedId = String(merged.id || '').trim();
      if (mergedId) byId.set(mergedId, merged);
      byBarcode.set(barcodeKey, merged);
      return;
    }

    if (!barcodeKey && bySignature.has(signature)) {
      const existing = bySignature.get(signature);
      const preferExisting = isUuid(String(existing?.id || ''));
      const merged = preferExisting ? { ...row, ...existing } : { ...existing, ...row };
      const mergedId = String(merged.id || '').trim();
      if (mergedId) byId.set(mergedId, merged);
      bySignature.set(signature, merged);
      return;
    }

    if (idKey) byId.set(idKey, row);
    if (barcodeKey) byBarcode.set(barcodeKey, row);
    if (!barcodeKey) bySignature.set(signature, row);
  });

  return Array.from(new Set([
    ...byId.values(),
    ...byBarcode.values(),
    ...bySignature.values()
  ]));
};

const parseAuthRequestLogEvent = (details) => {
  const raw = String(details || '');
  if (!raw.startsWith(AUTH_REQUEST_LOG_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(AUTH_REQUEST_LOG_PREFIX.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const parseShiftCloseOverrideLogEvent = (details) => {
  const raw = String(details || '');
  if (!raw.startsWith(SHIFT_CLOSE_OVERRIDE_LOG_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(SHIFT_CLOSE_OVERRIDE_LOG_PREFIX.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const createRequestPreviewAttachment = ({
  title = 'Solicitud',
  lines = [],
  tone = '#0f172a',
  accent = '#2563eb',
}) => {
  const safeLines = (lines || []).slice(0, 7).map((line) => escapeXml(line));
  const lineMarkup = safeLines
    .map((line, index) => `<text x="32" y="${108 + (index * 38)}" font-size="24" fill="${tone}" font-family="Segoe UI, Arial, sans-serif">${line}</text>`)
    .join('');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
      <rect width="900" height="520" rx="26" fill="#f8fafc"/>
      <rect x="20" y="20" width="860" height="480" rx="22" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
      <rect x="32" y="32" width="280" height="44" rx="12" fill="${accent}" opacity="0.12"/>
      <text x="48" y="61" font-size="26" font-weight="700" fill="${accent}" font-family="Segoe UI, Arial, sans-serif">${escapeXml(title)}</text>
      <line x1="32" y1="92" x2="868" y2="92" stroke="#cbd5e1" stroke-width="2"/>
      ${lineMarkup}
    </svg>
  `.trim();

  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${title.toLowerCase().replace(/\s+/g, '-')}.svg`,
    type: 'image/svg+xml',
    dataUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
  };
};

const buildApprovalPreviewAttachments = ({
  title,
  requester,
  reasonLabel,
  total,
  paymentMode,
  items = [],
  extraLines = [],
}) => {
  const previewItems = (items || []).slice(0, 3).map((item) => {
    const qty = Number(item?.quantity || 0);
    const name = String(item?.name || 'Producto');
    return `${qty} x ${name}`;
  });

  return [
    createRequestPreviewAttachment({
      title,
      accent: '#ea580c',
      lines: [
        `Usuario: ${requester || 'N/A'}`,
        reasonLabel ? `Motivo: ${reasonLabel}` : null,
        Number(total || 0) > 0 ? `Total: $${Number(total || 0).toLocaleString('es-CO')}` : null,
        paymentMode ? `Pago: ${paymentMode}` : null,
        ...previewItems,
        ...extraLines,
      ].filter(Boolean),
    }),
  ];
};

const buildRemoteAuthRequestsFromLogs = (logs) => {
  const byId = new Map();
  const ordered = [...(logs || [])].sort((a, b) => {
    const aTime = new Date(a?.timestamp || 0).getTime();
    const bTime = new Date(b?.timestamp || 0).getTime();
    return aTime - bTime;
  });

  ordered.forEach((log) => {
    if (log?.module !== 'Autorizaciones') return;
    const event = parseAuthRequestLogEvent(log?.details);
    if (!event?.requestId) return;

    if (event.type === 'CREATED') {
      const existing = byId.get(event.requestId);
      byId.set(event.requestId, {
        ...(existing || {}),
        id: event.requestId,
        status: existing?.status || 'PENDING',
        createdAt: event.createdAt || log?.timestamp || new Date().toISOString(),
        requestedBy: event.requestedBy || existing?.requestedBy || null,
        module: event.module || existing?.module || 'Facturacion',
        requestCategory: event.requestCategory || existing?.requestCategory || 'AUTHORIZATION',
        reasonType: event.reasonType || existing?.reasonType || '',
        reasonLabel: event.reasonLabel || existing?.reasonLabel || '',
        note: event.note || existing?.note || '',
        clientName: event.clientName || existing?.clientName || '',
        total: Number(event.total ?? existing?.total ?? 0),
        paymentMode: event.paymentMode || existing?.paymentMode || '',
        attachments: Array.isArray(event.attachments) ? event.attachments : (existing?.attachments || []),
        inventoryRequest: event.inventoryRequest || existing?.inventoryRequest || null,
      });
      return;
    }

    if (event.type === 'RESOLVED') {
      const existing = byId.get(event.requestId) || {
        id: event.requestId,
        createdAt: log?.timestamp || new Date().toISOString(),
      };
      byId.set(event.requestId, {
        ...existing,
        status: event.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        resolvedAt: event.resolvedAt || log?.timestamp || new Date().toISOString(),
        resolvedBy: event.resolvedBy || existing?.resolvedBy || null,
      });
    }
  });

  return Array.from(byId.values()).sort((a, b) => (
    new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
  ));
};

const mergeRemoteAuthRequests = (localRequests, syncedRequests) => {
  const byId = new Map();
  [...(localRequests || []), ...(syncedRequests || [])].forEach((request) => {
    if (!request?.id) return;
    const existing = byId.get(request.id);
    byId.set(request.id, existing ? { ...existing, ...request } : request);
  });
  return Array.from(byId.values())
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
    .slice(0, 120);
};

const normalizeShiftInventoryAssignments = (items, products = [], stockVentas = {}) => (
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const productId = String(item?.productId || item?.product_id || '').trim();
      if (!productId) return null;
      const product = (products || []).find((p) => String(p?.id || '') === productId);
      const quantity = Math.max(0, Math.trunc(Number(item?.quantity ?? item?.assignedQty ?? 0) || 0));
      if (quantity <= 0) return null;
      return {
        productId,
        productName: item?.productName || product?.name || 'Producto',
        quantity,
        availableInSystem: Math.max(0, Number(item?.availableInSystem ?? stockVentas?.[productId] ?? 0)),
      };
    })
    .filter(Boolean)
);

const normalizeCategoryKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const isSmokeCategory = (value) => normalizeCategoryKey(value) === 'smoke';

const filterSmokeShiftInventoryAssignments = (items, products = []) => {
  const productById = new Map((products || []).map((product) => [String(product?.id || ''), product]));
  return (Array.isArray(items) ? items : []).filter((item) => {
    const product = productById.get(String(item?.productId || '').trim());
    return isSmokeCategory(product?.category);
  });
};

const extractInvoiceItems = (invoice) => {
  if (Array.isArray(invoice?.items)) return invoice.items;
  if (Array.isArray(invoice?.mixedDetails?.items)) return invoice.mixedDetails.items;
  if (Array.isArray(invoice?.mixed_details?.items)) return invoice.mixed_details.items;
  return [];
};

const summarizeShiftInventory = ({
  assignments = [],
  shiftSales = [],
}) => {
  const soldByProduct = new Map();

  (shiftSales || []).forEach((sale) => {
    extractInvoiceItems(sale).forEach((item) => {
      const productId = String(item?.productId ?? item?.product_id ?? item?.id ?? '').trim();
      if (!productId) return;
      soldByProduct.set(productId, (soldByProduct.get(productId) || 0) + Math.max(0, Number(item?.quantity || 0)));
    });
  });

  const rows = (assignments || []).map((assignment) => {
    const productId = String(assignment?.productId || '').trim();
    const assignedQty = Math.max(0, Number(assignment?.quantity || 0));
    const soldQty = Math.max(0, Number(soldByProduct.get(productId) || 0));
    const expectedQty = Math.max(0, assignedQty - soldQty);
    return {
      productId,
      productName: assignment?.productName || 'Producto',
      assignedQty,
      soldQty,
      expectedQty,
    };
  });

  return {
    rows,
    totals: rows.reduce((acc, row) => ({
      assignedQty: acc.assignedQty + Number(row.assignedQty || 0),
      soldQty: acc.soldQty + Number(row.soldQty || 0),
      expectedQty: acc.expectedQty + Number(row.expectedQty || 0),
    }), { assignedQty: 0, soldQty: 0, expectedQty: 0 }),
  };
};

const parseBoardNoteLogEvent = (details) => {
  const raw = String(details || '');
  if (!raw.startsWith(BOARD_NOTE_LOG_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(BOARD_NOTE_LOG_PREFIX.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const buildBoardNotesFromLogs = (logs) => {
  return (logs || [])
    .filter((log) => log?.module === 'Pizarra')
    .map((log) => parseBoardNoteLogEvent(log?.details))
    .filter(Boolean)
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
    .slice(0, 60);
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const { data: liveProfile } = useProfile(currentUser?.id);
  const [activeTab, setActiveTab] = useState('home');
  const [preselectedProductId, setPreselectedProductId] = useState('');
  const [categories, setCategories] = useState(['General', 'Alimentos', 'Limpieza', 'Otros']);
  const [expenses, setExpenses] = useState([]);
  const [externalCashReceipts, setExternalCashReceipts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.08);
  const [soundPreset, setSoundPreset] = useState('beep');

  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [shiftRestored, setShiftRestored] = useState(false);

  // Products Catalog
  const [products, setProducts] = useState([]);

  // Shift State
  const [shift, setShift] = useState(() => readBootstrappedOpenShift()); // { startTime, initialCash }

  // Shared State
  const [clientName, setClientName] = useState(CLIENT_OCASIONAL);
  const [selectedClient, setSelectedClient] = useState(null); // Full client object if registered
  const [items, setItems] = useState([]);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [composerExtraDiscount, setComposerExtraDiscount] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState(['Efectivo', 'Credito', 'Transferencia', 'Tarjeta']);
  const [companyPromotions, setCompanyPromotions] = useState([]);
  const [paymentMode, setPaymentMode] = useState('Efectivo');
  const [paymentRef, setPaymentRef] = useState('');
  const [quickScanCode, setQuickScanCode] = useState('');
  const [quickLookupResult, setQuickLookupResult] = useState(null);
  const [quickLookupHistory, setQuickLookupHistory] = useState([]);
  const [quickTrayOpen, setQuickTrayOpen] = useState(true);
  const [quickPanelPosition, setQuickPanelPosition] = useState(null);
  const [promoPanelPosition, setPromoPanelPosition] = useState(null);
  const [homePanelsMovable, setHomePanelsMovable] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth > 768
  ));
  const quickScanInputRef = useRef(null);
  const quickScanBufferRef = useRef('');
  const quickScanLastKeyAtRef = useRef(0);
  const homeDashboardRef = useRef(null);
  const homePanelDragRef = useRef(null);
  const realtimeRefreshTimeoutRef = useRef(null);
  const realtimeRefreshInFlightRef = useRef(false);
  const queuedRealtimeRefreshRef = useRef(false);
  const lastAuthEventRef = useRef({ event: null, userId: null, at: 0 });
  const pendingProductsSyncRef = useRef(false);
  const pendingClientsSyncRef = useRef(false);
  const userCashBalancesHydratedRef = useRef(false);
  const lastSyncedUserCashBalancesRef = useRef('');

  // New States
  const [registeredClients, setRegisteredClients] = useState([]);
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [users, setUsers] = useState([
    {
      id: 1,
      name: 'Administrador',
      username: 'Admin',
      password: 'Admin',
      role: 'Administrador',
      permissions: {
        facturacion: true,
        cartera: true,
        compras: true,
        clientes: true,
        caja: true,
        inventario: true,
        codigos: true,
        reportes: true,
        bitacora: true,
        config: true,
        trueque: true,
        gastos: true,
        recibosCajaExternos: true,
        notas: true,
        historial: true,
        cierres: true
      }
    }
  ]);
  const adminPass = useMemo(() => (
    String(users.find((u) => u.username === 'Admin')?.password || '').trim() || 'Admin'
  ), [users]);
  const [cartera, setCartera] = useState([]);
  const [stock, setStock] = useState({ bodega: {}, ventas: {} });
  const [auditLogs, setAuditLogs] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [shiftHistory, setShiftHistory] = useState([]);
  const [headerNow, setHeaderNow] = useState(() => new Date());
  const [remoteAuthRequests, setRemoteAuthRequests] = useState(() => {
    try {
      const raw = localStorage.getItem(REMOTE_AUTH_REQUESTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [inventoryTransferRequests, setInventoryTransferRequests] = useState(() => {
    try {
      const raw = localStorage.getItem(INVENTORY_TRANSFER_REQUESTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [commercialNotes, setCommercialNotes] = useState(() => {
    try {
      const raw = localStorage.getItem(COMMERCIAL_NOTES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [invoiceDrafts, setInvoiceDrafts] = useState(() => {
    try {
      const raw = localStorage.getItem(INVOICE_DRAFTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loadedDraftState, setLoadedDraftState] = useState(null);
  const [invoiceComposerMeta, setInvoiceComposerMeta] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsSeenAt, setNotificationsSeenAt] = useState(() => {
    const raw = Number(localStorage.getItem(NOTIFICATIONS_SEEN_AT_STORAGE_KEY) || 0);
    return Number.isFinite(raw) ? raw : 0;
  });
  const lastNotificationSoundAtRef = useRef(0);
  const [boardNotesSeenAt, setBoardNotesSeenAt] = useState(() => {
    const raw = Number(localStorage.getItem(BOARD_NOTES_SEEN_AT_STORAGE_KEY) || 0);
    return Number.isFinite(raw) ? raw : 0;
  });
  const [operationalDateSettings, setOperationalDateSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(OPERATIONAL_DATE_SETTINGS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const daysOffset = Number(parsed?.daysOffset || 0);
      return {
        daysOffset: Number.isFinite(daysOffset) ? Math.max(-30, Math.min(30, Math.trunc(daysOffset))) : 0,
        reason: String(parsed?.reason || ''),
        appliedBy: String(parsed?.appliedBy || ''),
        appliedAt: String(parsed?.appliedAt || ''),
      };
    } catch {
      return { daysOffset: 0, reason: '', appliedBy: '', appliedAt: '' };
    }
  });
  const [companySettingsLoaded, setCompanySettingsLoaded] = useState(false);
  const [companySettingsLastSyncAt, setCompanySettingsLastSyncAt] = useState(0);
  const lastBoardNoteSoundAtRef = useRef(0);
  const adminAuthResolverRef = useRef(null);
  const [adminAuthModal, setAdminAuthModal] = useState({
    open: false,
    title: 'Autorizacion',
    message: 'Se necesita clave del administrador para avanzar.',
    value: '',
  });

  const getActiveTabStorageKey = (userId) => `${ACTIVE_TAB_STORAGE_KEY}_${userId}`;
  const getQuickTrayStorageKey = (userId) => `${QUICK_TRAY_OPEN_STORAGE_KEY}_${userId || 'anon'}`;
  const getQuickLookupHistoryStorageKey = (userId) => `${QUICK_LOOKUP_HISTORY_STORAGE_KEY}_${userId || 'anon'}`;
  const getQuickPanelPositionStorageKey = (userId) => `fact_quick_panel_pos_${userId || 'anon'}`;
  const getPromoPanelPositionStorageKey = (userId) => `fact_promo_panel_pos_${userId || 'anon'}`;
  const getOpenShiftStorageKey = (userId) => `${OPEN_SHIFT_STORAGE_KEY}_${userId || 'anon'}`;
  const getProductsCacheStorageKey = (userId) => `${PRODUCTS_CACHE_STORAGE_KEY}_${userId || 'anon'}`;
  const getClientsCacheStorageKey = (userId) => `${CLIENTS_CACHE_STORAGE_KEY}_${userId || 'anon'}`;
  const getSoundSettingsStorageKey = (userId) => `${SOUND_SETTINGS_STORAGE_KEY}_${userId || 'anon'}`;
  const getCompanyPromotionsStorageKey = (cid) => `fact_company_promotions_${cid || 'local'}`;
  const getInvoiceComposerStorageKey = (userId) => `${INVOICE_COMPOSER_STORAGE_KEY}_${userId || 'anon'}`;

  const saveOpenShift = (userId, openShift) => {
    if (!userId || !openShift) return;
    localStorage.setItem(getOpenShiftStorageKey(userId), JSON.stringify(openShift));
    localStorage.setItem(
      OPEN_SHIFT_STORAGE_KEY,
      JSON.stringify({
        userId,
        shift: openShift
      })
    );
  };

  const clearOpenShift = (userId = currentUser?.id) => {
    if (userId) {
      localStorage.removeItem(getOpenShiftStorageKey(userId));
    }
    localStorage.removeItem(OPEN_SHIFT_STORAGE_KEY);
  };

  const hydrateOpenShift = (rawShift) => normalizeStoredOpenShift(rawShift);

  const isValidOpenShift = (candidateShift) => {
    const startMs = new Date(candidateShift?.startTime).getTime();
    const ageMs = Date.now() - startMs;
    const isValidStart = Number.isFinite(startMs) && !Number.isNaN(startMs);
    const isStaleOpenShift = isValidStart && ageMs > MAX_OPEN_SHIFT_MS;
    return {
      isValidStart,
      isStaleOpenShift
    };
  };

  const restoreOpenShift = async (userId) => {
    try {
      const perUserRaw = localStorage.getItem(getOpenShiftStorageKey(userId));
      if (perUserRaw) {
        const localShift = hydrateOpenShift(JSON.parse(perUserRaw));
        const { isValidStart, isStaleOpenShift } = isValidOpenShift(localShift);

        if (isValidStart && !isStaleOpenShift) {
          setShift(localShift);
          return;
        }

        localStorage.removeItem(getOpenShiftStorageKey(userId));
      }

      const raw = localStorage.getItem(OPEN_SHIFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId === userId && parsed?.shift) {
          const localShift = hydrateOpenShift(parsed.shift);
          const { isValidStart, isStaleOpenShift } = isValidOpenShift(localShift);

          if (isValidStart && !isStaleOpenShift) {
            setShift(localShift);
            return;
          }

          clearOpenShift(userId);
          if (isStaleOpenShift) {
            console.warn(`Jornada abierta local descartada por antiguedad (${MAX_OPEN_SHIFT_HOURS}h max).`);
          }
        }
      }

      const cloudShift = hydrateOpenShift(await dataService.getOpenShiftForUser(userId));
      if (!cloudShift) {
        setShift(null);
        clearOpenShift(userId);
        return;
      }

      const { isValidStart, isStaleOpenShift } = isValidOpenShift(cloudShift);
      if (!isValidStart || isStaleOpenShift) {
        if (isStaleOpenShift) {
          console.warn(`Jornada abierta en nube descartada por antiguedad (${MAX_OPEN_SHIFT_HOURS}h max).`);
        }
        setShift(null);
        clearOpenShift(userId);
        return;
      }

      setShift(cloudShift);
      saveOpenShift(userId, cloudShift);
    } catch (e) {
      console.error('Error restaurando jornada abierta:', e);
    }
  };

  const restoreActiveTab = (userId) => {
    try {
      const saved = localStorage.getItem(getActiveTabStorageKey(userId));
      if (saved) setActiveTab(saved);
    } catch (e) {
      console.error('Error restaurando tab activa:', e);
    }
  };

  const restoreQuickTrayState = (userId) => {
    try {
      const saved = localStorage.getItem(getQuickTrayStorageKey(userId));
      if (saved !== null) setQuickTrayOpen(saved === '1');
    } catch (e) {
      console.error('Error restaurando estado de consulta rapida:', e);
    }
  };

  const restoreQuickLookupHistory = (userId) => {
    try {
      const raw = localStorage.getItem(getQuickLookupHistoryStorageKey(userId));
      if (!raw) {
        setQuickLookupHistory([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setQuickLookupHistory(Array.isArray(parsed) ? parsed.slice(0, 8) : []);
    } catch (e) {
      console.error('Error restaurando historial de consulta rapida:', e);
      setQuickLookupHistory([]);
    }
  };

  const restoreSoundSettings = (userId) => {
    try {
      const raw = localStorage.getItem(getSoundSettingsStorageKey(userId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.enabled === 'boolean') setSoundEnabled(parsed.enabled);
      const vol = Number(parsed?.volume);
      if (Number.isFinite(vol)) setSoundVolume(vol);
      const preset = String(parsed?.preset || '').trim();
      if (preset) setSoundPreset(preset);
    } catch (e) {
      console.error('Error restaurando configuracion de sonidos:', e);
    }
  };

  const restoreFloatingPanelPosition = (userId, type) => {
    const storageKey = type === 'quick'
      ? getQuickPanelPositionStorageKey(userId)
      : getPromoPanelPositionStorageKey(userId);
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        if (type === 'quick') setQuickPanelPosition(null);
        else setPromoPanelPosition(null);
        return;
      }

      const parsed = JSON.parse(raw);
      const normalized = {
        x: Number(parsed?.x || 0),
        y: Number(parsed?.y || 0),
      };
      if (!Number.isFinite(normalized.x) || !Number.isFinite(normalized.y)) return;

      if (type === 'quick') setQuickPanelPosition(normalized);
      else setPromoPanelPosition(normalized);
    } catch (e) {
      console.error(`Error restaurando posicion panel ${type}:`, e);
    }
  };

  const restoreCloudCache = (userId) => {
    try {
      const rawProducts = localStorage.getItem(getProductsCacheStorageKey(userId));
      if (rawProducts) {
        const parsedProducts = JSON.parse(rawProducts);
        if (Array.isArray(parsedProducts)) setProducts(parsedProducts);
      }
    } catch (e) {
      console.error('Error restaurando cache local de productos:', e);
    }

    try {
      const rawClients = localStorage.getItem(getClientsCacheStorageKey(userId));
      if (rawClients) {
        const parsedClients = JSON.parse(rawClients);
        if (Array.isArray(parsedClients)) setRegisteredClients(parsedClients);
      }
    } catch (e) {
      console.error('Error restaurando cache local de clientes:', e);
    }
  };

  const clearInvoiceComposerCache = (userId = currentUser?.id) => {
    if (!userId) return;
    try {
      localStorage.removeItem(getInvoiceComposerStorageKey(userId));
    } catch (e) {
      console.error('Error limpiando borrador automatico de facturacion:', e);
    }
  };

  const restoreInvoiceComposer = (userId) => {
    if (!userId) return;

    try {
      const raw = localStorage.getItem(getInvoiceComposerStorageKey(userId));
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const savedItems = Array.isArray(parsed?.items) ? parsed.items : [];
      const savedClientName = String(parsed?.clientName || '').trim();
      const savedSelectedClient = parsed?.selectedClient && typeof parsed.selectedClient === 'object'
        ? normalizeClientDraft(parsed.selectedClient)
        : null;
      const savedDeliveryFee = Number(parsed?.deliveryFee || 0);
      const savedPaymentMode = String(parsed?.paymentMode || '').trim();
      const savedPaymentRef = String(parsed?.paymentRef || '');
      const savedSummaryState = parsed?.summaryState && typeof parsed.summaryState === 'object'
        ? parsed.summaryState
        : null;

      const hasComposerState = (
        savedItems.length > 0 ||
        savedClientName ||
        savedSelectedClient ||
        savedDeliveryFee > 0 ||
        savedPaymentRef ||
        Number(savedSummaryState?.extraDiscount || 0) > 0 ||
        !!savedSummaryState?.isMixed
      );

      if (!hasComposerState) return;

      setClientName(savedClientName || CLIENT_OCASIONAL);
      setSelectedClient(savedSelectedClient);
      setItems(savedItems);
      setDeliveryFee(savedDeliveryFee);
      setPaymentMode(savedPaymentMode || PAYMENT_MODES.CONTADO);
      setPaymentRef(savedPaymentRef);
      setComposerExtraDiscount(Number(savedSummaryState?.extraDiscount || 0));
      setLoadedDraftState(savedSummaryState ? {
        ...savedSummaryState,
        restoreKey: `autosave-${userId}-${parsed?.savedAt || Date.now()}`,
      } : null);
      setInvoiceComposerMeta(savedSummaryState);
    } catch (e) {
      console.error('Error restaurando borrador automatico de facturacion:', e);
    }
  };

  // Initialize EmailJS and Auth on app load
  useEffect(() => {
    initEmailJS();
    checkAuthStatus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setHeaderNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setAppSoundEnabled(!!soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    setAppSoundVolume(soundVolume);
  }, [soundVolume]);

  useEffect(() => {
    setAppNotifyPreset(soundPreset);
  }, [soundPreset]);

  // Check authentication status
  const checkAuthStatus = async () => {
    try {
      const { user } = await getCurrentUser();
      if (user) {
        await applyUserWithProfile(user);
      }
    } catch (err) {
      console.error('Error checking auth:', err);
    } finally {
      setLoading(false);
    }
  }

  const applyUserWithProfile = async (user) => {
    const sameUserSession =
      !!user?.id &&
      !!currentUser?.id &&
      String(user.id) === String(currentUser.id) &&
      isLoggedIn &&
      profileLoaded &&
      shiftRestored;

    if (sameUserSession) {
      return;
    }

    setShiftRestored(false);
    try {
      const { data: profile, error: profileError } = await getProfile(user.id);
      if (profileError) throw new Error(profileError);
      const name = profile?.display_name || user.email || 'Sistema';
      const normalizedRole = normalizeRole(profile?.role);
      setIsLoggedIn(true);
      setProfileLoaded(true);
      setCurrentUser({
        ...user,
        name,
        role: normalizedRole,
        permissions: normalizePermissionsForRole(normalizedRole, profile?.permissions)
      });
      setIsAdminAuth(normalizedRole === 'Administrador');
      await restoreOpenShift(user.id);
      restoreActiveTab(user.id);
      restoreQuickTrayState(user.id);
      restoreQuickLookupHistory(user.id);
      restoreSoundSettings(user.id);
      restoreFloatingPanelPosition(user.id, 'quick');
      restoreFloatingPanelPosition(user.id, 'promo');
      restoreCloudCache(user.id);
      restoreInvoiceComposer(user.id);
    } catch (err) {
      console.error('Error loading profile:', err);
      setIsLoggedIn(true);
      setProfileLoaded(true);
      setCurrentUser({
        ...user,
        name: user.email || 'Sistema',
        role: 'Administrador',
        permissions: { ...DEFAULT_PERMISSIONS }
      });
      setIsAdminAuth(true);
      await restoreOpenShift(user.id);
      restoreActiveTab(user.id);
      restoreQuickTrayState(user.id);
      restoreQuickLookupHistory(user.id);
      restoreSoundSettings(user.id);
      restoreFloatingPanelPosition(user.id, 'quick');
      restoreFloatingPanelPosition(user.id, 'promo');
      restoreCloudCache(user.id);
      restoreInvoiceComposer(user.id);
    } finally {
      setShiftRestored(true);
    }
  };

  // Keep current role/permissions in sync with realtime profile updates.
  useEffect(() => {
    if (!currentUser?.id || !liveProfile) return;

    setCurrentUser((prev) => {
      if (!prev || prev.id !== currentUser.id) return prev;

      const nextName = liveProfile.display_name || prev.email || prev.name || 'Sistema';
      const nextRole = normalizeRole(liveProfile.role);
      const nextPermissions = normalizePermissionsForRole(nextRole, liveProfile.permissions);

      if (
        prev.name === nextName &&
        prev.role === nextRole &&
        prev.permissions === nextPermissions
      ) {
        return prev;
      }

      return {
        ...prev,
        name: nextName,
        role: nextRole,
        permissions: nextPermissions
      };
    });

    setIsAdminAuth(normalizeRole(liveProfile.role) === 'Administrador');
  }, [currentUser?.id, liveProfile]);

  const companyId = liveProfile?.company_id || null;

  useEffect(() => {
    if (!companyId) return;
    try {
      const raw = localStorage.getItem(getCompanyPromotionsStorageKey(companyId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setCompanyPromotions(parsed);
    } catch (e) {
      console.error('No se pudo cargar promociones locales:', e);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    try {
      localStorage.setItem(getCompanyPromotionsStorageKey(companyId), JSON.stringify(Array.isArray(companyPromotions) ? companyPromotions : []));
    } catch (e) {
      console.error('No se pudo guardar promociones locales:', e);
    }
  }, [companyId, companyPromotions]);

  const normalizeStringArray = (value, fallback = []) => {
    if (!Array.isArray(value)) return fallback;
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  };

  const loadCompanySettings = useCallback(async ({ silent = false } = {}) => {
    if (!companyId || !currentUser?.id) return;

    try {
      if (isAdminAuth) {
        await supabase
          .from('company_settings')
          .upsert({ company_id: companyId }, { onConflict: 'company_id', ignoreDuplicates: true });
      }

      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setCompanySettingsLoaded(true);
        return;
      }

      const nextPaymentMethods = normalizeStringArray(
        data.payment_methods,
        ['Efectivo', 'Credito', 'Transferencia', 'Tarjeta']
      );
      const nextCategories = normalizeStringArray(
        data.categories,
        ['General', 'Alimentos', 'Limpieza', 'Otros']
      );

      setPaymentMethods(nextPaymentMethods);
      setCategories(nextCategories);

      if (Array.isArray(data.promotions)) {
        setCompanyPromotions(data.promotions);
        try {
          localStorage.setItem(getCompanyPromotionsStorageKey(companyId), JSON.stringify(data.promotions));
        } catch (e) {
          console.error('No se pudo cachear promociones en localStorage:', e);
        }
      }

      const daysOffset = Number(data.operational_days_offset || 0);
      setOperationalDateSettings({
        daysOffset: Number.isFinite(daysOffset) ? Math.max(-30, Math.min(30, Math.trunc(daysOffset))) : 0,
        reason: String(data.operational_reason || ''),
        appliedBy: String(data.operational_applied_by || ''),
        appliedAt: String(data.operational_applied_at || ''),
      });

      setCompanySettingsLoaded(true);
      setCompanySettingsLastSyncAt(Date.now());
    } catch (err) {
      if (!silent) {
        console.error('No se pudo cargar company_settings:', err);
      }
      setCompanySettingsLoaded(true);
    }
  }, [companyId, currentUser?.id, isAdminAuth]);

  const saveCompanyPaymentMethods = useCallback(async (nextMethods) => {
    if (!companyId || !currentUser?.id) return false;
    if (!isAdminAuth) return false;

    const payload = {
      company_id: companyId,
      payment_methods: Array.isArray(nextMethods) ? nextMethods : [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('company_settings')
      .upsert(payload, { onConflict: 'company_id' });

    if (error) {
      console.error('No se pudo guardar metodos de pago:', error);
      return false;
    }

    setCompanySettingsLastSyncAt(Date.now());
    return true;
  }, [companyId, currentUser?.id, isAdminAuth]);

  const saveCompanyCategories = useCallback(async (nextCategories) => {
    if (!companyId || !currentUser?.id) return false;
    if (!isAdminAuth) return false;

    const payload = {
      company_id: companyId,
      categories: Array.isArray(nextCategories) ? nextCategories : [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('company_settings')
      .upsert(payload, { onConflict: 'company_id' });

    if (error) {
      console.error('No se pudo guardar categorias:', error);
      return false;
    }

    setCompanySettingsLastSyncAt(Date.now());
    return true;
  }, [companyId, currentUser?.id, isAdminAuth]);

  const saveCompanyPromotions = useCallback(async (nextPromotions) => {
    if (!companyId || !currentUser?.id) return false;
    if (!isAdminAuth) return false;

    const safePromotions = Array.isArray(nextPromotions) ? nextPromotions : [];
    setCompanyPromotions(safePromotions);
    try {
      localStorage.setItem(getCompanyPromotionsStorageKey(companyId), JSON.stringify(safePromotions));
    } catch (e) {
      console.error('No se pudo guardar promociones locales:', e);
    }

    const payload = {
      company_id: companyId,
      promotions: safePromotions,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('company_settings')
      .upsert(payload, { onConflict: 'company_id' });

    if (error) {
      console.error('No se pudo guardar promociones:', error);
      const msg = String(error?.message || '');
      if (msg.toLowerCase().includes('promotions') && msg.toLowerCase().includes('does not exist')) {
        alert('Falta la columna promotions en company_settings. Ejecute el SQL de migracion en Supabase (docs/company_settings.sql).');
      }
      return false;
    }

    setCompanySettingsLastSyncAt(Date.now());
    return true;
  }, [companyId, currentUser?.id, isAdminAuth]);

  const loadInventoryTransferRequests = useCallback(async ({ silent = false } = {}) => {
    if (!companyId || !currentUser?.id) return;

    try {
      const rows = await dataService.getInventoryTransferRequests(companyId);
      if (Array.isArray(rows)) {
        setInventoryTransferRequests(rows);
      }
    } catch (error) {
      if (!silent) {
        console.error('No se pudo cargar inventory_transfer_requests:', error);
      }
    }
  }, [companyId, currentUser?.id]);

  const loadCommercialNotes = useCallback(async ({ silent = false } = {}) => {
    if (!companyId || !currentUser?.id) return;

    try {
      const rows = await dataService.getCommercialNotes(companyId);
      if (Array.isArray(rows)) {
        setCommercialNotes(rows);
      }
    } catch (error) {
      if (!silent) {
        console.error('No se pudo cargar commercial_notes:', error);
      }
    }
  }, [companyId, currentUser?.id]);

  useEffect(() => {
    if (!companyId || !currentUser?.id) return;
    loadCompanySettings({ silent: true });
  }, [companyId, currentUser?.id, loadCompanySettings]);

  useEffect(() => {
    if (!companyId || !currentUser?.id) return;
    loadInventoryTransferRequests({ silent: true });
  }, [companyId, currentUser?.id, loadInventoryTransferRequests]);

  useEffect(() => {
    if (!companyId || !currentUser?.id) return;
    loadCommercialNotes({ silent: true });
  }, [companyId, currentUser?.id, loadCommercialNotes]);

  useEffect(() => {
    if (!companyId || !currentUser?.id) return;

    let channel;
    const setup = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(session?.access_token ?? '');

        channel = supabase
          .channel(`company_settings:${companyId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'company_settings',
              filter: `company_id=eq.${companyId}`,
            },
            () => {
              loadCompanySettings({ silent: true });
            }
          );

        channel.subscribe();
      } catch (err) {
        console.error('Realtime company_settings error:', err);
      }
    };

    void setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [companyId, currentUser?.id, loadCompanySettings]);

  // Subscribe to auth changes
  useEffect(() => {
    const subscription = onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;

      if (session?.user) {
        const now = Date.now();
        const duplicateEvent =
          lastAuthEventRef.current.event === event &&
          lastAuthEventRef.current.userId === session.user.id &&
          now - lastAuthEventRef.current.at < 4000;

        if (duplicateEvent) return;

        lastAuthEventRef.current = { event, userId: session.user.id, at: now };
        applyUserWithProfile(session.user);
      } else {
        setIsLoggedIn(false);
        setCurrentUser(null);
        setIsAdminAuth(false);
        setProfileLoaded(false);
        setShiftRestored(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [])

  useEffect(() => {
    if (!currentUser?.id || shift?.startTime) return undefined;

    const retryRestore = () => {
      restoreOpenShift(currentUser.id);
    };

    window.addEventListener('focus', retryRestore);
    return () => window.removeEventListener('focus', retryRestore);
  }, [currentUser?.id, shift?.startTime]);

  // Handle logout
  const handleLogout = async () => {
    const { error } = await signOut();
    if (!error) {
      setIsLoggedIn(false);
      setCurrentUser(null);
      setActiveTab('home');
      setShiftRestored(false);
    }
  }

  // Cash Management State
  const [cajaMayor, setCajaMayor] = useState(5000000);
  const [cajaMenor, setCajaMenor] = useState(200000);
  const [userCashBalances, setUserCashBalances] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_CASH_BALANCES_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const refreshCloudData = useCallback(async ({ showLoader = false, silent = false } = {}) => {
    try {
      if (showLoader) setLoading(true);
      const [dbProducts, dbClients, dbSales, dbExpenses, dbExternalCashReceipts, dbPurchases, dbLogs, dbShiftHistory, dbUserCashBalances] = await Promise.all([
        dataService.getProducts(),
        dataService.getClients(),
        dataService.getInvoices(),
        dataService.getExpenses(),
        dataService.getExternalCashReceipts(),
        dataService.getPurchases(),
        dataService.getAuditLogs(),
        dataService.getShiftHistory(),
        dataService.getUserCashBalances()
      ]);

      const safeProducts = dedupeProducts(dbProducts || []);
      const safeClients = dedupeClients(dbClients || []);
      if (!pendingProductsSyncRef.current) {
        setProducts((prev) => {
          // Guard against transient empty refreshes that can wipe local state.
          if (silent && safeProducts.length === 0 && (prev || []).length > 0) {
            console.warn('Refresh de productos devolvio vacio; se conserva cache local para evitar perdida visual.');
            return prev;
          }
          return safeProducts;
        });
      }
      const bStock = {};
      const vStock = {};
      safeProducts.forEach(p => {
        bStock[p.id] = p.warehouse_stock || 0;
        vStock[p.id] = p.stock || 0;
      });
      setStock({ bodega: bStock, ventas: vStock });

      const userNameById = {};
      (dbLogs || []).forEach((log) => {
        const uid = String(log?.user_id || '').trim();
        const uname = String(log?.user_name || log?.user || '').trim();
        if (uid && uname && !userNameById[uid]) userNameById[uid] = uname;
      });
      if (currentUser?.id && currentUser?.name) {
        userNameById[String(currentUser.id)] = currentUser.name;
      }

      const enrichedSales = (dbSales || []).map((sale) => ({
        ...sale,
        user_name: sale?.user_name || sale?.user || userNameById[String(sale?.user_id || '')] || null,
      }));

      const enrichedExpenses = (dbExpenses || []).map((expense) => ({
        ...expense,
        user_name: expense?.user_name || expense?.user || userNameById[String(expense?.user_id || '')] || null,
      }));

      const enrichedExternalCashReceipts = (dbExternalCashReceipts || [])
        .map((receipt) => normalizeExternalCashReceiptRecord({
          ...receipt,
          user_name: receipt?.user_name || receipt?.user || userNameById[String(receipt?.user_id || '')] || null,
        }))
        .filter(Boolean);

      const enrichedPurchases = (dbPurchases || []).map((purchase) => ({
        ...purchase,
        user_name: purchase?.user_name || purchase?.user || userNameById[String(purchase?.user_id || '')] || null,
      }));

      const enrichedShiftHistory = (dbShiftHistory || []).map((shiftRow) => ({
        ...shiftRow,
        user_name: shiftRow?.user_name || shiftRow?.user || userNameById[String(shiftRow?.user_id || '')] || null,
        user: shiftRow?.user || shiftRow?.user_name || userNameById[String(shiftRow?.user_id || '')] || 'Sistema',
      }));

      if (!pendingClientsSyncRef.current) {
        setRegisteredClients((prev) => {
          const hasOtherCloudData = safeProducts.length > 0 || (dbSales || []).length > 0 || (dbLogs || []).length > 0 || (dbShiftHistory || []).length > 0;
          if (safeClients.length === 0 && (prev || []).length > 0 && hasOtherCloudData) {
            console.warn('Refresh de clientes devolvio vacio; se conserva cache local para evitar perdida visual.');
            return prev;
          }
          return safeClients;
        });
      }
      setSalesHistory(enrichedSales);
      setExpenses(enrichedExpenses);
      setExternalCashReceipts(enrichedExternalCashReceipts);
      setPurchases(enrichedPurchases);
      setAuditLogs(dbLogs || []);
      setShiftHistory(enrichedShiftHistory);
      if (dbUserCashBalances && typeof dbUserCashBalances === 'object') {
        setUserCashBalances(dbUserCashBalances);
        lastSyncedUserCashBalancesRef.current = JSON.stringify(dbUserCashBalances);
        userCashBalancesHydratedRef.current = true;
      }

      // Reconstruct carteras/debts from invoices
      const pendingSales = enrichedSales.filter(s => s.status === 'pendiente');
      setCartera(pendingSales);
    } catch (err) {
      console.error("Error cargando datos de Supabase:", err);
      if (!silent) {
        const message = err?.message || 'Error desconocido';
        alert(`No se pudieron cargar los datos de la nube.\n\nDetalle: ${message}`);
      }
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  // Initial Data Sync (only when authenticated user exists)
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.id) return;
    refreshCloudData({ showLoader: true });
  }, [isLoggedIn, currentUser?.id, refreshCloudData]);

  // Realtime sync for shared modules
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.id) return;

    const scheduleRealtimeRefresh = () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
      }
      realtimeRefreshTimeoutRef.current = setTimeout(() => {
        if (realtimeRefreshInFlightRef.current) {
          queuedRealtimeRefreshRef.current = true;
          return;
        }

        realtimeRefreshInFlightRef.current = true;
        refreshCloudData({ silent: true })
          .catch((err) => console.error('Error en refresh realtime:', err))
          .finally(() => {
            realtimeRefreshInFlightRef.current = false;
            if (queuedRealtimeRefreshRef.current) {
              queuedRealtimeRefreshRef.current = false;
              scheduleRealtimeRefresh();
            }
          });
      }, 1400);
    };

    const channel = supabase
      .channel(`fact-realtime-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_items' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_cash_receipts' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_history' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transfer_requests' }, () => {
        loadInventoryTransferRequests({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commercial_notes' }, () => {
        loadCommercialNotes({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_cash_balances' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, scheduleRealtimeRefresh)
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      queuedRealtimeRefreshRef.current = false;
      realtimeRefreshInFlightRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [isLoggedIn, currentUser?.id, refreshCloudData, loadInventoryTransferRequests, loadCommercialNotes]);

  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(getActiveTabStorageKey(currentUser.id), activeTab);
  }, [activeTab, currentUser?.id]);

  useEffect(() => {
    if (normalizeRole(currentUser?.role) === 'Cajero' && activeTab === 'compras') {
      setActiveTab('inventario');
    }
  }, [currentUser?.role, activeTab]);

  useEffect(() => {
    localStorage.setItem(USER_CASH_BALANCES_STORAGE_KEY, JSON.stringify(userCashBalances));
  }, [userCashBalances]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (!userCashBalancesHydratedRef.current) return;

    const serialized = JSON.stringify(userCashBalances || {});
    if (serialized === lastSyncedUserCashBalancesRef.current) return;

    const persistBalances = async () => {
      try {
        const currentCashKey = String(getCashUserKey(currentUser) || '').trim();
        const allEntries = Object.entries(userCashBalances || {});
        const entries = liveProfile?.company_id
          ? allEntries
          : allEntries.filter(([cashKey]) => String(cashKey || '').trim() === currentCashKey);

        for (const [cashKey, balance] of entries) {
          await dataService.saveUserCashBalance({
            cashKey,
            balance,
            userId: cashKey,
            userName: users.find((u) => String(getCashUserKey(u)) === String(cashKey))?.name || null,
            companyId: liveProfile?.company_id || null,
          });
        }
        lastSyncedUserCashBalancesRef.current = serialized;
      } catch (error) {
        console.error('Error sincronizando saldos de caja por usuario:', error);
      }
    };

    persistBalances();
  }, [currentUser, userCashBalances, users, liveProfile?.company_id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(getQuickTrayStorageKey(currentUser.id), quickTrayOpen ? '1' : '0');
  }, [quickTrayOpen, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    try {
      localStorage.setItem(
        getSoundSettingsStorageKey(currentUser.id),
        JSON.stringify({ enabled: !!soundEnabled, volume: Number(soundVolume || 0), preset: String(soundPreset || 'beep') })
      );
    } catch (e) {
      console.error('Error guardando configuracion de sonidos:', e);
    }
  }, [currentUser?.id, soundEnabled, soundVolume, soundPreset]);

  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(
      getQuickLookupHistoryStorageKey(currentUser.id),
      JSON.stringify(quickLookupHistory.slice(0, 8))
    );
  }, [quickLookupHistory, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || !quickPanelPosition) return;
    localStorage.setItem(getQuickPanelPositionStorageKey(currentUser.id), JSON.stringify(quickPanelPosition));
  }, [quickPanelPosition, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || !promoPanelPosition) return;
    localStorage.setItem(getPromoPanelPositionStorageKey(currentUser.id), JSON.stringify(promoPanelPosition));
  }, [promoPanelPosition, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(getProductsCacheStorageKey(currentUser.id), JSON.stringify(dedupeProducts(products || [])));
  }, [products, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(getClientsCacheStorageKey(currentUser.id), JSON.stringify(dedupeClients(registeredClients || [])));
  }, [registeredClients, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;

    const safeClientName = String(clientName || '').trim();
    const safePaymentRef = String(paymentRef || '').trim();
    const summaryState = invoiceComposerMeta && typeof invoiceComposerMeta === 'object'
      ? {
          extraDiscount: Number(invoiceComposerMeta.extraDiscount || 0),
          authNote: String(invoiceComposerMeta.authNote || ''),
          activeRemoteRequestId: String(invoiceComposerMeta.activeRemoteRequestId || ''),
          isMixed: !!invoiceComposerMeta.isMixed,
          mixedData: invoiceComposerMeta.mixedData || null,
          otherPaymentDetail: String(invoiceComposerMeta.otherPaymentDetail || ''),
        }
      : null;

    const hasComposerState = (
      (items || []).length > 0 ||
      safeClientName !== CLIENT_OCASIONAL ||
      !!selectedClient ||
      Number(deliveryFee || 0) > 0 ||
      safePaymentRef.length > 0 ||
      Number(summaryState?.extraDiscount || 0) > 0 ||
      !!summaryState?.isMixed
    );

    if (!hasComposerState) {
      clearInvoiceComposerCache(currentUser.id);
      return;
    }

    try {
      localStorage.setItem(getInvoiceComposerStorageKey(currentUser.id), JSON.stringify({
        savedAt: new Date().toISOString(),
        clientName: safeClientName || CLIENT_OCASIONAL,
        selectedClient: selectedClient ? normalizeClientDraft(selectedClient) : null,
        items: Array.isArray(items) ? items : [],
        deliveryFee: Number(deliveryFee || 0),
        paymentMode: String(paymentMode || PAYMENT_MODES.CONTADO),
        paymentRef: safePaymentRef,
        summaryState,
      }));
    } catch (e) {
      console.error('Error guardando borrador automatico de facturacion:', e);
    }
  }, [
    currentUser?.id,
    clientName,
    selectedClient,
    items,
    deliveryFee,
    paymentMode,
    paymentRef,
    invoiceComposerMeta,
  ]);

  useEffect(() => {
    localStorage.setItem(REMOTE_AUTH_REQUESTS_STORAGE_KEY, JSON.stringify(remoteAuthRequests.slice(0, 120)));
  }, [remoteAuthRequests]);

  useEffect(() => {
    localStorage.setItem(INVENTORY_TRANSFER_REQUESTS_STORAGE_KEY, JSON.stringify(inventoryTransferRequests.slice(0, 200)));
  }, [inventoryTransferRequests]);

  useEffect(() => {
    localStorage.setItem(COMMERCIAL_NOTES_STORAGE_KEY, JSON.stringify(commercialNotes.slice(0, 300)));
  }, [commercialNotes]);

  useEffect(() => {
    localStorage.setItem(INVOICE_DRAFTS_STORAGE_KEY, JSON.stringify((invoiceDrafts || []).slice(0, 120)));
  }, [invoiceDrafts]);

  useEffect(() => {
    const syncViewportMode = () => {
      setHomePanelsMovable(window.innerWidth > 768);
    };

    syncViewportMode();
    window.addEventListener('resize', syncViewportMode);
    return () => window.removeEventListener('resize', syncViewportMode);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = homePanelDragRef.current;
      if (!drag) return;

      const container = homeDashboardRef.current;
      const rect = container?.getBoundingClientRect();
      if (!rect) return;

      const panelSize = drag.type === 'quick'
        ? { width: quickTrayOpen ? 360 : 76, height: quickTrayOpen ? 320 : 120 }
        : { width: 390, height: 240 };

      const next = {
        x: Math.min(Math.max(12, event.clientX - rect.left - drag.offsetX), Math.max(12, rect.width - panelSize.width - 12)),
        y: Math.min(Math.max(12, event.clientY - rect.top - drag.offsetY), Math.max(12, rect.height - panelSize.height - 12)),
      };

      if (drag.type === 'quick') setQuickPanelPosition(next);
      else setPromoPanelPosition(next);
    };

    const handlePointerUp = () => {
      homePanelDragRef.current = null;
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [quickTrayOpen]);

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_SEEN_AT_STORAGE_KEY, String(Number(notificationsSeenAt || 0)));
  }, [notificationsSeenAt]);

  useEffect(() => {
    localStorage.setItem(BOARD_NOTES_SEEN_AT_STORAGE_KEY, String(Number(boardNotesSeenAt || 0)));
  }, [boardNotesSeenAt]);

  useEffect(() => {
    localStorage.setItem(OPERATIONAL_DATE_SETTINGS_STORAGE_KEY, JSON.stringify(operationalDateSettings));
  }, [operationalDateSettings]);

  useEffect(() => {
    const syncedFromCloud = buildRemoteAuthRequestsFromLogs(auditLogs || []);
    if (syncedFromCloud.length === 0) return;
    setRemoteAuthRequests((prev) => mergeRemoteAuthRequests(prev, syncedFromCloud));
  }, [auditLogs]);

  useEffect(() => {
    if (activeTab !== 'home' || !shift) return;

    const timer = setTimeout(() => {
      quickScanInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, [activeTab, shift, quickLookupResult]);

  useEffect(() => {
    if (activeTab !== 'home' || !shift) return;

    const isTypingTarget = (target) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
    };

    const handleGlobalQuickScanner = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target === quickScanInputRef.current) return;
      if (isTypingTarget(event.target)) return;

      const now = Date.now();
      if (now - quickScanLastKeyAtRef.current > 120) {
        quickScanBufferRef.current = '';
      }
      quickScanLastKeyAtRef.current = now;

      if (event.key === 'Enter') {
        const scanned = cleanScannedCode(quickScanBufferRef.current);
        quickScanBufferRef.current = '';
        if (scanned.length >= 4) {
          event.preventDefault();
          handleQuickPriceLookup(scanned);
        }
        return;
      }

      if (event.key.length === 1) {
        quickScanBufferRef.current += event.key;
        setQuickScanCode(quickScanBufferRef.current);
      }
    };

    window.addEventListener('keydown', handleGlobalQuickScanner, true);
    return () => window.removeEventListener('keydown', handleGlobalQuickScanner, true);
  }, [activeTab, shift, products]);

  const updateStockInDB = async (type, productId, newValue) => {
    const prod = products.find(p => String(p.id) === String(productId));
    if (!prod) return;
    try {
      const field = type === 'bodega' ? 'warehouse_stock' : 'stock';
      await dataService.updateProductStockById(prod.id, { [field]: Number(newValue) || 0 }, currentUser?.id);
    } catch (e) {
      console.error(`Sync ${type} error:`, e);
    }
  };

  const getCashUserKey = (user) => String(
    user?.id ||
    user?.username ||
    user?.email ||
    user?.name ||
    ''
  );

  const getUserCashBalance = (user) => {
    const key = getCashUserKey(user);
    return Number(userCashBalances[key] || 0);
  };

  const setUserCashBalance = (user, amount) => {
    const key = getCashUserKey(user);
    if (!key) return;
    const safeAmount = Math.max(0, Number(amount) || 0);
    setUserCashBalances((prev) => ({ ...prev, [key]: safeAmount }));
  };

  const adjustUserCashBalance = (user, delta) => {
    const key = getCashUserKey(user);
    if (!key) return;
    setUserCashBalances((prev) => {
      const current = Number(prev[key] || 0);
      const next = Math.max(0, current + (Number(delta) || 0));
      return { ...prev, [key]: next };
    });
  };

  const adjustUserCashBalanceByKey = (userKey, delta) => {
    const key = String(userKey || '').trim();
    if (!key) return;
    setUserCashBalances((prev) => {
      const current = Number(prev[key] || 0);
      const next = Math.max(0, current + (Number(delta) || 0));
      return { ...prev, [key]: next };
    });
  };

  const createInventoryTransferRequest = async ({ productId, quantity, targetUserId, targetUserKey, targetUserName }) => {
    const normalizedProductId = String(productId || '').trim();
    const normalizedTargetUserKey = String(targetUserKey || '').trim();
    const safeQuantity = Math.max(0, Math.trunc(Number(quantity) || 0));
    if (!normalizedProductId || safeQuantity <= 0 || !normalizedTargetUserKey) {
      throw new Error('Complete producto, cantidad y usuario receptor.');
    }

    const product = products.find((item) => String(item?.id || '') === normalizedProductId);
    if (!product) {
      throw new Error('No se encontro el producto seleccionado.');
    }

    const availableInWarehouse = Number(stock?.bodega?.[normalizedProductId] || 0);
    if (availableInWarehouse < safeQuantity) {
      throw new Error(`Stock insuficiente en bodega. Disponible: ${availableInWarehouse}.`);
    }

    const nowIso = new Date().toISOString();
    const request = {
      id: `inv-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyId: companyId || null,
      productId: normalizedProductId,
      productName: product?.name || 'Producto',
      quantity: safeQuantity,
      targetUserId: targetUserId || null,
      targetUserKey: normalizedTargetUserKey,
      targetUserName: targetUserName || normalizedTargetUserKey,
      status: 'PENDING',
      source: 'bodega',
      destination: 'ventas',
      createdAt: nowIso,
      createdBy: {
        id: currentUser?.id || null,
        name: currentUser?.name || currentUser?.email || 'Sistema'
      }
    };

    const nextWarehouseStock = availableInWarehouse - safeQuantity;

    try {
      setStock((prev) => ({
        ...prev,
        bodega: {
          ...prev.bodega,
          [normalizedProductId]: nextWarehouseStock
        }
      }));
      await updateStockInDB('bodega', normalizedProductId, nextWarehouseStock);

      setInventoryTransferRequests((prev) => [request, ...prev].slice(0, 200));
      const savedRows = await dataService.saveInventoryTransferRequest(request);
      if (Array.isArray(savedRows) && savedRows.length > 0) {
        setInventoryTransferRequests((prev) => {
          const others = prev.filter((item) => item.id !== request.id);
          return [savedRows[0], ...others].slice(0, 200);
        });
      }

      await addLog({
        module: 'Inventario',
        action: 'Solicitud traslado inventario',
        details: `${request.createdBy.name} envio ${safeQuantity} unidad(es) de ${request.productName} desde bodega para ${request.targetUserName}. Pendiente confirmacion del receptor.`
      });
      return request;
    } catch (error) {
      setStock((prev) => ({
        ...prev,
        bodega: {
          ...prev.bodega,
          [normalizedProductId]: availableInWarehouse
        }
      }));
      await updateStockInDB('bodega', normalizedProductId, availableInWarehouse);
      setInventoryTransferRequests((prev) => prev.filter((item) => item.id !== request.id));
      throw error;
    }
  };

  const resolveInventoryTransferRequest = async (requestId, decision) => {
    const normalizedDecision = String(decision || '').trim().toUpperCase();
    const targetRequest = (inventoryTransferRequests || []).find((request) => request?.id === requestId);
    if (!targetRequest || targetRequest.status !== 'PENDING') {
      throw new Error('La solicitud ya no esta disponible.');
    }

    const currentUserKey = String(getCashUserKey(currentUser) || '').trim();
    const requestTargetKey = String(targetRequest.targetUserKey || '').trim();
    const requestTargetId = String(targetRequest.targetUserId || '').trim();
    const isAdminUser = normalizeRole(currentUser?.role) === 'Administrador';
    if (!isAdminUser && currentUserKey !== requestTargetKey && String(currentUser?.id || '').trim() !== requestTargetId) {
      throw new Error('Solo el usuario receptor puede confirmar este traslado.');
    }

    const updatedRequest = {
      ...targetRequest,
      status: normalizedDecision,
      resolvedAt: new Date().toISOString(),
      resolvedBy: {
        id: currentUser?.id || null,
        name: currentUser?.name || currentUser?.email || 'Sistema'
      }
    };

    if (normalizedDecision !== 'CONFIRMED' && normalizedDecision !== 'REJECTED') {
      throw new Error('Decision invalida para el traslado.');
    }

    const currentSalesStock = Number(stock?.ventas?.[targetRequest.productId] || 0);
    const currentWarehouseStock = Number(stock?.bodega?.[targetRequest.productId] || 0);
    const nextSalesStock = currentSalesStock + Number(targetRequest.quantity || 0);
    const nextWarehouseStock = currentWarehouseStock + Number(targetRequest.quantity || 0);
    const resolvedByName = updatedRequest.resolvedBy.name;

    try {
      if (normalizedDecision === 'CONFIRMED') {
        setStock((prev) => ({
          ...prev,
          ventas: {
            ...prev.ventas,
            [targetRequest.productId]: nextSalesStock
          }
        }));
        await updateStockInDB('ventas', targetRequest.productId, nextSalesStock);
      } else {
        setStock((prev) => ({
          ...prev,
          bodega: {
            ...prev.bodega,
            [targetRequest.productId]: nextWarehouseStock
          }
        }));
        await updateStockInDB('bodega', targetRequest.productId, nextWarehouseStock);
      }

      setInventoryTransferRequests((prev) => prev.map((request) => (
        request?.id === requestId ? updatedRequest : request
      )));
      const savedRows = await dataService.saveInventoryTransferRequest(updatedRequest);
      if (Array.isArray(savedRows) && savedRows.length > 0) {
        setInventoryTransferRequests((prev) => prev.map((request) => (
          request?.id === requestId ? savedRows[0] : request
        )));
      }

      await addLog({
        module: 'Inventario',
        action: normalizedDecision === 'CONFIRMED' ? 'Traslado inventario confirmado' : 'Traslado inventario rechazado',
        details: normalizedDecision === 'CONFIRMED'
          ? `${resolvedByName} confirmo ${Number(targetRequest.quantity || 0)} unidad(es) de ${targetRequest.productName}. El inventario quedo recibido en ventas para ${targetRequest.targetUserName}.`
          : `${resolvedByName} rechazo ${Number(targetRequest.quantity || 0)} unidad(es) de ${targetRequest.productName}. El stock regreso a bodega.`
      });
    } catch (error) {
      if (normalizedDecision === 'CONFIRMED') {
        setStock((prev) => ({
          ...prev,
          ventas: {
            ...prev.ventas,
            [targetRequest.productId]: currentSalesStock
          }
        }));
        await updateStockInDB('ventas', targetRequest.productId, currentSalesStock);
      } else {
        setStock((prev) => ({
          ...prev,
          bodega: {
            ...prev.bodega,
            [targetRequest.productId]: currentWarehouseStock
          }
        }));
        await updateStockInDB('bodega', targetRequest.productId, currentWarehouseStock);
      }
      setInventoryTransferRequests((prev) => prev.map((request) => (
        request?.id === requestId ? targetRequest : request
      )));
      throw error;
    }
  };

  const saveCommercialNote = async (note) => {
    const record = {
      ...note,
      companyId: companyId || null,
      createdBy: {
        id: currentUser?.id || null,
        name: currentUser?.name || currentUser?.email || 'Sistema'
      }
    };

    setCommercialNotes((prev) => [record, ...prev].slice(0, 300));
    try {
      const savedRows = await dataService.saveCommercialNote(record);
      if (Array.isArray(savedRows) && savedRows.length > 0) {
        setCommercialNotes((prev) => {
          const others = prev.filter((item) => item.id !== record.id);
          return [savedRows[0], ...others].slice(0, 300);
        });
        return savedRows[0];
      }
      return record;
    } catch (error) {
      setCommercialNotes((prev) => prev.filter((item) => item.id !== record.id));
      throw error;
    }
  };

  const getOperationalNow = useCallback(() => {
    const offset = Number(operationalDateSettings?.daysOffset || 0);
    const normalizedOffset = Number.isFinite(offset) ? Math.max(-30, Math.min(30, Math.trunc(offset))) : 0;
    const baseNow = new Date(Date.now() + normalizedOffset * 24 * 60 * 60 * 1000);
    const shiftStart = shift?.startTime ? new Date(shift.startTime) : null;
    if (shiftStart && !Number.isNaN(shiftStart.getTime()) && baseNow.getTime() < shiftStart.getTime()) {
      return shiftStart;
    }
    return baseNow;
  }, [operationalDateSettings?.daysOffset, shift?.startTime]);

  const getOperationalNowIso = useCallback(() => getOperationalNow().toISOString(), [getOperationalNow]);

  const adminApiBase = String(import.meta.env?.VITE_ADMIN_API_BASE_URL || '').trim();
  const adminSystemUrl = `${adminApiBase}/api/admin-system`;

  const runAdminSystemAction = async (action) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Sesion no valida. Inicia sesion nuevamente.');

    const res = await fetch(adminSystemUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo ejecutar la accion.');
    }
    return data;
  };

  const onResetSystem = async () => {
    if (!confirm("ESTA SEGURO?\n\nEsta accion borrara TODO el sistema de la empresa (ventas, clientes, inventario, gastos, compras, cierres, bitacora) para TODOS los usuarios.")) {
      return;
    }

    const confirm2 = prompt('Escriba BORRAR para confirmar:');
    if (String(confirm2 || '').trim().toUpperCase() !== 'BORRAR') return;

    try {
      await runAdminSystemAction('reset');
      setSalesHistory([]);
      setCartera([]);
      setRegisteredClients([]);
      setAuditLogs([]);
      setShiftHistory([]);
      setStock({ bodega: {}, ventas: {} });
      setUserCashBalances({});
      alert("Sistema reiniciado (global) a valores de fabrica.");
      window.location.reload();
    } catch (e) {
      alert(e?.message || 'No se pudo borrar el sistema.');
    }
  };

  const onSaveSystem = async () => {
    try {
      const exported = await runAdminSystemAction('export');
      const payload = exported?.data || { exportedAt: new Date().toISOString() };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `respaldo_sistema_empresa_${new Date().getTime()}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (e) {
      alert(e?.message || 'No se pudo generar el respaldo.');
    }
  };

  const addLog = async (logEntry) => {
    const fullLog = {
      ...logEntry,
      user_id: currentUser?.id || null,
      timestamp: getOperationalNowIso(),
      user_name: currentUser?.name || 'Sistema'
    };
    setAuditLogs(prev => [fullLog, ...prev]);
    if (!currentUser?.id) return;
    try {
      await dataService.saveAuditLog(fullLog);
    } catch (err) {
      console.error("Error guardando bitacora en la nube:", err);
    }
  };

  const onCreateRemoteAuthRequest = async (payload) => {
    const requestId = `AR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const requestRecord = {
      id: requestId,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      requestedBy: {
        id: currentUser?.id || null,
        name: currentUser?.name || currentUser?.email || 'Usuario',
        role: normalizeRole(currentUser?.role)
      },
      module: payload?.module || 'Facturacion',
      requestCategory: payload?.requestCategory || 'AUTHORIZATION',
      ...payload
    };

    setRemoteAuthRequests((prev) => [requestRecord, ...prev].slice(0, 120));
    addLog({
      module: 'Autorizaciones',
      action: 'Solicitud creada',
      details: `${AUTH_REQUEST_LOG_PREFIX}${JSON.stringify({
        type: 'CREATED',
        requestId,
        createdAt: requestRecord.createdAt,
        requestedBy: requestRecord.requestedBy,
        module: requestRecord.module,
        requestCategory: requestRecord.requestCategory,
        reasonType: requestRecord.reasonType,
        reasonLabel: requestRecord.reasonLabel,
        note: requestRecord.note || '',
        clientName: requestRecord.clientName || '',
        total: Number(requestRecord.total || 0),
        paymentMode: requestRecord.paymentMode || '',
        attachments: Array.isArray(requestRecord.attachments) ? requestRecord.attachments : [],
        inventoryRequest: requestRecord.inventoryRequest || null,
      })}`
    });

    return requestId;
  };

  const onResolveRemoteAuthRequest = (requestId, decision) => {
    if (!requestId || !['APPROVED', 'REJECTED'].includes(decision)) return;
    const targetRequest = (remoteAuthRequests || []).find((req) => req.id === requestId);
    const resolvedBy = {
      id: currentUser?.id || null,
      name: currentUser?.name || currentUser?.email || 'Usuario',
      role: normalizeRole(currentUser?.role)
    };

    if (
      decision === 'APPROVED' &&
      targetRequest?.module === 'Inventario' &&
      targetRequest?.inventoryRequest?.productId
    ) {
      const productId = targetRequest.inventoryRequest.productId;
      const productName = targetRequest?.inventoryRequest?.productName || products.find((p) => String(p?.id) === String(productId))?.name || 'Producto';
      const qty = Math.max(0, Number(targetRequest.inventoryRequest.quantity || 0));
      const available = Number(stock?.bodega?.[productId] || 0);
      if (qty <= 0 || available < qty) {
        alert('No se puede aprobar la solicitud: el stock de bodega ya no es suficiente.');
        return;
      }

      const currentVentas = Number(stock?.ventas?.[productId] || 0);
      const nextBodega = Math.max(0, available - qty);
      const nextVentas = currentVentas + qty;

      setStock((prev) => ({
        ...prev,
        bodega: {
          ...prev.bodega,
          [productId]: nextBodega,
        },
        ventas: {
          ...prev.ventas,
          [productId]: nextVentas,
        }
      }));
      Promise.all([
        updateStockInDB('bodega', productId, nextBodega),
        updateStockInDB('ventas', productId, nextVentas)
      ]).catch((error) => {
        console.error('Error aprobando solicitud de inventario:', error);
        alert(`La solicitud se marco, pero no se pudo sincronizar inventario.\n\nDetalle: ${error?.message || 'Error desconocido'}`);
      });

      addLog({
        module: 'Inventario',
        action: 'Entrada aprobada desde bodega',
        details: `${resolvedBy.name || 'Administrador'} autorizo ${qty} unidades de ${productName} para ventas. Bodega: ${available} -> ${nextBodega}. Ventas: ${currentVentas} -> ${nextVentas}. Solicitud: ${requestId}. Pedido por: ${targetRequest?.requestedBy?.name || 'Usuario'}.`
      });
    } else if (
      decision === 'REJECTED' &&
      targetRequest?.module === 'Inventario' &&
      targetRequest?.inventoryRequest?.productId
    ) {
      const productName = targetRequest?.inventoryRequest?.productName || 'Producto';
      const qty = Math.max(0, Number(targetRequest.inventoryRequest.quantity || 0));
      addLog({
        module: 'Inventario',
        action: 'Entrada rechazada desde bodega',
        details: `${resolvedBy.name || 'Administrador'} rechazo la entrada de ${qty} unidades de ${productName}. Solicitud: ${requestId}. Pedido por: ${targetRequest?.requestedBy?.name || 'Usuario'}.`
      });
    }

    setRemoteAuthRequests((prev) => prev.map((req) => {
      if (req.id !== requestId || req.status !== 'PENDING') return req;
      return {
        ...req,
        status: decision,
        resolvedAt: new Date().toISOString(),
        resolvedBy
      };
    }));

    addLog({
      module: 'Autorizaciones',
      action: decision === 'APPROVED' ? 'Solicitud aprobada' : 'Solicitud rechazada',
      details: `${AUTH_REQUEST_LOG_PREFIX}${JSON.stringify({
        type: 'RESOLVED',
        requestId,
        decision,
        resolvedAt: new Date().toISOString(),
        resolvedBy
      })}`
    });
  };

  const onCreateBoardNote = async (input) => {
    const cleanText = String(input?.text || '').trim();
    const attachments = Array.isArray(input?.attachments) ? input.attachments.slice(0, 2) : [];
    if (!cleanText && attachments.length === 0) return false;
    const payload = {
      id: `BN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      text: cleanText,
      attachments,
      createdAt: new Date().toISOString(),
      author: currentUser?.name || currentUser?.email || 'Usuario'
    };

    try {
      await addLog({
        module: 'Pizarra',
        action: 'Nota',
        details: `${BOARD_NOTE_LOG_PREFIX}${JSON.stringify(payload)}`
      });
      return true;
    } catch (e) {
      console.error('No se pudo guardar nota en pizarra:', e);
      alert('No se pudo guardar la nota en la nube.');
      return false;
    }
  };

  const onApplyOperationalDateOffset = async ({ daysOffset = 0, reason = '' } = {}) => {
    const normalizedOffset = Math.max(-30, Math.min(30, Math.trunc(Number(daysOffset) || 0)));
    const cleanReason = String(reason || '').trim();

    if (normalizedOffset !== 0 && cleanReason.length < 10) {
      alert('Debe escribir un motivo claro (minimo 10 caracteres).');
      return false;
    }

    if (!isAdminAuth) {
      alert('Solo un Administrador puede ajustar la fecha operativa para toda la empresa.');
      return false;
    }

    const nextSettings = {
      daysOffset: normalizedOffset,
      reason: normalizedOffset === 0 ? '' : cleanReason,
      appliedBy: currentUser?.name || currentUser?.email || 'Sistema',
      appliedAt: new Date().toISOString(),
    };

    setOperationalDateSettings(nextSettings);

    if (companyId && currentUser?.id) {
      try {
        const payload = {
          company_id: companyId,
          operational_days_offset: normalizedOffset,
          operational_reason: normalizedOffset === 0 ? null : cleanReason,
          operational_applied_by: normalizedOffset === 0 ? null : currentUser.id,
          operational_applied_at: normalizedOffset === 0 ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('company_settings')
          .upsert(payload, { onConflict: 'company_id' });

        if (error) throw error;

        setCompanySettingsLastSyncAt(Date.now());
      } catch (e) {
        console.error('No se pudo guardar fecha operativa global:', e);
        alert('No se pudo guardar el ajuste global en la nube.');
        return false;
      }
    }

    addLog({
      module: 'Configuracion',
      action: normalizedOffset === 0 ? 'Fecha operativa restablecida' : 'Fecha operativa ajustada',
      details: normalizedOffset === 0
        ? 'Se restablecio la fecha operativa al dia real del sistema.'
        : `Offset aplicado: ${normalizedOffset} dia(s). Motivo: ${cleanReason}`,
    });

    return true;
  };

  const onApplyUserShiftCloseOverride = async ({ userId = '', daysOffset = 0, reason = '' } = {}) => {
    const targetUserId = String(userId || '').trim();
    const normalizedOffset = Math.max(-30, Math.min(30, Math.trunc(Number(daysOffset) || 0)));
    const cleanReason = String(reason || '').trim();

    if (!targetUserId) {
      alert('Seleccione el usuario al que se le aplicara el ajuste.');
      return false;
    }

    if (cleanReason.length < 10) {
      alert('Debe escribir un motivo claro (minimo 10 caracteres).');
      return false;
    }

    if (!isAdminAuth) {
      alert('Solo un Administrador puede ajustar la reapertura de jornada por usuario.');
      return false;
    }

    const targetUser = (users || []).find((user) => String(user?.id || '') === targetUserId);
    const effectiveDate = new Date();
    effectiveDate.setDate(effectiveDate.getDate() + normalizedOffset);
    const effectiveDateKey = effectiveDate.toISOString().slice(0, 10);

    const closeMap = readLastShiftCloseByUser();
    closeMap[targetUserId] = effectiveDateKey;
    writeLastShiftCloseByUser(closeMap);

    await addLog({
      module: 'Jornada',
      action: 'Retroceder Dia Usuario',
      details: `${SHIFT_CLOSE_OVERRIDE_LOG_PREFIX}${JSON.stringify({
        targetUserId,
        targetUserName: targetUser?.name || targetUser?.username || 'Usuario',
        appliedById: currentUser?.id || null,
        appliedByName: currentUser?.name || currentUser?.email || 'Sistema',
        daysOffset: normalizedOffset,
        effectiveDateKey,
        reason: cleanReason,
        appliedAt: new Date().toISOString(),
      })}`
    });

    return true;
  };

  const resetInvoiceComposer = () => {
    setItems([]);
    setClientName(CLIENT_OCASIONAL);
    setSelectedClient(null);
    setDeliveryFee(0);
    setComposerExtraDiscount(0);
    setPaymentMode(PAYMENT_MODES.CONTADO);
    setPaymentRef('');
    setLoadedDraftState(null);
    setInvoiceComposerMeta(null);
    clearInvoiceComposerCache();
  };

  const onSaveInvoiceDraft = async (draftExtra = {}) => {
    if ((items || []).length === 0) {
      alert('No hay productos para guardar en borrador.');
      return;
    }

    const draftTotals = computeInvoiceTotals({
      items,
      deliveryFee,
      selectedClientDiscountPercent: Number(selectedClient?.discount || 0),
      extraDiscount: Number(draftExtra?.extraDiscount || 0),
      promotions: companyPromotions,
      now: getOperationalNow(),
    });

    const draft = {
      id: `DF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      savedAt: getOperationalNowIso(),
      savedBy: { id: currentUser?.id || null, name: currentUser?.name || 'Usuario' },
      clientName,
      clientDoc: selectedClient?.document || 'N/A',
      selectedClient,
      items,
      subtotal,
      deliveryFee,
      autoDiscountPercent: draftTotals.automaticDiscountPercent,
      autoDiscountAmount: draftTotals.automaticDiscountAmount,
      promoDiscountAmount: draftTotals.promoDiscountAmount,
      promotion: draftTotals.promotion,
      totalDiscount: draftTotals.totalDiscount,
      total: draftTotals.total,
      paymentMode,
      paymentRef,
      ...draftExtra,
    };

    setInvoiceDrafts((prev) => [draft, ...prev].slice(0, 120));
    addLog({
      module: 'Facturacion',
      action: 'Guardar borrador',
      details: `Borrador ${draft.id} guardado por ${draft.savedBy.name}`
    });
    resetInvoiceComposer();
    alert('Factura guardada en borrador.');
  };

  const onLoadInvoiceDraft = (draftId) => {
    const draft = (invoiceDrafts || []).find((d) => d.id === draftId);
    if (!draft) return;

    setClientName(draft.clientName || CLIENT_OCASIONAL);
    const draftDoc = String(draft?.selectedClient?.document || draft?.clientDoc || '').trim();
    const matchedClient = (registeredClients || []).find((c) => String(c?.document || '').trim() === draftDoc) || draft.selectedClient || null;
    setSelectedClient(matchedClient);
    setItems(Array.isArray(draft.items) ? draft.items : []);
    setDeliveryFee(Number(draft.deliveryFee || 0));
    setPaymentMode(draft.paymentMode || PAYMENT_MODES.CONTADO);
    setPaymentRef(draft.paymentRef || '');
    setLoadedDraftState({
      draftId: draft.id,
      extraDiscount: Number(draft.extraDiscount || 0),
      authNote: String(draft.authNote || ''),
      activeRemoteRequestId: String(draft.authRequestId || ''),
      isMixed: !!draft.mixedData,
      mixedData: draft.mixedData || null,
      otherPaymentDetail: String(draft.otherPaymentDetail || ''),
    });
    setInvoiceComposerMeta({
      extraDiscount: Number(draft.extraDiscount || 0),
      authNote: String(draft.authNote || ''),
      activeRemoteRequestId: String(draft.authRequestId || ''),
      isMixed: !!draft.mixedData,
      mixedData: draft.mixedData || null,
      otherPaymentDetail: String(draft.otherPaymentDetail || ''),
    });
    setActiveTab('facturacion');

    setInvoiceDrafts((prev) => prev.filter((d) => d.id !== draftId));
    addLog({
      module: 'Facturacion',
      action: 'Cargar borrador',
      details: `Borrador ${draftId} cargado por ${currentUser?.name || 'Usuario'}`
    });
  };

  const onDeleteInvoiceDraft = (draftId) => {
    if (!draftId) return;
    setInvoiceDrafts((prev) => prev.filter((d) => d.id !== draftId));
    addLog({
      module: 'Facturacion',
      action: 'Eliminar borrador',
      details: `Borrador ${draftId} eliminado por ${currentUser?.name || 'Usuario'}`
    });
  };

  const remoteAuthDecisionByRequestId = remoteAuthRequests.reduce((acc, req) => {
    if (req?.id && (req.status === 'APPROVED' || req.status === 'REJECTED')) {
      acc[req.id] = req.status;
    }
    return acc;
  }, {});

  const remoteAuthRequestById = remoteAuthRequests.reduce((acc, req) => {
    if (req?.id) acc[req.id] = req;
    return acc;
  }, {});

  const boardNotes = useMemo(() => buildBoardNotesFromLogs(auditLogs || []), [auditLogs]);
  const allExternalCashReceipts = useMemo(
    () => mergeExternalCashReceipts(externalCashReceipts, collectExternalCashReceipts(auditLogs)),
    [externalCashReceipts, auditLogs]
  );
  const latestBoardNoteAt = Number(new Date(boardNotes?.[0]?.createdAt || 0).getTime() || 0);
  const hasBoardAttention = latestBoardNoteAt > Number(boardNotesSeenAt || 0);

  const canManageAuth = ['Administrador', 'Supervisor'].includes(normalizeRole(currentUser?.role));
  const notifications = useMemo(() => {
    const ownUserId = currentUser?.id || '';
    const list = [];

    (remoteAuthRequests || []).forEach((req) => {
      const createdAt = new Date(req?.createdAt || 0).getTime();
      const resolvedAt = new Date(req?.resolvedAt || 0).getTime();
      if (canManageAuth && req?.status === 'PENDING') {
        list.push({
          id: `auth-pending-${req.id}`,
          at: createdAt || Date.now(),
          text: `Solicitud pendiente: ${req.module || 'General'} - ${req.reasonLabel || req.reasonType || 'Autorizacion'} (${req.requestedBy?.name || 'N/A'})`,
          attachments: Array.isArray(req?.attachments) ? req.attachments : [],
        });
      }
      if (String(req?.requestedBy?.id || '') === String(ownUserId || '') && (req?.status === 'APPROVED' || req?.status === 'REJECTED')) {
        list.push({
          id: `auth-resolved-${req.id}-${req.status}`,
          at: resolvedAt || createdAt || Date.now(),
          text: `Tu solicitud ${req.id} fue ${req.status === 'APPROVED' ? 'APROBADA' : 'RECHAZADA'}.`,
          attachments: Array.isArray(req?.attachments) ? req.attachments : [],
        });
      }
    });

    (invoiceDrafts || [])
      .filter((draft) => String(draft?.savedBy?.id || '') === String(ownUserId || ''))
      .forEach((draft) => {
        list.push({
          id: `draft-${draft.id}`,
          at: new Date(draft?.savedAt || 0).getTime() || Date.now(),
          text: `Borrador guardado: ${draft.clientName || 'Cliente Ocasional'} (${Number(draft.total || 0).toLocaleString()})`,
        });
      });

    return list.sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).slice(0, 50);
  }, [remoteAuthRequests, invoiceDrafts, currentUser?.id, currentUser?.role, canManageAuth]);

  const unreadNotificationsCount = notifications.filter((item) => Number(item?.at || 0) > Number(notificationsSeenAt || 0)).length;
  const pendingAuthRequestsForManager = useMemo(() => (
    canManageAuth
      ? (remoteAuthRequests || []).filter((req) => req?.status === 'PENDING').slice(0, 12)
      : []
  ), [canManageAuth, remoteAuthRequests]);
  const ownInvoiceDrafts = useMemo(() => (
    (invoiceDrafts || [])
      .filter((d) => String(d?.savedBy?.id || '') === String(currentUser?.id || ''))
      .slice(0, 12)
  ), [invoiceDrafts, currentUser?.id]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const latest = notifications[0]?.at || 0;
    if (latest > notificationsSeenAt) setNotificationsSeenAt(latest);
  }, [notificationsOpen, notifications, notificationsSeenAt]);

  useEffect(() => {
    const latest = Number(notifications[0]?.at || 0);
    if (!latest || latest <= Number(lastNotificationSoundAtRef.current || 0)) return;
    if (latest > Number(notificationsSeenAt || 0)) playSound('notify');
    lastNotificationSoundAtRef.current = latest;
  }, [notifications, notificationsSeenAt]);

  useEffect(() => {
    if (!latestBoardNoteAt || latestBoardNoteAt <= Number(lastBoardNoteSoundAtRef.current || 0)) return;
    if (latestBoardNoteAt > Number(boardNotesSeenAt || 0)) playSound('notify');
    lastBoardNoteSoundAtRef.current = latestBoardNoteAt;
  }, [latestBoardNoteAt, boardNotesSeenAt]);

  const handleLogin = (user, pass) => {
    const foundUser = users.find(u => u.username === user && u.password === pass);
    if (foundUser) {
      setIsLoggedIn(true);
      setCurrentUser(foundUser);
      addLog({ module: 'Sistema', action: 'Login', details: `Usuario ${foundUser.username} ingreso` });
    }
  };

  const closeAdminAuthModal = useCallback((approved) => {
    if (adminAuthResolverRef.current) {
      adminAuthResolverRef.current(approved);
      adminAuthResolverRef.current = null;
    }
    setAdminAuthModal({
      open: false,
      title: 'Autorizacion',
      message: 'Se necesita clave del administrador para avanzar.',
      value: '',
    });
  }, []);

  const requestAdminAuthorization = useCallback(async ({
    title = 'Autorizacion',
    message = 'Se necesita clave del administrador para avanzar.',
  } = {}) => {
    if (!adminPass) {
      alert('No hay clave Admin configurada para autorizar esta accion.');
      return false;
    }

    return await new Promise((resolve) => {
      adminAuthResolverRef.current = resolve;
      setAdminAuthModal({
        open: true,
        title,
        message,
        value: '',
      });
    });
  }, [adminPass]);

  const onStartShift = async (initialCash, options = {}) => {
    const startCash = Number(initialCash) > 0 ? Number(initialCash) : 0;
    const nowIso = getOperationalNowIso();
    const nowRealDateKey = getRealDateKey();
    const userKey = String(currentUser?.id || '');
    const lastClosedDateKey = getEffectiveLastClosedDateForUser(userKey);
    const inventoryAssignments = filterSmokeShiftInventoryAssignments(
      normalizeShiftInventoryAssignments(
        options?.inventoryAssignments,
        products,
        stock?.ventas || {}
      ),
      products
    );

    const invalidAssignment = inventoryAssignments.find((item) => Number(item.quantity || 0) > Number(stock?.ventas?.[item.productId] || 0));
    if (invalidAssignment) {
      alert(`No se puede entregar ${invalidAssignment.quantity} de ${invalidAssignment.productName}. En ventas solo hay ${Number(stock?.ventas?.[invalidAssignment.productId] || 0)}.`);
      return;
    }

    if (inventoryAssignments.length === 0) {
      const approved = await requestAdminAuthorization();
      if (!approved) {
        return;
      }
    }

    if (userKey && lastClosedDateKey && lastClosedDateKey === nowRealDateKey) {
      const isAdminUser = normalizeRole(currentUser?.role) === 'Administrador';
      const allowReopen = confirm(
        isAdminUser
          ? `Este usuario ya cerro jornada hoy (${nowRealDateKey}).\n\nComo administrador puede hacer una reapertura excepcional.\n\nDesea continuar?`
          : `Este usuario ya cerro jornada hoy (${nowRealDateKey}).\n\nSolo un administrador puede autorizar una reapertura excepcional ingresando la clave Admin.\n\nDesea solicitar autorizacion?`
      );
      if (!allowReopen) return;

      const approved = await requestAdminAuthorization();
      if (!approved) {
        return;
      }

      addLog({
        module: 'Jornada',
        action: 'Reapertura Excepcional',
        details: `Reapertura autorizada para ${currentUser?.name || 'Usuario'} en fecha real ${nowRealDateKey}. Ultimo cierre efectivo: ${lastClosedDateKey || 'N/A'}.`
      });
    }

    const openingReportLines = [
      '--- REPORTE DE APERTURA DE JORNADA (AP) ---',
      `Fecha apertura: ${new Date(nowIso).toLocaleString()}`,
      `Asesor/Cajero: ${currentUser?.name || 'Sistema'}`,
      `Base inicial: ${Number(startCash || 0).toLocaleString()}`,
      '------------------------------------------',
      'INVENTARIO ENTREGADO AL TURNO',
      ...(inventoryAssignments.length > 0
        ? inventoryAssignments.map((item) => `${item.productName} x${Number(item.quantity || 0)}`)
        : ['Sin inventario smoke declarado. Apertura autorizada por administrador.']),
      '------------------------------------------',
      'FIRMAS',
      'Firma Asesor/Cajero: ____________________________',
      'Firma Supervisor/Admin: _________________________',
      'Sello Empresa: __________________________________',
      '------------------------------------------'
    ];
    const openingReportText = openingReportLines.join('\n');

    const openShift = {
      startTime: nowIso,
      initialCash: startCash,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || currentUser?.email || 'Sistema',
      inventoryAssignments,
      inventoryAssignedAt: nowIso,
      openingReportText,
    };
    setShift(openShift);
    setUserCashBalance(currentUser, startCash);
    saveOpenShift(currentUser?.id, openShift);
    addLog({
      module: 'Jornada',
      action: 'Inicio Jornada',
      details: `Iniciada con base de $${startCash}. Inventario entregado al turno: ${inventoryAssignments.length > 0 ? inventoryAssignments.map((item) => `${item.productName} x${item.quantity}`).join(', ') : 'sin inventario asignado'}.`
    });

    try {
      const savedShift = await dataService.saveShift({
        ...openShift,
        companyId: liveProfile?.company_id || null,
        endTime: null,
        salesTotal: 0,
        theoreticalBalance: 0,
        physicalCash: 0,
        discrepancy: 0,
        authorized: false,
        reportText: '',
        openingReportText,
        inventoryAssignment: inventoryAssignments,
        inventoryAssignedAt: nowIso,
        inventoryStatus: 'OPEN'
      });
      const persistedRow = Array.isArray(savedShift) ? savedShift[0] : savedShift;
      if (persistedRow?.id) {
        const persistedShift = { ...openShift, db_id: persistedRow.id };
        setShift(persistedShift);
        saveOpenShift(currentUser?.id, persistedShift);
        try {
          printShiftOpening(persistedShift, '58mm');
        } catch (e) {
          console.error('No se pudo abrir impresion automatica de la apertura:', e);
        }
        return;
      }
      try {
        printShiftOpening(openShift, '58mm');
      } catch (e) {
        console.error('No se pudo abrir impresion automatica de la apertura:', e);
      }
    } catch (err) {
      console.error('Error persistiendo jornada abierta en nube:', err);
      try {
        printShiftOpening(openShift, '58mm');
      } catch (e) {
        console.error('No se pudo abrir impresion automatica de la apertura:', e);
      }
    }
  };

  const isDateInRange = (dateValue, startIso, endIso) => {
    if (!dateValue || !startIso || !endIso) return false;
    const date = new Date(dateValue).getTime();
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (Number.isNaN(date) || Number.isNaN(start) || Number.isNaN(end)) return false;
    return date >= start && date <= end;
  };

  const getDateKey = (dateValue) => {
    if (!dateValue) return '';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return '';
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0'),
    ].join('-');
  };

  const normalizeIdentityValue = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const isRecordOwnedByUser = (record, user) => {
    const recordUserId = String(
      record?.user_id ||
      record?.userId ||
      record?.mixedDetails?.user_id ||
      record?.mixed_details?.user_id ||
      ''
    ).trim();
    const currentUserId = String(user?.id || '').trim();
    if (recordUserId && currentUserId) return recordUserId === currentUserId;

    const recordCandidates = [
      record?.user_name,
      record?.user,
      record?.username,
      record?.email,
      record?.mixedDetails?.user_name,
      record?.mixedDetails?.user,
      record?.mixed_details?.user_name,
      record?.mixed_details?.user,
    ]
      .map(normalizeIdentityValue)
      .filter(Boolean);

    const currentUserCandidates = [
      user?.name,
      user?.email,
      user?.username,
      user?.user_name,
      user?.user,
      user?.cashKey,
      ...(Array.isArray(user?.aliases) ? user.aliases : []),
    ]
      .map(normalizeIdentityValue)
      .filter(Boolean);

    return recordCandidates.some((candidate) => currentUserCandidates.includes(candidate));
  };

  const buildShiftOwnerReference = (activeShift, fallbackUser = currentUser) => {
    const aliases = [
      activeShift?.user_name,
      activeShift?.user,
      fallbackUser?.name,
      fallbackUser?.email,
      fallbackUser?.username,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    return {
      id: activeShift?.user_id || fallbackUser?.id || null,
      name: activeShift?.user_name || fallbackUser?.name || null,
      email: fallbackUser?.email || null,
      username: fallbackUser?.username || null,
      user_name: activeShift?.user_name || fallbackUser?.name || null,
      user: activeShift?.user_name || fallbackUser?.name || null,
      cashKey: getCashUserKey(activeShift?.user_id ? { id: activeShift.user_id } : fallbackUser),
      aliases,
    };
  };

  const parseMoneyFromText = (text) => {
    const match = String(text || '').match(/\$([\d\.,]+)/);
    if (!match?.[1]) return 0;
    return Number(match[1].replace(/[^\d]/g, '')) || 0;
  };

  const normalizePaymentMethodLabel = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const isInvoiceFinanciallyClosed = (invoice) => {
    const normalizedStatus = String(invoice?.status || '').trim().toLowerCase();
    return normalizedStatus === 'anulada' || normalizedStatus === 'devuelta';
  };

  const addAmountToBreakdown = (acc, method, amount) => {
    const safeAmount = Number(amount || 0);
    if (safeAmount <= 0) return acc;

    const normalizedMethod = normalizePaymentMethodLabel(method);
    if (normalizedMethod.includes('efectivo') || normalizedMethod.includes('contado') || normalizedMethod.includes('cash')) {
      acc.cash += safeAmount;
    } else if (normalizedMethod.includes('transfer')) {
      acc.transfer += safeAmount;
    } else if (normalizedMethod.includes('tarjeta') || normalizedMethod.includes('card')) {
      acc.card += safeAmount;
    } else if (normalizedMethod.includes('credito') || normalizedMethod.includes('credit')) {
      acc.credit += safeAmount;
    } else {
      acc.other += safeAmount;
    }

    return acc;
  };

  const getSalePaymentBreakdown = (sale) => {
    const breakdown = { gross: Number(sale?.total || 0), cash: 0, transfer: 0, card: 0, credit: 0, other: 0 };
    const paymentModeLabel = String(sale?.paymentMode || '');
    const mixedParts = Array.isArray(sale?.mixedDetails?.parts) ? sale.mixedDetails.parts : [];

    if (paymentModeLabel === 'Mixto' || paymentModeLabel.startsWith('Mixto')) {
      if (mixedParts.length > 0) {
        mixedParts.forEach((part) => addAmountToBreakdown(breakdown, part?.method, part?.amount));
      } else {
        addAmountToBreakdown(breakdown, PAYMENT_MODES.CONTADO, sale?.mixedDetails?.cash);
        addAmountToBreakdown(breakdown, PAYMENT_MODES.CREDITO, sale?.mixedDetails?.credit);
      }
      return breakdown;
    }

    addAmountToBreakdown(breakdown, paymentModeLabel, sale?.total);
    return breakdown;
  };

  const getCashAbonosFromInvoice = (invoice) => {
    const abonos = Array.isArray(invoice?.abonos)
      ? invoice.abonos
      : (Array.isArray(invoice?.mixedDetails?.cartera?.abonos) ? invoice.mixedDetails.cartera.abonos : []);

    return abonos.reduce((sum, abono) => {
      const normalizedMethod = normalizePaymentMethodLabel(abono?.method);
      if (normalizedMethod.includes('efectivo') || normalizedMethod.includes('contado') || normalizedMethod.includes('cash')) {
        return sum + Number(abono?.amount || 0);
      }
      return sum;
    }, 0);
  };

  const resolveInvoiceCashOwner = (invoice) => {
    const invoiceUserId = String(invoice?.user_id || '').trim();
    if (invoiceUserId) {
      const byId = users.find((user) => String(user?.id || '').trim() === invoiceUserId);
      if (byId) return byId;
    }

    const invoiceUserName = String(
      invoice?.user_name ||
      invoice?.user ||
      invoice?.mixedDetails?.user_name ||
      invoice?.mixedDetails?.user ||
      ''
    ).trim().toLowerCase();

    if (invoiceUserName) {
      const byName = users.find((user) => {
        const candidate = String(user?.name || user?.email || user?.username || '').trim().toLowerCase();
        return candidate && candidate === invoiceUserName;
      });
      if (byName) return byName;
    }

    return {
      id: invoice?.user_id || null,
      name: invoice?.user_name || invoice?.user || invoice?.mixedDetails?.user_name || invoice?.mixedDetails?.user || 'Sistema',
      email: invoice?.user_name || invoice?.user || null,
    };
  };

  const getInvoiceCashRefundAmount = (invoice, operationType, returnMode = '') => {
    if (!invoice || isInvoiceFinanciallyClosed(invoice)) return 0;
    const saleCash = Number(getSalePaymentBreakdown(invoice).cash || 0);
    const cashAbonos = Number(getCashAbonosFromInvoice(invoice) || 0);

    if (operationType === 'return' && String(returnMode || '').trim().toUpperCase() !== 'DINERO') {
      return 0;
    }

    return Math.max(0, saleCash + cashAbonos);
  };

  const getShiftFinancialSnapshot = (startIso, endIso, userRef = currentUser) => {
    const shiftSales = salesHistory.filter((sale) =>
      isDateInRange(sale.date, startIso, endIso) &&
      isRecordOwnedByUser(sale, userRef) &&
      !isInvoiceFinanciallyClosed(sale)
    );
    const shiftExpenses = expenses.filter((expense) =>
      isDateInRange(expense.date, startIso, endIso) &&
      isRecordOwnedByUser(expense, userRef)
    );
    const shiftPurchases = purchases.filter((purchase) =>
      isDateInRange(purchase.date, startIso, endIso) &&
      isRecordOwnedByUser(purchase, userRef)
    );
    const shiftCashLogs = auditLogs.filter((log) =>
      log?.module === 'Caja Principal' &&
      isDateInRange(log.timestamp, startIso, endIso) &&
      isRecordOwnedByUser(log, userRef) &&
      ['Movimiento Efectivo', 'Recibir Dinero', 'Devolver Dinero'].includes(log.action)
    );
    const shiftExternalCashReceipts = allExternalCashReceipts.filter((receipt) =>
      isDateInRange(receipt.date, startIso, endIso) &&
      isRecordOwnedByUser(receipt, userRef)
    );
    const shiftCarteraAbonos = (salesHistory || [])
      .flatMap((sale) => {
        const abonos = Array.isArray(sale?.abonos)
          ? sale.abonos
          : (Array.isArray(sale?.mixedDetails?.cartera?.abonos) ? sale.mixedDetails.cartera.abonos : []);
        return abonos.map((abono) => ({
          ...abono,
          user_id: abono?.user_id || sale?.user_id || null,
          user_name: abono?.user_name || sale?.user_name || sale?.user || null,
          invoiceId: sale?.id || sale?.db_id || 'N/A'
        }));
      })
      .filter((abono) =>
        isDateInRange(abono?.date, startIso, endIso) &&
        isRecordOwnedByUser(abono, userRef)
      );

    const salesBreakdown = shiftSales.reduce((acc, sale) => {
      const saleBreakdown = getSalePaymentBreakdown(sale);
      acc.gross += saleBreakdown.gross;
      acc.cash += saleBreakdown.cash;
      acc.transfer += saleBreakdown.transfer;
      acc.card += saleBreakdown.card;
      acc.credit += saleBreakdown.credit;
      acc.other += saleBreakdown.other;
      return acc;
    }, { gross: 0, cash: 0, transfer: 0, card: 0, credit: 0, other: 0 });

    const expensesTotal = shiftExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const purchasesTotal = shiftPurchases.reduce((sum, p) => {
      const qty = Number(p.quantity) || 0;
      const unitCost = Number(p.unitCost) || 0;
      return sum + (qty * unitCost);
    }, 0);

    const cashMovements = shiftCashLogs.reduce((acc, log) => {
      const amount = parseMoneyFromText(log.details);
      if (log.action === 'Recibir Dinero') acc.receivedFromVault += amount;
      if (log.action === 'Devolver Dinero') acc.returnedToVault += amount;
      if (log.action === 'Movimiento Efectivo') {
        if (String(log.details || '').includes('de Caja Mayor a Caja Menor')) acc.majorToMinor += amount;
        if (String(log.details || '').includes('de Caja Menor a Caja Mayor')) acc.minorToMajor += amount;
      }
      return acc;
    }, { majorToMinor: 0, minorToMajor: 0, receivedFromVault: 0, returnedToVault: 0 });

    const abonosBreakdown = shiftCarteraAbonos.reduce((acc, abono) => {
      const amount = Number(abono?.amount || 0);
      acc.total += amount;
      addAmountToBreakdown(acc, abono?.method, amount);
      return acc;
    }, { total: 0, cash: 0, transfer: 0, card: 0, credit: 0, other: 0 });

    const externalCashReceiptsBreakdown = shiftExternalCashReceipts.reduce((acc, receipt) => {
      const breakdown = getExternalCashReceiptBreakdown(receipt);
      acc.total += Number(breakdown.total || 0);
      acc.cash += Number(breakdown.cash || 0);
      acc.transfer += Number(breakdown.transfer || 0);
      acc.card += Number(breakdown.card || 0);
      acc.other += Number(breakdown.other || 0);
      return acc;
    }, { total: 0, cash: 0, transfer: 0, card: 0, other: 0 });

    return {
      shiftSales,
      shiftExpenses,
      shiftPurchases,
      shiftCashLogs,
      shiftExternalCashReceipts,
      shiftCarteraAbonos,
      salesBreakdown,
      abonosBreakdown,
      externalCashReceiptsBreakdown,
      expensesTotal,
      purchasesTotal,
      cashMovements
    };
  };

  const getOperationalDayMovementSnapshot = (dateIso, userRef = currentUser) => {
    const targetDateKey = getDateKey(dateIso);
    if (!targetDateKey) {
      return {
        sales: [],
        expenses: [],
        purchases: [],
        cashLogs: [],
        externalCashReceipts: [],
        carteraAbonos: [],
      };
    }

    const hasSameOperationalDay = (value) => getDateKey(value) === targetDateKey;

    const sales = salesHistory.filter((sale) =>
      hasSameOperationalDay(sale?.date) &&
      isRecordOwnedByUser(sale, userRef) &&
      !isInvoiceFinanciallyClosed(sale)
    );
    const expensesForDay = expenses.filter((expense) =>
      hasSameOperationalDay(expense?.date) &&
      isRecordOwnedByUser(expense, userRef)
    );
    const purchasesForDay = purchases.filter((purchase) =>
      hasSameOperationalDay(purchase?.date) &&
      isRecordOwnedByUser(purchase, userRef)
    );
    const cashLogs = auditLogs.filter((log) =>
      log?.module === 'Caja Principal' &&
      hasSameOperationalDay(log?.timestamp) &&
      isRecordOwnedByUser(log, userRef) &&
      ['Movimiento Efectivo', 'Recibir Dinero', 'Devolver Dinero'].includes(log.action)
    );
    const externalCashReceipts = allExternalCashReceipts.filter((receipt) =>
      hasSameOperationalDay(receipt?.date) &&
      isRecordOwnedByUser(receipt, userRef)
    );
    const carteraAbonos = (salesHistory || [])
      .flatMap((sale) => {
        const abonos = Array.isArray(sale?.abonos)
          ? sale.abonos
          : (Array.isArray(sale?.mixedDetails?.cartera?.abonos) ? sale.mixedDetails.cartera.abonos : []);
        return abonos.map((abono) => ({
          ...abono,
          user_id: abono?.user_id || sale?.user_id || null,
          user_name: abono?.user_name || sale?.user_name || sale?.user || null,
          invoiceId: sale?.id || sale?.db_id || 'N/A'
        }));
      })
      .filter((abono) =>
        hasSameOperationalDay(abono?.date) &&
        isRecordOwnedByUser(abono, userRef)
      );

    return { sales, expenses: expensesForDay, purchases: purchasesForDay, cashLogs, externalCashReceipts, carteraAbonos };
  };

  const buildShiftSystemAccounts = (summary) => ({
    efectivo:
      Number(shift?.initialCash || 0) +
      Number(summary?.salesBreakdown?.cash || 0) +
      Number(summary?.abonosBreakdown?.cash || 0) +
      Number(summary?.externalCashReceiptsBreakdown?.cash || 0) +
      Number(summary?.cashMovements?.receivedFromVault || 0) +
      Number(summary?.cashMovements?.majorToMinor || 0) -
      Number(summary?.cashMovements?.returnedToVault || 0) -
      Number(summary?.cashMovements?.minorToMajor || 0) -
      Number(summary?.expensesTotal || 0) -
      Number(summary?.purchasesTotal || 0),
    transferencia:
      Number(summary?.salesBreakdown?.transfer || 0) +
      Number(summary?.abonosBreakdown?.transfer || 0) +
      Number(summary?.externalCashReceiptsBreakdown?.transfer || 0),
    tarjeta:
      Number(summary?.salesBreakdown?.card || 0) +
      Number(summary?.abonosBreakdown?.card || 0) +
      Number(summary?.externalCashReceiptsBreakdown?.card || 0),
    credito: Number(summary?.salesBreakdown?.credit || 0) + Number(summary?.abonosBreakdown?.credit || 0),
    otros:
      Number(summary?.salesBreakdown?.other || 0) +
      Number(summary?.abonosBreakdown?.other || 0) +
      Number(summary?.externalCashReceiptsBreakdown?.other || 0),
    gastos: Number(summary?.expensesTotal || 0),
    inversion: Number(summary?.purchasesTotal || 0),
  });

  const onEndShift = async (data) => {
    if (!shift?.startTime) return;
    const shiftStartMsReal = new Date(shift.startTime).getTime();
    const openShiftAgeMs = Date.now() - shiftStartMsReal;
    const staleOpenShift = Number.isFinite(shiftStartMsReal) && !Number.isNaN(shiftStartMsReal) && openShiftAgeMs > MAX_OPEN_SHIFT_MS;
    if (!Number.isFinite(shiftStartMsReal) || Number.isNaN(shiftStartMsReal) || staleOpenShift) {
      clearOpenShift();
      setShift(null);
      alert(
        staleOpenShift
          ? `La jornada abierta supero ${MAX_OPEN_SHIFT_HOURS} horas y fue descartada para evitar arrastre de dias anteriores. Inicie una nueva jornada.`
          : 'La jornada abierta es invalida y fue descartada. Inicie una nueva jornada.'
      );
      return;
    }
    const shiftEndIso = getOperationalNowIso();
    const shiftOwnerRef = buildShiftOwnerReference(shift, currentUser);
    const summary = getShiftFinancialSnapshot(shift.startTime, shiftEndIso, shiftOwnerRef);
    const sameDayFallback = getOperationalDayMovementSnapshot(shiftEndIso, shiftOwnerRef);
    const hasAnyUserMovement =
      summary.shiftSales.length > 0 ||
      summary.shiftExpenses.length > 0 ||
      summary.shiftPurchases.length > 0 ||
      summary.shiftCashLogs.length > 0 ||
      summary.shiftExternalCashReceipts.length > 0 ||
      summary.shiftCarteraAbonos.length > 0 ||
      sameDayFallback.sales.length > 0 ||
      sameDayFallback.expenses.length > 0 ||
      sameDayFallback.purchases.length > 0 ||
      sameDayFallback.cashLogs.length > 0 ||
      sameDayFallback.externalCashReceipts.length > 0 ||
      sameDayFallback.carteraAbonos.length > 0;
    const isAdminUser = normalizeRole(currentUser?.role) === 'Administrador';
    let emptyCloseReason = '';

    if (!hasAnyUserMovement) {
      if (!isAdminUser) {
        alert('No se puede cerrar la jornada: este usuario no tiene movimientos en su turno.');
        return;
      }

      const reason = String(prompt('No hay movimientos en la jornada. Como administrador, ingrese motivo obligatorio para cerrar:') || '').trim();
      if (reason.length < 10) {
        alert('Debe ingresar un motivo valido (minimo 10 caracteres) para cerrar sin movimientos.');
        return;
      }
      emptyCloseReason = reason;
    }

    const salesTotal = summary.salesBreakdown.gross;
    const shiftSalesDetailedLines = summary.shiftSales.map((sale) => {
      const invoiceCode = String(
        sale?.invoiceCode ||
        sale?.mixedDetails?.invoiceCode ||
        sale?.mixedDetails?.invoice_code ||
        sale?.id ||
        'N/A'
      );
      const discount = sale?.mixedDetails?.discount || {};
      const promoName = String(sale?.promotion?.name || discount?.promotion?.name || '').trim();
      const promoAmount = Number(sale?.promoDiscountAmount ?? discount?.promoAmount ?? 0);
      const automaticAmount = Number(sale?.automaticDiscountAmount ?? discount?.automaticAmount ?? 0);
      const extraAmount = Number(sale?.extraDiscount ?? discount?.extraAmount ?? 0);
      const totalDiscountAmount = Number(sale?.totalDiscount ?? discount?.totalAmount ?? (promoAmount + automaticAmount + extraAmount));
      return [
        `Factura ${invoiceCode}`,
        `Cliente ${sale?.clientName || 'Cliente Ocasional'}`,
        `Pago ${sale?.paymentMode || 'N/A'}`,
        `Bruto ${Number(sale?.subtotal || 0).toLocaleString()}`,
        promoAmount > 0 ? `Promo${promoName ? ` ${promoName}` : ''} ${promoAmount.toLocaleString()}` : null,
        automaticAmount > 0 ? `Desc. cliente ${automaticAmount.toLocaleString()}` : null,
        extraAmount > 0 ? `Desc. extra ${extraAmount.toLocaleString()}` : null,
        totalDiscountAmount > 0 ? `Desc. total ${totalDiscountAmount.toLocaleString()}` : null,
        `Neto ${Number(sale?.total || 0).toLocaleString()}`,
      ].filter(Boolean).join(' | ');
    });
    const reconciliation = data?.reconciliation && typeof data.reconciliation === 'object'
      ? data.reconciliation
      : null;
    const requiredAccountKeys = ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otros', 'gastos', 'inversion'];
    if (!reconciliation) {
      alert('Debe diligenciar el formato de cuadre por cuentas.');
      return;
    }

    const missingRequired = requiredAccountKeys.some((key) => reconciliation[key] === undefined || reconciliation[key] === null || reconciliation[key] === '');
    if (missingRequired) {
      alert('Debe diligenciar todas las cuentas. Si no hubo movimiento, escriba 0.');
      return;
    }

    const enteredAccounts = {
      efectivo: Number(reconciliation.efectivo || 0),
      transferencia: Number(reconciliation.transferencia || 0),
      tarjeta: Number(reconciliation.tarjeta || 0),
      credito: Number(reconciliation.credito || 0),
      otros: Number(reconciliation.otros || 0),
      gastos: Number(reconciliation.gastos || 0),
      inversion: Number(reconciliation.inversion || 0),
    };

    const systemAccounts = buildShiftSystemAccounts(summary);
    const inventorySummary = summarizeShiftInventory({
      assignments: shift?.inventoryAssignments || [],
      shiftSales: summary.shiftSales,
    });
    const returnedItemsRaw = Array.isArray(data?.inventoryClosure?.returnedItems)
      ? data.inventoryClosure.returnedItems
      : [];
    const returnedItemsByProductId = returnedItemsRaw.reduce((acc, item) => {
      const productId = String(item?.productId || '').trim();
      if (!productId) return acc;
      acc[productId] = Math.max(0, Number(item?.returnedQty ?? item?.quantity ?? 0));
      return acc;
    }, {});

    const positiveAccountKeys = ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otros'];
    const totalDeclarado = positiveAccountKeys.reduce((sum, key) => sum + Number(enteredAccounts[key] || 0), 0);
    const totalSistema = positiveAccountKeys.reduce((sum, key) => sum + Number(systemAccounts[key] || 0), 0);
    const discrepancy = totalDeclarado - totalSistema;
    const accountDiffs = requiredAccountKeys.map((key) => ({
      key,
      declarado: Number(enteredAccounts[key] || 0),
      sistema: Number(systemAccounts[key] || 0),
      diff: Number(enteredAccounts[key] || 0) - Number(systemAccounts[key] || 0)
    }));
    const hasAccountMismatch = accountDiffs.some((row) => Math.abs(row.diff) > 1);
    const inventoryClosureRows = inventorySummary.rows.map((row) => {
      const returnedQty = Object.prototype.hasOwnProperty.call(returnedItemsByProductId, row.productId)
        ? Number(returnedItemsByProductId[row.productId] || 0)
        : Number(row.expectedQty || 0);
      return {
        ...row,
        returnedQty,
        differenceQty: returnedQty - Number(row.expectedQty || 0)
      };
    });
    const hasInventoryMismatch = inventoryClosureRows.some((row) => Math.abs(Number(row.differenceQty || 0)) > 0);
    let authorizedMismatch = false;

    if (Math.abs(discrepancy) > 1 || hasAccountMismatch || hasInventoryMismatch) {
      const approved = await requestAdminAuthorization();
      if (!approved) {
        return;
      }
      authorizedMismatch = true;
    }

    const shiftStartMs = new Date(shift.startTime).getTime();
    const shiftEndMs = new Date(shiftEndIso).getTime();
    const workedMs = Math.max(0, shiftEndMs - shiftStartMs);
    const workedHours = Math.floor(workedMs / (1000 * 60 * 60));
    const workedMinutes = Math.floor((workedMs % (1000 * 60 * 60)) / (1000 * 60));
    const workedDurationLabel = `${workedHours}h ${workedMinutes}m`;

    const reportLines = [
      '--- REPORTE DE CIERRE DE JORNADA (CR) ---',
      `Fecha cierre: ${new Date(shiftEndIso).toLocaleString()}`,
      `Asesor/Cajero: ${currentUser?.name || 'Sistema'}`,
      `Inicio jornada: ${new Date(shift.startTime).toLocaleString()}`,
      `Fin jornada: ${new Date(shiftEndIso).toLocaleString()}`,
      `Total horas trabajadas: ${workedDurationLabel}`,
      '------------------------------------------',
      'RESUMEN MONETARIO',
      `Ventas Brutas: ${salesTotal.toLocaleString()} (${summary.shiftSales.length} facturas)`,
      `Descuento promociones: ${summary.shiftSales.reduce((sum, sale) => sum + Number(sale?.promoDiscountAmount ?? sale?.mixedDetails?.discount?.promoAmount ?? 0), 0).toLocaleString()}`,
      `Descuento clientes fijos: ${summary.shiftSales.reduce((sum, sale) => sum + Number(sale?.automaticDiscountAmount ?? sale?.mixedDetails?.discount?.automaticAmount ?? 0), 0).toLocaleString()}`,
      `Descuento extraordinario: ${summary.shiftSales.reduce((sum, sale) => sum + Number(sale?.extraDiscount ?? sale?.mixedDetails?.discount?.extraAmount ?? 0), 0).toLocaleString()}`,
      `Abonos Cartera: ${Number(summary.abonosBreakdown.total || 0).toLocaleString()} (${summary.shiftCarteraAbonos.length} abono(s))`,
      `Recibos Caja Externos: ${Number(summary.externalCashReceiptsBreakdown.total || 0).toLocaleString()} (${summary.shiftExternalCashReceipts.length} recibo(s))`,
      `Cuenta EFECTIVO: Sistema ${Number(systemAccounts.efectivo || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.efectivo || 0).toLocaleString()}`,
      `Cuenta TRANSFERENCIA: Sistema ${Number(systemAccounts.transferencia || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.transferencia || 0).toLocaleString()}`,
      `Cuenta TARJETA: Sistema ${Number(systemAccounts.tarjeta || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.tarjeta || 0).toLocaleString()}`,
      `Cuenta CREDITO: Sistema ${Number(systemAccounts.credito || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.credito || 0).toLocaleString()}`,
      `Cuenta OTROS: Sistema ${Number(systemAccounts.otros || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.otros || 0).toLocaleString()}`,
      `Cuenta GASTOS/EGRESOS: Sistema ${formatSignedAccountAmount('gastos', systemAccounts.gastos)} | Declarado ${formatSignedAccountAmount('gastos', enteredAccounts.gastos)}`,
      `Cuenta COMPRAS/INVERSION: Sistema ${formatSignedAccountAmount('inversion', systemAccounts.inversion)} | Declarado ${formatSignedAccountAmount('inversion', enteredAccounts.inversion)}`,
      `TOTAL SISTEMA CUADRE: ${Number(totalSistema || 0).toLocaleString()}`,
      `TOTAL DECLARADO CUADRE: ${Number(totalDeclarado || 0).toLocaleString()}`,
      `Diferencia Total: ${Number(discrepancy || 0).toLocaleString()}`,
      `Cierre con autorizacion admin: ${authorizedMismatch ? 'SI' : 'NO'}`,
      `Cierre sin movimientos: ${hasAnyUserMovement ? 'NO' : 'SI'}`,
      ...(hasAnyUserMovement ? [] : [`Motivo cierre sin movimientos: ${emptyCloseReason}`]),
      '------------------------------------------',
      'FACTURACION DETALLADA',
      ...(shiftSalesDetailedLines.length > 0 ? shiftSalesDetailedLines : ['Sin facturas registradas en esta jornada.']),
      '------------------------------------------',
      'CONTROL DE INVENTARIO POR TURNO',
      ...(inventoryClosureRows.length > 0
        ? inventoryClosureRows.map((row) => (
            `${row.productName} | Entregado: ${Number(row.assignedQty || 0)} | Vendido: ${Number(row.soldQty || 0)} | Recibido: ${Number(row.returnedQty || 0)} | Diferencia: ${Number(row.differenceQty || 0)}`
          ))
        : ['Sin inventario smoke asignado al turno.']),
      `Nota supervisor: ${String(data?.inventoryClosure?.supervisorNote || '').trim() || 'Sin nota'}`,
      '------------------------------------------',
      'FIRMAS',
      'Firma Asesor/Cajero: ____________________________',
      'Firma Supervisor/Admin: _________________________',
      'Sello Empresa: __________________________________',
      '------------------------------------------'
    ];

    const reportText = reportLines.join('\n');

    const shiftData = {
      id: shift?.db_id || shift?.id || Date.now(),
      db_id: shift?.db_id || null,
      companyId: liveProfile?.company_id || null,
      startTime: shift.startTime,
      endTime: shiftEndIso,
      initialCash: shift.initialCash,
      salesTotal: salesTotal,
      theoreticalBalance: totalSistema,
      physicalCash: totalDeclarado,
      discrepancy,
      authorized: authorizedMismatch,
      closedWithoutMovements: !hasAnyUserMovement,
      closeWithoutMovementsReason: hasAnyUserMovement ? '' : emptyCloseReason,
      reconciliation: {
        enteredAccounts,
        systemAccounts,
        totalDeclarado,
        totalSistema,
        accountDiffs
      },
      inventoryAssignment: shift?.inventoryAssignments || [],
      inventoryAssignedAt: shift?.inventoryAssignedAt || shift?.startTime || null,
      inventoryClosure: {
        rows: inventoryClosureRows,
        supervisorNote: String(data?.inventoryClosure?.supervisorNote || '').trim(),
      },
      inventoryStatus: hasInventoryMismatch ? 'PENDING_REVIEW' : 'VERIFIED',
      user: currentUser?.name || 'Sistema',
      user_name: currentUser?.name || currentUser?.email || 'Sistema',
      user_id: currentUser?.id || null,
      reportText: reportText
    };

    setShiftHistory(prev => [shiftData, ...prev]);
    console.log(reportText);

    const persistShift = async () => {
      try {
        await dataService.saveShift(shiftData);
        await syncFactMovement('shift.closed', {
          shiftId: String(shiftData.db_id || shiftData.id || ''),
          shiftDate: getRealDateKey(),
          startTime: shiftData.startTime,
          endTime: shiftData.endTime,
          userId: shiftData.user_id || null,
          userName: shiftData.user_name || shiftData.user || 'Sistema',
          salesTotal: Number(shiftData.salesTotal || 0),
          theoreticalBalance: Number(shiftData.theoreticalBalance || 0),
          physicalCash: Number(shiftData.physicalCash || 0),
          discrepancy: Number(shiftData.discrepancy || 0),
          authorized: !!shiftData.authorized,
          reportText: shiftData.reportText || '',
          reconciliation: shiftData.reconciliation || null,
        });
      } catch (err) {
        console.error("Error persistiendo cierre en Supabase:", err);
      }
    };
    persistShift();

    try {
      printShiftClosure(shiftData, '58mm');
    } catch (e) {
      console.error('No se pudo abrir impresion automatica del cierre:', e);
    }

    alert(`Jornada cerrada con exito. Horas trabajadas: ${workedDurationLabel}. Se envio a impresion automaticamente.`);

    setUserCashBalance(currentUser, enteredAccounts.efectivo);
    setShift(null);
    clearOpenShift();
    const closeMap = readLastShiftCloseByUser();
    const userKey = String(currentUser?.id || '');
    if (userKey) {
      closeMap[userKey] = getRealDateKey();
      writeLastShiftCloseByUser(closeMap);
    }
    addLog({ module: 'Jornada', action: 'Cierre Jornada', details: reportText });
  };

  const getRealDateKey = () => new Date().toISOString().slice(0, 10);

  const readLastShiftCloseByUser = () => {
    try {
      const raw = localStorage.getItem(LAST_SHIFT_CLOSE_BY_USER_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeLastShiftCloseByUser = (nextMap) => {
    try {
      localStorage.setItem(LAST_SHIFT_CLOSE_BY_USER_STORAGE_KEY, JSON.stringify(nextMap || {}));
    } catch (e) {
      console.error('No se pudo guardar cierre por usuario:', e);
    }
  };

  const getManualShiftCloseOverrideMap = useCallback(() => {
    return (auditLogs || []).reduce((acc, log) => {
      const event = parseShiftCloseOverrideLogEvent(log?.details);
      const userId = String(event?.targetUserId || '').trim();
      if (!userId || !event?.effectiveDateKey) return acc;
      acc[userId] = String(event.effectiveDateKey);
      return acc;
    }, {});
  }, [auditLogs]);

  const getLatestClosedShiftDateForUser = useCallback((userId) => {
    const key = String(userId || '').trim();
    if (!key) return '';

    const latestShift = (shiftHistory || [])
      .filter((row) => String(row?.user_id || '').trim() === key && row?.endTime)
      .sort((a, b) => new Date(b?.endTime || 0).getTime() - new Date(a?.endTime || 0).getTime())[0];

    if (!latestShift?.endTime) return '';
    return getDateKey(latestShift.endTime);
  }, [shiftHistory]);

  const getEffectiveLastClosedDateForUser = useCallback((userId) => {
    const key = String(userId || '').trim();
    if (!key) return '';

    const localMap = readLastShiftCloseByUser();
    const localDateKey = String(localMap[key] || '').trim();
    const manualOverrideMap = getManualShiftCloseOverrideMap();
    const manualDateKey = String(manualOverrideMap[key] || '').trim();
    const cloudDateKey = String(getLatestClosedShiftDateForUser(key) || '').trim();

    return manualDateKey || localDateKey || cloudDateKey || '';
  }, [getLatestClosedShiftDateForUser, getManualShiftCloseOverrideMap]);

  const handleAddItem = (item) => {
    if (item?.is_visible === false) {
      return alert('Este articulo esta oculto y no se puede facturar.');
    }
    if (String(item?.status || '').toLowerCase() === 'agotado') {
      return alert('Este articulo esta marcado como AGOTADO.');
    }
    setItems([...items, { ...item, total: Number(item.price || 0) * Number(item.quantity || 0) }]);

    addLog({
      module: 'Facturacion',
      action: 'Agregar Item',
      details: `Se agrego ${item.name} (${item.quantity})`
    });
  };

  const handleRemoveItem = (index) => {
    const item = items[index];
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);

    addLog({
      module: 'Facturacion',
      action: 'Eliminar Item',
      details: `Se elimino ${item.name} del carrito`
    });
  };

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const DISCOUNT_MIN_UNIT_PRICE = 50000;
  const isDiscountEligibleItem = (item) => {
    const fullPriceOnly = item?.full_price_only === true || item?.fullPriceOnly === true;
    const unitPrice = Number(item?.price || 0);
    return !fullPriceOnly && unitPrice > DISCOUNT_MIN_UNIT_PRICE;
  };
  const discountableSubtotal = items.reduce(
    (sum, item) => sum + (isDiscountEligibleItem(item) ? Number(item?.total || 0) : 0),
    0
  );
  const protectedSubtotal = Math.max(0, Number(subtotal || 0) - Number(discountableSubtotal || 0));
  const composerTotals = computeInvoiceTotals({
    items,
    deliveryFee,
    selectedClientDiscountPercent: Number(selectedClient?.discount || 0),
    extraDiscount: composerExtraDiscount,
    promotions: companyPromotions,
    now: getOperationalNow(),
  });
  const composerTotalDiscount = composerTotals.totalDiscount;
  const composerTotal = composerTotals.total;

  const getNextInvoiceCode = () => {
    const fromHistory = (salesHistory || []).reduce((max, inv) => {
      const raw = String(inv?.id || inv?.invoiceCode || inv?.mixedDetails?.invoiceCode || '');
      const match = raw.match(/^SSOT-(\d+)$/i);
      if (!match) return max;
      return Math.max(max, Number(match[1] || 0));
    }, 0);

    const fromStorage = Number(localStorage.getItem(INVOICE_SEQUENCE_STORAGE_KEY) || 0);
    const next = Math.max(fromHistory, fromStorage) + 1;
    localStorage.setItem(INVOICE_SEQUENCE_STORAGE_KEY, String(next));
    return `SSOT-${String(next).padStart(4, '0')}`;
  };

  const getSaleItemProductId = (item) => (
    item?.productId ?? item?.product_id ?? item?.id ?? null
  );

  const formatSignedAccountAmount = (key, amount) => {
    const numericAmount = Number(amount || 0);
    const isNegativeAccount = ['gastos', 'inversion'].includes(String(key || '').trim().toLowerCase());
    const prefix = isNegativeAccount && numericAmount > 0 ? '-' : '';
    return `${prefix}${Math.abs(numericAmount).toLocaleString()}`;
  };

  const handleFacturar = async (mixedData = null, extraDiscount = 0, invoiceMeta = {}) => {
    if (items.length === 0) return alert("Agregue productos primero");
    if (selectedClient?.blocked) {
      return alert("Este cliente esta bloqueado por Administracion. No puede facturar hasta ser desbloqueado.");
    }
    const isInternalZero = invoiceMeta?.internalZero === true;

    // Stock Validation
    for (const item of items) {
      const productId = getSaleItemProductId(item);
      const availableStock = Number(stock.ventas[productId] || 0);
      if (!productId) {
        return alert(`El item ${item?.name || 'sin nombre'} no tiene identificador de producto valido.`);
      }
      if (availableStock < Number(item.quantity || 0)) {
        return alert(`Inventario insuficiente para ${item.name}. Solo hay ${availableStock} en punto de venta.`);
      }
    }

    // Single-payment methods that are not cash/credit require a global reference.
    // Mixed payments validate their references per part in PaymentSummary.
    const needsRef = !mixedData && ![PAYMENT_MODES.CONTADO, PAYMENT_MODES.CREDITO].includes(paymentMode);
    if (!isInternalZero && needsRef && !String(paymentRef || '').trim()) {
      return alert("Debe ingresar el numero de referencia para este metodo de pago");
    }

    // Credit Limit check (Individual Invoice Max)
    const isCreditPortion = paymentMode === PAYMENT_MODES.CREDITO || mixedData?.credit > 0;
    const totals = computeInvoiceTotals({
      items,
      deliveryFee,
      selectedClientDiscountPercent: Number(selectedClient?.discount || 0),
      extraDiscount,
      promotions: companyPromotions,
      now: getOperationalNow(),
    });
    const automaticDiscountPercent = totals.automaticDiscountPercent;
    const automaticDiscountAmount = totals.automaticDiscountAmount;
    const promoDiscountAmount = totals.promoDiscountAmount;
    const promotion = totals.promotion;
    const effectiveExtraDiscount = totals.effectiveExtraDiscount;
    const totalDiscount = totals.totalDiscount;
    const totalAfterDiscounts = totals.total;
    if (!isInternalZero && isCreditPortion && selectedClient) {
      const creditPortion = mixedData ? mixedData.credit : totalAfterDiscounts;
      if (creditPortion > selectedClient.creditLimit) {
        return alert(`Supera el limite de factura para este nivel de credito (${selectedClient.creditLimit.toLocaleString()}). Realice un abono para continuar.`);
      }
    }

    const finalMode = isInternalZero ? 'Factura Interna $0' : (mixedData ? 'Mixto' : paymentMode);
    const finalTotal = isInternalZero ? 0 : totalAfterDiscounts;
    let invoiceCode = '';
    try {
      invoiceCode = await dataService.getNextInvoiceCode('SSOT');
    } catch (e) {
      console.error('Error obteniendo consecutivo desde nube, usando respaldo local:', e);
      invoiceCode = getNextInvoiceCode();
    }

    const termDays = selectedClient?.approvedTerm || 30;
    const dueDateObj = getOperationalNow();
    dueDateObj.setDate(dueDateObj.getDate() + termDays);

    const authorization = invoiceMeta?.authorization && typeof invoiceMeta.authorization === 'object'
      ? invoiceMeta.authorization
      : null;
    const paymentMethodDetail = String(invoiceMeta?.otherPaymentDetail || '').trim();
    const zeroReason = String(invoiceMeta?.zeroReason || '').trim();

    const newInvoice = {
      id: invoiceCode,
      invoiceCode,
      clientName: clientName,
      clientDoc: selectedClient?.document || 'N/A',
      items,
      subtotal,
      deliveryFee,
      automaticDiscountPercent,
      automaticDiscountAmount,
      promoDiscountAmount,
      promotion,
      extraDiscount: effectiveExtraDiscount,
      totalDiscount,
      total: finalTotal,
      paymentMode: finalMode,
      authorization,
      mixedDetails: {
        ...(mixedData || {}),
        invoiceCode,
        discount: {
          promotion,
          promoAmount: Number(promoDiscountAmount || 0),
          automaticPercent: automaticDiscountPercent,
          automaticAmount: automaticDiscountAmount,
          extraAmount: effectiveExtraDiscount,
          totalAmount: totalDiscount
        },
        authorization,
        payment_method_detail: paymentMethodDetail || undefined,
        otherPaymentDetail: paymentMethodDetail || undefined,
        internalZero: isInternalZero || undefined,
        internalZeroReason: isInternalZero ? zeroReason : undefined
      }, // { cash, credit, invoiceCode }
      date: getOperationalNowIso(),
      dueDate: dueDateObj.toISOString(),
      status: isInternalZero
        ? 'interna_cero'
        : ((paymentMode === PAYMENT_MODES.CREDITO || mixedData?.credit > 0) ? 'pendiente' : 'pagado'),
    };

    const finalInvoice = {
      ...newInvoice,
      status: newInvoice.status,
      user_name: currentUser?.name || 'Sistema',
      user_id: currentUser?.id,
      items: items.map((item) => ({
        ...item,
        productId: getSaleItemProductId(item),
        product_id: getSaleItemProductId(item),
      }))
    };

    // Reduce stock locally
    const newStockVentas = { ...stock.ventas };
    const stockUpdates = [];
    finalInvoice.items.forEach((item) => {
      const productId = getSaleItemProductId(item);
      if (!productId) return;
      newStockVentas[productId] = (Number(newStockVentas[productId]) || 0) - Number(item.quantity || 0);

      const prod = products.find((p) => String(p.id) === String(productId));
      if (prod) {
        stockUpdates.push(
          dataService.updateProductStockById(prod.id, { stock: Number(newStockVentas[productId]) || 0 }, currentUser?.id)
        );
      }
    });
    setStock((prev) => ({ ...prev, ventas: newStockVentas }));

    try {
      await Promise.all(stockUpdates);
    } catch (e) {
      console.error('Error updating stock on SALE:', e);
      alert(`La factura se genero, pero no se pudo sincronizar el inventario de ventas.\n\nDetalle: ${e?.message || 'Error desconocido'}`);
    }

    if (!isInternalZero && (paymentMode === PAYMENT_MODES.CREDITO || mixedData?.credit > 0)) {
      const debtAmount = mixedData ? mixedData.credit : finalTotal;
      setCartera((prev) => [...prev, { ...finalInvoice, balance: debtAmount }]);
    }

    setSalesHistory((prev) => [...prev, finalInvoice]);

    // Actualiza caja del usuario en tiempo real para reflejar facturacion en el circulo central.
    if (!isInternalZero && finalMode === PAYMENT_MODES.CONTADO) {
      adjustUserCashBalance(currentUser, finalTotal);
    } else if (!isInternalZero && finalMode === 'Mixto') {
      adjustUserCashBalance(currentUser, Number(mixedData?.cash || 0));
    }

    // Save to Supabase
    const persistInvoice = async () => {
      try {
        await dataService.saveInvoice(finalInvoice, items);
        await syncFactMovement('invoice.created', {
          invoiceId: finalInvoice.id,
          date: finalInvoice.date,
          customerName: finalInvoice.clientName,
          customerDoc: finalInvoice.clientDoc,
          total: finalInvoice.total,
          paymentMode: finalInvoice.paymentMode,
          userName: finalInvoice.user_name,
          notes: finalInvoice.mixedDetails?.internalZeroReason || '',
          items: (finalInvoice.items || []).map((item) => ({
            productId: item.productId || item.product_id || item.id || null,
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.price || 0),
          })),
        });
        // Also update stock in DB if needed (future Phase)
      } catch (err) {
        console.error("Error persistiendo factura en Supabase:", err);
        const message = err?.message || 'Error desconocido';
        alert(`Atencion: Los datos se guardaron localmente pero fallo la sincronizacion con la nube.\n\nDetalle: ${message}`);
      }
    };
    persistInvoice();

    playSound('invoice');

    addLog({
      module: 'Facturacion',
      action: isInternalZero ? 'Factura Interna Cero' : 'Generar Factura',
      details: isInternalZero
        ? `Factura interna ${newInvoice.id} para ${clientName}. Total $0. Motivo: ${zeroReason || 'N/A'}`
        : `Factura ${newInvoice.id} (${finalMode}) para ${clientName} - Total: $${newInvoice.total}`
    });

    // Reset current form
    resetInvoiceComposer();
  };

  const onFacturarCero = async (reason) => {
    await handleFacturar(null, 0, { internalZero: true, zeroReason: reason });
  };

  const getInvoiceItemProductId = (item) => (
    item?.productId ?? item?.product_id ?? item?.id ?? null
  );

  const onCancelInvoice = async (invoice, reason) => {
    if (!invoice) return;
    const currentStatus = String(invoice?.status || '').toLowerCase();
    if (currentStatus === 'anulada' || currentStatus === 'devuelta') {
      return alert('Esta factura ya fue cerrada como anulada o devuelta.');
    }

    const nextStock = { ...stock.ventas };
    (invoice.items || []).forEach((item) => {
      const productId = getInvoiceItemProductId(item);
      if (!productId) return;
      nextStock[productId] = (nextStock[productId] || 0) + Number(item.quantity || 0);
    });
    setStock((prev) => ({ ...prev, ventas: nextStock }));

    await Promise.all((invoice.items || []).map(async (item) => {
      const productId = getInvoiceItemProductId(item);
      const prod = products.find((p) => String(p.id) === String(productId));
      if (!prod) return;
      await dataService.updateProductStockById(prod.id, { stock: Number(nextStock[productId]) || 0 }, currentUser?.id);
    })).catch((e) => console.error('Error devolviendo stock por anulacion:', e));

    const refundCashAmount = getInvoiceCashRefundAmount(invoice, 'cancel');
    const cashOwner = resolveInvoiceCashOwner(invoice);

    const updatedInvoice = {
      ...invoice,
      id: invoice?.db_id || invoice?.id,
      status: 'anulada',
      mixedDetails: {
        ...(invoice?.mixedDetails || {}),
        cancellation: {
          at: new Date().toISOString(),
          by: currentUser?.name || currentUser?.email || 'Sistema',
          reason,
          refundedCash: refundCashAmount
        }
      }
    };

    setSalesHistory((prev) => prev.map((s) => {
      const same = (s?.db_id && invoice?.db_id && s.db_id === invoice.db_id) || s.id === invoice.id;
      return same ? { ...s, status: 'anulada', mixedDetails: updatedInvoice.mixedDetails } : s;
    }));
    setCartera((prev) => prev.filter((c) => c.id !== invoice.id));
    if (refundCashAmount > 0) {
      adjustUserCashBalance(cashOwner, -refundCashAmount);
    }

    try {
      await dataService.saveInvoice(updatedInvoice, invoice.items || []);
      await syncFactMovement('invoice.cancelled', {
        invoiceId: invoice.id,
        reason,
      });
    } catch (e) {
      console.error('Error actualizando factura anulada en nube:', e);
    }

    addLog({
      module: 'Facturacion',
      action: 'Cancelar Factura',
      details: `Factura ${invoice.id} anulada. Motivo: ${reason}. Stock devuelto a ventas.${refundCashAmount > 0 ? ` Reintegro de caja: $${refundCashAmount.toLocaleString()}.` : ''}`
    });
    alert(`Factura ${invoice.id} anulada correctamente.`);
  };

  const onReturnInvoice = async (invoice, mode, reason) => {
    if (!invoice) return;
    const currentStatus = String(invoice?.status || '').toLowerCase();
    if (currentStatus === 'anulada' || currentStatus === 'devuelta') {
      return alert('Esta factura ya fue cerrada como anulada o devuelta.');
    }

    const nextStock = { ...stock.ventas };
    (invoice.items || []).forEach((item) => {
      const productId = getInvoiceItemProductId(item);
      if (!productId) return;
      nextStock[productId] = (nextStock[productId] || 0) + Number(item.quantity || 0);
    });
    setStock((prev) => ({ ...prev, ventas: nextStock }));

    await Promise.all((invoice.items || []).map(async (item) => {
      const productId = getInvoiceItemProductId(item);
      const prod = products.find((p) => String(p.id) === String(productId));
      if (!prod) return;
      await dataService.updateProductStockById(prod.id, { stock: Number(nextStock[productId]) || 0 }, currentUser?.id);
    })).catch((e) => console.error('Error devolviendo stock por devolucion:', e));

    const refundCashAmount = getInvoiceCashRefundAmount(invoice, 'return', mode);
    const cashOwner = resolveInvoiceCashOwner(invoice);

    const updatedInvoice = {
      ...invoice,
      id: invoice?.db_id || invoice?.id,
      status: 'devuelta',
      mixedDetails: {
        ...(invoice?.mixedDetails || {}),
        returnData: {
          mode,
          reason,
          at: new Date().toISOString(),
          by: currentUser?.name || currentUser?.email || 'Sistema',
          refundedCash: refundCashAmount
        }
      }
    };

    setSalesHistory((prev) => prev.map((s) => {
      const same = (s?.db_id && invoice?.db_id && s.db_id === invoice.db_id) || s.id === invoice.id;
      return same ? { ...s, status: 'devuelta', mixedDetails: updatedInvoice.mixedDetails } : s;
    }));
    setCartera((prev) => prev.filter((c) => c.id !== invoice.id));
    if (refundCashAmount > 0) {
      adjustUserCashBalance(cashOwner, -refundCashAmount);
    }

    try {
      await dataService.saveInvoice(updatedInvoice, invoice.items || []);
      await syncFactMovement('invoice.returned', {
        invoiceId: invoice.id,
        reason: `${mode || 'devolucion'}: ${reason || ''}`.trim(),
      });
    } catch (e) {
      console.error('Error actualizando factura devuelta en nube:', e);
    }

    addLog({
      module: 'Facturacion',
      action: 'Devolucion Factura',
      details: `Factura ${invoice.id} devuelta (${mode}). Motivo: ${reason}. Stock reintegrado.${refundCashAmount > 0 ? ` Reintegro de caja: $${refundCashAmount.toLocaleString()}.` : ''}`
    });
    alert(`Devolucion aplicada en factura ${invoice.id}.`);
  };

  const onDeleteInvoice = (invoice) => {
    // 1. Revert Stock
    const newStock = { ...stock };
    (invoice.items || []).forEach((item) => {
      const productId = getInvoiceItemProductId(item);
      if (!productId) return;
      newStock.ventas[productId] = (newStock.ventas[productId] || 0) + Number(item.quantity || 0);
    });
    setStock(newStock);

    // 2. Remove from Sales History
    setSalesHistory(prev => prev.filter(s => s.id !== invoice.id));

    // 3. Remove from Cartera if pending
    if (invoice.status === 'pendiente') {
      setCartera(prev => prev.filter(c => c.id !== invoice.id));
    }

    addLog({
      module: 'Historial',
      action: 'Eliminar Factura',
      details: `Factura ${invoice.id} eliminada por Admin. Stock revertido.`
    });

    alert(`Factura ${invoice.id} eliminada y stock actualizado.`);
  };

  const cleanScannedCode = (value) => String(value ?? '').trim().replace(/\s+/g, '');

  const findProductByBarcode = (barcodeValue) => {
    const scanned = cleanScannedCode(barcodeValue);
    if (!scanned) return null;

    const scannedDigits = scanned.replace(/\D/g, '');

    return products.find((product) => {
      const productBarcode = cleanScannedCode(product.barcode);
      if (!productBarcode) return false;
      if (productBarcode === scanned) return true;

      const productDigits = productBarcode.replace(/\D/g, '');
      return scannedDigits && productDigits && scannedDigits === productDigits;
    }) || null;
  };

  const handleQuickPriceLookup = (codeFromSubmit = quickScanCode) => {
    const scannedCode = cleanScannedCode(codeFromSubmit);
    if (!scannedCode) {
      setQuickLookupResult(null);
      return;
    }

    const matchedProduct = findProductByBarcode(scannedCode);
    const lookupEntry = {
      id: Date.now(),
      scannedCode,
      found: !!matchedProduct,
      product: matchedProduct || null,
      checkedAt: new Date().toLocaleTimeString()
    };

    setQuickLookupResult(lookupEntry);
    setQuickLookupHistory((prev) => [lookupEntry, ...prev].slice(0, 8));
    setQuickScanCode('');
  };

  const getDefaultFloatingPanelPosition = (type) => {
    const container = homeDashboardRef.current;
    const containerWidth = Number(container?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280));
    const containerHeight = Number(container?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720));

    if (type === 'quick') {
      return { x: Math.max(18, containerWidth - 350), y: 18 };
    }

    return { x: 22, y: Math.max(22, containerHeight - 250) };
  };

  const getFloatingPanelStyle = (type) => {
    if (!homePanelsMovable) return undefined;
    const position = type === 'quick'
      ? (quickPanelPosition || getDefaultFloatingPanelPosition('quick'))
      : (promoPanelPosition || getDefaultFloatingPanelPosition('promo'));

    return {
      left: `${Number(position.x || 0)}px`,
      top: `${Number(position.y || 0)}px`,
      right: 'auto',
      bottom: 'auto',
    };
  };

  const startFloatingPanelDrag = (type, event) => {
    if (!homePanelsMovable || event.button !== 0) return;

    const panelElement = event.currentTarget.closest('[data-floating-panel]');
    const container = homeDashboardRef.current;
    if (!panelElement || !container) return;

    const panelRect = panelElement.getBoundingClientRect();
    homePanelDragRef.current = {
      type,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    document.body.style.userSelect = 'none';
  };

  const renderHome = () => {
    const allowedMenuItems = getAllowedMenuItemsForUser(currentUser);

    const cashBalance = activeShiftCashBalance;

    const radius = 255;

    return (
      <div className="radial-container" ref={homeDashboardRef}>
        <div
          data-floating-panel="quick"
          className={`quick-price-wrapper ${quickTrayOpen ? 'open' : 'closed'} ${homePanelsMovable ? 'movable' : ''}`}
          style={getFloatingPanelStyle('quick')}
        >
          <button
            type="button"
            className="quick-price-tab"
            onClick={() => setQuickTrayOpen(prev => !prev)}
            title={quickTrayOpen ? 'Ocultar consulta rapida' : 'Mostrar consulta rapida'}
          >
            {quickTrayOpen ? 'Ocultar' : 'Consulta'}
          </button>
          <aside className="quick-price-tray">
          <div className="floating-panel-head">
            <h3>Consulta Rapida</h3>
            {homePanelsMovable && (
              <button
                type="button"
                className="floating-panel-handle"
                onMouseDown={(event) => startFloatingPanelDrag('quick', event)}
                title="Mover consulta rapida"
              >
                Mover
              </button>
            )}
          </div>
          <p>Escanea el codigo y presiona Enter.</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleQuickPriceLookup();
            }}
          >
            <input
              ref={quickScanInputRef}
              className="quick-price-input"
              value={quickScanCode}
              onChange={(e) => setQuickScanCode(e.target.value)}
              placeholder="Escanear codigo..."
              autoComplete="off"
              autoFocus
            />
            <div className="quick-price-actions">
              <button type="submit" className="btn btn-primary">Buscar</button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setQuickScanCode('');
                  setQuickLookupResult(null);
                }}
              >
                Limpiar
              </button>
            </div>
          </form>

          {quickLookupResult && (
            <div className={`quick-price-result ${quickLookupResult.found ? 'found' : 'not-found'}`}>
              {quickLookupResult.found ? (
                <>
                  <div><strong>{quickLookupResult.product.name}</strong></div>
                  <div>Codigo: {quickLookupResult.product.barcode}</div>
                  <div>Precio: ${Number(quickLookupResult.product.price || 0).toLocaleString()}</div>
                  <div>Stock tienda: {(stock.ventas?.[quickLookupResult.product.id] ?? quickLookupResult.product.stock ?? 0).toLocaleString()}</div>
                </>
              ) : (
                <>
                  <div><strong>No encontrado</strong></div>
                  <div>Codigo: {quickLookupResult.scannedCode}</div>
                </>
              )}
            </div>
          )}

          {quickLookupHistory.length > 0 && (
            <div className="quick-price-history">
              <div className="quick-price-history-title">Ultimas consultas</div>
              {quickLookupHistory.map((entry) => (
                <div key={entry.id} className="quick-price-history-row">
                  <span>{entry.found ? entry.product.name : `No encontrado (${entry.scannedCode})`}</span>
                  <strong>{entry.found ? `$${Number(entry.product.price || 0).toLocaleString()}` : '--'}</strong>
                </div>
              ))}
            </div>
          )}
          </aside>
        </div>

        <div className="center-cash-widget">
          <div className="widget-label">EFECTIVO EN CAJA</div>
          <div className="widget-balance" style={{ color: cashBalance >= 0 ? '#10b981' : '#ef4444' }}>
            ${cashBalance.toLocaleString()}
          </div>
          <div className="widget-details">
            <span>Saldo de caja: {currentUser?.name || 'Sistema'}</span>
          </div>
        </div>

        {allowedMenuItems.length === 0 && (
          <div className="card" style={{ maxWidth: '580px', margin: '2rem auto', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Sin modulos habilitados</h3>
            <p style={{ margin: 0, color: '#64748b' }}>
              Este usuario no tiene permisos validos en el perfil. Verifica rol y permisos en Supabase (tabla profiles).
            </p>
          </div>
        )}

        {allowedMenuItems.map((item, index) => {
          const angle = (index / allowedMenuItems.length) * 2 * Math.PI - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          return (
            <div
              key={item.id}
              className={`radial-item item-${item.id}`}
              style={{
                left: `calc(50% + ${x}px - 60px)`,
                top: `calc(50% + ${y}px - 52px)`
              }}
              onClick={() => setActiveTab(item.tab)}
            >
              <div className="icon-circle">{item.icon}</div>
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const activeShiftOwnerRef = useMemo(
    () => (shift?.startTime ? buildShiftOwnerReference(shift, currentUser) : currentUser),
    [shift, currentUser]
  );

  const activeShiftReconciliationPreview = useMemo(() => {
    if (!shift?.startTime) return null;

    const summary = getShiftFinancialSnapshot(shift.startTime, getOperationalNowIso(), activeShiftOwnerRef);
    const systemAccounts = buildShiftSystemAccounts(summary);
    const netSystemTotal =
      Number(systemAccounts.efectivo || 0) +
      Number(systemAccounts.transferencia || 0) +
      Number(systemAccounts.tarjeta || 0) +
      Number(systemAccounts.credito || 0) +
      Number(systemAccounts.otros || 0);

    return { systemAccounts, netSystemTotal };
  }, [shift, activeShiftOwnerRef, salesHistory, expenses, purchases, auditLogs, allExternalCashReceipts, getOperationalNowIso]);

  const activeShiftInventorySummary = useMemo(() => {
    if (!shift?.startTime) return { rows: [], totals: { assignedQty: 0, soldQty: 0, expectedQty: 0 } };

    const summary = getShiftFinancialSnapshot(shift.startTime, getOperationalNowIso(), activeShiftOwnerRef);
    return summarizeShiftInventory({
      assignments: shift?.inventoryAssignments || [],
      shiftSales: summary.shiftSales,
    });
  }, [shift, activeShiftOwnerRef, salesHistory, getOperationalNowIso]);

  const activeShiftCashBalance = useMemo(() => {
    if (!shift?.startTime) return getUserCashBalance(currentUser);

    const summary = getShiftFinancialSnapshot(shift.startTime, getOperationalNowIso(), activeShiftOwnerRef);
    const initialCash = Number(shift?.initialCash || 0);
    return initialCash
      + Number(summary.salesBreakdown.cash || 0)
      + Number(summary.abonosBreakdown.cash || 0)
      + Number(summary.externalCashReceiptsBreakdown.cash || 0)
      + Number(summary.cashMovements.receivedFromVault || 0)
      + Number(summary.cashMovements.majorToMinor || 0)
      - Number(summary.cashMovements.returnedToVault || 0)
      - Number(summary.cashMovements.minorToMajor || 0)
      - Number(summary.expensesTotal || 0)
      - Number(summary.purchasesTotal || 0);
  }, [shift, currentUser, activeShiftOwnerRef, salesHistory, expenses, purchases, auditLogs, allExternalCashReceipts, getOperationalNowIso, userCashBalances]);

  const selectedClientPendingBalance = selectedClient
    ? (cartera || [])
        .filter((inv) =>
          String(inv?.clientDoc || '').trim() === String(selectedClient?.document || '').trim() ||
          String(inv?.clientName || '').trim().toLowerCase() === String(selectedClient?.name || '').trim().toLowerCase()
        )
        .reduce((sum, inv) => sum + Number(inv?.balance || 0), 0)
    : 0;

  const selectedClientAvailableCredit = selectedClient
    ? Math.max(0, Number(selectedClient?.creditLimit || 0) - selectedClientPendingBalance)
    : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
        <div className="spinner" style={{ width: '50px', height: '50px', border: '5px solid #f3f3f3', borderTop: '5px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p>Sincronizando con la nube...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <AuthPage
        onAuthSuccess={(user) => {
          applyUserWithProfile(user);
        }}
      />
    );
  }

  if (!shiftRestored) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
        <div className="spinner" style={{ width: '50px', height: '50px', border: '5px solid #f3f3f3', borderTop: '5px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p>Restaurando jornada...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const headerNavItems = getAllowedMenuItemsForUser(currentUser);
  const canViewShiftSystemResults = ['Administrador', 'Supervisor'].includes(normalizeRole(currentUser?.role));

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundImage: `radial-gradient(900px circle at 18% -10%, rgba(255, 0, 214, 0.18), transparent 55%),
          radial-gradient(900px circle at 85% 0%, rgba(0, 229, 255, 0.14), transparent 50%),
          linear-gradient(180deg, rgba(0, 0, 0, 0.92), rgba(0, 0, 0, 0.86)),
          url('${modulesBg}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundBlendMode: 'screen, screen, normal, overlay',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid rgba(255, 0, 214, 0.28)', paddingBottom: '1rem', boxShadow: '0 10px 30px rgba(255, 0, 214, 0.10)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', color: 'var(--neon-fuchsia)', textShadow: '0 0 14px rgba(255, 0, 214, 0.45)' }}>Sistema de Facturacion Pro</h1>
            <div style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {currentUser?.role || 'Usuario'}: <strong>{currentUser?.name || 'Sistema'}</strong> |
              {shift && (
                <ShiftManager
                  shift={shift}
                  onStartShift={onStartShift}
                  onEndShift={onEndShift}
                  reconciliationPreview={activeShiftReconciliationPreview}
                  products={products}
                  stock={stock}
                  activeShiftInventorySummary={activeShiftInventorySummary}
                  hideSystemResults={!canViewShiftSystemResults}
                />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '0.4rem 0.7rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 0, 214, 0.35)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                lineHeight: 1.2,
                boxShadow: '0 0 0 1px rgba(255, 0, 214, 0.16), 0 0 18px rgba(0, 229, 255, 0.12)'
              }}
            >
              <strong>HORA</strong>
              <span>{headerNow.toLocaleString('es-CO')}</span>
            </div>
            <div style={{ position: 'relative' }}>
              <button
                className="btn"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                style={{ position: 'relative', minWidth: '44px', backgroundColor: 'rgba(0, 0, 0, 0.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                title="Notificaciones"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .53-.21 1.04-.6 1.4L4 17h5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 17a3 3 0 0 0 6 0"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {unreadNotificationsCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      background: '#ef4444',
                      color: '#fff',
                      borderRadius: '999px',
                      fontSize: '0.7rem',
                      minWidth: '18px',
                      padding: '1px 5px'
                    }}
                  >
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '44px',
                    right: 0,
                    width: 'min(420px, 90vw)',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    background: 'rgba(12, 12, 24, 0.92)',
                    border: '1px solid rgba(0, 229, 255, 0.28)',
                    borderRadius: '12px',
                    boxShadow: '0 0 0 1px rgba(0, 229, 255, 0.18), 0 22px 56px rgba(0, 0, 0, 0.55)',
                    zIndex: 40,
                    padding: '10px'
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '8px' }}>Notificaciones</div>
                  {notifications.length === 0 && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Sin notificaciones.</p>}
                  {notifications.map((n) => (
                    <div key={n.id} style={{ border: '1px solid rgba(0, 229, 255, 0.20)', borderRadius: '8px', padding: '8px', marginBottom: '6px', background: 'rgba(0, 0, 0, 0.22)' }}>
                      <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{n.text}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(n.at).toLocaleString('es-CO')}</div>
                      {Array.isArray(n.attachments) && n.attachments.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                          {n.attachments.slice(0, 2).map((file) => (
                            String(file?.type || '').startsWith('image/') ? (
                              <img key={file.id} src={file.dataUrl} alt={file.name} style={{ width: '100%', maxWidth: '180px', borderRadius: '8px', border: '1px solid rgba(0, 229, 255, 0.22)' }} />
                            ) : (
                              <a key={file.id} href={file.dataUrl} download={file.name} className="btn">{file.name}</a>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {pendingAuthRequestsForManager.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>Autorizaciones pendientes</div>
                      {pendingAuthRequestsForManager.map((req) => (
                        <div key={req.id} style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                          <div style={{ fontSize: '0.84rem', marginBottom: '4px' }}>
                            {req.module || 'General'} - {req.reasonLabel || req.reasonType || 'Solicitud'} - {req.requestedBy?.name || 'N/A'} {Number(req.total || 0) > 0 ? `- $${Number(req.total || 0).toLocaleString()}` : ''}
                          </div>
                          {req.inventoryRequest && (
                            <div style={{ fontSize: '0.8rem', color: '#9a3412', marginBottom: '6px' }}>
                              Producto: {req.inventoryRequest.productName} | Cantidad: {Number(req.inventoryRequest.quantity || 0)} | Bodega: {Number(req.inventoryRequest.availableInBodega || 0)}
                            </div>
                          )}
                          {Array.isArray(req.attachments) && req.attachments.length > 0 && (
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                              {req.attachments.slice(0, 2).map((file) => (
                                String(file?.type || '').startsWith('image/') ? (
                                  <img key={file.id} src={file.dataUrl} alt={file.name} style={{ width: '100%', maxWidth: '220px', borderRadius: '8px', border: '1px solid #fdba74' }} />
                                ) : (
                                  <a key={file.id} href={file.dataUrl} download={file.name} className="btn">{file.name}</a>
                                )
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-primary" onClick={() => onResolveRemoteAuthRequest(req.id, 'APPROVED')}>Aprobar</button>
                            <button className="btn" onClick={() => onResolveRemoteAuthRequest(req.id, 'REJECTED')}>Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {ownInvoiceDrafts.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>Borradores guardados</div>
                      {ownInvoiceDrafts.map((draft) => (
                        <div key={draft.id} style={{ border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                          <div style={{ fontSize: '0.84rem', marginBottom: '4px' }}>
                            {draft.clientName || 'Cliente Ocasional'} - ${Number(draft.total || 0).toLocaleString()}
                          </div>
                          <button className="btn" onClick={() => onLoadInvoiceDraft(draft.id)}>Cargar borrador</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              className="btn"
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(0, 0, 0, 0.25)', color: 'var(--text-primary)' }}
              title="Cerrar sesion (Cerrar sesion NO termina la jornada)"
            >
              Salir
            </button>
          </div>
        </div>

        {shift && (
          <>
            <div className="neon-divider" />
            <nav className="neon-nav" aria-label="Navegacion">
              <button
                type="button"
                className={`neon-pill ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => setActiveTab('home')}
              >
                Inicio
              </button>
              {headerNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`neon-pill ${activeTab === item.tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.tab)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </>
        )}
      </header>
      <br />
      {!shift ? (
        <ShiftManager
          shift={shift}
          onStartShift={onStartShift}
          onEndShift={onEndShift}
          reconciliationPreview={activeShiftReconciliationPreview}
          products={products}
          stock={stock}
          activeShiftInventorySummary={activeShiftInventorySummary}
          hideSystemResults={!canViewShiftSystemResults}
        />
      ) : (
        <>
          {activeTab === 'home' && renderHome()}
          {activeTab === 'facturacion' && (
            <main style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
              <div className="left-column">
                <ClientSelector
                  clientName={clientName}
                  setClientName={setClientName}
                  registeredClients={registeredClients}
                  setSelectedClient={setSelectedClient}
                  selectedClient={selectedClient}
                  selectedClientPendingBalance={selectedClientPendingBalance}
                  selectedClientAvailableCredit={selectedClientAvailableCredit}
                />

                <div style={{ margin: '2rem 0' }}>
                  <ProductSelector onAddItem={handleAddItem} isAdmin={isAdminAuth} products={products} />
                  <InvoiceTable items={items} onRemoveItem={handleRemoveItem} />
                </div>

                {/* Hidden Printable Invoice Template */}
                <div className="printable-area only-print" style={{ padding: '20px', border: '1px solid #000' }}>
                  <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                    <img src={COMPANY_INFO.logo} alt="Logo" style={{ maxWidth: '120px' }} />
                    <h2 style={{ margin: '5px 0' }}>{COMPANY_INFO.name}</h2>
                    <p style={{ margin: '2px 0' }}>NIT: {COMPANY_INFO.nit}</p>
                    <p style={{ margin: '2px 0' }}>{COMPANY_INFO.address}</p>
                    <p style={{ margin: '2px 0' }}>Tel: {COMPANY_INFO.phone} | {COMPANY_INFO.email}</p>
                  </div>
                  <div style={{ borderBottom: '1px solid #000', marginBottom: '10px', paddingBottom: '10px' }}>
                    <p><strong>Factura:</strong> {new Date().getTime().toString().slice(-6)}</p>
                    <p><strong>Fecha:</strong> {getOperationalNow().toLocaleString()}</p>
                    <p><strong>Cliente:</strong> {clientName}</p>
                    {selectedClient && <p><strong>NIT/CC:</strong> {selectedClient.document}</p>}
                    <p><strong>Atendido por:</strong> {currentUser?.username}</p>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #000' }}>
                        <th style={{ textAlign: 'left' }}>Producto</th>
                        <th style={{ textAlign: 'center' }}>Cant.</th>
                        <th style={{ textAlign: 'right' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.name}</td>
                          <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ textAlign: 'right' }}>${item.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '15px', borderTop: '1px solid #000', paddingTop: '10px', textAlign: 'right' }}>
                    {deliveryFee > 0 && <p>Domicilio: ${deliveryFee.toLocaleString()}</p>}
                    {composerTotalDiscount > 0 && (
                      <p>{`Descuento: -$${Number(composerTotalDiscount || 0).toLocaleString()}`}</p>
                    )}
                    <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                      {`TOTAL: $${Number(composerTotal || 0).toLocaleString()}`}
                    </p>
                  </div>
                  <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.8rem' }}>
                    <p>Gracias por su compra.</p>
                    <p>CASA SMOKE Y ARTE - Cultura, Tattoo y Experiencia</p>
                  </div>
                </div>
              </div>

              <div className="right-column">
                <PaymentSummary
                  subtotal={subtotal}
                  deliveryFee={deliveryFee}
                  setDeliveryFee={setDeliveryFee}
                  paymentMode={paymentMode}
                  setPaymentMode={setPaymentMode}
                  clientName={clientName}
                  paymentRef={paymentRef}
                  setPaymentRef={setPaymentRef}
                  paymentMethods={paymentMethods}
                  selectedClientDiscount={Number(selectedClient?.discount || 0)}
                  onFacturar={handleFacturar}
                  selectedClient={selectedClient}
                  selectedClientPendingBalance={selectedClientPendingBalance}
                  selectedClientAvailableCredit={selectedClientAvailableCredit}
                  items={items}
                  adminPass={adminPass}
                  extraDiscount={composerExtraDiscount}
                  setExtraDiscount={setComposerExtraDiscount}
                  promotions={companyPromotions}
                  operationalNow={getOperationalNow()}
                  currentUser={currentUser}
                  onCreateRemoteAuthRequest={onCreateRemoteAuthRequest}
                  remoteAuthDecisionByRequestId={remoteAuthDecisionByRequestId}
                  remoteAuthRequestById={remoteAuthRequestById}
                  buildApprovalAttachments={(payload) => buildApprovalPreviewAttachments(payload)}
                  loadedDraftState={loadedDraftState}
                  onDraftStateChange={setInvoiceComposerMeta}
                  onSaveDraft={onSaveInvoiceDraft}
                  onFacturarCero={onFacturarCero}
                />
                <div className="card" style={{ marginTop: '1rem' }}>
                  <h3 style={{ marginTop: 0 }}>Borradores de Factura</h3>
                  {ownInvoiceDrafts.length === 0 ? (
                    <p style={{ margin: 0, color: '#64748b' }}>No tienes borradores guardados.</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {ownInvoiceDrafts.map((draft) => (
                        <div
                          key={draft.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '0.6rem',
                            background: '#f8fafc'
                          }}
                        >
                          <div style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                            <strong>{draft.clientName || 'Cliente Ocasional'}</strong> - ${Number(draft.total || 0).toLocaleString()}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.45rem' }}>
                            {new Date(draft.savedAt).toLocaleString('es-CO')} - {draft.id}
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button className="btn" onClick={() => onLoadInvoiceDraft(draft.id)}>Cargar</button>
                            <button className="btn" onClick={() => onDeleteInvoiceDraft(draft.id)}>Eliminar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </main>
          )}

          {activeTab === 'cartera' && (
            <CarteraModule
              currentUser={currentUser}
              clients={registeredClients}
              cartera={cartera}
              setCartera={async (newCartera) => {
                setCartera(newCartera);
                // Find the one that changed and sync to 'invoices' table
                const changed = newCartera.find(nc => {
                  const oc = cartera.find(ocItem => ocItem.id === nc.id);
                  if (!oc) return false;
                  return (
                    Number(oc.balance || 0) !== Number(nc.balance || 0) ||
                    String(oc.status || '') !== String(nc.status || '') ||
                    JSON.stringify(oc.abonos || []) !== JSON.stringify(nc.abonos || [])
                  );
                });
                if (changed) {
                  try {
                    const previous = cartera.find((oc) => oc.id === changed.id) || null;
                    // Update only the balance/status in the invoices table
                    const payload = {
                      ...changed,
                      id: changed.db_id || changed.id,
                      status: String(changed?.status || 'pendiente'),
                      mixed_details: {
                        ...(changed?.mixedDetails || {}),
                        cartera: {
                          balance: Number(changed?.balance || 0),
                          abonos: Array.isArray(changed?.abonos) ? changed.abonos : []
                        }
                      }
                    };
                    await dataService.saveInvoice(payload, changed.items);
                    setSalesHistory((prev) => prev.map((s) => {
                      const same = (s?.db_id && changed?.db_id && s.db_id === changed.db_id) || s.id === changed.id;
                      if (!same) return s;
                      return {
                        ...s,
                        status: changed.status,
                        balance: Number(changed.balance || 0),
                        abonos: Array.isArray(changed.abonos) ? changed.abonos : (s.abonos || []),
                        mixedDetails: payload.mixed_details
                      };
                    }));

                    const prevAbonos = Array.isArray(previous?.abonos) ? previous.abonos : [];
                    const nextAbonos = Array.isArray(changed?.abonos) ? changed.abonos : [];
                    if (nextAbonos.length > prevAbonos.length) {
                      const newAbono = nextAbonos[0];
                      const normalizedMethod = normalizePaymentMethodLabel(newAbono?.method);
                      if (normalizedMethod.includes('efectivo') || normalizedMethod.includes('contado') || normalizedMethod.includes('cash')) {
                        adjustUserCashBalance(currentUser, Number(newAbono?.amount || 0));
                      }
                      await addLog({
                        module: 'Cartera',
                        action: 'Registrar Abono',
                        details: `Factura ${changed.id} abono ${Number(newAbono?.amount || 0).toLocaleString()} (${newAbono?.method || 'N/A'}) saldo: ${Number(changed.balance || 0).toLocaleString()}`
                      });
                    }
                    if (String(previous?.status || '') !== String(changed?.status || '') && String(changed?.status || '').toLowerCase() === 'pagado') {
                      await addLog({
                        module: 'Cartera',
                        action: 'Factura Pagada',
                        details: `Factura ${changed.id} quedo pagada en su totalidad.`
                      });
                    }
                  } catch (e) {
                    console.error("Error sync Cartera:", e);
                  }
                }
              }}
            />
          )}
          {activeTab === 'compras' && currentUser?.role !== 'Cajero' && (
            <PurchasingModule
              warehouseStock={stock.bodega}
              currentUser={currentUser}
              userCashBalance={getUserCashBalance(currentUser)}
              setWarehouseStock={async (update) => {
                const newBodega = typeof update === 'function' ? update(stock.bodega) : update;
                setStock({ ...stock, bodega: newBodega });

                // Identify what changed to sync with Supabase
                const changedId = Object.keys(newBodega).find(id => newBodega[id] !== stock.bodega[id]);
                if (changedId) {
                  const prod = products.find(p => String(p.id) === String(changedId));
                  if (prod) {
                    try {
                      await dataService.updateProductStockById(
                        prod.id,
                        { warehouse_stock: Number(newBodega[changedId]) || 0 },
                        currentUser?.id
                      );
                    } catch (e) { console.error("Sync bodega error:", e); }
                  }
                }
              }}
              purchases={purchases}
              setPurchases={async (newPurchases) => {
                setPurchases(newPurchases);
              }}
              onRegisterPurchase={async (purchase) => {
                const qty = Number(purchase?.quantity) || 0;
                const unitCost = Number(purchase?.unitCost) || 0;
                const totalAmount = qty * unitCost;
                adjustUserCashBalance(currentUser, -totalAmount);
                try {
                  await dataService.savePurchase({
                    ...purchase,
                    user_id: currentUser?.id,
                    user_name: currentUser?.name || currentUser?.email || 'Sistema'
                  });
                  await syncFactMovement('purchase.created', {
                    purchaseId: purchase.id || `purchase-${Date.now()}`,
                    date: purchase.date,
                    supplierName: purchase.supplier,
                    total: totalAmount,
                    invoiceNumber: purchase.invoiceNumber,
                    userName: currentUser?.name || currentUser?.email || 'Sistema',
                    items: [{
                      productId: purchase.productId || null,
                      quantity: qty,
                      unitPrice: unitCost,
                    }],
                  });
                } catch (e) {
                  adjustUserCashBalance(currentUser, totalAmount);
                  console.error("Error guardando compra en Supabase:", e);
                  throw e;
                }
              }}
              products={products}
              onLog={(entry) => addLog({ ...entry, module: 'Compras' })}
            />
          )}
          {activeTab === 'clientes' && (
            <ClientModule
              currentUser={currentUser}
              clients={registeredClients}
              setClients={async (newClients) => {
                const previousClients = dedupeClients(registeredClients || []);
                const normalizedNextClients = dedupeClients(newClients || []);
                pendingClientsSyncRef.current = true;
                setRegisteredClients(normalizedNextClients);
                const removedClients = previousClients.filter(
                  (oldClient) => !normalizedNextClients.some((nextClient) => String(nextClient.document) === String(oldClient.document))
                );

                try {
                  if (removedClients.length > 0) {
                    for (const removed of removedClients) {
                      await dataService.deleteClient(removed);
                    }
                  }

                  const changedClients = normalizedNextClients.filter((nextClient) => {
                    const previous = previousClients.find((c) => c.document === nextClient.document);
                    return !previous || JSON.stringify(previous) !== JSON.stringify(nextClient);
                  });

                  for (const changed of changedClients) {
                    await dataService.saveClient({ ...changed, user_id: currentUser?.id });
                  }

                  await refreshCloudData({ silent: true });
                } catch (e) {
                  console.error("Error sincronizando clientes en Supabase:", e);
                  const message = e?.message || 'Error desconocido';
                  alert(`No se pudieron sincronizar clientes en la nube.\n\nDetalle: ${message}`);
                } finally {
                  pendingClientsSyncRef.current = false;
                }
              }}
              cartera={cartera}
              salesHistory={salesHistory}
              onLog={(entry) => addLog({ ...entry, module: 'Clientes' })}
            />
          )}
          {activeTab === 'caja' && (
            <MainCashier
              currentUser={currentUser}
              users={users}
              products={products}
              warehouseStock={stock.bodega}
              setWarehouseStock={async (update) => {
                const newBodega = typeof update === 'function' ? update(stock.bodega) : update;
                setStock(prev => ({ ...prev, bodega: newBodega }));
                const changedId = Object.keys(newBodega).find(id => newBodega[id] !== stock.bodega[id]);
                if (changedId) updateStockInDB('bodega', changedId, newBodega[changedId]);
              }}
              onLog={addLog}
              cajaMayor={cajaMayor}
              setCajaMayor={setCajaMayor}
              cajaMenor={cajaMenor}
              setCajaMenor={setCajaMenor}
              userCashBalances={userCashBalances}
              getCashUserKey={getCashUserKey}
              getUserCashBalance={getUserCashBalance}
              setUserCashBalance={setUserCashBalance}
              adjustUserCashBalance={adjustUserCashBalance}
              inventoryTransferRequests={inventoryTransferRequests}
              onCreateInventoryTransfer={createInventoryTransferRequest}
              onResolveInventoryTransfer={resolveInventoryTransferRequest}
              salesHistory={salesHistory}
              expenses={expenses}
              // Added missing shop stock sync
              shopStock={stock.ventas}
              setShopStock={async (update) => {
                const newVentas = typeof update === 'function' ? update(stock.ventas) : update;
                setStock(prev => ({ ...prev, ventas: newVentas }));
                const changedId = Object.keys(newVentas).find(id => newVentas[id] !== stock.ventas[id]);
                if (changedId) updateStockInDB('ventas', changedId, newVentas[changedId]);
              }}
            />
          )}
          {activeTab === 'inventario' && (
            <InventoryModule
              currentUser={currentUser}
              products={products}
              setProducts={async (newProducts) => {
                pendingProductsSyncRef.current = true;
                setProducts(newProducts);

                try {
                  const changedProducts = newProducts.filter((np) => {
                    const op = products.find((p) => String(p.id) === String(np.id));
                    if (!op) return true;
                    return JSON.stringify(op) !== JSON.stringify(np);
                  });

                  for (const changed of changedProducts) {
                    await dataService.saveProduct({ ...changed, user_id: currentUser?.id });
                  }

                  await refreshCloudData({ silent: true });
                } catch (e) {
                  console.error("Error guardando productos en Supabase:", e);
                  const message = e?.message || 'Error desconocido';
                  alert(`No se pudieron guardar productos en la nube (conexion inestable).\n\nDetalle: ${message}`);
                } finally {
                  pendingProductsSyncRef.current = false;
                }
              }}
              onDeleteProduct={async (productId) => {
                const removed = products.find((p) => String(p.id) === String(productId));
                if (!removed) return;

                pendingProductsSyncRef.current = true;
                try {
                  await dataService.deleteProduct(removed);
                  await refreshCloudData({ silent: true });
                } catch (e) {
                  console.error("Error eliminando producto en Supabase:", e);
                  const message = e?.message || 'Error desconocido';
                  alert(`No se pudo eliminar el producto en la nube (conexion inestable).\n\nDetalle: ${message}`);
                  throw e;
                } finally {
                  pendingProductsSyncRef.current = false;
                }
              }}
              onAdjustStock={async (product, target, delta, reason) => {
                const productId = product?.id;
                if (!productId) throw new Error('Producto invalido.');
                const normalizedTarget = target === 'bodega' ? 'bodega' : 'ventas';
                const currentValue = Number(stock?.[normalizedTarget]?.[productId] || 0);
                const nextValue = currentValue + Number(delta || 0);
                if (nextValue < 0) {
                  throw new Error('El ajuste deja stock negativo.');
                }

                setStock((prev) => ({
                  ...prev,
                  [normalizedTarget]: {
                    ...prev[normalizedTarget],
                    [productId]: nextValue
                  }
                }));

                await updateStockInDB(normalizedTarget, productId, nextValue);
                await addLog({
                  module: 'Inventario',
                  action: 'Ajuste Stock',
                  details: `${currentUser?.name || 'Usuario'} ajusto ${product?.name || productId} en ${normalizedTarget}: ${currentValue} -> ${nextValue}. Motivo: ${reason}`
                });
              }}
              onApplyInventoryCount={async (rows, reason) => {
                const safeRows = Array.isArray(rows) ? rows : [];
                for (const row of safeRows) {
                  const productId = String(row?.productId || '').trim();
                  if (!productId) continue;
                  const nextValue = Math.max(0, Number(row?.countedQty || 0));
                  const currentValue = Number(stock?.ventas?.[productId] || 0);

                  setStock((prev) => ({
                    ...prev,
                    ventas: {
                      ...prev.ventas,
                      [productId]: nextValue
                    }
                  }));

                  await updateStockInDB('ventas', productId, nextValue);
                  await addLog({
                    module: 'Inventario',
                    action: 'Ajuste Stock Conteo',
                    details: `${currentUser?.name || 'Usuario'} ajusto por conteo ${row?.productName || productId} en ventas: ${currentValue} -> ${nextValue}. Diferencia: ${Number(row?.diff || 0)}. Motivo: ${reason}`
                  });
                }
              }}
              stock={stock}
              setStock={setStock}
              categories={categories}
              onLog={addLog}
              setActiveTab={setActiveTab}
              setPreselectedProductId={setPreselectedProductId}
              shift={shift}
            />
          )}
          {activeTab === 'codigos' && (
            <BarcodeModule
              products={products}
              userId={currentUser?.id}
              canManageCodes={normalizeRole(currentUser?.role) !== 'Cajero'}
              setProducts={async (update) => {
                const newProducts = typeof update === 'function' ? update(products) : update;
                pendingProductsSyncRef.current = true;
                setProducts(dedupeProducts(newProducts));

                const changedProducts = newProducts.filter((np) => {
                  const op = products.find((p) => String(p.id) === String(np.id));
                  if (!op) return true;
                  return JSON.stringify(op) !== JSON.stringify(np);
                });

                try {
                  for (const changed of changedProducts) {
                    await dataService.saveProduct({ ...changed, user_id: currentUser?.id });
                  }
                  await refreshCloudData({ silent: true });
                } catch (e) {
                  console.error('Error sync producto desde codigos:', e);
                } finally {
                  pendingProductsSyncRef.current = false;
                }
              }}
              onLog={addLog}
              preselectedProductId={preselectedProductId}
              setPreselectedProductId={setPreselectedProductId}
            />
          )}
          {activeTab === 'reportes' && (
            <ReportsModule
              currentUser={currentUser}
              logs={auditLogs}
              sales={salesHistory}
              shiftHistory={shiftHistory}
              clients={registeredClients}
              inventory={stock}
              products={products}
              expenses={expenses}
              purchases={purchases}
              cartera={cartera}
              users={users}
              userCashBalances={userCashBalances}
            />
          )}
          {activeTab === 'bitacora' && <AuditLog logs={auditLogs} />}
	          {activeTab === 'config' && (
	            <SettingsModule
	              users={users} setUsers={setUsers}
	              paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods}
	              onSavePaymentMethods={saveCompanyPaymentMethods}
	              categories={categories} setCategories={setCategories}
	              onSaveCategories={saveCompanyCategories}
                products={products}
                sales={salesHistory}
                promotions={companyPromotions}
                setPromotions={setCompanyPromotions}
                onSavePromotions={saveCompanyPromotions}
	              onResetSystem={onResetSystem} onSaveSystem={onSaveSystem}
	              soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled}
	              soundVolume={soundVolume} setSoundVolume={setSoundVolume}
	              soundPreset={soundPreset} setSoundPreset={setSoundPreset}
	              operationalDateSettings={operationalDateSettings}
	              onApplyOperationalDateOffset={onApplyOperationalDateOffset}
                onApplyUserShiftCloseOverride={onApplyUserShiftCloseOverride}
	            />
	          )}
          {activeTab === 'trueque' && (
            <TruequeModule
              products={products}
              stock={stock}
              setStock={setStock}
              clients={registeredClients}
              onLog={addLog}
            />
          )}
          {activeTab === 'gastos' && (
            <GastosModule
              expenses={expenses}
              setExpenses={async (newExpenses) => {
                setExpenses(newExpenses);
              }}
              currentUser={currentUser}
              userCashBalance={getUserCashBalance(currentUser)}
              onRegisterExpense={async (expense) => {
                const amount = Number(expense?.amount || 0);
                const paidAmount = Math.max(0, Number(expense?.paidAmount ?? expense?.paid_amount ?? amount));
                adjustUserCashBalance(currentUser, -paidAmount);
                try {
                  await dataService.saveExpense({
                    ...expense,
                    user_id: currentUser?.id,
                    user_name: currentUser?.name || currentUser?.email || 'Sistema'
                  });
                  await syncFactMovement('expense.created', {
                    expenseId: expense.id || 'expense-' + Date.now(),
                    date: expense.date,
                    expenseType: expense.type || expense.category || 'Gasto',
                    beneficiary: expense.beneficiary || null,
                    description: expense.description || null,
                    total: amount,
                    paidAmount,
                    balance: Math.max(0, amount - paidAmount),
                    status: expense.status || 'Pagado',
                    userName: currentUser?.name || currentUser?.email || 'Sistema',
                  });
                } catch (err) {
                  adjustUserCashBalance(currentUser, paidAmount);
                  console.error("Error persistiendo gasto en Supabase:", err);
                  throw err;
                }
              }}
              onUpdateExpense={async (previousExpense, updatedExpense) => {
                const previousPaid = Math.max(0, Number(previousExpense?.paidAmount ?? previousExpense?.paid_amount ?? previousExpense?.amount ?? 0));
                const nextPaid = Math.max(0, Number(updatedExpense?.paidAmount ?? updatedExpense?.paid_amount ?? updatedExpense?.amount ?? 0));
                const deltaPaid = nextPaid - previousPaid;
                const targetCashKey = String(previousExpense?.user_id || updatedExpense?.user_id || '').trim() || getCashUserKey(currentUser);

                if (deltaPaid !== 0) {
                  adjustUserCashBalanceByKey(targetCashKey, -deltaPaid);
                }

                try {
                  await dataService.updateExpense(previousExpense?.id, {
                    ...updatedExpense,
                    user_id: previousExpense?.user_id || updatedExpense?.user_id || currentUser?.id,
                    user_name: previousExpense?.user_name || updatedExpense?.user_name || currentUser?.name || currentUser?.email || 'Sistema',
                  });
                  try {
                    await syncFactMovement('expense.updated', {
                      expenseId: previousExpense?.id || updatedExpense?.id,
                      date: updatedExpense?.date,
                      expenseType: updatedExpense?.type || updatedExpense?.category || 'Gasto',
                      beneficiary: updatedExpense?.beneficiary || null,
                      description: updatedExpense?.description || null,
                      total: Number(updatedExpense?.amount || 0),
                      paidAmount: nextPaid,
                      balance: Math.max(0, Number(updatedExpense?.amount || 0) - nextPaid),
                      status: updatedExpense?.status || 'Pagado',
                      userName: previousExpense?.user_name || updatedExpense?.user_name || currentUser?.name || currentUser?.email || 'Sistema',
                    });
                  } catch (syncErr) {
                    console.warn('CRM sync no disponible para expense.updated. El gasto ya fue actualizado en Supabase.', syncErr);
                  }
                } catch (err) {
                  if (deltaPaid !== 0) {
                    adjustUserCashBalanceByKey(targetCashKey, deltaPaid);
                  }
                  console.error("Error actualizando gasto en Supabase:", err);
                  throw err;
                }
              }}
              onLog={addLog}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === 'recibosCajaExternos' && (
            <ExternalCashReceiptModule
              receipts={allExternalCashReceipts}
              currentUser={currentUser}
              setActiveTab={setActiveTab}
              onCreateReceipt={async (receipt) => {
                const amount = Number(receipt?.amount || 0);
                const paymentMethod = String(receipt?.paymentMethod || '');

                if (paymentMethod === 'Efectivo') {
                  adjustUserCashBalance(currentUser, amount);
                }

                try {
                  let storedInTable = false;
                  try {
                    await dataService.saveExternalCashReceipt(receipt);
                    setExternalCashReceipts((prev) => mergeExternalCashReceipts([receipt], prev));
                    storedInTable = true;
                  } catch (saveError) {
                    console.warn('No se pudo guardar en external_cash_receipts; se usa respaldo en audit_logs.', saveError);
                  }

                  if (!storedInTable) {
                    await addLog({
                      module: 'Recibo de Caja externos',
                      action: 'Crear Recibo de Caja Externo',
                      details: buildExternalCashReceiptDetails(receipt),
                    });
                  }
                  await syncFactMovement('external_cash_receipt.created', {
                    receiptCode: receipt.receiptCode,
                    date: receipt.date,
                    customerName: receipt.thirdPartyName,
                    customerDoc: receipt.thirdPartyDocument || null,
                    total: amount,
                    paymentMode: paymentMethod,
                    notes: receipt.concept,
                    reference: receipt.paymentReference || '',
                    userName: currentUser?.name || currentUser?.email || 'Sistema',
                  });
                } catch (err) {
                  if (paymentMethod === 'Efectivo') {
                    adjustUserCashBalance(currentUser, -amount);
                  }
                  console.error('Error creando recibo de caja externo:', err);
                  throw err;
                }
              }}
            />
          )}
          {activeTab === 'notas' && (
            <NotasModule
              currentUser={currentUser}
              clients={registeredClients}
              sales={salesHistory}
              products={products}
              notes={commercialNotes}
              onLog={addLog}
              onSaveNote={saveCommercialNote}
              onCreateNote={async (note) => {
                await syncFactMovement('note.created', {
                  noteId: note.id,
                  date: note.date,
                  noteType: note.noteClass,
                  noteScope: note.scope,
                  invoiceId: note.invoiceId || null,
                  productId: note.productId || null,
                  productName: note.productName || null,
                  customerName: note.clientName,
                  customerDoc: note.clientDocument || null,
                  total: note.amount,
                  quantity: note.quantity || 0,
                  direction: note.direction,
                  reason: note.reasonLabel || note.description,
                  description: note.description,
                  userName: currentUser?.name || currentUser?.email || 'Sistema',
                });
              }}
            />
          )}
          {activeTab === 'historial' && (
            <HistorialModule
              sales={salesHistory}
              products={products}
              logs={auditLogs}
              currentUser={currentUser}
              isAdmin={currentUser?.role === 'Administrador'}
              onDeleteInvoice={onDeleteInvoice}
              onCancelInvoice={onCancelInvoice}
              onReturnInvoice={onReturnInvoice}
              onLog={addLog}
              preselectedProductId={preselectedProductId}
              setPreselectedProductId={setPreselectedProductId}
            />
          )}
          {activeTab === 'cierres' && <ShiftHistoryModule shiftHistory={shiftHistory} onLog={addLog} />}

        </>
      )}
      </div>
      <OperationsBoardBubble
        notes={boardNotes}
        onCreateNote={onCreateBoardNote}
        hasAttention={hasBoardAttention}
        onOpenChange={(isOpen) => {
          if (!isOpen) return;
          if (latestBoardNoteAt > Number(boardNotesSeenAt || 0)) {
            setBoardNotesSeenAt(latestBoardNoteAt);
          }
        }}
      />
      <SystemHelpBubble currentUser={currentUser} onLog={addLog} />
      {adminAuthModal.open && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200
        }}>
          <div className="card" style={{ width: '420px', maxWidth: '92vw' }}>
            <h3 style={{ marginTop: 0 }}>{adminAuthModal.title}</h3>
            <p style={{ color: 'var(--text-secondary)' }}>{adminAuthModal.message}</p>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Clave del administrador</label>
              <input
                type="password"
                className="input-field"
                inputMode="numeric"
                autoFocus
                value={adminAuthModal.value}
                onChange={(e) => setAdminAuthModal((prev) => ({ ...prev, value: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const pass = String(adminAuthModal.value || '').trim();
                    if (pass !== String(adminPass).trim()) {
                      alert('Clave incorrecta.');
                      return;
                    }
                    closeAdminAuthModal(true);
                  }
                  if (e.key === 'Escape') closeAdminAuthModal(false);
                }}
                placeholder="Ingrese la clave"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  const pass = String(adminAuthModal.value || '').trim();
                  if (pass !== String(adminPass).trim()) {
                    alert('Clave incorrecta.');
                    return;
                  }
                  closeAdminAuthModal(true);
                }}
              >
                Autorizar
              </button>
              <button className="btn" style={{ flex: 1 }} onClick={() => closeAdminAuthModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App




