import React, { useState } from 'react';

export function SettingsModule({
    users, setUsers,
    paymentMethods, setPaymentMethods,
    categories, setCategories,
    onResetSystem, onSaveSystem
}) {
    const [subTab, setSubTab] = useState('usuarios');

    // New User State
    const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'Cajero' });
    const [editingPermissionsUser, setEditingPermissionsUser] = useState(null);

    // New Payment Method State
    const [newMethod, setNewMethod] = useState('');

    // New Category State
    const [newCategory, setNewCategory] = useState('');

    const defaultPermissions = {
        Administrador: {
            facturacion: true, cartera: true, compras: true, clientes: true, caja: true,
            inventario: true, codigos: true, reportes: true, bitacora: true, config: true,
            trueque: true, gastos: true, notas: true, historial: true
        },
        Supervisor: {
            facturacion: true, cartera: true, compras: false, clientes: true, caja: true,
            inventario: true, codigos: true, reportes: true, bitacora: true, config: false,
            trueque: true, gastos: true, notas: true, historial: true
        },
        Cajero: {
            facturacion: true, cartera: false, compras: false, clientes: false, caja: false,
            inventario: false, codigos: false, reportes: false, bitacora: false, config: false,
            trueque: false, gastos: false, notas: false, historial: false
        }
    };

    const handleCreateUser = (e) => {
        e.preventDefault();
        if (!newUser.username || !newUser.password) return alert("Usuario y clave obligatorios");

        const permissions = defaultPermissions[newUser.role] || defaultPermissions.Cajero;

        setUsers([...users, { ...newUser, id: Date.now(), permissions }]);
        setNewUser({ name: '', username: '', password: '', role: 'Cajero' });
        alert("Usuario creado");
    };

    const togglePermission = (userId, module) => {
        setUsers(users.map(u => {
            if (u.id === userId) {
                const newPermissions = { ...(u.permissions || {}), [module]: !(u.permissions?.[module]) };
                return { ...u, permissions: newPermissions };
            }
            return u;
        }));
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
                <button className={`btn ${subTab === 'categorias' ? 'btn-primary' : ''}`} onClick={() => setSubTab('categorias')}>Categoriass</button>
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
                                {users.map(u => (
                                    <React.Fragment key={u.id}>
                                        <tr style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '0.5rem' }}>{u.name}</td>
                                            <td style={{ padding: '0.5rem' }}>{u.username}</td>
                                            <td style={{ padding: '0.5rem' }}><span className="badge" style={{ backgroundColor: u.role === 'Administrador' ? '#fee2e2' : '#e2e8f0', color: u.role === 'Administrador' ? '#991b1b' : 'inherit' }}>{u.role}</span></td>
                                            <td style={{ padding: '0.5rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn"
                                                    style={{ padding: '2px 8px', fontSize: '0.8em', backgroundColor: '#e2e8f0' }}
                                                    onClick={() => setEditingPermissionsUser(editingPermissionsUser?.id === u.id ? null : u)}
                                                >
                                                    {'\uD83D\uDD10'} Permisos
                                                </button>
                                                <button
                                                    className="btn"
                                                    style={{ padding: '2px 8px', fontSize: '0.8em' }}
                                                    onClick={() => {
                                                        if (u.username === 'Admin') return alert("No se puede eliminar al administrador principal");
                                                        if (confirm(`AEliminar al usuario ${u.username}?`)) {
                                                            setUsers(users.filter(user => user.id !== u.id));
                                                        }
                                                    }}
                                                >
                                                    {'\uD83D\uDDD1\uFE0F'}
                                                </button>
                                            </td>
                                        </tr>
                                        {editingPermissionsUser?.id === u.id && (
                                            <tr>
                                                <td colSpan="4" style={{ padding: '1rem', backgroundColor: '#f8fafc' }}>
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
                    </div>
                </div>
            )}

            {subTab === 'pagos' && (
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Editar MAtodos de Pago</h3>
                    <p>Configure las opciones disponibles en la zona de facturaciAn.</p>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                        <input
                            type="text" className="input-field" placeholder="Nuevo mAtodo (ej: Bitcoin, Giro)"
                            value={newMethod} onChange={e => setNewMethod(e.target.value)}
                        />
                        <button className="btn btn-primary" onClick={handleAddPayment}>Agregar</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                        {paymentMethods.map(method => (
                            <div key={method} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: '#f8fafc' }}>
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
                    <p style={{ fontSize: '0.8em', color: '#64748b', marginTop: '1rem' }}>Nota: MAtodos bAsicos (Efectivo/Credito) no se pueden eliminar.</p>
                </div>
            )}

            {subTab === 'sistema' && (
                <div className="card" style={{ border: '2px solid #fee2e2' }}>
                    <h3 style={{ marginTop: 0, color: '#991b1b' }}>Zona de Peligro - Control del Sistema</h3>
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
            )}

            {subTab === 'categorias' && (
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Gestionar Categoriass</h3>
                    <p>Defina las Categoriass de productos para organizar su inventario.</p>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                        <input
                            type="text" className="input-field" placeholder="Nueva Categorias (ej: Bebidas, Ropa)"
                            value={newCategory} onChange={e => setNewCategory(e.target.value)}
                        />
                        <button className="btn btn-primary" onClick={handleAddCategory}>Agregar</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                        {categories.map(cat => (
                            <div key={cat} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', backgroundColor: '#f8fafc' }}>
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
