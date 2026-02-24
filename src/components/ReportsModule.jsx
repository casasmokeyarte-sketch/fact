import React, { useEffect, useMemo, useState } from 'react';
import { COMPANY_INFO } from '../constants';

export function ReportsModule({
    currentUser,
    logs,
    sales,
    shiftHistory = [],
    clients,
    inventory,
    products,
    expenses,
    purchases,
    cartera,
    users = [],
    userCashBalances = {},
    onLog
}) {
    const [reportType, setReportType] = useState('ventas');
    const [filter, setFilter] = useState('');

    const filterStorageKey = `fact_filter_reports_${currentUser?.id || 'anon'}`;
    const reportTypeStorageKey = `fact_report_type_${currentUser?.id || 'anon'}`;

    const isCajero = currentUser?.role === 'Cajero';

    useEffect(() => {
        if (!currentUser?.id) return;
        const savedFilter = localStorage.getItem(filterStorageKey);
        const savedReportType = localStorage.getItem(reportTypeStorageKey);
        if (savedFilter !== null) setFilter(savedFilter);
        if (savedReportType !== null) setReportType(savedReportType);
    }, [currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;
        localStorage.setItem(filterStorageKey, filter);
    }, [filter, currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;
        localStorage.setItem(reportTypeStorageKey, reportType);
    }, [reportType, currentUser?.id]);

    const userNameByKey = useMemo(() => {
        const map = {};
        (users || []).forEach((u) => {
            const key = String(u?.id || u?.username || u?.email || u?.name || '');
            if (!key) return;
            map[key] = u?.name || u?.username || u?.email || key;
        });
        return map;
    }, [users]);

    const CompanyHeader = () => (
        <div className="report-header only-print" style={{ display: 'none', textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem' }}>
            <img src={COMPANY_INFO.logo} alt="Logo" style={{ maxWidth: '150px', marginBottom: '0.5rem' }} />
            <h2 style={{ margin: 0, color: '#1e293b' }}>{COMPANY_INFO.name}</h2>
            <p style={{ margin: '0.2rem 0', fontWeight: 'bold' }}>NIT: {COMPANY_INFO.nit}</p>
            <p style={{ margin: '0.1rem 0', fontSize: '0.9rem' }}>{COMPANY_INFO.address}</p>
            <p style={{ margin: '0.1rem 0', fontSize: '0.9rem' }}>Tel: {COMPANY_INFO.phone} | {COMPANY_INFO.email}</p>
            <div style={{ marginTop: '1rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', color: '#64748b' }}>
                REPORTE DE {reportType} - {new Date().toLocaleDateString()}
            </div>
        </div>
    );

    const renderTable = () => {
        const f = filter.toLowerCase();

        switch (reportType) {
            case 'bitacora':
                return (
                    <table>
                        <thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Detalle</th></tr></thead>
                        <tbody>
                            {(logs || []).filter((l) => String(l?.details || '').toLowerCase().includes(f)).map((l, i) => (
                                <tr key={i}><td>{new Date(l.timestamp).toLocaleString()}</td><td>{l.user_name || l.user || 'Sistema'}</td><td>{l.action}</td><td>{l.details}</td></tr>
                            ))}
                        </tbody>
                    </table>
                );

            case 'ventas': {
                const filteredSales = (sales || []).filter((s) => String(s?.clientName || '').toLowerCase().includes(f));
                const totalSales = filteredSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Total Ventas: ${totalSales.toLocaleString()}</div>
                        <table>
                            <thead><tr><th>Factura</th><th>Cliente</th><th>Total</th><th>Pago</th></tr></thead>
                            <tbody>
                                {filteredSales.map((s, i) => (
                                    <tr key={i}><td>{s.id}</td><td>{s.clientName}</td><td>${Number(s.total || 0).toLocaleString()}</td><td>{s.paymentMode}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                );
            }

            case 'inventario':
                return (
                    <table>
                        <thead><tr><th>Producto</th><th>Bodega</th><th>Punto Venta</th><th>Total Stock</th></tr></thead>
                        <tbody>
                            {(products || []).filter((p) => String(p?.name || '').toLowerCase().includes(f)).map((p, idx) => {
                                const bodega = inventory?.bodega?.[p.id] || 0;
                                const ventas = inventory?.ventas?.[p.id] || 0;
                                return (
                                    <tr key={`${p.id}-${idx}`}>
                                        <td>{p.name}</td>
                                        <td>{bodega}</td>
                                        <td>{ventas}</td>
                                        <td><strong>{bodega + ventas}</strong></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                );

            case 'clientes':
                return (
                    <table>
                        <thead><tr><th>Nombre</th><th>Documento</th><th>Tipo</th><th>Credito</th></tr></thead>
                        <tbody>
                            {(clients || []).filter((c) => String(c?.name || '').toLowerCase().includes(f)).map((c, i) => (
                                <tr key={i}>
                                    <td>{c.name}</td>
                                    <td>{c.document}</td>
                                    <td>{c.type}</td>
                                    <td>${Number(c.creditLimit || 0).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );

            case 'gastos': {
                const filteredExpenses = (expenses || []).filter((g) =>
                    String(g?.description || '').toLowerCase().includes(f) ||
                    String(g?.type || '').toLowerCase().includes(f) ||
                    String(g?.beneficiary || '').toLowerCase().includes(f)
                );
                const totalExp = filteredExpenses.reduce((sum, g) => sum + Number(g.amount || 0), 0);
                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Total Gastos: ${totalExp.toLocaleString()}</div>
                        <table>
                            <thead><tr><th>Fecha</th><th>Tipo</th><th>Beneficiario</th><th>Descripcion</th><th>Monto</th></tr></thead>
                            <tbody>
                                {filteredExpenses.map((g, i) => (
                                    <tr key={i}>
                                        <td>{new Date(g.date).toLocaleDateString()}</td>
                                        <td>{g.type}</td>
                                        <td>{g.beneficiary || 'N/A'}</td>
                                        <td>{g.description}</td>
                                        <td>${Number(g.amount || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                );
            }

            case 'compras': {
                const filteredPurchases = (purchases || []).filter((p) =>
                    String(p?.supplier || '').toLowerCase().includes(f) ||
                    String(p?.productName || '').toLowerCase().includes(f)
                );
                const totalUnits = filteredPurchases.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Total Unidades Compradas: {totalUnits}</div>
                        <table>
                            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Producto</th><th>Cant.</th></tr></thead>
                            <tbody>
                                {filteredPurchases.map((p, i) => (
                                    <tr key={i}><td>{new Date(p.date).toLocaleDateString()}</td><td>{p.supplier}</td><td>{p.productName}</td><td>{p.quantity}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                );
            }

            case 'cartera': {
                const filteredCartera = (cartera || []).filter((c) => String(c?.clientName || '').toLowerCase().includes(f));
                const totalCartera = filteredCartera.reduce((sum, c) => sum + Number(c.balance || 0), 0);
                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Total Deuda Pendiente: ${totalCartera.toLocaleString()}</div>
                        <table>
                            <thead><tr><th>Fecha</th><th>Cliente</th><th>Factura #</th><th>Saldo</th></tr></thead>
                            <tbody>
                                {filteredCartera.map((c, i) => (
                                    <tr key={i}><td>{new Date(c.date).toLocaleDateString()}</td><td>{c.clientName}</td><td>{c.id}</td><td>${Number(c.balance || 0).toLocaleString()}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                );
            }

            case 'saldos': {
                const saldoEntries = Object.entries(userCashBalances || {})
                    .map(([userKey, balance]) => ({
                        userKey,
                        userName: userNameByKey[userKey] || userKey,
                        balance: Number(balance || 0)
                    }))
                    .filter((row) => row.userName.toLowerCase().includes(f) || row.userKey.toLowerCase().includes(f))
                    .sort((a, b) => b.balance - a.balance);

                const saldoTotal = saldoEntries.reduce((sum, row) => sum + row.balance, 0);

                const movementActions = new Set([
                    'Transferencia a Usuario',
                    'Recaudo desde Usuario',
                    'Recibir Dinero',
                    'Devolver Dinero'
                ]);

                const cashLogs = (logs || [])
                    .filter((l) => l?.module === 'Caja Principal' && movementActions.has(l?.action))
                    .filter((l) => {
                        const details = String(l?.details || '').toLowerCase();
                        return !f || details.includes(f) || String(l?.action || '').toLowerCase().includes(f);
                    });

                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>
                            Saldo total en cajas de usuarios: ${saldoTotal.toLocaleString()}
                        </div>
                        <table style={{ marginBottom: '1.5rem' }}>
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Identificador</th>
                                    <th>Saldo Actual</th>
                                </tr>
                            </thead>
                            <tbody>
                                {saldoEntries.length === 0 ? (
                                    <tr><td colSpan="3" style={{ textAlign: 'center' }}>Sin saldos registrados</td></tr>
                                ) : (
                                    saldoEntries.map((row, i) => (
                                        <tr key={`${row.userKey}-${i}`}>
                                            <td>{row.userName}</td>
                                            <td>{row.userKey}</td>
                                            <td><strong>${row.balance.toLocaleString()}</strong></td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>

                        <h4 style={{ margin: '0 0 0.75rem 0' }}>Movimientos de Caja por Usuario</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Accion</th>
                                    <th>Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cashLogs.length === 0 ? (
                                    <tr><td colSpan="3" style={{ textAlign: 'center' }}>Sin movimientos de caja para el filtro actual</td></tr>
                                ) : (
                                    cashLogs.map((l, i) => (
                                        <tr key={i}>
                                            <td>{new Date(l.timestamp).toLocaleString()}</td>
                                            <td>{l.action}</td>
                                            <td>{l.details}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </>
                );
            }

            case 'balance': {
                const totalSalesBal = (sales || []).reduce((sum, s) => sum + Number(s.total || 0), 0);
                const totalGastosBal = (expenses || []).reduce((sum, g) => sum + Number(g.amount || 0), 0);
                const net = totalSalesBal - totalGastosBal;
                return (
                    <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                        <h3>BALANCE GENERAL SISTEMA</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
                            <div className="card" style={{ backgroundColor: '#f0fdf4' }}>
                                <h4 style={{ color: '#166534' }}>Ingresos Totales</h4>
                                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#166534' }}>${totalSalesBal.toLocaleString()}</p>
                            </div>
                            <div className="card" style={{ backgroundColor: '#fef2f2' }}>
                                <h4 style={{ color: '#991b1b' }}>Egresos Totales (Gastos)</h4>
                                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#991b1b' }}>${totalGastosBal.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="card" style={{ marginTop: '2rem', backgroundColor: net >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                            <h4>Utilidad Operativa Bruta</h4>
                            <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: net >= 0 ? '#15803d' : '#b91c1c' }}>
                                ${net.toLocaleString()}
                            </p>
                        </div>
                    </div>
                );
            }

            case 'asesores': {
                const toUserKey = (name) => String(name || '').trim().toLowerCase();
                const formatDurationHours = (ms) => {
                    if (!ms || ms <= 0) return '0.00 h';
                    return `${(ms / 3600000).toFixed(2)} h`;
                };

                const salesByUser = (sales || []).reduce((acc, s) => {
                    const key = toUserKey(s?.user_name || s?.user || 'Sin usuario');
                    if (!key) return acc;
                    if (!acc[key]) acc[key] = { count: 0, total: 0, label: s?.user_name || s?.user || 'Sin usuario' };
                    acc[key].count += 1;
                    acc[key].total += Number(s?.total || 0);
                    return acc;
                }, {});

                const notesByUser = (logs || []).reduce((acc, l) => {
                    if (String(l?.module || '') !== 'Notas') return acc;
                    const details = String(l?.details || '');
                    const fromLog = details.match(/Usuario:\s*([^|]+)/i)?.[1]?.trim();
                    const key = toUserKey(fromLog || l?.user_name || 'Sin usuario');
                    if (!key) return acc;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});

                const shiftsByUser = (shiftHistory || []).reduce((acc, sh) => {
                    const key = toUserKey(sh?.user || sh?.user_name || 'Sin usuario');
                    if (!key) return acc;

                    const start = sh?.startTime ? new Date(sh.startTime).getTime() : null;
                    const end = sh?.endTime ? new Date(sh.endTime).getTime() : null;
                    const durationMs = start && end && end > start ? end - start : 0;

                    if (!acc[key]) {
                        acc[key] = {
                            count: 0,
                            totalDurationMs: 0,
                            rows: [],
                            label: sh?.user || sh?.user_name || 'Sin usuario'
                        };
                    }

                    acc[key].count += 1;
                    acc[key].totalDurationMs += durationMs;
                    acc[key].rows.push({
                        start: sh?.startTime || null,
                        end: sh?.endTime || null,
                        durationMs
                    });
                    return acc;
                }, {});

                const allKeys = Array.from(
                    new Set([
                        ...Object.keys(salesByUser),
                        ...Object.keys(notesByUser),
                        ...Object.keys(shiftsByUser)
                    ])
                );

                const rows = allKeys
                    .map((key) => {
                        const salesData = salesByUser[key] || { count: 0, total: 0, label: key };
                        const shiftData = shiftsByUser[key] || { count: 0, totalDurationMs: 0, rows: [], label: salesData.label };
                        const notesCount = notesByUser[key] || 0;
                        return {
                            key,
                            user: shiftData.label || salesData.label || key,
                            salesCount: salesData.count,
                            salesTotal: salesData.total,
                            notesCount,
                            shiftsCount: shiftData.count,
                            totalDurationMs: shiftData.totalDurationMs,
                            shifts: shiftData.rows
                        };
                    })
                    .filter((row) => row.user.toLowerCase().includes(f))
                    .sort((a, b) => b.salesTotal - a.salesTotal);

                return (
                    <>
                        <table style={{ marginBottom: '1.5rem' }}>
                            <thead>
                                <tr>
                                    <th>Asesor/Usuario</th>
                                    <th># Ventas</th>
                                    <th>Total Ventas</th>
                                    <th># Notas</th>
                                    <th># Jornadas</th>
                                    <th>Horas Totales</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr><td colSpan="6" style={{ textAlign: 'center' }}>Sin datos para el filtro actual</td></tr>
                                ) : (
                                    rows.map((row, idx) => (
                                        <tr key={`${row.key}-${idx}`}>
                                            <td>{row.user}</td>
                                            <td>{row.salesCount}</td>
                                            <td><strong>${row.salesTotal.toLocaleString()}</strong></td>
                                            <td>{row.notesCount}</td>
                                            <td>{row.shiftsCount}</td>
                                            <td>{formatDurationHours(row.totalDurationMs)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>

                        <h4 style={{ margin: '0 0 0.75rem 0' }}>Detalle de Jornadas (Inicio / Fin / Horas)</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>Asesor/Usuario</th>
                                    <th>Inicio</th>
                                    <th>Fin</th>
                                    <th>Duracion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.flatMap((row) =>
                                    (row.shifts || []).map((s, i) => (
                                        <tr key={`${row.key}-shift-${i}`}>
                                            <td>{row.user}</td>
                                            <td>{s.start ? new Date(s.start).toLocaleString() : 'N/A'}</td>
                                            <td>{s.end ? new Date(s.end).toLocaleString() : 'N/A'}</td>
                                            <td>{formatDurationHours(s.durationMs)}</td>
                                        </tr>
                                    ))
                                ).length === 0 ? (
                                    <tr><td colSpan="4" style={{ textAlign: 'center' }}>Sin jornadas registradas</td></tr>
                                ) : (
                                    rows.flatMap((row) =>
                                        (row.shifts || []).map((s, i) => (
                                            <tr key={`${row.key}-shift-${i}`}>
                                                <td>{row.user}</td>
                                                <td>{s.start ? new Date(s.start).toLocaleString() : 'N/A'}</td>
                                                <td>{s.end ? new Date(s.end).toLocaleString() : 'N/A'}</td>
                                                <td>{formatDurationHours(s.durationMs)}</td>
                                            </tr>
                                        ))
                                    )
                                )}
                            </tbody>
                        </table>
                    </>
                );
            }

            default:
                return null;
        }
    };

    return (
        <div className="reports-module">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }} className="no-print">
                <h2>Modulo de Reportes</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {isCajero && <span className="alert alert-info" style={{ padding: '0.3rem 0.6rem', fontSize: '0.85em' }}>Solo Impresion</span>}
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            onLog?.({
                                module: 'Reportes',
                                action: 'Imprimir Reporte',
                                details: `Tipo: ${reportType}`
                            });
                            window.print();
                        }}
                    >
                        Imprimir Reporte
                    </button>
                </div>
            </div>
            <div className="card">
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }} className="no-print">
                    <select className="input-field" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                        <option value="ventas">Ventas / Facturacion</option>
                        <option value="gastos">Reporte de Gastos</option>
                        <option value="compras">Historial de Compras</option>
                        <option value="cartera">Reporte de Cartera (Deudas)</option>
                        <option value="inventario">Inventario Detallado</option>
                        <option value="clientes">Listado de Clientes</option>
                        <option value="bitacora">Bitacora / Auditoria</option>
                        <option value="asesores">Asesores</option>
                        <option value="saldos">Saldos de Caja por Usuario</option>
                        <option value="balance">BALANCE GENERAL</option>
                    </select>
                    <input
                        type="text"
                        className="input-field"
                        placeholder="Filtrar..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
                <div className="report-canvas printable-area" style={{ maxHeight: '600px', overflow: 'auto' }}>
                    <CompanyHeader />
                    {renderTable()}
                </div>
            </div>
        </div>
    );
}
