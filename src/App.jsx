import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './design-system.css'
import { CLIENT_OCASIONAL, PAYMENT_MODES, COMPANY_INFO, CREDIT_LEVELS } from './constants'
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
import { printShiftClosure } from './lib/printReports'
import { playSound, setSoundEnabled, setSoundVolume } from './lib/soundService'

import { dataService } from './lib/dataService'
import { getProfile } from './lib/databaseService'
import { initEmailJS } from './lib/emailService'
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
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return 'Administrador';
  if (normalized === 'administrador' || normalized === 'admin') return 'Administrador';
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
const PAYMENT_METHODS_STORAGE_KEY = 'fact_payment_methods';
const SOUND_ENABLED_STORAGE_KEY = 'fact_sound_enabled';
const SOUND_VOLUME_STORAGE_KEY = 'fact_sound_volume';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'Credito', 'Transferencia', 'Tarjeta', 'Otros'];
const REMOTE_AUTH_REQUEST_ACTION = 'Solicitud Autorizacion Remota';
const REMOTE_AUTH_RESPONSE_ACTION = 'Respuesta Autorizacion Remota';
const SHIFT_BOARD_ACTION = 'Pizarron Turnos';

const isUuid = (value) => typeof value === 'string' && UUID_REGEX.test(value);

const normalizeBarcodeKey = (value) => {
  const raw = String(value ?? '').trim();
  return /^\d+$/.test(raw) ? raw : '';
};

const normalizeClientDraft = (client) => ({
  ...client,
  document: String(client?.document || '').trim(),
  name: String(client?.name || '').trim(),
  creditLevel: resolveCreditLevel(client?.creditLevel || client?.credit_level || 'ESTANDAR'),
  creditLimit: Number(client?.creditLimit ?? client?.credit_limit ?? 0),
  approvedTerm: Number(client?.approvedTerm ?? client?.approved_term ?? 30),
  discount: Number(client?.discount ?? 0),
});

const normalizeCreditLevelKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\(.*?\)/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase();

const resolveCreditLevel = (value) => {
  const levelKey = normalizeCreditLevelKey(value || 'ESTANDAR');
  if (CREDIT_LEVELS[levelKey]) return levelKey;
  const byLabel = Object.entries(CREDIT_LEVELS).find(([, level]) =>
    normalizeCreditLevelKey(level?.label) === levelKey
  );
  return byLabel?.[0] || 'ESTANDAR';
};

const getClientAutoDiscount = (client) => {
  if (!client) return 0;

  const explicitDiscount = Number(client?.discount ?? 0);
  if (Number.isFinite(explicitDiscount) && explicitDiscount > 0) {
    return explicitDiscount;
  }

  const levelRaw = client?.creditLevel ?? client?.credit_level ?? 'ESTANDAR';
  const levelKey = resolveCreditLevel(levelRaw);
  return Number(CREDIT_LEVELS[levelKey]?.discount ?? 0);
};

const applyClientDiscountToItem = (item, discountPercent) => {
  const basePrice = Number(item?.originalPrice ?? item?.price ?? 0);
  const quantity = Number(item?.quantity ?? 0);
  const discountedUnitPrice = basePrice * (1 - (Number(discountPercent) || 0) / 100);

  return {
    ...item,
    originalPrice: basePrice,
    price: discountedUnitPrice,
    total: discountedUnitPrice * quantity
  };
};

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

