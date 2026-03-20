import React, { useState } from 'react';
import { playSound } from '../lib/soundService';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { supabase } from '../lib/supabaseClient';

export function SettingsModule({
    users, setUsers,
    paymentMethods, setPaymentMethods,
    categories, setCategories,
    onResetSystem, onSaveSystem,
    soundEnabled, setSoundEnabled,
    soundVolume, setSoundVolume,
    soundPreset, setSoundPreset,
    operationalDateSettings,
    onApplyOperationalDateOffset
}) {
    const [subTab, setSubTab] = useState('usuarios');

    // New User State
    const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'Cajero' });
    const [editingPermissionsUser, setEditingPermissionsUser] = useState(null);

    // New Payment Method State
    const [newMethod, setNewMethod] = useState('');

    // New Category State
    const [newCategory, setNewCategory] = useState('');
    const [dayOffsetInput, setDayOffsetInput] = useState(() => Number(operationalDateSettings?.daysOffset || 0));
    const [dayOffsetReason, setDayOffsetReason] = useState('');
    const usersPagination = usePagination(users, 15);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState('');

    const adminApiBase = String(import.meta.env?.VITE_ADMIN_API_BASE_URL || '').trim();
    const adminUsersUrl = `${adminApiBase}/api/admin-users`;

    React.useEffect(() => {
        setDayOffsetInput(Number(operationalDateSettings?.daysOffset || 0));
    }, [operationalDateSettings?.daysOffset]);

    const refreshUsersFromSupabase = React.useCallback(async () => {
        setUsersError('');
        setUsersLoading(true);
        try {
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

            const mapped = (data?.users || []).map((u) => ({
                id: u.user_id || u.id,
                name: u.name || u.display_name || u.username || u.email || 'Usuario',
                username: u.username || (String(u.email || '').split('@')[0] || ''),
                email: u.email || null,
                role: u.role || 'Cajero',
                permissions: u.permissions || {},
            }));

            setUsers(mapped);
        } catch (err) {
            setUsersError(err?.message || 'Error cargando usuarios.');
        } finally {
            setUsersLoading(false);
        }
    }, [adminUsersUrl, setUsers]);

    React.useEffect(() => {
        if (subTab !== 'usuarios') return;
        if (!Array.isArray(users) || users.length <= 1) {
            refreshUsersFromSupabase();
        }
    }, [subTab, users?.length, refreshUsersFromSupabase]);

    const defaultPermissions = {
        Administrador: {
            facturacion: true, cartera: true, compras: true, clientes: true, caja: true,
            inventario: true, codigos: true, reportes: true, bitacora: true, config: true,
            trueque: true, gastos: true, notas: true, historial: true
        },
        Supervisor: {
            facturacion: true, cartera: true, compras: true, clientes: true, caja: true,
            inventario: true, codigos: true, reportes: true, bitacora: true, config: false,
            trueque: true, gastos: true, notas: true, historial: true
        },
        Cajero: {
            facturacion: true, cartera: false, compras: false, clientes: false, caja: false,
            inventario: false, codigos: false, reportes: false, bitacora: false, config: false,
            trueque: false, gastos: false, notas: false, historial: false
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUser.username || !newUser.password) return alert("Usuario y clave obligatorios");

        setUsersError('');
        setUsersLoading(true);

        try {
            const permissions = defaultPermissions[newUser.role] || defaultPermissions.Cajero;
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
                    username: newUser.username,
                    password: newUser.password,
                    role: newUser.role,
                    permissions,
                    emailDomain: '@fact.local',
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || 'No se pudo crear el usuario.');
            }

            setNewUser({ name: '', username: '', password: '', role: 'Cajero' });
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
        const label = userRow?.username || userRow?.email || userRow?.name || 'usuario';
        const ok = confirm(`Eliminar al usuario ${label}?\n\nEsta accion lo borra de Supabase Auth y su perfil.`);
        if (!ok) return;

        setUsersLoading(true);
        try {
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

    const handleAddPayment = () => {
        if (!newMethod) return;
        setPaymentMethods([...paymentMethods, newMethod]);
        setNewMethod('');
    };

    const handleRemovePayment = (method) => {
        setPaymentMethods(paymentMethods.filter(m => m !== method));
    };

    const handleAddCategory = () => {
        if (!newCategory) return;
        if (categories.includes(newCategory)) return alert("La Categorias ya existe");
        setCategories([...categories, newCategory]);
        setNewCategory('');
    };

    const handleRemoveCategory = (cat) => {
        if (cat === 'General') return alert("No se puede eliminar la Categorias General");
        setCategories(categories.filter(c => c !== cat));
    };

    return (
        <div className="settings-module">
            <h2>Modulo de ConfiguraciAn</h2>

            <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button className={`btn ${subTab === 'usuarios' ? 'btn-primary' : ''}`} onClick={() => setSubTab('usuarios')}>Usuarios</button>
                <button className={`btn ${subTab === 'pagos' ? 'btn-primary' : ''}`} onClick={() => setSubTab('pagos')}>Pagos</button>
                <button className={`btn ${subTab === 'categorias' ? 'btn-primary' : ''}`} onClick={() => setSubTab('categorias')}>Categorias</button>
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
                        <h3 style={{ marginTop: 0 }}>Usuarios Activos</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #ccc' }}>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Nombre</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Usuario</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Rol</th>
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
                                            <td style={{ padding: '0.5rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
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
                                                        if (u.username === 'Admin') return alert("No se puede eliminar al administrador principal");
                                                        handleDeleteUser(u);
                                                    }}
                                                >
                                                    {'\uD83D\uDDD1\uFE0F'}
                                                </button>
                                            </td>
                                        </tr>
                                        {editingPermissionsUser?.id === u.id && (
                                            <tr>
                                                <td colSpan="4" style={{ padding: '1rem', backgroundColor: 'var(--surface-muted)' }}>
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
                            Permite ajustar temporalmente la fecha del sistema para corregir errores del dia anterior.
                            Requiere motivo obligatorio para trazabilidad.
                        </p>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label className="input-label">Dias a mover (negativo = retroceder, maximo +/-30)</label>
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
                                    onClick={() => {
                                        const ok = onApplyOperationalDateOffset?.({
                                            daysOffset: Number(dayOffsetInput || 0),
                                            reason: String(dayOffsetReason || '').trim()
                                        });
                                        if (ok) {
                                            setDayOffsetReason('');
                                            alert('Fecha operativa actualizada.');
                                        }
                                    }}
                                >
                                    Aplicar ajuste
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => {
                                        const ok = onApplyOperationalDateOffset?.({ daysOffset: 0, reason: 'Restablecer fecha real' });
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
        </div>
    );
}
