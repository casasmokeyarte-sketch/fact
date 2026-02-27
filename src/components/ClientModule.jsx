import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { INITIAL_REGISTERED_CLIENT, CREDIT_LEVELS, COMPANY_INFO } from '../constants';

export function ClientModule({ currentUser, clients, setClients, cartera, salesHistory, onLog }) {
    const [newClient, setNewClient] = useState(INITIAL_REGISTERED_CLIENT);
    const [isEditing, setIsEditing] = useState(false);
    const [editingDocument, setEditingDocument] = useState('');
    const [selectedClientReport, setSelectedClientReport] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const filterStorageKey = `fact_filter_clients_${currentUser?.id || 'anon'}`;
    
    // Check if user is Cajero
    const isCajero = currentUser?.role === 'Cajero';
    const isAdmin = currentUser?.role === 'Administrador';
    const canEdit = !isCajero && (currentUser?.permissions?.clientes?.editar !== false);
    const canExport = !isCajero && (currentUser?.permissions?.clientes?.exportar !== false);
    const canImport = !isCajero && (currentUser?.permissions?.clientes?.importar !== false);
    const onlyStandard = isCajero || currentUser?.permissions?.clientes?.solo_estandar;
    const canBlockClient = isAdmin;

    const normalizeCreditLevelKey = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();

    const resolveCreditLevel = (rawLevel) => {
        const normalized = normalizeCreditLevelKey(rawLevel || 'ESTANDAR');
        if (CREDIT_LEVELS[normalized]) return normalized;
        const byLabel = Object.entries(CREDIT_LEVELS).find(([, level]) =>
            normalizeCreditLevelKey(level?.label) === normalized
        );
        return byLabel?.[0] || 'ESTANDAR';
    };

    useEffect(() => {
        if (!currentUser?.id) return;
        const saved = localStorage.getItem(filterStorageKey);
        if (saved !== null) setSearchTerm(saved);
    }, [currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;
        localStorage.setItem(filterStorageKey, searchTerm);
    }, [searchTerm, currentUser?.id]);

    const handleLevelChange = (levelKey) => {
        const safeLevel = resolveCreditLevel(levelKey);
        const levelData = CREDIT_LEVELS[safeLevel] || CREDIT_LEVELS.ESTANDAR;
        setNewClient({
            ...newClient,
            creditLevel: safeLevel,
            discount: levelData.discount,
            creditLimit: levelData.maxInvoice
        });
    };

    const handleSave = (e) => {
        e.preventDefault();
        if (!newClient.name || !newClient.document) return alert("Nombre y Documento son obligatorios");

        const { credit_level, credit_limit, approved_term, ...cleanClient } = (newClient || {});
        const normalizedClient = {
            ...cleanClient,
            name: String(newClient.name || '').trim(),
            document: String(newClient.document || '').trim(),
            creditLevel: resolveCreditLevel(newClient.creditLevel),
            creditLimit: Number(newClient.creditLimit ?? 0),
            approvedTerm: Number(newClient.approvedTerm ?? 30),
            discount: Number(newClient.discount ?? 0),
        };

        if (isEditing) {
            const matchDoc = editingDocument || normalizedClient.document;
            setClients(clients.map(c => String(c.document || '').trim() === String(matchDoc || '').trim() ? normalizedClient : c));
            setIsEditing(false);
            setEditingDocument('');
            onLog?.({ module: 'Clientes', action: 'Editar Cliente', details: `Se editA a: ${newClient.name}` });
        } else {
            if (clients.find(c => String(c.document || '').trim() === normalizedClient.document)) return alert("Documento ya existe");
            const clientToAdd = { ...normalizedClient, id: Date.now(), blocked: false };
            setClients([...clients, clientToAdd]);
            onLog?.({ module: 'Clientes', action: 'Crear Cliente', details: `Se creA a: ${newClient.name}` });
        }
        setNewClient(INITIAL_REGISTERED_CLIENT);
    };

    const toggleClientBlock = (client) => {
        if (!canBlockClient) return;
        const nextBlocked = !client.blocked;
        const action = nextBlocked ? 'Bloquear Cliente' : 'Desbloquear Cliente';
        const confirmMsg = nextBlocked
            ? `ABloquear a ${client.name}? No podra facturar ni abonar hasta desbloquearlo.`
            : `ADesbloquear a ${client.name}?`;

        if (!window.confirm(confirmMsg)) return;

        setClients(clients.map((c) =>
            c.document === client.document ? { ...c, blocked: nextBlocked } : c
        ));

        onLog?.({
            module: 'Clientes',
            action,
            details: `${client.name} (${client.document}) -> ${nextBlocked ? 'BLOQUEADO' : 'ACTIVO'}`
        });
    };

    const exportClients = (type) => {
        if (type === 'json') {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clients));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "clientes_export.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } else if (type === 'excel') {
            const ws = XLSX.utils.json_to_sheet(clients);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Clientes");
            XLSX.writeFile(wb, "clientes.xlsx");
        } else if (type === 'notes') {
            const headers = "nombre,documento,telefono,direccion,nivel_credito,limite_credito,descuento\n";
            const rows = clients.map(c => `"${c.name}","${c.document}","${c.phone}","${c.address}","${c.creditLevel}",${c.creditLimit},${c.discount}`).join("\n");
            const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", "clientes_notas.csv");
            link.click();
        }
        onLog?.({ module: 'Clientes', action: 'Exportar', details: `Exportado en formato ${type.toUpperCase()}` });
    };

    const importClients = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();

        if (type === 'excel') {
            reader.readAsBinaryString(file);
            reader.onload = (evt) => {
                try {
                    const bstr = evt.target.result;
                    const wb = XLSX.read(bstr, { type: 'binary' });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json(ws);
                    if (Array.isArray(data) && data.length > 0) {
                        setClients(data);
                        onLog?.({ module: 'Clientes', action: 'Importar Excel', details: `Importados ${data.length} clientes` });
                        alert("Clientes importados con Axito");
                    }
                } catch (err) { alert("Error al importar Excel"); }
            };
        } else {
            reader.onload = (event) => {
                try {
                    const content = event.target.result;
                    let imported = [];
                    if (type === 'json') {
                        imported = JSON.parse(content);
                    } else if (type === 'notes') {
                        const lines = content.split('\n').filter(l => l.trim().length > 0);
                        const [header, ...rows] = lines;
                        imported = rows.map(row => {
                            const [name, doc, phone, addr, level, limit, disc] = row.split(',').map(s => s.replace(/"/g, '').trim());
                            return { name, document: doc, phone, address: addr, creditLevel: level || 'ESTANDAR', creditLimit: Number(limit) || 0, discount: Number(disc) || 0, id: Date.now() + Math.random() };
                        });
                    }
                    if (Array.isArray(imported)) {
                        setClients(imported);
                        alert("Clientes importados con Axito");
                    }
                } catch (err) {
                    alert("Error al importar archivo");
                } finally { e.target.value = ''; }
            };
            reader.readAsText(file);
        }
    };

    if (selectedClientReport) {
        const clientCartera = cartera.filter(c => c.clientName === selectedClientReport.name);
        const clientSales = salesHistory.filter(s => s.clientName === selectedClientReport.name);
        const currentBalance = clientCartera.reduce((sum, inv) => sum + (inv.balance || 0), 0);

        return (
            <div className="client-report-view">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }} className="no-print">
                    <button className="btn" onClick={() => setSelectedClientReport(null)}>{'\u2B05'} Volver al Listado</button>
                    <button className="btn btn-primary" onClick={() => window.print()}>{'\uD83D\uDDA8\uFE0F'} Imprimir Reporte</button>
                </div>

                <div className="card printable-area">
                    <div style={{ textAlign: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                        <img src={COMPANY_INFO.logo} alt="Logo" style={{ maxWidth: '90px', marginBottom: '0.25rem' }} />
                        <h3 style={{ margin: '0.1rem 0' }}>{COMPANY_INFO.name}</h3>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>NIT: {COMPANY_INFO.nit}</p>
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>{COMPANY_INFO.address}</p>
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>Tel: {COMPANY_INFO.phone} | {COMPANY_INFO.email}</p>
                    </div>
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #334155', paddingBottom: '1rem', marginBottom: '2rem' }}>
                        <h2 style={{ margin: 0 }}>ESTADO DE CUENTA INDIVIDUAL</h2>
                        <p style={{ color: '#64748b', margin: '0.5rem 0' }}>Reporte generado el {new Date().toLocaleString()}</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                        <div>
                            <h4 style={{ textTransform: 'uppercase', color: '#64748b', fontSize: '0.8rem', borderBottom: '1px solid #e2e8f0' }}>InformaciAn del Cliente</h4>
                            <p><strong>Nombre:</strong> {selectedClientReport.name}</p>
                            <p><strong>NIT/Documento:</strong> {selectedClientReport.document}</p>
                            <p><strong>Telèfono:</strong> {selectedClientReport.phone || 'N/A'}</p>
                            <p><strong>Direcciòn:</strong> {selectedClientReport.address || 'N/A'}</p>
                        </div>
                        <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', textAlign: 'right' }}>
                            <h4 style={{ textTransform: 'uppercase', color: '#64748b', fontSize: '0.8rem', borderBottom: '1px solid #e2e8f0' }}>Resumen Financiero</h4>
                            <p style={{ fontSize: '1.5rem', margin: '0.5rem 0' }}>Saldo Pendiente: <strong style={{ color: '#e11d48' }}>${currentBalance.toLocaleString()}</strong></p>
                            <p>Limite de Credito: ${selectedClientReport.creditLimit.toLocaleString()}</p>
                            <p>Cupo Disponible: ${(selectedClientReport.creditLimit - currentBalance).toLocaleString()}</p>
                        </div>
                    </div>

                    <h4 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>Detalle de Cartera (Pendientes)</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Fecha</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Factura #</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clientCartera.length === 0 ? (
                                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '1rem' }}>No posee facturas pendientes</td></tr>
                            ) : (
                                clientCartera.map(inv => (
                                    <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.5rem' }}>{new Date(inv.date).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.5rem' }}>{inv.id}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>${inv.total.toLocaleString()}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right' }}><strong>${inv.balance.toLocaleString()}</strong></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    <h4 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>Asltimas Compras (Historial)</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Fecha</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Factura #</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Metodo</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clientSales.slice(0, 5).map(s => (
                                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.5rem' }}>{new Date(s.date).toLocaleDateString()}</td>
                                    <td style={{ padding: '0.5rem' }}>{s.id}</td>
                                    <td style={{ padding: '0.5rem' }}><span className="badge">{s.paymentMode}</span></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>${s.total.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="client-module">
            <h2>Modulo de Clientes</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>{isEditing ? 'Editar Cliente' : 'Crear Cliente'}</h3>
                    <form onSubmit={handleSave}>
                        <div className="input-group">
                            <label className="input-label">Nombre Completo</label>
                            <input type="text" className="input-field" value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} required />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Documento / NIT</label>
                            <input type="text" className="input-field" value={newClient.document} onChange={e => setNewClient({ ...newClient, document: e.target.value })} required />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Direcciòn</label>
                            <input type="text" className="input-field" value={newClient.address} onChange={e => setNewClient({ ...newClient, address: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Telèfono</label>
                            <input type="text" className="input-field" value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Email (para facturas eelectronica)</label>
                            <input type="email" className="input-field" value={newClient.email || ''} onChange={e => setNewClient({ ...newClient, email: e.target.value })} placeholder="cliente@ejemplo.com" />
                        </div>
                        {!onlyStandard && (
                        <>
                        <div className="input-group">
                            <label className="input-label">Nivel de Credito</label>
                            <select
                                className="input-field"
                                value={newClient.creditLevel}
                                onChange={e => handleLevelChange(e.target.value)}
                            >
                                {Object.entries(CREDIT_LEVELS).map(([key, data]) => (
                                    <option key={key} value={key}>
                                        {key === 'CREDITO_SIN_DESCUENTO' ? 'Linea de Credito (Sin descuento)' : data.label} (Max: ${data.maxInvoice.toLocaleString()})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Cupo Credito (Max Sugerido)</label>
                                <input type="number" className="input-field" value={newClient.creditLimit} onChange={e => setNewClient({ ...newClient, creditLimit: Number(e.target.value) })} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Descuento AutomAtico (%)</label>
                                <input type="number" className="input-field" value={newClient.discount} readOnly style={{ backgroundColor: '#f1f5f9' }} />
                            </div>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Plazo (Dias)</label>
                            <input type="number" className="input-field" value={newClient.approvedTerm} onChange={e => setNewClient({ ...newClient, approvedTerm: Number(e.target.value) })} />
                        </div>
                        </>
                        )}
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>{isEditing ? 'Actualizar' : 'Guardar Cliente'}</button>
                        {isEditing && <button className="btn" onClick={() => { setIsEditing(false); setEditingDocument(''); setNewClient(INITIAL_REGISTERED_CLIENT) }} style={{ width: '100%', marginTop: '0.5rem' }}>Cancelar</button>}
                    </form>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Listado de Clientes</h3>
                        {(canExport || canImport) && (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {canExport && (
                                    <div className="btn-group">
                                        <button className="btn" onClick={() => exportClients('excel')} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8em' }}>XLS</button>
                                        <button className="btn" onClick={() => exportClients('json')} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8em' }}>JSON</button>
                                        <button className="btn" onClick={() => exportClients('notes')} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8em' }}>Notas</button>
                                    </div>
                                )}
                                {canImport && (
                                    <div className="btn-group">
                                        <label className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8em', cursor: 'pointer' }}>
                                            Imp. XLS
                                            <input type="file" style={{ display: 'none' }} onChange={(e) => importClients(e, 'excel')} accept=".xlsx,.xls" />
                                        </label>
                                        <label className="btn" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8em', cursor: 'pointer' }}>
                                            Imp. JSON
                                            <input type="file" style={{ display: 'none' }} onChange={(e) => importClients(e, 'json')} accept=".json" />
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <input
                            type="text"
                            placeholder={'\uD83D\uDD0D Buscar cliente por nombre o NIT...'}
                            className="input-field"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Cliente</th>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>NIT</th>
                                <th style={{ padding: '0.5rem', textAlign: 'center' }}>Estado</th>
                                <th style={{ padding: '0.5rem', textAlign: 'center' }}>Desc.</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Cupo</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>AcciAn</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clients.filter(c =>
                                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                c.document.toLowerCase().includes(searchTerm.toLowerCase())
                            ).map(c => (
                                <tr key={c.document} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '0.5rem' }}>{c.name}</td>
                                    <td style={{ padding: '0.5rem' }}>{c.document}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                        <span className={`badge ${c.blocked ? 'alert alert-warning' : ''}`} style={{ padding: '0.2rem 0.45rem' }}>
                                            {c.blocked ? 'Bloqueado' : 'Activo'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{c.discount}%</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>${c.creditLimit.toLocaleString()}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right', display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                        {canEdit && (
                                            <button
                                                className="btn"
                                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8em' }}
                                                onClick={() => {
                                                    setIsEditing(true);
                                                    setEditingDocument(String(c.document || '').trim());
                                                    setNewClient({
                                                        ...c,
                                                        creditLevel: resolveCreditLevel(c.creditLevel || c.credit_level),
                                                        creditLimit: Number(c.creditLimit ?? c.credit_limit ?? 0),
                                                        approvedTerm: Number(c.approvedTerm ?? c.approved_term ?? 30),
                                                        discount: Number(c.discount ?? 0),
                                                        credit_level: undefined,
                                                        credit_limit: undefined,
                                                        approved_term: undefined,
                                                    });
                                                }}
                                            >
                                                {'\u270F\uFE0F'}
                                            </button>
                                        )}
                                        <button className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8em', backgroundColor: '#e2e8f0' }} onClick={() => setSelectedClientReport(c)}>{'\uD83D\uDCCA'}</button>
                                        {canBlockClient && (
                                            <button
                                                className="btn"
                                                style={{
                                                    padding: '0.2rem 0.5rem',
                                                    fontSize: '0.8em',
                                                    backgroundColor: c.blocked ? '#dcfce7' : '#fee2e2',
                                                    color: c.blocked ? '#166534' : '#991b1b'
                                                }}
                                                onClick={() => toggleClientBlock(c)}
                                            >
                                                {c.blocked ? 'Desbloquear' : 'Bloquear'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
