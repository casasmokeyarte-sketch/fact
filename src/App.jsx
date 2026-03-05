import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './design-system.css'
import { CLIENT_OCASIONAL, PAYMENT_MODES, COMPANY_INFO } from './constants'
import { AuthPage } from './components/AuthPage'
import { onAuthStateChange, getCurrentUser, signOut } from './lib/authService'
import { ClientSelector } from './components/ClientSelector'
import { ProductSelector } from './components/ProductSelector'
import { InvoiceTable } from './components/InvoiceTable'
import { PaymentSummary } from './components/PaymentSummary'

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
import { NotasModule } from './components/NotasModule'
import { HistorialModule } from './components/HistorialModule'
import { ReportsModule } from './components/ReportsModule'
import { ShiftHistoryModule } from './components/ShiftHistoryModule'
import { SystemHelpBubble } from './components/SystemHelpBubble'
import { OperationsBoardBubble } from './components/OperationsBoardBubble'
import { printShiftClosure } from './lib/printReports'

import { dataService } from './lib/dataService'
import { getProfile } from './lib/databaseService'
import { initEmailJS } from './lib/emailService'
import { playSound } from './lib/soundService'
import { supabase } from './lib/supabaseClient'
import { useProfile } from './lib/useSupabase'
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
      notas: true,
      config: false
    };
  }

  return base;
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
const AUTH_REQUEST_LOG_PREFIX = 'AUTH_REQUEST_EVENT::';
const BOARD_NOTE_LOG_PREFIX = 'BOARD_NOTE_EVENT::';
const INVOICE_DRAFTS_STORAGE_KEY = 'fact_invoice_drafts';
const NOTIFICATIONS_SEEN_AT_STORAGE_KEY = 'fact_notifications_seen_at';
const BOARD_NOTES_SEEN_AT_STORAGE_KEY = 'fact_board_notes_seen_at';
const OPERATIONAL_DATE_SETTINGS_STORAGE_KEY = 'fact_operational_date_settings';
const LAST_SHIFT_CLOSE_BY_USER_STORAGE_KEY = 'fact_last_shift_close_by_user';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === 'string' && UUID_REGEX.test(value);

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
        reasonType: event.reasonType || existing?.reasonType || '',
        reasonLabel: event.reasonLabel || existing?.reasonLabel || '',
        note: event.note || existing?.note || '',
        clientName: event.clientName || existing?.clientName || '',
        total: Number(event.total ?? existing?.total ?? 0),
        paymentMode: event.paymentMode || existing?.paymentMode || '',
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
  const [purchases, setPurchases] = useState([]);

  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Products Catalog
  const [products, setProducts] = useState([]);

  // Shift State
  const [shift, setShift] = useState(null); // { startTime, initialCash }

  // Shared State
  const [clientName, setClientName] = useState(CLIENT_OCASIONAL);
  const [selectedClient, setSelectedClient] = useState(null); // Full client object if registered
  const [items, setItems] = useState([]);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState(['Efectivo', 'Credito', 'Transferencia', 'Tarjeta']);
  const [paymentMode, setPaymentMode] = useState('Efectivo');
  const [paymentRef, setPaymentRef] = useState('');
  const [quickScanCode, setQuickScanCode] = useState('');
  const [quickLookupResult, setQuickLookupResult] = useState(null);
  const [quickLookupHistory, setQuickLookupHistory] = useState([]);
  const [quickTrayOpen, setQuickTrayOpen] = useState(true);
  const quickScanInputRef = useRef(null);
  const quickScanBufferRef = useRef('');
  const quickScanLastKeyAtRef = useRef(0);
  const realtimeRefreshTimeoutRef = useRef(null);
  const realtimeRefreshInFlightRef = useRef(false);
  const queuedRealtimeRefreshRef = useRef(false);
  const lastAuthEventRef = useRef({ event: null, userId: null, at: 0 });
  const pendingProductsSyncRef = useRef(false);
  const pendingClientsSyncRef = useRef(false);

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
        notas: true,
        historial: true,
        cierres: true
      }
    }
  ]);
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
  const [invoiceDrafts, setInvoiceDrafts] = useState(() => {
    try {
      const raw = localStorage.getItem(INVOICE_DRAFTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
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
  const lastBoardNoteSoundAtRef = useRef(0);

  const getActiveTabStorageKey = (userId) => `${ACTIVE_TAB_STORAGE_KEY}_${userId}`;
  const getQuickTrayStorageKey = (userId) => `${QUICK_TRAY_OPEN_STORAGE_KEY}_${userId || 'anon'}`;
  const getQuickLookupHistoryStorageKey = (userId) => `${QUICK_LOOKUP_HISTORY_STORAGE_KEY}_${userId || 'anon'}`;
  const getProductsCacheStorageKey = (userId) => `${PRODUCTS_CACHE_STORAGE_KEY}_${userId || 'anon'}`;
  const getClientsCacheStorageKey = (userId) => `${CLIENTS_CACHE_STORAGE_KEY}_${userId || 'anon'}`;
  const MAX_OPEN_SHIFT_HOURS = 24;
  const MAX_OPEN_SHIFT_MS = MAX_OPEN_SHIFT_HOURS * 60 * 60 * 1000;

  const saveOpenShift = (userId, openShift) => {
    if (!userId || !openShift) return;
    localStorage.setItem(
      OPEN_SHIFT_STORAGE_KEY,
      JSON.stringify({
        userId,
        shift: openShift
      })
    );
  };

  const clearOpenShift = () => {
    localStorage.removeItem(OPEN_SHIFT_STORAGE_KEY);
  };

  const restoreOpenShift = (userId) => {
    try {
      const raw = localStorage.getItem(OPEN_SHIFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.userId === userId && parsed?.shift) {
        const startMs = new Date(parsed.shift?.startTime).getTime();
        const ageMs = Date.now() - startMs;
        const isValidStart = Number.isFinite(startMs) && !Number.isNaN(startMs);
        const isStaleOpenShift = isValidStart && ageMs > MAX_OPEN_SHIFT_MS;

        if (!isValidStart || isStaleOpenShift) {
          clearOpenShift();
          if (isStaleOpenShift) {
            console.warn(`Jornada abierta descartada por antiguedad (${MAX_OPEN_SHIFT_HOURS}h max).`);
          }
          return;
        }

        setShift(parsed.shift);
      }
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

  // Initialize EmailJS and Auth on app load
  useEffect(() => {
    initEmailJS();
    checkAuthStatus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setHeaderNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      restoreOpenShift(user.id);
      restoreActiveTab(user.id);
      restoreQuickTrayState(user.id);
      restoreQuickLookupHistory(user.id);
      restoreCloudCache(user.id);
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
      restoreOpenShift(user.id);
      restoreActiveTab(user.id);
      restoreQuickTrayState(user.id);
      restoreQuickLookupHistory(user.id);
      restoreCloudCache(user.id);
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
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [])

  // Handle logout
  const handleLogout = async () => {
    const { error } = await signOut();
    if (!error) {
      setIsLoggedIn(false);
      setCurrentUser(null);
      setActiveTab('home');
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
      const [dbProducts, dbClients, dbSales, dbExpenses, dbPurchases, dbLogs, dbShiftHistory] = await Promise.all([
        dataService.getProducts(),
        dataService.getClients(),
        dataService.getInvoices(),
        dataService.getExpenses(),
        dataService.getPurchases(),
        dataService.getAuditLogs(),
        dataService.getShiftHistory()
      ]);

      const safeProducts = dedupeProducts(dbProducts || []);
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
        setRegisteredClients(dedupeClients(dbClients || []));
      }
      setSalesHistory(enrichedSales);
      setExpenses(enrichedExpenses);
      setPurchases(enrichedPurchases);
      setAuditLogs(dbLogs || []);
      setShiftHistory(enrichedShiftHistory);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, scheduleRealtimeRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_history' }, scheduleRealtimeRefresh)
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
  }, [isLoggedIn, currentUser?.id, refreshCloudData]);

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
    localStorage.setItem(getQuickTrayStorageKey(currentUser.id), quickTrayOpen ? '1' : '0');
  }, [quickTrayOpen, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(
      getQuickLookupHistoryStorageKey(currentUser.id),
      JSON.stringify(quickLookupHistory.slice(0, 8))
    );
  }, [quickLookupHistory, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(getProductsCacheStorageKey(currentUser.id), JSON.stringify(dedupeProducts(products || [])));
  }, [products, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(getClientsCacheStorageKey(currentUser.id), JSON.stringify(dedupeClients(registeredClients || [])));
  }, [registeredClients, currentUser?.id]);

  useEffect(() => {
    localStorage.setItem(REMOTE_AUTH_REQUESTS_STORAGE_KEY, JSON.stringify(remoteAuthRequests.slice(0, 120)));
  }, [remoteAuthRequests]);

  useEffect(() => {
    localStorage.setItem(INVOICE_DRAFTS_STORAGE_KEY, JSON.stringify((invoiceDrafts || []).slice(0, 120)));
  }, [invoiceDrafts]);

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

  const onResetSystem = () => {
    if (confirm("ESTA SEGURO? Esta accion borrara todas las ventas, clientes, deudas y bitacora.")) {
      setSalesHistory([]);
      setCartera([]);
      setRegisteredClients([]);
      setAuditLogs([]);
      setShiftHistory([]);
      setStock({ bodega: {}, ventas: {} });
      setUserCashBalances({});
      alert("Sistema reiniciado a valores de fabrica.");
      window.location.reload();
    }
  };

  const onSaveSystem = () => {
    const systemData = {
      sales: salesHistory,
      clients: registeredClients,
      inventory: stock,
      debts: cartera,
      shiftHistory: shiftHistory,
      audit: auditLogs,
      timestamp: new Date().toISOString()
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(systemData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `respaldo_sistema_${new Date().getTime()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
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
        reasonType: requestRecord.reasonType,
        reasonLabel: requestRecord.reasonLabel,
        note: requestRecord.note || '',
        clientName: requestRecord.clientName || '',
        total: Number(requestRecord.total || 0),
        paymentMode: requestRecord.paymentMode || ''
      })}`
    });

    return requestId;
  };

  const onResolveRemoteAuthRequest = (requestId, decision) => {
    if (!requestId || !['APPROVED', 'REJECTED'].includes(decision)) return;
    const resolvedBy = {
      id: currentUser?.id || null,
      name: currentUser?.name || currentUser?.email || 'Usuario',
      role: normalizeRole(currentUser?.role)
    };

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

  const onApplyOperationalDateOffset = ({ daysOffset = 0, reason = '' } = {}) => {
    const normalizedOffset = Math.max(-30, Math.min(30, Math.trunc(Number(daysOffset) || 0)));
    const cleanReason = String(reason || '').trim();

    if (normalizedOffset !== 0 && cleanReason.length < 10) {
      alert('Debe escribir un motivo claro (minimo 10 caracteres).');
      return false;
    }

    const nextSettings = {
      daysOffset: normalizedOffset,
      reason: normalizedOffset === 0 ? '' : cleanReason,
      appliedBy: currentUser?.name || currentUser?.email || 'Sistema',
      appliedAt: new Date().toISOString(),
    };

    setOperationalDateSettings(nextSettings);

    addLog({
      module: 'Configuracion',
      action: normalizedOffset === 0 ? 'Fecha operativa restablecida' : 'Fecha operativa ajustada',
      details: normalizedOffset === 0
        ? 'Se restablecio la fecha operativa al dia real del sistema.'
        : `Offset aplicado: ${normalizedOffset} dia(s). Motivo: ${cleanReason}`,
    });

    return true;
  };

  const resetInvoiceComposer = () => {
    setItems([]);
    setClientName(CLIENT_OCASIONAL);
    setSelectedClient(null);
    setDeliveryFee(0);
    setPaymentMode(PAYMENT_MODES.CONTADO);
    setPaymentRef('');
  };

  const onSaveInvoiceDraft = async (draftExtra = {}) => {
    if ((items || []).length === 0) {
      alert('No hay productos para guardar en borrador.');
      return;
    }

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
      autoDiscountPercent: Number(selectedClient?.discount || 0),
      autoDiscountAmount: subtotal * (Number(selectedClient?.discount || 0) / 100),
      total: Math.max(0, subtotal + deliveryFee - (subtotal * (Number(selectedClient?.discount || 0) / 100)) - Number(draftExtra?.extraDiscount || 0)),
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
          text: `Solicitud pendiente: ${req.reasonLabel || req.reasonType || 'Autorizacion'} (${req.requestedBy?.name || 'N/A'})`,
        });
      }
      if (String(req?.requestedBy?.id || '') === String(ownUserId || '') && (req?.status === 'APPROVED' || req?.status === 'REJECTED')) {
        list.push({
          id: `auth-resolved-${req.id}-${req.status}`,
          at: resolvedAt || createdAt || Date.now(),
          text: `Tu solicitud ${req.id} fue ${req.status === 'APPROVED' ? 'APROBADA' : 'RECHAZADA'}.`,
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

  const onStartShift = (initialCash) => {
    const startCash = Number(initialCash) > 0 ? Number(initialCash) : 0;
    const nowIso = getOperationalNowIso();
    const nowRealDateKey = getRealDateKey();
    const closeMap = readLastShiftCloseByUser();
    const userKey = String(currentUser?.id || '');
    const lastClosedDateKey = String(closeMap[userKey] || '');

    if (userKey && lastClosedDateKey && lastClosedDateKey === nowRealDateKey) {
      const isAdminUser = normalizeRole(currentUser?.role) === 'Administrador';
      if (!isAdminUser) {
        alert(`Este usuario ya cerro jornada hoy (${nowRealDateKey}). Solo podra iniciar nueva jornada cuando cambie al siguiente dia real del sistema.`);
        return;
      }

      const allowReopen = confirm(
        `Este usuario ya cerro jornada hoy (${nowRealDateKey}).\n\nComo administrador puede hacer una reapertura excepcional.\n\nDesea continuar?`
      );
      if (!allowReopen) return;

      const pass = String(prompt('Ingrese clave Admin para autorizar reapertura de jornada:') || '').trim();
      if (pass !== 'Admin') {
        alert('Clave incorrecta. No se autorizo reapertura.');
        return;
      }

      addLog({
        module: 'Jornada',
        action: 'Reapertura Excepcional',
        details: `Reapertura autorizada para ${currentUser?.name || 'Usuario'} en fecha real ${nowRealDateKey}.`
      });
    }

    const openShift = {
      startTime: nowIso,
      initialCash: startCash,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || currentUser?.email || 'Sistema'
    };
    setShift(openShift);
    setUserCashBalance(currentUser, startCash);
    saveOpenShift(currentUser?.id, openShift);
    addLog({ module: 'Jornada', action: 'Inicio Jornada', details: `Iniciada con base de $${startCash}` });
  };

  const isDateInRange = (dateValue, startIso, endIso) => {
    if (!dateValue || !startIso || !endIso) return false;
    const date = new Date(dateValue).getTime();
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (Number.isNaN(date) || Number.isNaN(start) || Number.isNaN(end)) return false;
    return date >= start && date <= end;
  };

  const isRecordOwnedByUser = (record, user) => {
    const recordUserId = String(record?.user_id || record?.userId || '').trim();
    const currentUserId = String(user?.id || '').trim();
    if (recordUserId && currentUserId) return recordUserId === currentUserId;

    const recordUserName = String(record?.user_name || record?.user || '').trim().toLowerCase();
    const currentUserName = String(user?.name || user?.email || '').trim().toLowerCase();
    if (recordUserName && currentUserName) return recordUserName === currentUserName;

    return false;
  };

  const parseMoneyFromText = (text) => {
    const match = String(text || '').match(/\$([\d\.,]+)/);
    if (!match?.[1]) return 0;
    return Number(match[1].replace(/[^\d]/g, '')) || 0;
  };

  const getShiftFinancialSnapshot = (startIso, endIso, userRef = currentUser) => {
    const shiftSales = salesHistory.filter((sale) =>
      isDateInRange(sale.date, startIso, endIso) &&
      isRecordOwnedByUser(sale, userRef)
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
      const total = Number(sale.total) || 0;
      acc.gross += total;

      if (sale.paymentMode === PAYMENT_MODES.CONTADO) acc.cash += total;
      else if (sale.paymentMode === PAYMENT_MODES.CREDITO) acc.credit += total;
      else if (sale.paymentMode === PAYMENT_MODES.TRANSFERENCIA) acc.transfer += total;
      else if (sale.paymentMode === PAYMENT_MODES.TARJETA) acc.card += total;
      else if (sale.paymentMode === 'Mixto') {
        acc.cash += Number(sale.mixedDetails?.cash) || 0;
        acc.credit += Number(sale.mixedDetails?.credit) || 0;
      } else {
        acc.other += total;
      }

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
      const method = String(abono?.method || '').trim().toLowerCase();
      acc.total += amount;
      if (method.includes('efectivo')) acc.cash += amount;
      else if (method.includes('transfer')) acc.transfer += amount;
      else if (method.includes('tarjeta')) acc.card += amount;
      else if (method.includes('credit')) acc.credit += amount;
      else acc.other += amount;
      return acc;
    }, { total: 0, cash: 0, transfer: 0, card: 0, credit: 0, other: 0 });

    return {
      shiftSales,
      shiftExpenses,
      shiftPurchases,
      shiftCashLogs,
      shiftCarteraAbonos,
      salesBreakdown,
      abonosBreakdown,
      expensesTotal,
      purchasesTotal,
      cashMovements
    };
  };

  const onEndShift = (data) => {
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
    const summary = getShiftFinancialSnapshot(shift.startTime, shiftEndIso, currentUser);
    const hasAnyUserMovement =
      summary.shiftSales.length > 0 ||
      summary.shiftExpenses.length > 0 ||
      summary.shiftPurchases.length > 0 ||
      summary.shiftCashLogs.length > 0;
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

    const systemAccounts = {
      efectivo: Number(summary.salesBreakdown.cash || 0) + Number(summary.abonosBreakdown.cash || 0) + Number(summary.cashMovements.receivedFromVault || 0) + Number(summary.cashMovements.majorToMinor || 0) - Number(summary.cashMovements.returnedToVault || 0) - Number(summary.cashMovements.minorToMajor || 0),
      transferencia: Number(summary.salesBreakdown.transfer || 0) + Number(summary.abonosBreakdown.transfer || 0),
      tarjeta: Number(summary.salesBreakdown.card || 0) + Number(summary.abonosBreakdown.card || 0),
      credito: Number(summary.salesBreakdown.credit || 0) + Number(summary.abonosBreakdown.credit || 0),
      otros: Number(summary.salesBreakdown.other || 0) + Number(summary.abonosBreakdown.other || 0),
      gastos: Number(summary.expensesTotal || 0),
      inversion: Number(summary.purchasesTotal || 0),
    };

    const totalDeclarado = requiredAccountKeys.reduce((sum, key) => sum + Number(enteredAccounts[key] || 0), 0);
    const totalSistema = requiredAccountKeys.reduce((sum, key) => sum + Number(systemAccounts[key] || 0), 0);
    const discrepancy = totalDeclarado - totalSistema;
    const accountDiffs = requiredAccountKeys.map((key) => ({
      key,
      declarado: Number(enteredAccounts[key] || 0),
      sistema: Number(systemAccounts[key] || 0),
      diff: Number(enteredAccounts[key] || 0) - Number(systemAccounts[key] || 0)
    }));
    const hasAccountMismatch = accountDiffs.some((row) => Math.abs(row.diff) > 1);
    let authorizedMismatch = false;

    if (Math.abs(discrepancy) > 1 || hasAccountMismatch) {
      const pass = String(prompt('DESCUADRE DETECTADO. Ingrese clave Admin para autorizar cierre con descuadre:') || '').trim();
      if (pass !== 'Admin') {
        alert('Clave incorrecta o no autorizada. Debe cuadrar la caja.');
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
      `Abonos Cartera: ${Number(summary.abonosBreakdown.total || 0).toLocaleString()} (${summary.shiftCarteraAbonos.length} abono(s))`,
      `Cuenta EFECTIVO: Sistema ${Number(systemAccounts.efectivo || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.efectivo || 0).toLocaleString()}`,
      `Cuenta TRANSFERENCIA: Sistema ${Number(systemAccounts.transferencia || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.transferencia || 0).toLocaleString()}`,
      `Cuenta TARJETA: Sistema ${Number(systemAccounts.tarjeta || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.tarjeta || 0).toLocaleString()}`,
      `Cuenta CREDITO: Sistema ${Number(systemAccounts.credito || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.credito || 0).toLocaleString()}`,
      `Cuenta OTROS: Sistema ${Number(systemAccounts.otros || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.otros || 0).toLocaleString()}`,
      `Cuenta GASTOS/EGRESOS: Sistema ${Number(systemAccounts.gastos || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.gastos || 0).toLocaleString()}`,
      `Cuenta COMPRAS/INVERSION: Sistema ${Number(systemAccounts.inversion || 0).toLocaleString()} | Declarado ${Number(enteredAccounts.inversion || 0).toLocaleString()}`,
      `TOTAL SISTEMA (cuentas): ${Number(totalSistema || 0).toLocaleString()}`,
      `TOTAL DECLARADO (cuentas): ${Number(totalDeclarado || 0).toLocaleString()}`,
      `Diferencia Total: ${Number(discrepancy || 0).toLocaleString()}`,
      `Cierre con autorizacion admin: ${authorizedMismatch ? 'SI' : 'NO'}`,
      `Cierre sin movimientos: ${hasAnyUserMovement ? 'NO' : 'SI'}`,
      ...(hasAnyUserMovement ? [] : [`Motivo cierre sin movimientos: ${emptyCloseReason}`]),
      ...(accountDiffs.map((row) => `Diff ${String(row.key).toUpperCase()}: ${Number(row.diff || 0).toLocaleString()}`)),
      '------------------------------------------',
      'MOVIMIENTOS DE CAJA INTERNOS (INFO)',
      `Mayor -> Menor: ${summary.cashMovements.majorToMinor.toLocaleString()}`,
      `Menor -> Mayor: ${summary.cashMovements.minorToMajor.toLocaleString()}`,
      `Recibido de Boveda (Cajero): ${summary.cashMovements.receivedFromVault.toLocaleString()}`,
      `Devuelto a Boveda (Cajero): ${summary.cashMovements.returnedToVault.toLocaleString()}`,
      ...(summary.shiftCashLogs.length > 0
        ? summary.shiftCashLogs.map((log) => `${new Date(log.timestamp).toLocaleString()} | ${log.action} | ${log.details || ''}`)
        : ['Sin movimientos internos de caja en la jornada.']),
      '------------------------------------------',
      'DETALLE DE VENTAS',
      ...(summary.shiftSales.length > 0
        ? summary.shiftSales.map((sale) => `#${sale.id} | ${new Date(sale.date).toLocaleString()} | ${sale.clientName} | ${sale.paymentMode} | ${Number(sale.total || 0).toLocaleString()}`)
        : ['Sin ventas en la jornada.']),
      '------------------------------------------',
      'DETALLE DE GASTOS',
      ...(summary.shiftExpenses.length > 0
        ? summary.shiftExpenses.map((gasto) => `${new Date(gasto.date).toLocaleString()} | ${gasto.type || 'Gasto'} | ${gasto.description || 'Sin descripcion'} | -${Number(gasto.amount || 0).toLocaleString()}`)
        : ['Sin gastos en la jornada.']),
      '------------------------------------------',
      'DETALLE DE COMPRAS / INVERSION',
      ...(summary.shiftPurchases.length > 0
        ? summary.shiftPurchases.map((compra) => {
            const qty = Number(compra.quantity) || 0;
            const unitCost = Number(compra.unitCost) || 0;
            return `${new Date(compra.date).toLocaleString()} | Fact. ${compra.invoiceNumber || 'N/A'} | ${compra.productName || 'Producto'} x${qty} | -${(qty * unitCost).toLocaleString()}`;
          })
        : ['Sin compras/inversion en la jornada.']),
      '------------------------------------------',
      'FIRMAS',
      'Firma Asesor/Cajero: ____________________________',
      'Firma Supervisor/Admin: _________________________',
      'Sello Empresa: __________________________________',
      '------------------------------------------'
    ];

    const reportText = reportLines.join('\n');

    const shiftData = {
      id: Date.now(),
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

  const handleFacturar = async (mixedData = null, extraDiscount = 0, invoiceMeta = {}) => {
    if (items.length === 0) return alert("Agregue productos primero");
    if (selectedClient?.blocked) {
      return alert("Este cliente esta bloqueado por Administracion. No puede facturar hasta ser desbloqueado.");
    }
    const isInternalZero = invoiceMeta?.internalZero === true;

    // Stock Validation
    for (const item of items) {
      if ((stock.ventas[item.id] || 0) < item.quantity) {
        return alert(`Inventario insuficiente para ${item.name}. Solo hay ${stock.ventas[item.id] || 0} en punto de venta.`);
      }
    }

    // Reference validation for non-Cash/Credit
    const needsRef = ![PAYMENT_MODES.CONTADO, PAYMENT_MODES.CREDITO].includes(paymentMode);
    if (!isInternalZero && needsRef && !paymentRef) return alert("Debe ingresar el numero de referencia de la transferencia");

    // Credit Limit check (Individual Invoice Max)
    const isCreditPortion = paymentMode === PAYMENT_MODES.CREDITO || mixedData?.credit > 0;
    const automaticDiscountPercent = Number(selectedClient?.discount || 0);
    const automaticDiscountAmount = subtotal * (automaticDiscountPercent / 100);
    const totalDiscount = automaticDiscountAmount + Number(extraDiscount || 0);
    const totalAfterDiscounts = Math.max(0, subtotal + deliveryFee - totalDiscount);
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
      extraDiscount: Number(extraDiscount || 0),
      totalDiscount,
      total: finalTotal,
      paymentMode: finalMode,
      authorization,
      mixedDetails: {
        ...(mixedData || {}),
        invoiceCode,
        discount: {
          automaticPercent: automaticDiscountPercent,
          automaticAmount: automaticDiscountAmount,
          extraAmount: Number(extraDiscount || 0),
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
      user_id: currentUser?.id
    };

    // Reduce stock locally
    const newStockVentas = { ...stock.ventas };
    items.forEach(item => {
      newStockVentas[item.id] = (newStockVentas[item.id] || 0) - item.quantity;

      // PERSIST stock reduction to Supabase product table
      const prod = products.find(p => p.id === item.id);
      if (prod) {
        dataService
          .updateProductStockById(prod.id, { stock: Number(newStockVentas[item.id]) || 0 }, currentUser?.id)
          .catch(e => console.error("Error updating stock on SALE:", e));
      }
    });
    setStock({ ...stock, ventas: newStockVentas });

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

    const updatedInvoice = {
      ...invoice,
      id: invoice?.db_id || invoice?.id,
      status: 'anulada',
      mixedDetails: {
        ...(invoice?.mixedDetails || {}),
        cancellation: {
          at: new Date().toISOString(),
          by: currentUser?.name || currentUser?.email || 'Sistema',
          reason
        }
      }
    };

    setSalesHistory((prev) => prev.map((s) => {
      const same = (s?.db_id && invoice?.db_id && s.db_id === invoice.db_id) || s.id === invoice.id;
      return same ? { ...s, status: 'anulada', mixedDetails: updatedInvoice.mixedDetails } : s;
    }));
    setCartera((prev) => prev.filter((c) => c.id !== invoice.id));

    try {
      await dataService.saveInvoice(updatedInvoice, invoice.items || []);
    } catch (e) {
      console.error('Error actualizando factura anulada en nube:', e);
    }

    addLog({
      module: 'Facturacion',
      action: 'Cancelar Factura',
      details: `Factura ${invoice.id} anulada. Motivo: ${reason}. Stock devuelto a ventas.`
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
          by: currentUser?.name || currentUser?.email || 'Sistema'
        }
      }
    };

    setSalesHistory((prev) => prev.map((s) => {
      const same = (s?.db_id && invoice?.db_id && s.db_id === invoice.db_id) || s.id === invoice.id;
      return same ? { ...s, status: 'devuelta', mixedDetails: updatedInvoice.mixedDetails } : s;
    }));
    setCartera((prev) => prev.filter((c) => c.id !== invoice.id));

    try {
      await dataService.saveInvoice(updatedInvoice, invoice.items || []);
    } catch (e) {
      console.error('Error actualizando factura devuelta en nube:', e);
    }

    addLog({
      module: 'Facturacion',
      action: 'Devolucion Factura',
      details: `Factura ${invoice.id} devuelta (${mode}). Motivo: ${reason}. Stock reintegrado.`
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

  const renderHome = () => {
    const menuItems = [
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
      { id: 'notas', label: 'Notas', icon: '\uD83D\uDCD2', tab: 'notas' },
      { id: 'historial', label: 'Historial', icon: '\u23F3', tab: 'historial' },
      { id: 'cierres', label: 'Cierres', icon: '\uD83D\uDD12', tab: 'cierres' },
      { id: 'config', label: 'Configuracion', icon: '\u2699\uFE0F', tab: 'config' },
    ];

    const currentRole = normalizeRole(currentUser?.role);
    const isCashierRole = currentRole === 'Cajero';
    const isSupervisorRole = currentRole === 'Supervisor';

    const allowedMenuItems = currentRole === 'Administrador'
      ? menuItems
      : isCashierRole
        ? menuItems.filter((item) => ['facturacion', 'inventario', 'codigos', 'clientes', 'cartera', 'historial', 'caja', 'trueque', 'gastos', 'notas'].includes(item.tab))
        : isSupervisorRole
          ? menuItems.filter((item) => {
              const permission = currentUser?.permissions?.[item.tab];
              return permission === true || (typeof permission === 'object' && permission !== null);
            })
        : menuItems.filter(item => {
            const permission = currentUser?.permissions?.[item.tab];
            // Si el permiso es true (boolean) o un objeto (con sub-permisos), mostrar
            // Si es false o undefined, ocultar
            return permission === true || (typeof permission === 'object' && permission !== null);
          });

    const cashBalance = getUserCashBalance(currentUser);

    const radius = 255;

    return (
      <div className="radial-container">
        <div className={`quick-price-wrapper ${quickTrayOpen ? 'open' : 'closed'}`}>
          <button
            type="button"
            className="quick-price-tab"
            onClick={() => setQuickTrayOpen(prev => !prev)}
            title={quickTrayOpen ? 'Ocultar consulta rapida' : 'Mostrar consulta rapida'}
          >
            {quickTrayOpen ? 'Ocultar' : 'Consulta'}
          </button>
          <aside className="quick-price-tray">
          <h3>Consulta Rapida</h3>
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

  const activeShiftSalesTotal = shift?.startTime
    ? getShiftFinancialSnapshot(shift.startTime, getOperationalNowIso(), currentUser).salesBreakdown.gross
    : 0;

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

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundImage: `linear-gradient(135deg, rgba(255, 255, 255, 0.48) 0%, rgba(255, 255, 255, 0.48) 100%), url('${modulesBg}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', color: '#1e293b' }}>Sistema de Facturacion Pro</h1>
            <div style={{ color: '#64748b', margin: '0.5rem 0 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {currentUser?.role || 'Usuario'}: <strong>{currentUser?.name || 'Sistema'}</strong> |
              <ShiftManager
                shift={shift}
                onStartShift={onStartShift}
                onEndShift={onEndShift}
                salesTotal={activeShiftSalesTotal}
              />
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
                backgroundColor: '#fff7ed',
                border: '1px solid #fdba74',
                color: '#9a3412',
                fontSize: '0.75rem',
                lineHeight: 1.2
              }}
            >
              <strong>HORA</strong>
              <span>{headerNow.toLocaleString('es-CO')}</span>
            </div>
            <div style={{ position: 'relative' }}>
              <button
                className="btn"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                style={{ position: 'relative', minWidth: '44px', backgroundColor: '#f8fafc' }}
                title="Notificaciones"
              >
                🔔
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
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 14px 34px rgba(15, 23, 42, 0.18)',
                    zIndex: 40,
                    padding: '10px'
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '8px' }}>Notificaciones</div>
                  {notifications.length === 0 && <p style={{ margin: 0, color: '#64748b' }}>Sin notificaciones.</p>}
                  {notifications.map((n) => (
                    <div key={n.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                      <div style={{ fontSize: '0.88rem', color: '#0f172a' }}>{n.text}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(n.at).toLocaleString('es-CO')}</div>
                    </div>
                  ))}

                  {pendingAuthRequestsForManager.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>Autorizaciones pendientes</div>
                      {pendingAuthRequestsForManager.map((req) => (
                        <div key={req.id} style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: '8px', padding: '8px', marginBottom: '6px' }}>
                          <div style={{ fontSize: '0.84rem', marginBottom: '4px' }}>
                            {req.reasonLabel || req.reasonType || 'Solicitud'} - {req.requestedBy?.name || 'N/A'} - ${Number(req.total || 0).toLocaleString()}
                          </div>
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
            {activeTab !== 'home' && (
              <button
                className="btn btn-primary"
                onClick={() => setActiveTab('home')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                Inicio
              </button>
            )}
            <button
              className="btn"
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f1f5f9', color: '#64748b' }}
              title="Cerrar sesion (Cerrar sesion NO termina la jornada)"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <br />
      {!shift ? (
        <ShiftManager
          shift={shift}
          onStartShift={onStartShift}
          onEndShift={onEndShift}
          salesTotal={activeShiftSalesTotal}
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
                    <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>TOTAL: ${(subtotal + deliveryFee).toLocaleString()}</p>
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
                  adminPass={users.find(u => u.username === 'Admin')?.password || 'Admin'}
                  currentUser={currentUser}
                  onCreateRemoteAuthRequest={onCreateRemoteAuthRequest}
                  remoteAuthDecisionByRequestId={remoteAuthDecisionByRequestId}
                  remoteAuthRequestById={remoteAuthRequestById}
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
                if (newPurchases.length > purchases.length) {
                  try {
                    await dataService.savePurchase({
                      ...newPurchases[0],
                      user_id: currentUser?.id,
                      user_name: currentUser?.name || currentUser?.email || 'Sistema'
                    });
                  } catch (e) {
                    console.error("Error guardando compra en Supabase:", e);
                    const message = e?.message || 'Error desconocido';
                    alert(`La compra se guardo localmente pero no en la nube.\n\nDetalle: ${message}`);
                  }
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
              onAcceptFromBodega={async (productId, quantity) => {
                const qty = Math.max(0, Number(quantity) || 0);
                if (!qty) return;

                const available = Number(stock.bodega?.[productId] || 0);
                if (available < qty) {
                  throw new Error('Stock insuficiente en bodega');
                }

                const nextBodega = Math.max(0, available - qty);
                const currentVentas = Number(stock.ventas?.[productId] || 0);
                const nextVentas = currentVentas + qty;

                setStock((prev) => ({
                  ...prev,
                  bodega: { ...prev.bodega, [productId]: nextBodega },
                  ventas: { ...prev.ventas, [productId]: nextVentas }
                }));

                await Promise.all([
                  updateStockInDB('bodega', productId, nextBodega),
                  updateStockInDB('ventas', productId, nextVentas)
                ]);
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
              stock={stock}
              setStock={setStock}
              categories={categories}
              onLog={addLog}
              setActiveTab={setActiveTab}
              setPreselectedProductId={setPreselectedProductId}
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
              categories={categories} setCategories={setCategories}
              onResetSystem={onResetSystem} onSaveSystem={onSaveSystem}
              operationalDateSettings={operationalDateSettings}
              onApplyOperationalDateOffset={onApplyOperationalDateOffset}
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
                // If it's a new expense (length increased), save the last one
                if (newExpenses.length > expenses.length) {
                  try {
                    await dataService.saveExpense({
                      ...newExpenses[0],
                      user_id: currentUser?.id,
                      user_name: currentUser?.name || currentUser?.email || 'Sistema'
                    });
                  } catch (err) {
                    console.error("Error persistiendo gasto en Supabase:", err);
                  }
                }
              }}
              onLog={addLog}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === 'notas' && <NotasModule clients={registeredClients} sales={salesHistory} onLog={addLog} />}
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
    </div>
  )
}

export default App