const parseStructuredAuditDetails = (details) => {
  const raw = String(details || '').trim();
  if (!raw) return null;
  const withoutActor = raw.replace(/\s*\|\s*Usuario:\s*.*$/i, '').trim();
  try {
    const parsed = JSON.parse(withoutActor);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
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
  const [paymentMethods, setPaymentMethods] = useState(() => {
    try {
      const raw = localStorage.getItem(PAYMENT_METHODS_STORAGE_KEY);
      if (!raw) return [...DEFAULT_PAYMENT_METHODS];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...DEFAULT_PAYMENT_METHODS];
      const normalized = parsed
        .map((m) => String(m || '').trim())
        .filter(Boolean);
      if (normalized.length === 0) return [...DEFAULT_PAYMENT_METHODS];
      return Array.from(new Set(normalized));
    } catch {
      return [...DEFAULT_PAYMENT_METHODS];
    }
  });
  const [paymentMode, setPaymentMode] = useState('Efectivo');
  const [paymentRef, setPaymentRef] = useState('');
  const [quickScanCode, setQuickScanCode] = useState('');
  const [quickLookupResult, setQuickLookupResult] = useState(null);
  const [quickLookupHistory, setQuickLookupHistory] = useState([]);
  const [quickTrayOpen, setQuickTrayOpen] = useState(true);
  const [soundEnabled, setSoundEnabledState] = useState(() => {
    const raw = localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);
    return raw === null ? true : raw === '1';
  });
  const [soundVolume, setSoundVolumeState] = useState(() => {
    const raw = Number(localStorage.getItem(SOUND_VOLUME_STORAGE_KEY) || 0.08);
    if (!Number.isFinite(raw)) return 0.08;
    return Math.min(0.3, Math.max(0.01, raw));
  });
  const [remoteAuthPanelOpen, setRemoteAuthPanelOpen] = useState(false);
  const [shiftBoardText, setShiftBoardText] = useState('');
  const [shiftBoardReplyDrafts, setShiftBoardReplyDrafts] = useState({});
  const quickScanInputRef = useRef(null);
  const quickScanBufferRef = useRef('');
  const quickScanLastKeyAtRef = useRef(0);
  const prevPendingAuthCountRef = useRef(0);
  const prevBoardNoteCountRef = useRef(0);
  const realtimeRefreshTimeoutRef = useRef(null);
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

  const getActiveTabStorageKey = (userId) => `${ACTIVE_TAB_STORAGE_KEY}_${userId}`;
  const getQuickTrayStorageKey = (userId) => `${QUICK_TRAY_OPEN_STORAGE_KEY}_${userId || 'anon'}`;
  const getQuickLookupHistoryStorageKey = (userId) => `${QUICK_LOOKUP_HISTORY_STORAGE_KEY}_${userId || 'anon'}`;
  const getProductsCacheStorageKey = (userId) => `${PRODUCTS_CACHE_STORAGE_KEY}_${userId || 'anon'}`;
  const getClientsCacheStorageKey = (userId) => `${CLIENTS_CACHE_STORAGE_KEY}_${userId || 'anon'}`;

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

      if (!pendingClientsSyncRef.current) {
        setRegisteredClients(dedupeClients(dbClients || []));
      }
      setSalesHistory(dbSales || []);
      setExpenses(dbExpenses || []);
      setPurchases(dbPurchases || []);
      setAuditLogs(dbLogs || []);
      setShiftHistory(dbShiftHistory || []);

      // Reconstruct carteras/debts from invoices
      const pendingSales = (dbSales || []).filter(s => s.status === 'pendiente');
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
        refreshCloudData({ silent: true });
      }, 900);
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
      .subscribe();

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
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
    const normalized = Array.from(
      new Set((paymentMethods || []).map((m) => String(m || '').trim()).filter(Boolean))
    );
    localStorage.setItem(
      PAYMENT_METHODS_STORAGE_KEY,
      JSON.stringify(normalized.length > 0 ? normalized : DEFAULT_PAYMENT_METHODS)
    );
  }, [paymentMethods]);

  useEffect(() => {
    setSoundEnabled(soundEnabled);
    localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, soundEnabled ? '1' : '0');
  }, [soundEnabled]);

  useEffect(() => {
    setSoundVolume(soundVolume);
    localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(soundVolume));
  }, [soundVolume]);

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

      if (event.key === 'Enter' || event.key === 'Tab') {
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
      await dataService.updateProductStockById(prod.id, { [field]: Number(newValue) || 0 });
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
    const actorName = currentUser?.name || currentUser?.email || 'Sistema';
    const baseDetails = String(logEntry?.details || '').trim();
    const detailsWithActor = /usuario\s*:/i.test(baseDetails)
      ? baseDetails
      : [baseDetails, `Usuario: ${actorName}`].filter(Boolean).join(' | ');

    const fullLog = {
      ...logEntry,
      user_id: currentUser?.id || null,
      timestamp: new Date().toISOString(),
      user_name: actorName,
      details: detailsWithActor
    };
    setAuditLogs(prev => [fullLog, ...prev]);
    if (!currentUser?.id) return;
    try {
      await dataService.saveAuditLog(fullLog);
    } catch (err) {
      console.error("Error guardando bitacora en la nube:", err);
    }
  };

  const canModerateRemoteAuth = ['Administrador', 'Supervisor'].includes(normalizeRole(currentUser?.role));

  const remoteAuthState = useMemo(() => {
    const requestsById = new Map();
    const responsesByRequestId = new Map();

    (auditLogs || []).forEach((log) => {
      const payload = parseStructuredAuditDetails(log?.details);
      if (!payload) return;

      if (log?.action === REMOTE_AUTH_REQUEST_ACTION && payload?.kind === 'REMOTE_AUTH_REQUEST' && payload?.requestId) {
        requestsById.set(payload.requestId, {
          ...payload,
          createdAt: log?.timestamp || new Date().toISOString(),
          logId: log?.id || null,
        });
      }

      if (log?.action === REMOTE_AUTH_RESPONSE_ACTION && payload?.kind === 'REMOTE_AUTH_RESPONSE' && payload?.requestId) {
        const previous = responsesByRequestId.get(payload.requestId);
        const prevTime = new Date(previous?.respondedAt || 0).getTime();
        const currTime = new Date(payload?.respondedAt || log?.timestamp || 0).getTime();
        if (!previous || currTime >= prevTime) {
          responsesByRequestId.set(payload.requestId, {
            ...payload,
            respondedAt: payload?.respondedAt || log?.timestamp || new Date().toISOString(),
          });
        }
      }
    });

    const requests = Array.from(requestsById.values())
      .map((req) => {
        const response = responsesByRequestId.get(req.requestId) || null;
        const status = response?.decision === 'APPROVED'
          ? 'APPROVED'
          : response?.decision === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING';
        return { ...req, response, status };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const decisionByRequestId = requests.reduce((acc, req) => {
      if (req.status !== 'PENDING') {
        acc[req.requestId] = req.status;
      }
      return acc;
    }, {});

    return { requests, decisionByRequestId };
  }, [auditLogs]);

  const pendingRemoteAuthRequests = useMemo(
    () => (remoteAuthState.requests || []).filter((r) => r.status === 'PENDING'),
    [remoteAuthState.requests]
  );

  const createRemoteAuthRequest = async (payload) => {
    const requestId = `AUTH-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const details = JSON.stringify({
      kind: 'REMOTE_AUTH_REQUEST',
      requestId,
      requesterUserId: currentUser?.id || null,
      requesterName: currentUser?.name || currentUser?.email || 'Cajero',
      requestedAt: new Date().toISOString(),
      ...payload,
    });
    await addLog({
      module: 'Autorizaciones',
      action: REMOTE_AUTH_REQUEST_ACTION,
      details
    });
    playSound('notify');
    return requestId;
  };

  const respondRemoteAuthRequest = async (request, decision) => {
    const note = prompt(
      decision === 'APPROVED'
        ? 'Nota para aprobar (opcional):'
        : 'Motivo de rechazo (opcional):'
    ) || '';
    const details = JSON.stringify({
      kind: 'REMOTE_AUTH_RESPONSE',
      requestId: request?.requestId,
      requesterUserId: request?.requesterUserId || null,
      requesterName: request?.requesterName || 'Usuario',
      decision,
      note: String(note || '').trim(),
      respondedAt: new Date().toISOString(),
      responderUserId: currentUser?.id || null,
      responderName: currentUser?.name || currentUser?.email || 'Administrador',
    });
    await addLog({
      module: 'Autorizaciones',
      action: REMOTE_AUTH_RESPONSE_ACTION,
      details
    });
    playSound(decision === 'APPROVED' ? 'success' : 'error');
  };

  const shiftBoardNotes = useMemo(() => {
    const notesById = new Map();
    const repliesByNote = new Map();
    const statusByNote = new Map();

    (auditLogs || []).forEach((log) => {
      if (log?.action !== SHIFT_BOARD_ACTION) return;
      const payload = parseStructuredAuditDetails(log?.details);
      if (!payload || !payload?.noteId) return;

      if (payload.kind === 'SHIFT_BOARD_NOTE') {
        notesById.set(payload.noteId, {
          ...payload,
          createdAt: payload?.createdAt || log?.timestamp || new Date().toISOString(),
        });
      }

      if (payload.kind === 'SHIFT_BOARD_REPLY') {
        const bucket = repliesByNote.get(payload.noteId) || [];
        bucket.push({
          ...payload,
          createdAt: payload?.createdAt || log?.timestamp || new Date().toISOString(),
        });
        repliesByNote.set(payload.noteId, bucket);
      }

      if (payload.kind === 'SHIFT_BOARD_STATUS') {
        statusByNote.set(payload.noteId, {
          ...payload,
          changedAt: payload?.changedAt || log?.timestamp || new Date().toISOString(),
        });
      }
    });

    return Array.from(notesById.values())
      .map((note) => {
        const status = statusByNote.get(note.noteId);
        const replies = (repliesByNote.get(note.noteId) || [])
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return {
          ...note,
          resolved: !!status?.resolved,
          statusChangedBy: status?.changedByName || '',
          statusChangedAt: status?.changedAt || '',
          replies,
          lastActivityAt: status?.changedAt || replies[replies.length - 1]?.createdAt || note.createdAt
        };
      })
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
      .slice(0, 20);
  }, [auditLogs]);

  const postShiftBoardNote = async () => {
    const text = String(shiftBoardText || '').trim();
    if (!text) return;
    const noteId = `NOTE-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    await addLog({
      module: 'Comunicacion',
      action: SHIFT_BOARD_ACTION,
      details: JSON.stringify({
        kind: 'SHIFT_BOARD_NOTE',
        noteId,
        text,
        createdAt: new Date().toISOString(),
        createdByUserId: currentUser?.id || null,
        createdByName: currentUser?.name || currentUser?.email || 'Usuario'
      })
    });
    setShiftBoardText('');
    playSound('notify');
  };

  const postShiftBoardReply = async (noteId) => {
    const text = String(shiftBoardReplyDrafts?.[noteId] || '').trim();
    if (!text) return;
    await addLog({
      module: 'Comunicacion',
      action: SHIFT_BOARD_ACTION,
      details: JSON.stringify({
        kind: 'SHIFT_BOARD_REPLY',
        noteId,
        replyId: `REPLY-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        text,
        createdAt: new Date().toISOString(),
        createdByUserId: currentUser?.id || null,
        createdByName: currentUser?.name || currentUser?.email || 'Usuario'
      })
    });
    setShiftBoardReplyDrafts((prev) => ({ ...prev, [noteId]: '' }));
    playSound('action');
  };

  const toggleShiftBoardResolved = async (note) => {
    await addLog({
      module: 'Comunicacion',
      action: SHIFT_BOARD_ACTION,
      details: JSON.stringify({
        kind: 'SHIFT_BOARD_STATUS',
        noteId: note?.noteId,
        resolved: !note?.resolved,
        changedAt: new Date().toISOString(),
        changedByUserId: currentUser?.id || null,
        changedByName: currentUser?.name || currentUser?.email || 'Usuario'
      })
    });
    playSound(note?.resolved ? 'warn' : 'success');
  };

  useEffect(() => {
    const current = pendingRemoteAuthRequests.length;
    if (current > prevPendingAuthCountRef.current) {
      playSound('notify');
    }
    prevPendingAuthCountRef.current = current;
  }, [pendingRemoteAuthRequests.length]);

  useEffect(() => {
    const current = shiftBoardNotes.length;
    if (current > prevBoardNoteCountRef.current) {
      playSound('notify');
    }
    prevBoardNoteCountRef.current = current;
  }, [shiftBoardNotes.length]);

  const handleLogin = (user, pass) => {
    const foundUser = users.find(u => u.username === user && u.password === pass);
    if (foundUser) {
      setIsLoggedIn(true);
      setCurrentUser(foundUser);
      addLog({ module: 'Sistema', action: 'Login', details: `Usuario ${foundUser.username} ingreso` });
    }
  };

  const onStartShift = (initialCash) => {
    const carryOverCash = getUserCashBalance(currentUser);
    const startCash = Number(initialCash) > 0 ? Number(initialCash) : carryOverCash;
    const openShift = { startTime: new Date().toISOString(), initialCash: startCash };
    setShift(openShift);
    setUserCashBalance(currentUser, startCash);
    saveOpenShift(currentUser?.id, openShift);
    addLog({ module: 'Jornada', action: 'Inicio Jornada', details: `Iniciada con base de $${startCash}` });
    playSound('success');
  };

  const isDateInRange = (dateValue, startIso, endIso) => {
    if (!dateValue || !startIso || !endIso) return false;
    const date = new Date(dateValue).getTime();
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (Number.isNaN(date) || Number.isNaN(start) || Number.isNaN(end)) return false;
    return date >= start && date <= end;
  };

  const parseMoneyFromText = (text) => {
    const match = String(text || '').match(/\$([\d\.,]+)/);
    if (!match?.[1]) return 0;
    return Number(match[1].replace(/[^\d]/g, '')) || 0;
  };

  const getShiftFinancialSnapshot = (startIso, endIso) => {
    const shiftSales = salesHistory.filter((sale) => isDateInRange(sale.date, startIso, endIso));
    const shiftExpenses = expenses.filter((expense) => isDateInRange(expense.date, startIso, endIso));
    const shiftPurchases = purchases.filter((purchase) => isDateInRange(purchase.date, startIso, endIso));
    const shiftCashLogs = auditLogs.filter((log) =>
      log?.module === 'Caja Principal' &&
      isDateInRange(log.timestamp, startIso, endIso) &&
      ['Movimiento Efectivo', 'Recibir Dinero', 'Devolver Dinero'].includes(log.action)
    );

    const salesBreakdown = shiftSales.reduce((acc, sale) => {
      const total = Number(sale.total) || 0;
      acc.gross += total;

      if (sale.paymentMode === PAYMENT_MODES.CONTADO) acc.cash += total;
      else if (sale.paymentMode === PAYMENT_MODES.CREDITO) acc.credit += total;
      else if (sale.paymentMode === PAYMENT_MODES.TRANSFERENCIA) acc.transfer += total;
      else if (sale.paymentMode === PAYMENT_MODES.TARJETA) acc.card += total;
      else if (sale.paymentMode === PAYMENT_MODES.OTROS) acc.other += total;
      else if (sale.paymentMode === 'Mixto') {
        const parts = Array.isArray(sale?.mixedDetails?.parts) ? sale.mixedDetails.parts : null;
        if (parts && parts.length > 0) {
          parts.forEach((part) => {
            const amount = Number(part?.amount || 0);
            const method = String(part?.method || '').trim();
            if (method === PAYMENT_MODES.CONTADO) acc.cash += amount;
            else if (method === PAYMENT_MODES.CREDITO) acc.credit += amount;
            else if (method === PAYMENT_MODES.TRANSFERENCIA) acc.transfer += amount;
            else if (method === PAYMENT_MODES.TARJETA) acc.card += amount;
            else acc.other += amount;
          });
        } else {
          acc.cash += Number(sale.mixedDetails?.cash) || 0;
          acc.credit += Number(sale.mixedDetails?.credit) || 0;
        }
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

    return {
      shiftSales,
      shiftExpenses,
      shiftPurchases,
      shiftCashLogs,
      salesBreakdown,
      expensesTotal,
      purchasesTotal,
      cashMovements
    };
  };

  const onEndShift = (data) => {
    if (!shift?.startTime) return;
    const shiftEndIso = new Date().toISOString();
    const summary = getShiftFinancialSnapshot(shift.startTime, shiftEndIso);
    const salesTotal = summary.salesBreakdown.gross;

    const reportLines = [
      '--- REPORTE DE CIERRE DE JORNADA (CR) ---',
      `Fecha cierre: ${new Date(shiftEndIso).toLocaleString()}`,
      `Asesor/Cajero: ${currentUser?.name || 'Sistema'}`,
      `Inicio jornada: ${new Date(shift.startTime).toLocaleString()}`,
      `Fin jornada: ${new Date(shiftEndIso).toLocaleString()}`,
      '------------------------------------------',
      'RESUMEN MONETARIO',
      `Base Inicial: ${Number(shift.initialCash || 0).toLocaleString()}`,
      `Ventas Brutas: ${salesTotal.toLocaleString()} (${summary.shiftSales.length} facturas)`,
      `  - Efectivo: ${summary.salesBreakdown.cash.toLocaleString()}`,
      `  - Transferencia: ${summary.salesBreakdown.transfer.toLocaleString()}`,
      `  - Tarjeta: ${summary.salesBreakdown.card.toLocaleString()}`,
      `  - Credito (CxC): ${summary.salesBreakdown.credit.toLocaleString()}`,
      `Gastos/Egresos: -${summary.expensesTotal.toLocaleString()} (${summary.shiftExpenses.length})`,
      `Compras/Inversion: -${summary.purchasesTotal.toLocaleString()} (${summary.shiftPurchases.length})`,
      `Saldo Teorico (segun cuadre): ${Number(data.theoreticalBalance || 0).toLocaleString()}`,
      `Efectivo Fisico contado: ${Number(data.physicalCash || 0).toLocaleString()}`,
      `Diferencia: ${Number(data.discrepancy || 0).toLocaleString()}`,
      `Cierre con autorizacion admin: ${data.authorized ? 'SI' : 'NO'}`,
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
      theoreticalBalance: data.theoreticalBalance,
      physicalCash: data.physicalCash,
      discrepancy: data.discrepancy,
      authorized: data.authorized,
      user: currentUser?.name || 'Sistema',
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

    // Abre de inmediato el dialogo de imprimir/guardar para el soporte del cierre.
    printShiftClosure(shiftData, 'a4');

    alert("Jornada cerrada con exito.");
    playSound('success');

    setUserCashBalance(currentUser, data.physicalCash);
    setShift(null);
    clearOpenShift();
    setSalesHistory([]);
    addLog({ module: 'Jornada', action: 'Cierre Jornada', details: reportText });
  };

  const handleAddItem = (item) => {
    const clientDiscount = getClientAutoDiscount(selectedClient);
    setItems([...items, applyClientDiscountToItem(item, clientDiscount)]);

    addLog({
      module: 'Facturacion',
      action: 'Agregar Item',
      details: `Se agrego ${item.name} (${item.quantity})`
    });
  };

  const selectedClientAutoDiscount = getClientAutoDiscount(selectedClient);

  useEffect(() => {
    setItems((prevItems) =>
      prevItems.map((item) => applyClientDiscountToItem(item, selectedClientAutoDiscount))
    );
  }, [selectedClientAutoDiscount]);

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

  const handleFacturar = async (mixedData = null, extraDiscount = 0, paymentMeta = null) => {
    if (items.length === 0) {
      playSound('warn');
      return alert("Agregue productos primero");
    }
    if (selectedClient?.blocked) {
      playSound('error');
      return alert("Este cliente esta bloqueado por Administracion. No puede facturar hasta ser desbloqueado.");
    }

    // Stock Validation
    for (const item of items) {
      if ((stock.ventas[item.id] || 0) < item.quantity) {
        playSound('error');
        return alert(`Inventario insuficiente para ${item.name}. Solo hay ${stock.ventas[item.id] || 0} en punto de venta.`);
      }
    }

    // Reference validation for non-Cash/Credit (single payment mode)
    const needsRef = !mixedData && ![PAYMENT_MODES.CONTADO, PAYMENT_MODES.CREDITO].includes(paymentMode);
    if (needsRef && !paymentRef) {
      playSound('warn');
      return alert("Debe ingresar el numero de referencia de la transferencia");
    }

    if (!mixedData && paymentMode === PAYMENT_MODES.OTROS && !String(paymentMeta?.otherPaymentDetail || '').trim()) {
      playSound('warn');
      return alert('Debe especificar el medio exacto para metodo "Otros".');
    }

    if (mixedData) {
      const parts = Array.isArray(mixedData.parts) ? mixedData.parts : [];
      if (parts.length < 2) {
        playSound('warn');
        return alert('Pago mixto invalido: faltan componentes de pago.');
      }

      const partsTotal = parts.reduce((sum, part) => sum + (Number(part?.amount || 0)), 0);
      if (Math.abs(partsTotal - (subtotal + deliveryFee - extraDiscount)) > 1) {
        playSound('warn');
        return alert('Pago mixto invalido: el total de los metodos no coincide con la factura.');
      }

      const invalidReferencePart = parts.find((part) =>
        ![PAYMENT_MODES.CONTADO, PAYMENT_MODES.CREDITO].includes(String(part?.method || '').trim()) &&
        !String(part?.reference || '').trim()
      );
      if (invalidReferencePart) {
        playSound('warn');
        return alert(`Debe ingresar referencia para el metodo ${invalidReferencePart.method}.`);
      }

      const invalidOtherPart = parts.find((part) =>
        String(part?.method || '').trim() === PAYMENT_MODES.OTROS &&
        !String(part?.otherDetail || '').trim()
      );
      if (invalidOtherPart) {
        playSound('warn');
        return alert('En metodo "Otros" del pago mixto debe indicar el medio exacto.');
      }
    }

    // Credit Limit check (Individual Invoice Max)
    const isCreditPortion = paymentMode === PAYMENT_MODES.CREDITO || mixedData?.credit > 0;
    if (isCreditPortion && selectedClient) {
      const creditPortion = mixedData ? mixedData.credit : (subtotal + deliveryFee - extraDiscount);
      if (creditPortion > selectedClient.creditLimit) {
        playSound('warn');
        return alert(`Supera el limite de factura para este nivel de credito (${selectedClient.creditLimit.toLocaleString()}). Realice un abono para continuar.`);
      }
    }

    const finalMode = mixedData ? 'Mixto' : paymentMode;
    const finalTotal = subtotal + deliveryFee - extraDiscount;
    let invoiceCode = '';
    try {
      invoiceCode = await dataService.getNextInvoiceCode('SSOT');
    } catch (e) {
      console.error('Error obteniendo consecutivo desde nube, usando respaldo local:', e);
      invoiceCode = getNextInvoiceCode();
    }

    const termDays = selectedClient?.approvedTerm || 30;
    const dueDateObj = new Date();
    dueDateObj.setDate(dueDateObj.getDate() + termDays);

    const newInvoice = {
      id: invoiceCode,
      invoiceCode,
      clientName: clientName,
      clientDoc: selectedClient?.document || 'N/A',
      items,
      subtotal,
      deliveryFee,
      total: finalTotal,
      paymentMode: finalMode,
      mixedDetails: {
        ...(mixedData || {}),
        ...(paymentMeta || {}),
        ...(mixedData ? {} : {
          payment_reference: String(paymentRef || '').trim() || null,
          payment_method_detail: String(paymentMeta?.otherPaymentDetail || '').trim() || null,
        }),
        invoiceCode,
        user_name: currentUser?.name || currentUser?.email || 'Sistema',
        user_id: currentUser?.id || null
      }, // { cash, credit, invoiceCode, user_name }
      date: new Date().toISOString(),
      dueDate: dueDateObj.toISOString(),
      status: (paymentMode === PAYMENT_MODES.CREDITO || mixedData?.credit > 0) ? 'pendiente' : 'pagado',
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
          .updateProductStockById(prod.id, { stock: Number(newStockVentas[item.id]) || 0 })
          .catch(e => console.error("Error updating stock on SALE:", e));
      }
    });
    setStock({ ...stock, ventas: newStockVentas });

    if (paymentMode === PAYMENT_MODES.CREDITO || mixedData?.credit > 0) {
      const debtAmount = mixedData ? mixedData.credit : finalTotal;
      setCartera((prev) => [...prev, { ...finalInvoice, balance: debtAmount }]);
    }

    setSalesHistory((prev) => [...prev, finalInvoice]);

    // Actualiza caja del usuario en tiempo real para reflejar facturacion en el circulo central.
    if (finalMode === PAYMENT_MODES.CONTADO) {
      adjustUserCashBalance(currentUser, finalTotal);
    } else if (finalMode === 'Mixto') {
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

    alert("Venta realizada con exito");
    playSound('invoice');

    addLog({
      module: 'Facturacion',
      action: 'Generar Factura',
      details: `Factura ${newInvoice.id} (${finalMode}) para ${clientName} - Total: $${newInvoice.total}`
    });

    // Reset current form
    setItems([]);
    setClientName(CLIENT_OCASIONAL);
    setSelectedClient(null);
    setDeliveryFee(0);
    setPaymentMode(PAYMENT_MODES.CONTADO);
    setPaymentRef('');
  };

  const onDeleteInvoice = (invoice) => {
    // 1. Revert Stock
    const newStock = { ...stock };
    invoice.items.forEach(item => {
      newStock.ventas[item.id] = (newStock.ventas[item.id] || 0) + item.quantity;
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
    playSound('warn');
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

    const allowedMenuItems = currentRole === 'Administrador'
      ? menuItems
      : isCashierRole
        ? menuItems.filter((item) => ['facturacion', 'inventario', 'codigos', 'clientes', 'cartera', 'historial', 'caja', 'trueque', 'gastos', 'notas'].includes(item.tab))
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
              onBlur={() => {
                if (activeTab !== 'home' || !shift) return;
                setTimeout(() => quickScanInputRef.current?.focus(), 80);
              }}
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

          <div className="card" style={{ marginTop: '0.9rem', padding: '0.85rem', backgroundColor: '#f8fafc' }}>
            <h4 style={{ margin: '0 0 0.45rem', fontSize: '1rem' }}>Pizarron de Turnos</h4>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', color: '#64748b' }}>
              Deje pendientes, novedades y respuestas para el siguiente turno.
            </p>
            <textarea
              className="input-field"
              rows={2}
              value={shiftBoardText}
              onChange={(e) => setShiftBoardText(e.target.value)}
              placeholder="Ej: Cliente Pepe queda pendiente de pago. Cobrar cuando llegue."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.45rem' }}>
              <button className="btn btn-primary" onClick={postShiftBoardNote}>Publicar Nota</button>
            </div>

            <div style={{ marginTop: '0.75rem', maxHeight: '260px', overflowY: 'auto', display: 'grid', gap: '0.55rem' }}>
              {shiftBoardNotes.length === 0 && (
                <div style={{ fontSize: '0.84rem', color: '#64748b' }}>No hay notas en la pizarra.</div>
              )}
              {shiftBoardNotes.map((note) => (
                <div
                  key={note.noteId}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.55rem',
                    backgroundColor: note.resolved ? '#f1f5f9' : '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', marginBottom: '0.25rem' }}>
                    <strong style={{ fontSize: '0.84rem' }}>{note.createdByName || 'Usuario'}</strong>
                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{new Date(note.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '0.84rem', marginBottom: '0.35rem' }}>{note.text}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        padding: '0.12rem 0.45rem',
                        borderRadius: '999px',
                        backgroundColor: note.resolved ? '#dcfce7' : '#fee2e2',
                        color: note.resolved ? '#166534' : '#991b1b'
                      }}
                    >
                      {note.resolved ? 'Resuelta' : 'Pendiente'}
                    </span>
                    <button
                      className="btn"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => toggleShiftBoardResolved(note)}
                    >
                      {note.resolved ? 'Reabrir' : 'Marcar Resuelta'}
                    </button>
                  </div>

                  {note.replies.length > 0 && (
                    <div style={{ marginBottom: '0.35rem', display: 'grid', gap: '0.25rem' }}>
                      {note.replies.map((reply) => (
                        <div key={reply.replyId} style={{ fontSize: '0.78rem', backgroundColor: '#f8fafc', borderRadius: '6px', padding: '0.3rem 0.45rem' }}>
                          <strong>{reply.createdByName || 'Usuario'}:</strong> {reply.text}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <input
                      className="input-field"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.45rem' }}
                      value={shiftBoardReplyDrafts[note.noteId] || ''}
                      onChange={(e) => setShiftBoardReplyDrafts((prev) => ({ ...prev, [note.noteId]: e.target.value }))}
                      placeholder="Responder..."
                    />
                    <button className="btn" style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }} onClick={() => postShiftBoardReply(note.noteId)}>
                      Responder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
    ? getShiftFinancialSnapshot(shift.startTime, new Date().toISOString()).salesBreakdown.gross
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
          <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
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
              <strong></strong>
              <span>{headerNow.toLocaleString('es-CO')}</span>
            </div>
            {canModerateRemoteAuth && (
              <button
                className="btn"
                onClick={() => setRemoteAuthPanelOpen((prev) => !prev)}
                style={{
                  backgroundColor: pendingRemoteAuthRequests.length > 0 ? '#fee2e2' : '#f1f5f9',
                  color: pendingRemoteAuthRequests.length > 0 ? '#991b1b' : '#334155',
                  border: pendingRemoteAuthRequests.length > 0 ? '1px solid #fecaca' : '1px solid #cbd5e1'
                }}
                title="Solicitudes remotas de autorizacion"
              >
                Autorizaciones {pendingRemoteAuthRequests.length > 0 ? `(${pendingRemoteAuthRequests.length})` : ''}
              </button>
            )}
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
            {canModerateRemoteAuth && remoteAuthPanelOpen && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  top: '48px',
                  right: 0,
                  width: '460px',
                  maxHeight: '65vh',
                  overflowY: 'auto',
                  zIndex: 20,
                  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.2)'
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Solicitudes de Autorizacion</h3>
                {pendingRemoteAuthRequests.length === 0 && (
                  <p style={{ margin: 0, color: '#64748b' }}>No hay solicitudes pendientes.</p>
                )}
                {pendingRemoteAuthRequests.map((req) => (
                  <div key={req.requestId} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.7rem', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <strong>{req.requesterName || 'Cajero'}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.82rem' }}>{new Date(req.createdAt).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: '0.4rem 0', fontSize: '0.9rem' }}>
                      <strong>Motivo:</strong> {req.reasonLabel || req.reasonType || 'Autorizacion manual'}
                    </p>
                    <p style={{ margin: '0.2rem 0', fontSize: '0.88rem' }}>
                      <strong>Contexto:</strong> Cliente {req.clientName || 'N/A'} | Total ${Number(req.total || 0).toLocaleString()} | Pago {req.paymentMode || 'N/A'}
                    </p>
                    {req.note && (
                      <p style={{ margin: '0.35rem 0', fontSize: '0.88rem', color: '#334155' }}>
                        <strong>Nota cajero:</strong> {req.note}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.55rem' }}>
                      <button className="btn btn-primary" onClick={() => respondRemoteAuthRequest(req, 'APPROVED')}>Aprobar</button>
                      <button className="btn" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }} onClick={() => respondRemoteAuthRequest(req, 'REJECTED')}>Rechazar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                    <p><strong>Fecha:</strong> {new Date().toLocaleString()}</p>
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
                  onFacturar={handleFacturar}
                  selectedClient={selectedClient}
                  selectedClientPendingBalance={selectedClientPendingBalance}
                  selectedClientAvailableCredit={selectedClientAvailableCredit}
                  items={items}
                  adminPass={users.find(u => u.username === 'Admin')?.password || 'Admin'}
                  currentUser={currentUser}
                  onCreateRemoteAuthRequest={createRemoteAuthRequest}
                  remoteAuthDecisionByRequestId={remoteAuthState.decisionByRequestId}
                />
              </div>
            </main>
          )}

          {activeTab === 'cartera' && (
            <CarteraModule
              currentUser={currentUser}
              clients={registeredClients}
              paymentMethods={paymentMethods}
              cartera={cartera}
              setCartera={async (newCartera) => {
                setCartera(newCartera);
                // Find the one that changed and sync to 'invoices' table
                const changed = newCartera.find(nc => {
                  const oc = cartera.find(ocItem => ocItem.id === nc.id);
                  return oc && oc.balance !== nc.balance;
                });
                if (changed) {
                  try {
                    // Update only the balance/status in the invoices table
                    await dataService.saveInvoice(changed, changed.items);
                    // Note: saveInvoice uses insert/upsert logic in dataService.js
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
                        { warehouse_stock: Number(newBodega[changedId]) || 0 }
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
                    await dataService.savePurchase({ ...newPurchases[0], user_id: currentUser?.id });
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
                  const lower = String(message).toLowerCase();
                  if (lower.includes('foreign key') || lower.includes('invoice_items_product_id_fkey')) {
                    alert(`No se puede eliminar este producto porque ya tiene historial de facturas.\n\nSe recomienda dejarlo inactivo en lugar de borrarlo.`);
                  } else {
                    alert(`No se pudo eliminar el producto en la nube.\n\nDetalle: ${message}`);
                  }
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
              onLog={addLog}
            />
          )}
          {activeTab === 'bitacora' && <AuditLog logs={auditLogs} />}
          {activeTab === 'config' && (
            <SettingsModule
              users={users} setUsers={setUsers}
              paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods}
              categories={categories} setCategories={setCategories}
              onResetSystem={onResetSystem} onSaveSystem={onSaveSystem}
              soundEnabled={soundEnabled}
              setSoundEnabled={setSoundEnabledState}
              soundVolume={soundVolume}
              setSoundVolume={setSoundVolumeState}
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
                    await dataService.saveExpense(newExpenses[0]);
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
              isAdmin={currentUser?.role === 'Administrador'}
              onDeleteInvoice={onDeleteInvoice}
              onLog={addLog}
            />
          )}
          {activeTab === 'cierres' && <ShiftHistoryModule shiftHistory={shiftHistory} onLog={addLog} />}

        </>
      )}
      </div>
      <SystemHelpBubble />
    </div>
  )
}

export default App
