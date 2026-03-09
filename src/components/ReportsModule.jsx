import React, { useEffect, useMemo, useRef, useState } from 'react';
import { COMPANY_INFO } from '../constants';
import { printReportHtml } from '../lib/printReports';
import { PaginationControls } from './PaginationControls';

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
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [reportPage, setReportPage] = useState(1);
    const reportCanvasRef = useRef(null);

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

    useEffect(() => {
        setReportPage(1);
    }, [reportType, filter, dateFrom, dateTo, userFilter, statusFilter, paymentFilter, categoryFilter, supplierFilter]);

    const userNameByKey = useMemo(() => {
        const map = {};
        (users || []).forEach((u) => {
            const key = String(u?.id || u?.username || u?.email || u?.name || '');
            if (!key) return;
            map[key] = u?.name || u?.username || u?.email || key;
        });
        return map;
    }, [users]);

    const resolveUserLabel = (row) => (
        row?.user_name ||
        row?.user ||
        row?.username ||
        row?.mixedDetails?.user_name ||
        row?.mixedDetails?.user ||
        row?.mixed_details?.user_name ||
        row?.mixed_details?.user ||
        userNameByKey[String(row?.user_id || '')] ||
        'Sin usuario'
    );

    const normalizeDateKey = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toISOString().slice(0, 10);
    };

    const isDateWithinRange = (value) => {
        if (!dateFrom && !dateTo) return true;
        const key = normalizeDateKey(value);
        if (!key) return false;
        if (dateFrom && key < dateFrom) return false;
        if (dateTo && key > dateTo) return false;
        return true;
    };

    const matchesUserFilter = (row) => (
        !userFilter || resolveUserLabel(row).toLowerCase().includes(userFilter.toLowerCase())
    );

    const paginateRows = (rows) => {
        const totalItems = Array.isArray(rows) ? rows.length : 0;
        const pageSize = 15;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const safePage = Math.min(reportPage, totalPages);
        const start = (safePage - 1) * pageSize;
        return {
            page: safePage,
            totalItems,
            totalPages,
            pageSize,
            pageItems: (rows || []).slice(start, start + pageSize),
        };
    };

    const shouldShowDateFilters = ['ventas', 'gastos', 'compras', 'bitacora', 'cartera'].includes(reportType);
    const shouldShowUserFilter = ['ventas', 'gastos', 'compras', 'bitacora'].includes(reportType);
    const salesPaymentOptions = useMemo(() => (
        Array.from(new Set((sales || []).map((row) => String(row?.paymentMode || '').trim()).filter(Boolean))).sort()
    ), [sales]);
    const expenseTypeOptions = useMemo(() => (
        Array.from(new Set((expenses || []).map((row) => String(row?.type || row?.category || '').trim()).filter(Boolean))).sort()
    ), [expenses]);
    const purchaseSupplierOptions = useMemo(() => (
        Array.from(new Set((purchases || []).map((row) => String(row?.supplier || '').trim()).filter(Boolean))).sort()
    ), [purchases]);

    const isFinanciallyClosedInvoice = (invoice) => {
        const status = String(invoice?.status || '').trim().toLowerCase();
        return status === 'anulada' || status === 'devuelta';
    };

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
            case 'bitacora': {
                const filteredLogs = (logs || [])
                    .filter((l) => String(l?.details || '').toLowerCase().includes(f))
                    .filter((l) => isDateWithinRange(l?.timestamp))
                    .filter((l) => matchesUserFilter(l));
                const pagination = paginateRows(filteredLogs);
                return (
                    <>
                        <table>
                            <thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Detalle</th></tr></thead>
                            <tbody>
                                {pagination.pageItems.map((l, i) => (
                                    <tr key={i}><td>{new Date(l.timestamp).toLocaleString()}</td><td>{l.user_name || l.user || 'Sistema'}</td><td>{l.action}</td><td>{l.details}</td></tr>
                                ))}
                            </tbody>
                        </table>
                        <PaginationControls page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={setReportPage} />
                    </>
                );
            }

            case 'ventas': {
                const filteredSales = (sales || [])
                    .filter((s) => !isFinanciallyClosedInvoice(s))
                    .filter((s) =>
                        String(s?.clientName || '').toLowerCase().includes(f) ||
                        String(s?.id || '').toLowerCase().includes(f)
                    )
                    .filter((s) => isDateWithinRange(s?.date))
                    .filter((s) => matchesUserFilter(s))
                    .filter((s) => !statusFilter || String(s?.status || 'pagado').toLowerCase() === statusFilter)
                    .filter((s) => !paymentFilter || String(s?.paymentMode || '').trim() === paymentFilter);
                const pagination = paginateRows(filteredSales);
                const totalSales = filteredSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Total Ventas: ${totalSales.toLocaleString()}</div>
                        <table>
                            <thead><tr><th>Factura</th><th>Usuario</th><th>Cliente</th><th>Total</th><th>Pago</th></tr></thead>
                            <tbody>
                                {pagination.pageItems.map((s, i) => (
                                    <tr key={i}><td>{s.id}</td><td>{resolveUserLabel(s)}</td><td>{s.clientName}</td><td>${Number(s.total || 0).toLocaleString()}</td><td>{s.paymentMode}</td></tr>
                                ))}
                            </tbody>
                        </table>
                        <PaginationControls page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={setReportPage} />
                    </>
                );
            }

            case 'inventario': {
                const filteredProducts = (products || []).filter((p) => String(p?.name || '').toLowerCase().includes(f));
                const pagination = paginateRows(filteredProducts);
                return (
                    <>
                        <table>
                            <thead><tr><th>Producto</th><th>Bodega</th><th>Punto Venta</th><th>Total Stock</th></tr></thead>
                            <tbody>
                                {pagination.pageItems.map((p, idx) => {
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
                        <PaginationControls page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={setReportPage} />
                    </>
                );
            }

            case 'clientes': {
                const filteredClients = (clients || []).filter((c) =>
                    String(c?.name || '').toLowerCase().includes(f) ||
                    String(c?.document || '').toLowerCase().includes(f)
                );
                const pagination = paginateRows(filteredClients);
                return (
                    <>
                        <table>
                            <thead><tr><th>Nombre</th><th>Documento</th><th>Tipo</th><th>Credito</th></tr></thead>
                            <tbody>
                                {pagination.pageItems.map((c, i) => (
                                    <tr key={i}>
                                        <td>{c.name}</td>
                                        <td>{c.document}</td>
                                        <td>{c.type}</td>
                                        <td>${Number(c.creditLimit || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <PaginationControls page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={setReportPage} />
                    </>
                );
            }

            case 'gastos': {
                const filteredExpenses = (expenses || []).filter((g) =>
                    (
                        String(g?.description || '').toLowerCase().includes(f) ||
                        String(g?.type || '').toLowerCase().includes(f) ||
                        String(g?.beneficiary || '').toLowerCase().includes(f)
                    ) &&
                    isDateWithinRange(g?.date) &&
                    matchesUserFilter(g) &&
                    (!categoryFilter || String(g?.type || g?.category || '').trim() === categoryFilter)
                );
                const pagination = paginateRows(filteredExpenses);
                const totalExp = filteredExpenses.reduce((sum, g) => sum + Number(g.amount || 0), 0);
                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Total Gastos: ${totalExp.toLocaleString()}</div>
                        <table>
                            <thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Beneficiario</th><th>Descripcion</th><th>Monto</th></tr></thead>
                            <tbody>
                                {pagination.pageItems.map((g, i) => (
                                    <tr key={i}>
                                        <td>{new Date(g.date).toLocaleDateString()}</td>
                                        <td>{resolveUserLabel(g)}</td>
                                        <td>{g.type}</td>
                                        <td>{g.beneficiary || 'N/A'}</td>
                                        <td>{g.description}</td>
                                        <td>${Number(g.amount || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <PaginationControls page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={setReportPage} />
                    </>
                );
            }

            case 'compras': {
                const filteredPurchases = (purchases || []).filter((p) =>
                    (
                        String(p?.supplier || '').toLowerCase().includes(f) ||
                        String(p?.productName || '').toLowerCase().includes(f)
                    ) &&
                    isDateWithinRange(p?.date) &&
                    matchesUserFilter(p) &&
                    (!supplierFilter || String(p?.supplier || '').trim() === supplierFilter)
                );
                const pagination = paginateRows(filteredPurchases);
                const totalUnits = filteredPurchases.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Total Unidades Compradas: {totalUnits}</div>
                        <table>
                            <thead><tr><th>Fecha</th><th>Usuario</th><th>Proveedor</th><th>Producto</th><th>Cant.</th></tr></thead>
                            <tbody>
                                {pagination.pageItems.map((p, i) => (
                                    <tr key={i}><td>{new Date(p.date).toLocaleDateString()}</td><td>{resolveUserLabel(p)}</td><td>{p.supplier}</td><td>{p.productName}</td><td>{p.quantity}</td></tr>
                                ))}
                            </tbody>
                        </table>
                        <PaginationControls page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={setReportPage} />
                    </>
                );
            }

            case 'cartera': {
                const filteredCartera = (cartera || []).filter((c) =>
                    String(c?.clientName || '').toLowerCase().includes(f) &&
                    isDateWithinRange(c?.date) &&
                    (!statusFilter || String(c?.status || '').toLowerCase() === statusFilter)
                );
                const totalCartera = filteredCartera.reduce((sum, c) => sum + Number(c.balance || 0), 0);
                const pagination = paginateRows(filteredCartera);
                const carteraHistory = (sales || [])
                    .filter((s) => {
                        const hasCredit = String(s?.paymentMode || '').toLowerCase().includes('credito') || Number(s?.balance || 0) > 0;
                        const hasAbonos = Array.isArray(s?.abonos) && s.abonos.length > 0;
                        return hasCredit || hasAbonos || String(s?.status || '').toLowerCase() === 'pagado';
                    })
                    .filter((s) => String(s?.clientName || '').toLowerCase().includes(f))
                    .sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));
                return (
                    <>
                        <div style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Total Deuda Pendiente: ${totalCartera.toLocaleString()}</div>
                        <table>
                            <thead><tr><th>Fecha</th><th>Usuario</th><th>Cliente</th><th>Factura #</th><th>Saldo</th></tr></thead>
                            <tbody>
                                {pagination.pageItems.map((c, i) => (
                                    <tr key={i}><td>{new Date(c.date).toLocaleDateString()}</td><td>{resolveUserLabel(c)}</td><td>{c.clientName}</td><td>{c.id}</td><td>${Number(c.balance || 0).toLocaleString()}</td></tr>
                                ))}
                            </tbody>
                        </table>
                        <PaginationControls page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize} onPageChange={setReportPage} />
                        <h4 style={{ margin: '1.2rem 0 0.6rem' }}>Historial de Cartera (incluye facturas pagadas y abonos)</h4>
                        <table>
                            <thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Estado</th><th>Saldo</th><th>Abonos</th></tr></thead>
                            <tbody>
                                {carteraHistory.length === 0 ? (
                                    <tr><td colSpan="6" style={{ textAlign: 'center' }}>Sin historial para el filtro actual</td></tr>
                                ) : (
                                    carteraHistory.map((inv, i) => {
                                        const abonos = Array.isArray(inv?.abonos) ? inv.abonos : [];
                                        const abonosText = abonos.length === 0
                                            ? 'Sin abonos'
                                            : abonos.slice(0, 3).map((a) => `${new Date(a.date).toLocaleDateString()}: $${Number(a.amount || 0).toLocaleString()} (${a.method || 'N/A'})`).join(' | ');
                                        return (
                                            <tr key={`${inv?.id || 'inv'}-${i}`}>
                                                <td>{new Date(inv?.date || Date.now()).toLocaleDateString()}</td>
                                                <td>{inv?.id || 'N/A'}</td>
                                                <td>{inv?.clientName || 'Cliente'}</td>
                                                <td>{String(inv?.status || 'N/A')}</td>
                                                <td>${Number(inv?.balance || 0).toLocaleString()}</td>
                                                <td>{abonosText}</td>
                                            </tr>
                                        );
                                    })
                                )}
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
                const totalSalesBal = (sales || [])
                    .filter((s) => !isFinanciallyClosedInvoice(s))
                    .reduce((sum, s) => sum + Number(s.total || 0), 0);
                const totalGastosBal = (expenses || []).reduce((sum, g) => sum + Number(g.amount || 0), 0);
                const totalInversionBal = (purchases || []).reduce((sum, p) => (
                    sum + ((Number(p.quantity) || 0) * (Number(p.unitCost) || 0))
                ), 0);
                const totalEgresosBal = totalGastosBal + totalInversionBal;
                const net = totalSalesBal - totalEgresosBal;
                return (
                    <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
                        <h3>BALANCE GENERAL SISTEMA</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginTop: '2rem' }}>
                            <div className="card" style={{ backgroundColor: '#f0fdf4' }}>
                                <h4 style={{ color: '#166534' }}>Ingresos Totales</h4>
                                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#166534' }}>${totalSalesBal.toLocaleString()}</p>
                            </div>
                            <div className="card" style={{ backgroundColor: '#fef2f2' }}>
                                <h4 style={{ color: '#991b1b' }}>Gastos Totales</h4>
                                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#991b1b' }}>${totalGastosBal.toLocaleString()}</p>
                            </div>
                            <div className="card" style={{ backgroundColor: '#fff7ed' }}>
                                <h4 style={{ color: '#9a3412' }}>Inversion Total</h4>
                                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#9a3412' }}>${totalInversionBal.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="card" style={{ marginTop: '2rem', backgroundColor: net >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                            <h4>Utilidad Operativa Bruta</h4>
                            <p style={{ margin: '0 0 0.6rem', color: '#64748b' }}>
                                Ingresos - Gastos - Inversion = ${totalSalesBal.toLocaleString()} - ${totalGastosBal.toLocaleString()} - ${totalInversionBal.toLocaleString()}
                            </p>
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
                    if (isFinanciallyClosedInvoice(s)) return acc;
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

    const handlePrintReport = (mode = 'a4') => {
        const contentHtml = reportCanvasRef.current?.innerHTML || '<p>Sin informacion para imprimir.</p>';
        onLog?.({
            module: 'Reportes',
            action: 'Imprimir Reporte',
            details: `Tipo: ${reportType} | Formato: ${mode.toUpperCase()}`
        });
        printReportHtml({
            title: `Reporte de ${reportType}`,
            subtitle: `Generado el ${new Date().toLocaleString()}`,
            contentHtml,
            mode
        });
    };

    return (
        <div className="reports-module">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }} className="no-print">
                <h2>Modulo de Reportes</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {isCajero && <span className="alert alert-info" style={{ padding: '0.3rem 0.6rem', fontSize: '0.85em' }}>Solo Impresion</span>}
                    <button
                        className="btn btn-primary"
                        onClick={() => handlePrintReport('58mm')}
                    >
                        Imprimir 58mm
                    </button>
                    <button className="btn" onClick={() => handlePrintReport('a4')}>Imprimir A4</button>
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
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }} className="no-print">
                    {shouldShowDateFilters && (
                        <>
                            <input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                            <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                        </>
                    )}
                    {shouldShowUserFilter && (
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Asesor / usuario"
                            value={userFilter}
                            onChange={(e) => setUserFilter(e.target.value)}
                        />
                    )}
                    {reportType === 'ventas' && (
                        <>
                            <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                <option value="">Todos los estados</option>
                                <option value="pagado">Pagado</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="anulada">Anulada</option>
                                <option value="devuelta">Devuelta</option>
                                <option value="interna_cero">Interna $0</option>
                            </select>
                            <select className="input-field" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                                <option value="">Todos los pagos</option>
                                {salesPaymentOptions.map((payment) => (
                                    <option key={payment} value={payment}>{payment}</option>
                                ))}
                            </select>
                        </>
                    )}
                    {reportType === 'gastos' && (
                        <select className="input-field" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            <option value="">Todos los tipos</option>
                            {expenseTypeOptions.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    )}
                    {reportType === 'compras' && (
                        <select className="input-field" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
                            <option value="">Todos los proveedores</option>
                            {purchaseSupplierOptions.map((supplier) => (
                                <option key={supplier} value={supplier}>{supplier}</option>
                            ))}
                        </select>
                    )}
                    {reportType === 'cartera' && (
                        <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">Todos los estados</option>
                            <option value="pendiente">Pendiente</option>
                            <option value="pagado">Pagado</option>
                        </select>
                    )}
                </div>
                <div ref={reportCanvasRef} className="report-canvas printable-area" style={{ maxHeight: '600px', overflow: 'auto' }}>
                    <CompanyHeader />
                    {renderTable()}
                </div>
            </div>
        </div>
    );
}
