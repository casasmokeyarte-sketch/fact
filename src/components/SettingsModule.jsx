import React, { useState } from 'react';
import { playSound } from '../lib/soundService';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { supabase } from '../lib/supabaseClient';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';
import { getAdminUsersUrl, isElectronFileRuntime } from '../lib/runtime.js';

import { mergeUsersByIdentity, normalizeAppUser } from '../lib/userUtils';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function SettingsModule({
    currentUser,
    users, setUsers,
    paymentMethods, setPaymentMethods,
    onSavePaymentMethods,
    categories, setCategories,
    onSaveCategories,
    products = [],
    sales = [],
    promotions = [],
    setPromotions,
    onSavePromotions,
    onResetSystem, onSaveSystem,
    soundEnabled, setSoundEnabled,
    soundVolume, setSoundVolume,
    soundPreset, setSoundPreset,
    operationalDateSettings,
    onApplyOperationalDateOffset,
    onApplyUserShiftCloseOverride
}) {
    const [subTab, setSubTab] = useState('usuarios');

    const [promoDraft, setPromoDraft] = useState(() => ({
        name: '',
        enabled: true,
        scope: 'ALL',
        discountType: 'PERCENT',
        percent: 0,
        amount: 0,
        includeFullPriceOnly: false,
        productIds: [],
        startAt: '',
        endAt: '',
    }));
    const [promoSaveBusy, setPromoSaveBusy] = useState(false);
    const [promoProductsOpenId, setPromoProductsOpenId] = useState('');
    const [promoProductSearch, setPromoProductSearch] = useState('');
    const [promoHistoryOpen, setPromoHistoryOpen] = useState(false);

    // New User State
    const [newUser, setNewUser] = useState({ name: '', username: '', email: '', password: '', role: 'Cajero', authorizationKey: '' });
    const [editingPermissionsUser, setEditingPermissionsUser] = useState(null);
    const [editingUser, setEditingUser] = useState(null);

    // New Payment Method State
    const [newMethod, setNewMethod] = useState('');

    // New Category State
    const [newCategory, setNewCategory] = useState('');
    const [dayOffsetInput, setDayOffsetInput] = useState(() => Number(operationalDateSettings?.daysOffset || 0));

    // Flash Reminders State
    const [flashReminders, setFlashReminders] = useState([]);
    const [remindersLoading, setRemindersLoading] = useState(false);
    const [newReminder, setNewReminder] = useState({
        id: null,
        title: '',
        description: '',
        media_url: '',
        media_type: 'none',
        max_views: 1,
        target_roles: [],
        active: true
    });
    const [reminderSaveBusy, setReminderSaveBusy] = useState(false);
    const [mediaFileError, setMediaFileError] = useState('');
    const [userDayOffsetInput, setUserDayOffsetInput] = useState(0);
    const [dayOffsetReason, setDayOffsetReason] = useState('');
    const [targetUserIdForDayOffset, setTargetUserIdForDayOffset] = useState('');
    const [printerSettings, setPrinterSettings] = useState(() => {
        try {
            const raw = localStorage.getItem('fact_printer_settings');
            if (raw) return JSON.parse(raw);
        } catch {}
        return {
            preferredPrinter: '',
            connectionType: 'USB / Red',
            defaultPaper: 'A4',
            autoPrintReports: false,
        };
    });
    const [detectedPrinters, setDetectedPrinters] = useState([]);
    const [printersLoading, setPrintersLoading] = useState(false);
    const [printersMessage, setPrintersMessage] = useState('');
    const [nfcMessage, setNfcMessage] = useState('Sin verificar');
    const { sortedRows: sortedUsers, sortConfig: usersSort, setSortKey: setUsersSortKey } = useTableSort(
        users,
        {
            name: { getValue: (u) => u?.name || '', type: 'string' },
            username: { getValue: (u) => u?.username || '', type: 'string' },
            role: { getValue: (u) => u?.role || '', type: 'string' },
        },
        'name'
    );
    const usersPagination = usePagination(sortedUsers, 15);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState('');

    const adminUsersUrl = getAdminUsersUrl();

    React.useEffect(() => {
        setDayOffsetInput(Number(operationalDateSettings?.daysOffset || 0));
    }, [operationalDateSettings?.daysOffset]);

    React.useEffect(() => {
        if (targetUserIdForDayOffset) return;
        const firstNonAdmin = (users || []).find((user) => String(user?.role || '') !== 'Administrador');
        if (firstNonAdmin?.id) {
            setTargetUserIdForDayOffset(String(firstNonAdmin.id));
        }
    }, [users, targetUserIdForDayOffset]);

    React.useEffect(() => {
        try {
            localStorage.setItem('fact_printer_settings', JSON.stringify(printerSettings));
        } catch {}
    }, [printerSettings]);

    const detectPrinters = async () => {
        setPrintersLoading(true);
        setPrintersMessage('');
        try {
            const result = await window.systemIntegrations?.listPrinters?.();
            if (!result?.ok) {
                throw new Error(result?.error || 'No se pudieron consultar impresoras.');
            }
            setDetectedPrinters(Array.isArray(result?.printers) ? result.printers : []);
            setPrintersMessage(`Impresoras detectadas: ${Array.isArray(result?.printers) ? result.printers.length : 0}`);
        } catch (err) {
            setDetectedPrinters([]);
            setPrintersMessage(err?.message || 'Deteccion no disponible en esta ejecucion.');
        } finally {
            setPrintersLoading(false);
        }
    };

    const detectNfcStatus = async () => {
        try {
            const result = await window.systemIntegrations?.getNfcStatus?.();
            setNfcMessage(result?.message || (result?.available ? 'Lector NFC disponible.' : 'Lector NFC no disponible.'));
        } catch (err) {
            setNfcMessage(err?.message || 'No fue posible consultar el lector NFC.');
        }
    };

    const refreshUsersFromSupabase = React.useCallback(async () => {
        setUsersError('');
        setUsersLoading(true);
        try {
            if (!adminUsersUrl) {
                throw new Error(
                    isElectronFileRuntime()
                        ? 'La app de escritorio necesita VITE_ADMIN_API_BASE_URL para administrar usuarios.'
                        : 'No se configuro la URL del API de usuarios.'
                );
            }
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Sesion no valida. Inicia sesion nuevamente.');

            const res = await fetch(adminUsersUrl, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || 'No se pudo cargar usuarios.');
            }

            const mapped = (data?.users || []).map(normalizeAppUser).filter(Boolean);

            setUsers((prev) => {
                const localAdmin = (prev || []).find(u => String(u.id) === '1' || u.username === 'Admin');
                return mergeUsersByIdentity(
                    localAdmin ? [localAdmin] : [],
                    mapped,
                    [currentUser]
                );
            });
        } catch (err) {
            setUsersError(err?.message || 'Error cargando usuarios.');
        } finally {
            setUsersLoading(false);
        }
    }, [adminUsersUrl, setUsers]);

    React.useEffect(() => {
        if (subTab !== 'usuarios') return;
        if (String(currentUser?.role || '') !== 'Administrador') return;
        refreshUsersFromSupabase();
    }, [subTab, currentUser?.role, refreshUsersFromSupabase]);

    const loadFlashReminders = async () => {
        setRemindersLoading(true);
        try {
            const { data, error } = await supabase
                .from('flash_reminders')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setFlashReminders(data || []);
        } catch (err) {
            console.error('Error cargando recordatorios:', err);
        } finally {
            setRemindersLoading(false);
        }
    };

    React.useEffect(() => {
        if (subTab === 'flash') {
            loadFlashReminders();
        }
    }, [subTab]);

    const handleSaveFlashReminder = async (e) => {
        e.preventDefault();
        if (!newReminder.title) return alert('El titulo es obligatorio.');
        setReminderSaveBusy(true);
        try {
            const payload = {
                title: newReminder.title,
                description: newReminder.description || '',
                media_url: newReminder.media_url || null,
                media_type: newReminder.media_type || 'none',
                max_views: Number(newReminder.max_views ?? 1),
                target_roles: newReminder.target_roles || [],
                active: newReminder.active !== false,
                updated_at: new Date().toISOString()
            };

            if (newReminder.id) {
                // Update
                const { error } = await supabase
                    .from('flash_reminders')
                    .update(payload)
                    .eq('id', newReminder.id);
                if (error) throw error;
                alert('Recordatorio actualizado.');
            } else {
                // Create
                const { error } = await supabase
                    .from('flash_reminders')
                    .insert({
                        ...payload,
                        company_id: currentUser?.company_id || '09d70414-784e-449b-9efc-dbe23fd547ad'
                    });
                if (error) throw error;
                alert('Recordatorio creado.');
            }
            // Reset form
            setNewReminder({ id: null, title: '', description: '', media_url: '', media_type: 'none', max_views: 1, target_roles: [], active: true });
            loadFlashReminders();
        } catch (err) {
            alert('Error al guardar recordatorio: ' + err.message);
        } finally {
            setReminderSaveBusy(false);
        }
    };

    const handleDeleteFlashReminder = async (id) => {
        if (!confirm('¿Seguro que deseas eliminar este recordatorio?')) return;
        try {
            const { error } = await supabase
                .from('flash_reminders')
                .delete()
                .eq('id', id);
            if (error) throw error;
            alert('Recordatorio eliminado.');
            loadFlashReminders();
        } catch (err) {
            alert('Error al eliminar recordatorio: ' + err.message);
        }
    };

    const handleResetFlashReminderViews = async (id) => {
        if (!confirm('¿Seguro que deseas reiniciar las visualizaciones? Todos los empleados volverán a ver este recordatorio.')) return;
        try {
            const { error } = await supabase
                .from('flash_reminder_views')
                .delete()
                .eq('reminder_id', id);
            if (error) throw error;
            alert('Visualizaciones reiniciadas con éxito.');
        } catch (err) {
            alert('Error al reiniciar visualizaciones: ' + err.message);
        }
    };

    const handleFlashMediaChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setMediaFileError('');
        try {
            const fileType = file.type || '';
            const isImage = fileType.startsWith('image/');
            const isVideo = fileType.startsWith('video/');

            if (!isImage && !isVideo) {
                throw new Error('Selecciona un archivo de imagen o video.');
            }

            const limit = isImage ? 2 * 1024 * 1024 : 10 * 1024 * 1024;
            if (file.size > limit) {
                throw new Error(`El archivo es demasiado grande (Límite: ${isImage ? '2MB' : '10MB'}).`);
            }

            const reader = new FileReader();
            reader.onload = () => {
                setNewReminder(prev => ({
                    ...prev,
                    media_url: String(reader.result || ''),
                    media_type: isImage ? 'image' : 'video'
                }));
            };
            reader.onerror = () => {
                setMediaFileError('Error al leer el archivo.');
            };
            reader.readAsDataURL(file);
        } catch (err) {
            setMediaFileError(err.message);
        } finally {
            e.target.value = '';
        }
    };

    const defaultPermissions = {
        Administrador: {
            facturacion: true, cartera: true, compras: true, clientes: true, caja: true,
            inventario: true, codigos: true, reportes: true, bitacora: true, config: true,
            trueque: true, gastos: true, recibosCajaExternos: true, notas: true, historial: true
        },
        Supervisor: {
            facturacion: true, cartera: true, compras: true, clientes: true, caja: true,
            inventario: true, codigos: true, reportes: true, bitacora: true, config: false,
            trueque: true, gastos: true, recibosCajaExternos: true, notas: true, historial: true
        },
        Cajero: {
            facturacion: true, cartera: false, compras: false, clientes: false, caja: false,
            inventario: false, codigos: false, reportes: false, bitacora: false, config: false,
            recibosCajaExternos: false,
            trueque: false, gastos: false, notas: false, historial: false
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUser.username || !newUser.password) return alert("Usuario y clave obligatorios");

        setUsersError('');
        setUsersLoading(true);

        try {
            if (!adminUsersUrl) throw new Error('La administracion de usuarios no esta disponible en este entorno.');
            const permissions = defaultPermissions[newUser.role] || defaultPermissions.Cajero;
            const rawUsername = String(newUser.username || '').trim();
            const normalizedUsername = rawUsername.includes('@') ? rawUsername.split('@')[0].trim() : rawUsername;
            if (!normalizedUsername || normalizedUsername.length < 3) {
                throw new Error('El usuario debe tener minimo 3 caracteres (ej: cajero1).');
            }
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Sesion no valida. Inicia sesion nuevamente.');

            const res = await fetch(adminUsersUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newUser.name,
                    username: normalizedUsername,
                    email: String(newUser.email || '').trim(),
                    password: newUser.password,
                    role: newUser.role,
                    permissions,
                    authorizationKey: String(newUser.authorizationKey || '').trim(),
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || 'No se pudo crear el usuario.');
            }

            setNewUser({ name: '', username: '', email: '', password: '', role: 'Cajero', authorizationKey: '' });
            await refreshUsersFromSupabase();
            alert("Usuario creado en Supabase.");
        } catch (err) {
            alert(err?.message || 'Error creando usuario.');
        } finally {
            setUsersLoading(false);
        }
    };

    const togglePermission = async (userId, module) => {
        const target = users.find((u) => String(u?.id || '') === String(userId));
        if (!target) return;
        if (String(target?.role || '') === 'Administrador') return;

        const newPermissions = { ...(target.permissions || {}), [module]: !(target.permissions?.[module]) };
        const nextUsers = users.map((u) => (String(u?.id || '') === String(userId) ? { ...u, permissions: newPermissions } : u));
        setUsers(nextUsers);

        try {
            if (!adminUsersUrl) throw new Error('La administracion de usuarios no esta disponible en este entorno.');
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Sesion no valida.');

            const res = await fetch(adminUsersUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    user_id: userId,
                    role: target.role,
                    permissions: newPermissions,
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || 'No se pudo guardar permisos.');
            }
        } catch (err) {
            alert(err?.message || 'Error guardando permisos.');
            refreshUsersFromSupabase();
        }
    };

    const handleDeleteUser = async (userRow) => {
        if (!userRow?.id) return;
        if (!UUID_REGEX.test(String(userRow.id || '').trim())) {
            return alert('Ese registro no corresponde a un usuario real de Supabase. Refresque la lista oficial antes de eliminar.');
        }
        const label = userRow?.username || userRow?.email || userRow?.name || 'usuario';
        if (userRow?.active !== false) {
            return alert('Primero debe desactivar al usuario. La eliminacion permanente solo esta disponible para usuarios inactivos sin historial.');
        }
        const ok = confirm(`Eliminar permanentemente al usuario ${label}?\n\nSolo se completara si no tiene facturas, turnos ni otros movimientos.`);
        if (!ok) return;

        setUsersLoading(true);
        try {
            if (!adminUsersUrl) throw new Error('La administracion de usuarios no esta disponible en este entorno.');
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Sesion no valida.');

            const res = await fetch(adminUsersUrl, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ user_id: userRow.id })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || 'No se pudo eliminar el usuario.');
            }

            await refreshUsersFromSupabase();
            alert('Usuario eliminado.');
        } catch (err) {
            alert(err?.message || 'Error eliminando usuario.');
        } finally {
            setUsersLoading(false);
        }
    };

    const handleSetUserActive = async (userRow, nextActive) => {
        if (!userRow?.id) return;
        if (!UUID_REGEX.test(String(userRow.id || '').trim())) {
            return alert('Ese registro no corresponde a un usuario real de Supabase.');
        }
        if (String(userRow.id) === String(currentUser?.id || '') && !nextActive) {
            return alert('No puede desactivar su propio usuario.');
        }

        const label = userRow?.username || userRow?.email || userRow?.name || 'usuario';
        const actionLabel = nextActive ? 'reactivar' : 'desactivar';
        const ok = confirm(
            nextActive
                ? `Reactivar al usuario ${label}? Podra volver a iniciar sesion.`
                : `Desactivar al usuario ${label}?\n\nSe bloqueara su acceso, pero se conservaran sus facturas, turnos y movimientos.`
        );
        if (!ok) return;

        setUsersLoading(true);
        try {
            if (!adminUsersUrl) throw new Error('La administracion de usuarios no esta disponible en este entorno.');
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Sesion no valida.');

            const res = await fetch(adminUsersUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    user_id: userRow.id,
                    role: userRow.role,
                    permissions: userRow.permissions || {},
                    active: nextActive,
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || `No se pudo ${actionLabel} el usuario.`);
            }

            await refreshUsersFromSupabase();
            alert(nextActive ? 'Usuario reactivado.' : 'Usuario desactivado. Su historial fue conservado.');
        } catch (err) {
            alert(err?.message || `Error al ${actionLabel} el usuario.`);
        } finally {
            setUsersLoading(false);
        }
    };

    const openEditUser = (userRow) => {
        setEditingUser({
            id: userRow?.id || '',
            name: userRow?.name || '',
            email: userRow?.email || '',
            role: userRow?.role || 'Cajero',
            authorizationKey: String(userRow?.authorization_key || userRow?.permissions?.authorizationKey || '').trim(),
            password: '',
        });
    };

    const handleUpdateUser = async () => {
        if (!editingUser?.id) return;
        setUsersLoading(true);
        setUsersError('');
        try {
            if (!adminUsersUrl) throw new Error('La administracion de usuarios no esta disponible en este entorno.');
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) throw new Error('Sesion no valida.');

            const target = users.find((u) => String(u?.id || '') === String(editingUser.id));
            const role = String(editingUser.role || target?.role || 'Cajero').trim();
            const permissionsBase = target?.permissions && typeof target.permissions === 'object'
                ? { ...target.permissions }
                : { ...(defaultPermissions[role] || defaultPermissions.Cajero) };

            const res = await fetch(adminUsersUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    user_id: editingUser.id,
                    name: String(editingUser.name || '').trim(),
                    display_name: String(editingUser.name || '').trim(),
                    email: String(editingUser.email || '').trim(),
                    role,
                    permissions: permissionsBase,
                    authorization_key: String(editingUser.authorizationKey || '').trim(),
                    password: String(editingUser.password || '').trim() || undefined,
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || 'No se pudo actualizar el usuario.');
            }

            await refreshUsersFromSupabase();
            setEditingUser(null);
            alert('Usuario actualizado.');
        } catch (err) {
            alert(err?.message || 'Error actualizando usuario.');
        } finally {
            setUsersLoading(false);
        }
    };

    const handleAddPayment = () => {
        if (!newMethod) return;
        const next = [...paymentMethods, newMethod];
        setPaymentMethods(next);
        onSavePaymentMethods?.(next);
        setNewMethod('');
    };

    const handleRemovePayment = (method) => {
        const next = paymentMethods.filter(m => m !== method);
        setPaymentMethods(next);
        onSavePaymentMethods?.(next);
    };

    const handleAddCategory = () => {
        if (!newCategory) return;
        if (categories.includes(newCategory)) return alert("La Categorias ya existe");
        const next = [...categories, newCategory];
        setCategories(next);
        onSaveCategories?.(next);
        setNewCategory('');
    };

    const handleRemoveCategory = (cat) => {
        if (cat === 'General') return alert("No se puede eliminar la Categorias General");
        const next = categories.filter(c => c !== cat);
        setCategories(next);
        onSaveCategories?.(next);
    };

    const buildPromoId = () => `PR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const toDatetimeLocal = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        const t = d.getTime();
        if (!Number.isFinite(t)) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const fromDatetimeLocal = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const d = new Date(raw);
        const t = d.getTime();
        if (!Number.isFinite(t)) return '';
        return d.toISOString();
    };

    const updatePromotion = (promoId, patch) => {
        if (!promoId) return;
        const next = (promotions || []).map((p) => (
            String(p?.id || '') === String(promoId) ? { ...(p || {}), ...(patch || {}) } : p
        ));
        setPromotions?.(next);
    };

    const removePromotion = (promoId) => {
        if (!promoId) return;
        const ok = confirm('Eliminar esta promocion?');
        if (!ok) return;
        const next = (promotions || []).filter((p) => String(p?.id || '') !== String(promoId));
        setPromotions?.(next);
    };

    const addPromotion = () => {
        const name = String(promoDraft?.name || '').trim();
        if (!name) return alert('Nombre de promocion obligatorio.');

        const scope = promoDraft?.scope === 'PRODUCTS' ? 'PRODUCTS' : 'ALL';
        const discountType = promoDraft?.discountType === 'AMOUNT' ? 'AMOUNT' : 'PERCENT';
        const percent = Math.max(0, Math.min(100, Number(promoDraft?.percent || 0)));
        const amount = Math.max(0, Number(promoDraft?.amount || 0));

        if (discountType === 'PERCENT' && percent <= 0) return alert('Ingrese un porcentaje mayor a 0.');
        if (discountType === 'AMOUNT' && amount <= 0) return alert('Ingrese un monto mayor a 0.');
        if (scope === 'PRODUCTS' && (!Array.isArray(promoDraft?.productIds) || promoDraft.productIds.length === 0)) {
            return alert('Seleccione al menos 1 producto para la promocion.');
        }

        const startAt = fromDatetimeLocal(promoDraft?.startAt);
        const endAt = fromDatetimeLocal(promoDraft?.endAt);
        if (startAt && endAt && new Date(startAt).getTime() > new Date(endAt).getTime()) {
            return alert('La fecha/hora "hasta" debe ser mayor o igual a "desde".');
        }

        const promo = {
            id: buildPromoId(),
            name,
            enabled: promoDraft?.enabled !== false,
            scope,
            discountType,
            percent,
            amount,
            includeFullPriceOnly: promoDraft?.includeFullPriceOnly === true,
            productIds: scope === 'PRODUCTS' ? (promoDraft.productIds || []).map((id) => String(id)) : [],
            startAt,
            endAt,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const next = [promo, ...(promotions || [])];
        setPromotions?.(next);
        setPromoDraft((prev) => ({ ...(prev || {}), name: '', percent: 0, amount: 0, productIds: [], startAt: '', endAt: '' }));
    };

    const savePromotionsNow = async () => {
        setPromoSaveBusy(true);
        try {
            const ok = await onSavePromotions?.(Array.isArray(promotions) ? promotions : []);
            if (ok === false) {
                alert('No se pudieron guardar las promociones (requiere Admin o migracion en Supabase).');
            } else {
                alert('Promociones guardadas.');
            }
        } finally {
            setPromoSaveBusy(false);
        }
    };

    const getInvoicePromotionInfo = React.useCallback((invoice) => {
        const discount = invoice?.mixedDetails?.discount || invoice?.mixed_details?.discount || {};
        const promotion = invoice?.promotion || discount?.promotion || null;
        const promoAmount = Number(invoice?.promoDiscountAmount ?? discount?.promoAmount ?? 0);
        if (!promotion || promoAmount <= 0) return null;
        return {
            promotion,
            promoAmount,
        };
    }, []);

    const promotionHistory = React.useMemo(() => {
        const summaryByPromo = new Map();
        const invoiceRows = [];

        (Array.isArray(sales) ? sales : []).forEach((invoice) => {
            const promoInfo = getInvoicePromotionInfo(invoice);
            if (!promoInfo) return;

            const promoId = String(promoInfo.promotion?.id || promoInfo.promotion?.name || 'PROMO-SIN-ID');
            const promoName = String(promoInfo.promotion?.name || promoId);
            const promoAmount = Number(promoInfo.promoAmount || 0);
            const invoiceCode = String(
                invoice?.invoiceCode ||
                invoice?.mixedDetails?.invoiceCode ||
                invoice?.mixedDetails?.invoice_code ||
                invoice?.id ||
                'N/A'
            );
            const row = {
                promoId,
                promoName,
                invoiceCode,
                clientName: invoice?.clientName || 'Cliente Ocasional',
                userName: invoice?.user_name || invoice?.user || invoice?.mixedDetails?.user_name || invoice?.mixedDetails?.user || 'Sistema',
                date: invoice?.date || '',
                promoAmount,
                invoiceTotal: Number(invoice?.total || 0),
            };

            invoiceRows.push(row);
            const existing = summaryByPromo.get(promoId) || {
                promoId,
                promoName,
                uses: 0,
                totalDiscount: 0,
                invoices: [],
            };
            existing.uses += 1;
            existing.totalDiscount += promoAmount;
            existing.invoices.push(row);
            summaryByPromo.set(promoId, existing);
        });

        return {
            totals: Array.from(summaryByPromo.values()).sort((a, b) => b.totalDiscount - a.totalDiscount),
            invoiceRows: invoiceRows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()),
            grandTotal: Array.from(summaryByPromo.values()).reduce((sum, row) => sum + Number(row.totalDiscount || 0), 0),
        };
    }, [sales, getInvoicePromotionInfo]);

    return (
        <div className="settings-module">
            <h2>Modulo de ConfiguraciAn</h2>

            <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button className={`btn ${subTab === 'usuarios' ? 'btn-primary' : ''}`} onClick={() => setSubTab('usuarios')}>Usuarios</button>
                <button className={`btn ${subTab === 'pagos' ? 'btn-primary' : ''}`} onClick={() => setSubTab('pagos')}>Pagos</button>
                <button className={`btn ${subTab === 'categorias' ? 'btn-primary' : ''}`} onClick={() => setSubTab('categorias')}>Categorias</button>
                <button className={`btn ${subTab === 'promociones' ? 'btn-primary' : ''}`} onClick={() => setSubTab('promociones')}>Promociones</button>
                {currentUser?.role === 'Administrador' && (
                    <button className={`btn ${subTab === 'flash' ? 'btn-primary' : ''}`} onClick={() => setSubTab('flash')}>Recordatorios Flash</button>
                )}
                <button className={`btn ${subTab === 'sistema' ? 'btn-primary' : ''}`} onClick={() => setSubTab('sistema')}>Sistema</button>
            </nav>

            {subTab === 'usuarios' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Crear Usuario</h3>
                        <form onSubmit={handleCreateUser}>
                            <div className="input-group">
                                <label className="input-label">Nombre Real</label>
                                <input type="text" className="input-field" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Nombre de Usuario</label>
                                <input type="text" className="input-field" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Correo real</label>
                                <input type="email" className="input-field" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="usuario@correo.com" />
                            </div>
                            <div className="input-group">
                                <label className="input-label">ContraseAa</label>
                                <input type="password" className="input-field" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Rol / Permisos</label>
                                <select className="input-field" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                    <option value="Administrador">Administrador (Total)</option>
                                    <option value="Supervisor">Supervisor (Ventas + Inventario)</option>
                                    <option value="Cajero">Cajero (Ventas solamente)</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Clave de Autorizacion</label>
                                <input
                                    type="password"
                                    className="input-field"
                                    value={newUser.authorizationKey}
                                    onChange={e => setNewUser({ ...newUser, authorizationKey: e.target.value })}
                                    placeholder="Opcional para aprobar descuentos y acciones"
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Crear Usuario</button>
                        </form>
                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <button className="btn" onClick={refreshUsersFromSupabase} disabled={usersLoading}>
                                {usersLoading ? 'Cargando...' : 'Refrescar lista'}
                            </button>
                            {usersError && <div style={{ color: 'rgba(255, 45, 85, 0.95)', fontSize: '0.85rem' }}>{usersError}</div>}
                        </div>
                    </div>

                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Usuarios de la organizacion</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #ccc' }}>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                                        <SortButton label="Nombre" sortKey="name" sortConfig={usersSort} onChange={setUsersSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                                        <SortButton label="Usuario" sortKey="username" sortConfig={usersSort} onChange={setUsersSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>
                                        <SortButton label="Rol" sortKey="role" sortConfig={usersSort} onChange={setUsersSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {usersPagination.pageItems.map(u => (
                                    <React.Fragment key={u.id}>
                                        <tr style={{ borderBottom: '1px solid rgba(0, 229, 255, 0.12)' }}>
                                            <td style={{ padding: '0.5rem' }}>{u.name}</td>
                                            <td style={{ padding: '0.5rem' }}>{u.username}</td>
                                            <td style={{ padding: '0.5rem' }}>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        backgroundColor: u.role === 'Administrador' ? 'var(--surface-danger)' : 'var(--surface-info)',
                                                        borderColor: u.role === 'Administrador' ? 'rgba(255, 45, 85, 0.45)' : 'rgba(0, 229, 255, 0.42)',
                                                    }}
                                                >
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.5rem' }}>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        backgroundColor: u.active === false ? 'var(--surface-muted)' : 'var(--surface-success)',
                                                        borderColor: u.active === false ? 'var(--border-soft)' : 'rgba(0, 255, 154, 0.45)',
                                                    }}
                                                >
                                                    {u.active === false ? 'Inactivo' : 'Activo'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.5rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn"
                                                    style={{ padding: '2px 8px', fontSize: '0.8em' }}
                                                    onClick={() => openEditUser(u)}
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    className="btn"
                                                    style={{ padding: '2px 8px', fontSize: '0.8em', backgroundColor: 'var(--surface-muted)' }}
                                                    onClick={() => setEditingPermissionsUser(editingPermissionsUser?.id === u.id ? null : u)}
                                                >
                                                    {'\uD83D\uDD10'} Permisos
                                                </button>
                                                <button
                                                    className="btn"
                                                    style={{ padding: '2px 8px', fontSize: '0.8em' }}
                                                    onClick={() => {
                                                        if (u.username === 'Admin') return alert("No se puede desactivar al administrador principal");
                                                        handleSetUserActive(u, u.active === false);
                                                    }}
                                                >
                                                    {u.active === false ? 'Reactivar' : 'Desactivar'}
                                                </button>
                                                {u.active === false && (
                                                    <button
                                                        className="btn"
                                                        style={{ padding: '2px 8px', fontSize: '0.8em' }}
                                                        onClick={() => handleDeleteUser(u)}
                                                        title="Eliminar permanentemente solo si no tiene historial"
                                                    >
                                                        {'\uD83D\uDDD1\uFE0F'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {editingPermissionsUser?.id === u.id && (
                                            <tr>
                                                <td colSpan="5" style={{ padding: '1rem', backgroundColor: 'var(--surface-muted)' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                                                        {Object.keys(defaultPermissions.Administrador).map(module => (
                                                            <label key={module} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85em', textTransform: 'capitalize' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={u.permissions?.[module] || false}
                                                                    onChange={() => togglePermission(u.id, module)}
                                                                    disabled={u.role === 'Administrador'}
                                                                />
                                                                {module}
                                                            </label>
                                                        ))}
                                                    </div>
                                                    {u.role === 'Administrador' && <p style={{ fontSize: '0.8em', color: '#64748b', marginTop: '5px' }}>* Administradores tienen acceso total por defecto.</p>}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                        <PaginationControls
                            page={usersPagination.page}
                            totalPages={usersPagination.totalPages}
                            totalItems={usersPagination.totalItems}
                            pageSize={usersPagination.pageSize}
                            onPageChange={usersPagination.setPage}
                        />
                    </div>
                </div>
            )}

            {subTab === 'pagos' && (
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Editar Metodos de Pago</h3>
                    <p>Configure las opciones disponibles en la zona de Facturaciòn.</p>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                        <input
                            type="text" className="input-field" placeholder="Nuevo mAtodo (ej: Bitcoin, Giro)"
                            value={newMethod} onChange={e => setNewMethod(e.target.value)}
                        />
                        <button className="btn btn-primary" onClick={handleAddPayment}>Agregar</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                        {paymentMethods.map(method => (
                            <div key={method} className="card card--muted" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem' }}>
                                <strong>{method}</strong>
                                <button
                                    className="btn" style={{ color: 'red', border: 'none', backgroundColor: 'transparent' }}
                                    onClick={() => handleRemovePayment(method)}
                                    disabled={['Efectivo', 'Credito'].includes(method)}
                                >
                                    {'\u2715'}
                                </button>
                            </div>
                        ))}
                    </div>
                    <p style={{ fontSize: '0.8em', color: 'var(--text-secondary)', marginTop: '1rem' }}>Nota: Metodos bAsicos (Efectivo/Credito) no se pueden eliminar.</p>
                </div>
            )}

            {subTab === 'sistema' && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div className="card card--warn">
                        <h3 style={{ marginTop: 0 }}>Fecha Operativa (Retroceder Dia)</h3>
                        <p style={{ marginTop: 0 }}>
                            El ajuste global sigue disponible para toda la empresa, pero ahora tambien puede mover la reapertura de jornada para un usuario especifico.
                            Requiere motivo obligatorio para trazabilidad.
                        </p>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            <div className="card card--muted" style={{ marginBottom: '0.25rem' }}>
                                <strong>Ajuste por usuario para reapertura</strong>
                                <p style={{ margin: '0.5rem 0 0.75rem 0', color: 'var(--text-secondary)' }}>
                                    Use esto cuando un usuario ya cerro jornada hoy y necesita volver a abrir en otra correccion o en otro equipo.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                        <label className="input-label">Usuario</label>
                                        <select
                                            className="input-field"
                                            value={targetUserIdForDayOffset}
                                            onChange={(e) => setTargetUserIdForDayOffset(e.target.value)}
                                        >
                                            <option value="">Seleccione usuario...</option>
                                            {(users || []).map((user) => (
                                                <option key={String(user?.id || user?.username || user?.name)} value={String(user?.id || '')}>
                                                    {user?.name || user?.username || 'Usuario'}{user?.role ? ` (${user.role})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                        <label className="input-label">Dias a mover para ese usuario</label>
                                        <input
                                            type="number"
                                            className="input-field"
                                            value={Number(userDayOffsetInput || 0)}
                                            min={-30}
                                            max={30}
                                            step={1}
                                            onChange={(e) => setUserDayOffsetInput(Number(e.target.value))}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            const ok = await onApplyUserShiftCloseOverride?.({
                                                userId: String(targetUserIdForDayOffset || '').trim(),
                                                daysOffset: Number(userDayOffsetInput || 0),
                                                reason: String(dayOffsetReason || '').trim()
                                            });
                                            if (ok) {
                                                setDayOffsetReason('');
                                                setUserDayOffsetInput(0);
                                                alert('Ajuste por usuario aplicado.');
                                            }
                                        }}
                                    >
                                        Aplicar a usuario
                                    </button>
                                </div>
                            </div>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label className="input-label">Dias a mover globalmente (negativo = retroceder, maximo +/-30)</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={Number(dayOffsetInput || 0)}
                                    min={-30}
                                    max={30}
                                    step={1}
                                    onChange={(e) => setDayOffsetInput(Number(e.target.value))}
                                />
                            </div>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label className="input-label">Motivo del ajuste</label>
                                <textarea
                                    className="input-field"
                                    rows={2}
                                    value={dayOffsetReason}
                                    onChange={(e) => setDayOffsetReason(e.target.value)}
                                    placeholder="Ej: correccion de cierre y reporte del turno de ayer"
                                />
                            </div>
                            <div style={{ fontSize: '0.9em', color: 'var(--text-secondary)' }}>
                                Estado actual: <strong>{Number(operationalDateSettings?.daysOffset || 0)} dia(s)</strong>
                                {operationalDateSettings?.reason ? ` | Motivo: ${operationalDateSettings.reason}` : ''}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={async () => {
                                        const ok = await onApplyOperationalDateOffset?.({
                                            daysOffset: Number(dayOffsetInput || 0),
                                            reason: String(dayOffsetReason || '').trim()
                                        });
                                        if (ok) {
                                            setDayOffsetReason('');
                                            alert('Fecha operativa actualizada.');
                                        }
                                    }}
                                >
                                    Aplicar ajuste global
                                </button>
                                <button
                                    className="btn"
                                    onClick={async () => {
                                        const ok = await onApplyOperationalDateOffset?.({ daysOffset: 0, reason: 'Restablecer fecha real' });
                                        if (ok) {
                                            setDayOffsetReason('');
                                            setDayOffsetInput(0);
                                            alert('Fecha operativa restablecida al dia real.');
                                        }
                                    }}
                                >
                                    Restablecer dia real
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Sonidos del Sistema</h3>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <input
                                    type="checkbox"
                                    checked={!!soundEnabled}
                                    onChange={(e) => setSoundEnabled?.(e.target.checked)}
                                />
                                Activar sonidos de acciones y alertas
                            </label>
                            <div>
                                <label className="input-label">Tono de notificaciones</label>
                                <select
                                    className="input-field"
                                    value={String(soundPreset || 'beep')}
                                    onChange={(e) => setSoundPreset?.(e.target.value)}
                                >
                                    <option value="beep">Beep (Simple)</option>
                                    <option value="double">Doble</option>
                                    <option value="chime">Campanita</option>
                                    <option value="neon">Neon</option>
                                    <option value="soft">Suave</option>
                                </select>
                            </div>
                            <div>
                                <label className="input-label">Volumen ({Math.round(Number(soundVolume || 0) * 100)}%)</label>
                                <input
                                    type="range"
                                    min="0.01"
                                    max="0.30"
                                    step="0.01"
                                    value={Number(soundVolume || 0.08)}
                                    onChange={(e) => setSoundVolume?.(Number(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <button className="btn" onClick={() => playSound('notify')}>Probar sonido</button>
                        </div>
                    </div>

                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Impresoras y NFC</h3>
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Impresora preferida</label>
                                    <select
                                        className="input-field"
                                        value={String(printerSettings?.preferredPrinter || '')}
                                        onChange={(e) => setPrinterSettings((prev) => ({ ...(prev || {}), preferredPrinter: e.target.value }))}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {detectedPrinters.map((printer) => (
                                            <option key={printer.name} value={printer.name}>
                                                {printer.displayName || printer.name}{printer.isDefault ? ' (Predeterminada)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Conexion esperada</label>
                                    <select
                                        className="input-field"
                                        value={String(printerSettings?.connectionType || 'USB / Red')}
                                        onChange={(e) => setPrinterSettings((prev) => ({ ...(prev || {}), connectionType: e.target.value }))}
                                    >
                                        <option value="USB / Red">USB / Red</option>
                                        <option value="WiFi / LAN">WiFi / LAN</option>
                                        <option value="Bluetooth">Bluetooth</option>
                                    </select>
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Formato por defecto</label>
                                    <select
                                        className="input-field"
                                        value={String(printerSettings?.defaultPaper || 'A4')}
                                        onChange={(e) => setPrinterSettings((prev) => ({ ...(prev || {}), defaultPaper: e.target.value }))}
                                    >
                                        <option value="A4">A4</option>
                                        <option value="58mm">58mm</option>
                                    </select>
                                </div>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <input
                                    type="checkbox"
                                    checked={printerSettings?.autoPrintReports === true}
                                    onChange={(e) => setPrinterSettings((prev) => ({ ...(prev || {}), autoPrintReports: e.target.checked }))}
                                />
                                Guardar preferencia para reportes e impresiones administrativas
                            </label>

                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button className="btn btn-primary" onClick={detectPrinters} disabled={printersLoading}>
                                    {printersLoading ? 'Buscando impresoras...' : 'Detectar impresoras'}
                                </button>
                                <button className="btn" onClick={detectNfcStatus}>Consultar NFC</button>
                            </div>

                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                                {printersMessage || 'El sistema puede listar las impresoras instaladas en Windows cuando se ejecuta en Electron.'}
                            </div>

                            {detectedPrinters.length > 0 && (
                                <div className="card card--muted">
                                    <strong>Impresoras disponibles</strong>
                                    <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                                        {detectedPrinters.map((printer) => (
                                            <div key={printer.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', borderBottom: '1px solid rgba(148,163,184,0.25)', paddingBottom: '0.45rem' }}>
                                                <span>{printer.displayName || printer.name}</span>
                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                    {printer.isDefault ? 'Predeterminada' : 'Instalada'} | {printer.description || printer.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="card card--muted">
                                <strong>Estado NFC</strong>
                                <p style={{ margin: '0.6rem 0 0 0', color: 'var(--text-secondary)' }}>{nfcMessage}</p>
                                <p style={{ margin: '0.6rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                                    Nota: para lectura NFC real se necesita un lector compatible y un puente nativo adicional. Esta pantalla deja la base de configuracion y diagnostico.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="card card--danger">
                        <h3 style={{ marginTop: 0, color: 'rgba(255, 45, 85, 0.95)' }}>Zona de Peligro - Control del Sistema</h3>
                        <p>Estas acciones afectan a toda la base de datos del sistema.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
                            <div className="card" style={{ textAlign: 'center' }}>
                                <h4>{'\uD83D\uDCBE'} Guardar Respaldo</h4>
                                <p style={{ fontSize: '0.9em' }}>Descarga un archivo JSON con toda la informaciAn actual (Ventas, Clientes, Inventario, BitAcora).</p>
                                <button className="btn btn-primary" style={{ width: '100%' }} onClick={onSaveSystem}>Guardar Sistema General</button>
                            </div>

                            <div className="card" style={{ textAlign: 'center', borderColor: '#f87171' }}>
                                <h4 style={{ color: '#b91c1c' }}>{'\uD83E\uDDE8'} Borrar Sistema</h4>
                                <p style={{ fontSize: '0.9em' }}>Elimina permanentemente todos los datos y reinicia el sistema a valores de fAbrica. No se puede deshacer.</p>
                                <button className="btn" style={{ width: '100%', backgroundColor: '#ef4444', color: 'white' }} onClick={onResetSystem}>BORRAR TODO EL SISTEMA</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {subTab === 'promociones' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Nueva Promocion</h3>
                        <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            Estas promociones aplican descuento automatico en Facturacion y no requieren autorizacion adicional.
                        </p>

                        <div className="input-group">
                            <label className="input-label">Nombre</label>
                            <input
                                type="text"
                                className="input-field"
                                value={promoDraft.name}
                                onChange={(e) => setPromoDraft((p) => ({ ...(p || {}), name: e.target.value }))}
                                placeholder="Ej: Happy Hour / Promo Viernes / 10% tienda"
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label">Alcance</label>
                            <select
                                className="input-field"
                                value={promoDraft.scope}
                                onChange={(e) => setPromoDraft((p) => ({ ...(p || {}), scope: e.target.value }))}
                            >
                                <option value="ALL">Toda la tienda</option>
                                <option value="PRODUCTS">Productos especificos</option>
                            </select>
                        </div>

                        {promoDraft.scope === 'PRODUCTS' && (
                            <div className="card card--muted" style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong>Productos ({(promoDraft.productIds || []).length})</strong>
                                    <button
                                        className="btn"
                                        onClick={() => setPromoProductsOpenId((prev) => (prev === 'DRAFT' ? '' : 'DRAFT'))}
                                    >
                                        {promoProductsOpenId === 'DRAFT' ? 'Cerrar' : 'Seleccionar'}
                                    </button>
                                </div>
                                {promoProductsOpenId === 'DRAFT' && (
                                    <div style={{ marginTop: '0.6rem' }}>
                                        <input
                                            type="text"
                                            className="input-field"
                                            value={promoProductSearch}
                                            onChange={(e) => setPromoProductSearch(e.target.value)}
                                            placeholder="Buscar producto..."
                                        />
                                        <div style={{ maxHeight: '220px', overflow: 'auto', marginTop: '0.6rem', display: 'grid', gap: '0.35rem' }}>
                                            {(Array.isArray(products) ? products : [])
                                                .filter((pr) => {
                                                    const q = String(promoProductSearch || '').trim().toLowerCase();
                                                    if (!q) return true;
                                                    const label = `${pr?.name || ''} ${pr?.code || ''} ${pr?.barcode || ''}`.toLowerCase();
                                                    return label.includes(q);
                                                })
                                                .slice(0, 40)
                                                .map((pr) => {
                                                    const pid = String(pr?.id || '');
                                                    if (!pid) return null;
                                                    const checked = (promoDraft.productIds || []).map(String).includes(pid);
                                                    return (
                                                        <label key={pid} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => {
                                                                    const current = (promoDraft.productIds || []).map(String);
                                                                    const nextIds = checked ? current.filter((x) => x !== pid) : [...current, pid];
                                                                    setPromoDraft((p) => ({ ...(p || {}), productIds: nextIds }));
                                                                }}
                                                            />
                                                            <span style={{ fontSize: '0.9rem' }}>{pr?.name || pid}</span>
                                                        </label>
                                                    );
                                                })
                                                .filter(Boolean)}
                                        </div>
                                        <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                            Muestra maximo 40 resultados. Use el buscador.
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="input-group">
                            <label className="input-label">Tipo de descuento</label>
                            <select
                                className="input-field"
                                value={promoDraft.discountType}
                                onChange={(e) => setPromoDraft((p) => ({ ...(p || {}), discountType: e.target.value }))}
                            >
                                <option value="PERCENT">Porcentaje (%)</option>
                                <option value="AMOUNT">Monto fijo ($)</option>
                            </select>
                        </div>

                        {promoDraft.discountType === 'PERCENT' ? (
                            <div className="input-group">
                                <label className="input-label">Porcentaje (%)</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={promoDraft.percent}
                                    onChange={(e) => setPromoDraft((p) => ({ ...(p || {}), percent: Number(e.target.value) }))}
                                />
                            </div>
                        ) : (
                            <div className="input-group">
                                <label className="input-label">Monto ($)</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={promoDraft.amount}
                                    onChange={(e) => setPromoDraft((p) => ({ ...(p || {}), amount: Number(e.target.value) }))}
                                />
                            </div>
                        )}

                        <div className="input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={promoDraft.includeFullPriceOnly === true}
                                    onChange={(e) => setPromoDraft((p) => ({ ...(p || {}), includeFullPriceOnly: e.target.checked }))}
                                />
                                <strong>Incluir items “Precio Full / Sin Descuento”</strong>
                            </label>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div className="input-group">
                                <label className="input-label">Desde (fecha/hora)</label>
                                <input
                                    type="datetime-local"
                                    className="input-field"
                                    value={promoDraft.startAt}
                                    onChange={(e) => setPromoDraft((p) => ({ ...(p || {}), startAt: e.target.value }))}
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Hasta (fecha/hora)</label>
                                <input
                                    type="datetime-local"
                                    className="input-field"
                                    value={promoDraft.endAt}
                                    onChange={(e) => setPromoDraft((p) => ({ ...(p || {}), endAt: e.target.value }))}
                                />
                            </div>
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={addPromotion}>
                            Agregar promocion
                        </button>
                    </div>

                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Promociones vigentes</h3>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button className="btn" onClick={() => setPromoHistoryOpen(true)}>
                                    Historial
                                </button>
                                <button className="btn btn-primary" onClick={savePromotionsNow} disabled={promoSaveBusy}>
                                    {promoSaveBusy ? 'Guardando...' : 'Guardar promociones'}
                                </button>
                            </div>
                        </div>
                        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            Nota: si el cliente ya tiene descuento fijo en su perfil, la promocion no se aplica. El sistema evita doble descuento.
                        </p>

                        {(promotions || []).length === 0 ? (
                            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No hay promociones configuradas.</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {(promotions || []).map((promo) => {
                                    const pid = String(promo?.id || '');
                                    const name = String(promo?.name || '').trim();
                                    const scope = promo?.scope === 'PRODUCTS' ? 'PRODUCTS' : 'ALL';
                                    const discountType = promo?.discountType === 'AMOUNT' ? 'AMOUNT' : 'PERCENT';
                                    const selectedCount = Array.isArray(promo?.productIds) ? promo.productIds.length : 0;
                                    const productsOpen = promoProductsOpenId === pid;
                                    const startLocal = toDatetimeLocal(promo?.startAt);
                                    const endLocal = toDatetimeLocal(promo?.endAt);

                                    return (
                                        <div key={pid} className="card card--muted">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={promo?.enabled !== false}
                                                        onChange={(e) => updatePromotion(pid, { enabled: e.target.checked, updatedAt: new Date().toISOString() })}
                                                    />
                                                    <strong>{name || pid}</strong>
                                                </label>
                                                <button className="btn" onClick={() => removePromotion(pid)} style={{ color: '#b91c1c' }}>
                                                    Eliminar
                                                </button>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                                                <div className="input-group" style={{ margin: 0 }}>
                                                    <label className="input-label">Nombre</label>
                                                    <input
                                                        type="text"
                                                        className="input-field"
                                                        value={name}
                                                        onChange={(e) => updatePromotion(pid, { name: e.target.value, updatedAt: new Date().toISOString() })}
                                                    />
                                                </div>
                                                <div className="input-group" style={{ margin: 0 }}>
                                                    <label className="input-label">Alcance</label>
                                                    <select
                                                        className="input-field"
                                                        value={scope}
                                                        onChange={(e) => updatePromotion(pid, { scope: e.target.value, updatedAt: new Date().toISOString() })}
                                                    >
                                                        <option value="ALL">Toda la tienda</option>
                                                        <option value="PRODUCTS">Productos</option>
                                                    </select>
                                                </div>
                                                <div className="input-group" style={{ margin: 0 }}>
                                                    <label className="input-label">Tipo</label>
                                                    <select
                                                        className="input-field"
                                                        value={discountType}
                                                        onChange={(e) => updatePromotion(pid, { discountType: e.target.value, updatedAt: new Date().toISOString() })}
                                                    >
                                                        <option value="PERCENT">%</option>
                                                        <option value="AMOUNT">$</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                                                {discountType === 'PERCENT' ? (
                                                    <div className="input-group" style={{ margin: 0 }}>
                                                        <label className="input-label">%</label>
                                                        <input
                                                            type="number"
                                                            className="input-field"
                                                            value={Number(promo?.percent || 0)}
                                                            onChange={(e) => updatePromotion(pid, { percent: Number(e.target.value), updatedAt: new Date().toISOString() })}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="input-group" style={{ margin: 0 }}>
                                                        <label className="input-label">$</label>
                                                        <input
                                                            type="number"
                                                            className="input-field"
                                                            value={Number(promo?.amount || 0)}
                                                            onChange={(e) => updatePromotion(pid, { amount: Number(e.target.value), updatedAt: new Date().toISOString() })}
                                                        />
                                                    </div>
                                                )}

                                                <div className="input-group" style={{ margin: 0 }}>
                                                    <label className="input-label">Desde</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="input-field"
                                                        value={startLocal}
                                                        onChange={(e) => updatePromotion(pid, { startAt: fromDatetimeLocal(e.target.value), updatedAt: new Date().toISOString() })}
                                                    />
                                                </div>
                                                <div className="input-group" style={{ margin: 0 }}>
                                                    <label className="input-label">Hasta</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="input-field"
                                                        value={endLocal}
                                                        onChange={(e) => updatePromotion(pid, { endAt: fromDatetimeLocal(e.target.value), updatedAt: new Date().toISOString() })}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={promo?.includeFullPriceOnly === true}
                                                        onChange={(e) => updatePromotion(pid, { includeFullPriceOnly: e.target.checked, updatedAt: new Date().toISOString() })}
                                                    />
                                                    <span>Incluye “Precio Full”</span>
                                                </label>

                                                {scope === 'PRODUCTS' && (
                                                    <button
                                                        className="btn"
                                                        onClick={() => setPromoProductsOpenId((prev) => (prev === pid ? '' : pid))}
                                                    >
                                                        {productsOpen ? 'Cerrar productos' : `Productos (${selectedCount})`}
                                                    </button>
                                                )}
                                            </div>

                                            {scope === 'PRODUCTS' && productsOpen && (
                                                <div className="card" style={{ marginTop: '0.75rem' }}>
                                                    <input
                                                        type="text"
                                                        className="input-field"
                                                        value={promoProductSearch}
                                                        onChange={(e) => setPromoProductSearch(e.target.value)}
                                                        placeholder="Buscar producto..."
                                                    />
                                                    <div style={{ maxHeight: '260px', overflow: 'auto', marginTop: '0.6rem', display: 'grid', gap: '0.35rem' }}>
                                                        {(Array.isArray(products) ? products : [])
                                                            .filter((pr) => {
                                                                const q = String(promoProductSearch || '').trim().toLowerCase();
                                                                if (!q) return true;
                                                                const label = `${pr?.name || ''} ${pr?.code || ''} ${pr?.barcode || ''}`.toLowerCase();
                                                                return label.includes(q);
                                                            })
                                                            .slice(0, 60)
                                                            .map((pr) => {
                                                                const prId = String(pr?.id || '');
                                                                if (!prId) return null;
                                                                const current = Array.isArray(promo?.productIds) ? promo.productIds.map(String) : [];
                                                                const checked = current.includes(prId);
                                                                return (
                                                                    <label key={prId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={() => {
                                                                                const nextIds = checked ? current.filter((x) => x !== prId) : [...current, prId];
                                                                                updatePromotion(pid, { productIds: nextIds, updatedAt: new Date().toISOString() });
                                                                            }}
                                                                        />
                                                                        <span style={{ fontSize: '0.9rem' }}>{pr?.name || prId}</span>
                                                                    </label>
                                                                );
                                                            })
                                                            .filter(Boolean)}
                                                    </div>
                                                    <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                                        Muestra maximo 60 resultados. Use el buscador.
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {subTab === 'categorias' && (
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Gestionar Categorias</h3>
                    <p>Defina las Categorias de productos para organizar su inventario.</p>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                        <input
                            type="text" className="input-field" placeholder="Nueva Categorias (ej: Bebidas, Ropa)"
                            value={newCategory} onChange={e => setNewCategory(e.target.value)}
                        />
                        <button className="btn btn-primary" onClick={handleAddCategory}>Agregar</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                        {categories.map(cat => (
                            <div key={cat} className="card card--muted" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem' }}>
                                <strong>{cat}</strong>
                                <button
                                    className="btn" style={{ color: 'red', border: 'none', backgroundColor: 'transparent' }}
                                    onClick={() => handleRemoveCategory(cat)}
                                    disabled={cat === 'General'}
                                >
                                    {'\u2715'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {promoHistoryOpen && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem'
                }}>
                    <div className="card" style={{ width: 'min(1100px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Historial de promociones</h3>
                                <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)' }}>
                                    Total descontado por promociones: <strong>${Number(promotionHistory.grandTotal || 0).toLocaleString()}</strong>
                                </p>
                            </div>
                            <button className="btn" onClick={() => setPromoHistoryOpen(false)}>Cerrar</button>
                        </div>

                        <div className="card card--muted" style={{ marginBottom: '1rem' }}>
                            <h4 style={{ marginTop: 0 }}>Totales por promocion</h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Promocion</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Usos</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total descontado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {promotionHistory.totals.length === 0 ? (
                                        <tr><td colSpan="3" style={{ padding: '1rem', textAlign: 'center' }}>No hay descuentos de promociones registrados.</td></tr>
                                    ) : (
                                        promotionHistory.totals.map((row) => (
                                            <tr key={row.promoId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '0.5rem' }}>{row.promoName}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{Number(row.uses || 0).toLocaleString()}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>${Number(row.totalDiscount || 0).toLocaleString()}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="card card--muted">
                            <h4 style={{ marginTop: 0 }}>Detalle por factura</h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Fecha</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Promocion</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Factura</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Cliente</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Usuario</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Descuento promo</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total factura</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {promotionHistory.invoiceRows.length === 0 ? (
                                        <tr><td colSpan="7" style={{ padding: '1rem', textAlign: 'center' }}>Sin facturas con promociones.</td></tr>
                                    ) : (
                                        promotionHistory.invoiceRows.map((row, index) => (
                                            <tr key={`${row.promoId}-${row.invoiceCode}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '0.5rem' }}>{row.date ? new Date(row.date).toLocaleString() : 'N/A'}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.promoName}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.invoiceCode}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.clientName}</td>
                                                <td style={{ padding: '0.5rem' }}>{row.userName}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>-${Number(row.promoAmount || 0).toLocaleString()}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>${Number(row.invoiceTotal || 0).toLocaleString()}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {editingUser && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem'
                }}>
                    <div className="card" style={{ width: 'min(520px, 100%)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>Editar Usuario</h3>
                            <button className="btn" onClick={() => setEditingUser(null)}>Cerrar</button>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Nombre Real</label>
                            <input
                                type="text"
                                className="input-field"
                                value={editingUser.name}
                                onChange={(e) => setEditingUser((prev) => ({ ...prev, name: e.target.value }))}
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label">Correo</label>
                            <input
                                type="email"
                                className="input-field"
                                value={editingUser.email || ''}
                                onChange={(e) => setEditingUser((prev) => ({ ...prev, email: e.target.value }))}
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label">Rol</label>
                            <select
                                className="input-field"
                                value={editingUser.role}
                                onChange={(e) => setEditingUser((prev) => ({ ...prev, role: e.target.value }))}
                            >
                                <option value="Administrador">Administrador</option>
                                <option value="Supervisor">Supervisor</option>
                                <option value="Cajero">Cajero</option>
                            </select>
                        </div>

                        <div className="input-group">
                            <label className="input-label">Clave de Autorizacion</label>
                            <input
                                type="password"
                                className="input-field"
                                value={editingUser.authorizationKey}
                                onChange={(e) => setEditingUser((prev) => ({ ...prev, authorizationKey: e.target.value }))}
                                placeholder="Clave para descuentos y aprobaciones"
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label">Nueva Contrasena</label>
                            <input
                                type="password"
                                className="input-field"
                                value={editingUser.password}
                                onChange={(e) => setEditingUser((prev) => ({ ...prev, password: e.target.value }))}
                                placeholder="Opcional, solo si desea cambiarla"
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                            <button className="btn" onClick={() => setEditingUser(null)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleUpdateUser} disabled={usersLoading}>
                                {usersLoading ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {subTab === 'flash' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '2rem' }}>
                    {/* Creation / Edition Form */}
                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>
                            {newReminder.id ? 'Editar Recordatorio' : 'Crear Recordatorio Flash'}
                        </h3>
                        <form onSubmit={handleSaveFlashReminder}>
                            <div className="input-group">
                                <label className="input-label">Título del Anuncio</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={newReminder.title}
                                    onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
                                    placeholder="Ej: Reunión general, Promoción de la semana"
                                    required
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Mensaje / Descripción</label>
                                <textarea
                                    className="input-field"
                                    rows="4"
                                    value={newReminder.description}
                                    onChange={(e) => setNewReminder({ ...newReminder, description: e.target.value })}
                                    placeholder="Escribe el mensaje que verán los empleados..."
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Adjuntar Foto o Video</label>
                                <input
                                    type="file"
                                    accept="image/*,video/*"
                                    className="input-field"
                                    onChange={handleFlashMediaChange}
                                />
                                <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    Imágenes (máx. 2MB) o Videos (máx. 10MB) se comprimen/convierten para almacenamiento local.
                                </div>
                                {!!mediaFileError && (
                                    <div className="alert alert-danger" style={{ marginTop: '0.5rem', padding: '0.35rem' }}>
                                        {mediaFileError}
                                    </div>
                                )}
                            </div>

                            {/* Media Preview inside Form */}
                            {newReminder.media_url && (
                                <div className="card card--muted" style={{ marginBottom: '1rem', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                    <strong>Vista previa del archivo</strong>
                                    {newReminder.media_type === 'video' ? (
                                        <video
                                            src={newReminder.media_url}
                                            controls
                                            style={{ width: '100%', maxHeight: '180px', borderRadius: '0.5rem' }}
                                        />
                                    ) : (
                                        <img
                                            src={newReminder.media_url}
                                            alt="Preview"
                                            style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: '0.5rem' }}
                                        />
                                    )}
                                    <button
                                        type="button"
                                        className="btn"
                                        style={{ width: '100%', padding: '4px 8px', fontSize: '0.85em', backgroundColor: 'var(--surface-danger)' }}
                                        onClick={() => setNewReminder({ ...newReminder, media_url: '', media_type: 'none' })}
                                    >
                                        Quitar archivo
                                    </button>
                                </div>
                            )}

                            <div className="input-group">
                                <label className="input-label">Repeticiones máximas por usuario</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="input-field"
                                    value={newReminder.max_views}
                                    onChange={(e) => setNewReminder({ ...newReminder, max_views: Number(e.target.value) })}
                                    placeholder="0 = Sin límite, 1 = Solo una vez"
                                />
                                <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    Cuántas veces le aparecerá el popup en pantalla a cada usuario.
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Roles objetivo</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.5rem' }}>
                                    {['Administrador', 'Supervisor', 'Cajero'].map(role => (
                                        <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={newReminder.target_roles.includes(role)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    let nextRoles = [...newReminder.target_roles];
                                                    if (checked) {
                                                        nextRoles.push(role);
                                                    } else {
                                                        nextRoles = nextRoles.filter(r => r !== role);
                                                    }
                                                    setNewReminder({ ...newReminder, target_roles: nextRoles });
                                                }}
                                            />
                                            {role}
                                        </label>
                                    ))}
                                </div>
                                <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    Si no marcas ninguno, se mostrará a todos los empleados.
                                </div>
                            </div>

                            <div className="input-group" style={{ marginTop: '0.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={newReminder.active}
                                        onChange={(e) => setNewReminder({ ...newReminder, active: e.target.checked })}
                                    />
                                    Recordatorio Activo (Mostrar en pantalla)
                                </label>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={reminderSaveBusy}>
                                    {reminderSaveBusy ? 'Guardando...' : (newReminder.id ? 'Guardar' : 'Crear')}
                                </button>
                                {newReminder.id && (
                                    <button
                                        type="button"
                                        className="btn"
                                        style={{ flex: 1 }}
                                        onClick={() => setNewReminder({ id: null, title: '', description: '', media_url: '', media_type: 'none', max_views: 1, target_roles: [], active: true })}
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* Reminders List */}
                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Anuncios Configurados</h3>
                        {remindersLoading ? (
                            <p>Cargando anuncios...</p>
                        ) : flashReminders.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)' }}>No hay recordatorios configurados aún.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {flashReminders.map(r => (
                                    <div
                                        key={r.id}
                                        className="card card--muted"
                                        style={{
                                            borderLeft: `4px solid ${r.active ? '#ffb400' : 'var(--border-soft)'}`,
                                            padding: '1.25rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.75rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <div>
                                                <h4 style={{ margin: 0, color: r.active ? '#ffb400' : 'var(--text-secondary)' }}>
                                                    {r.title}
                                                </h4>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                    Creado: {new Date(r.created_at).toLocaleString()} | Máx. vistas: {r.max_views === 0 ? 'Sin límite' : r.max_views}
                                                </div>
                                            </div>
                                            <span
                                                className="badge"
                                                style={{
                                                    backgroundColor: r.active ? 'var(--surface-success)' : 'var(--surface-muted)',
                                                    borderColor: r.active ? 'rgba(0, 255, 154, 0.45)' : 'var(--border-soft)'
                                                }}
                                            >
                                                {r.active ? 'Activo' : 'Pausado'}
                                            </span>
                                        </div>

                                        {r.description && (
                                            <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                                {r.description}
                                            </p>
                                        )}

                                        {r.media_url && (
                                            <div style={{
                                                maxHeight: '120px',
                                                display: 'flex',
                                                backgroundColor: '#0f172a',
                                                borderRadius: '0.5rem',
                                                overflow: 'hidden',
                                                width: 'max-content',
                                                border: '1px solid var(--border-soft)'
                                            }}>
                                                {r.media_type === 'video' ? (
                                                    <video
                                                        src={r.media_url}
                                                        style={{ height: '120px', objectFit: 'contain' }}
                                                    />
                                                ) : (
                                                    <img
                                                        src={r.media_url}
                                                        alt={r.title}
                                                        style={{ height: '120px', objectFit: 'contain' }}
                                                    />
                                                )}
                                            </div>
                                        )}

                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                            <strong>Destinatarios:</strong> {r.target_roles && r.target_roles.length > 0 ? r.target_roles.join(', ') : 'Todos los roles'}
                                        </div>

                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                                            <button
                                                className="btn"
                                                style={{ padding: '4px 10px', fontSize: '0.85em' }}
                                                onClick={() => setNewReminder({
                                                    id: r.id,
                                                    title: r.title,
                                                    description: r.description || '',
                                                    media_url: r.media_url || '',
                                                    media_type: r.media_type || 'none',
                                                    max_views: r.max_views ?? 1,
                                                    target_roles: r.target_roles || [],
                                                    active: r.active !== false
                                                })}
                                            >
                                                Editar
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '4px 10px', fontSize: '0.85em', backgroundColor: 'var(--surface-muted)' }}
                                                onClick={() => handleResetFlashReminderViews(r.id)}
                                                title="Reinicia el conteo para que todos los usuarios vuelvan a ver el recordatorio"
                                            >
                                                🔄 Reiniciar vistas
                                            </button>
                                            <button
                                                className="btn"
                                                style={{ padding: '4px 10px', fontSize: '0.85em', backgroundColor: 'var(--surface-danger)', color: 'white' }}
                                                onClick={() => handleDeleteFlashReminder(r.id)}
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
