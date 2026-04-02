import React, { useEffect, useMemo, useState } from 'react';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';
import { printExpenseReceipt } from '../lib/printReports';

const EXPENSE_STATUS_OPTIONS = ['Pagado', 'Pendiente', 'Cancelado', 'Abono'];

const INITIAL_FORM = {
    type: 'Oficina',
    amount: '',
    description: '',
    beneficiary: '',
    docId: '',
    status: 'Pagado',
    paidAmount: '',
    paymentMethod: 'Efectivo',
    paymentReference: '',
};

function normalizeExpenseStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'pagado') return 'Pagado';
    if (normalized === 'pendiente') return 'Pendiente';
    if (normalized === 'cancelado') return 'Cancelado';
    if (normalized === 'abono') return 'Abono';
    return 'Pagado';
}

function getAppliedAmount(status, amount, paidAmountInput) {
    const total = Math.max(0, Number(amount || 0));
    const paid = Math.max(0, Number(paidAmountInput || 0));
    if (status === 'Pagado') return total;
    if (status === 'Abono') return Math.min(total, paid);
    return 0;
}

function toExpenseViewModel(expense) {
    const amount = Math.max(0, Number(expense?.amount || 0));
    const status = normalizeExpenseStatus(expense?.status);
    const paidAmount = Math.min(amount, Math.max(0, Number(expense?.paidAmount ?? expense?.paid_amount ?? (status === 'Pagado' ? amount : 0))));
    return {
        ...expense,
        type: expense?.type || expense?.category || 'Otros',
        beneficiary: expense?.beneficiary || '',
        docId: expense?.docId || expense?.doc_id || '',
        status,
        paidAmount,
        paymentMethod: expense?.paymentMethod || expense?.payment_method || '',
        paymentReference: expense?.paymentReference || expense?.payment_reference || '',
        balance: Math.max(0, amount - paidAmount),
    };
}

export function GastosModule({
    expenses,
    setExpenses,
    onLog,
    setActiveTab,
    currentUser,
    userCashBalance = 0,
    onRegisterExpense,
    onUpdateExpense,
}) {
    const [form, setForm] = useState(INITIAL_FORM);
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const normalizedExpenses = useMemo(() => (Array.isArray(expenses) ? expenses.map(toExpenseViewModel) : []), [expenses]);
    const [rowDrafts, setRowDrafts] = useState({});

    useEffect(() => {
        const nextDrafts = {};
        normalizedExpenses.forEach((expense) => {
            nextDrafts[expense.id] = {
                status: expense.status,
                paidAmount: expense.paidAmount,
            };
        });
        setRowDrafts(nextDrafts);
    }, [normalizedExpenses]);

    const handleFormChange = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const handleAddExpense = async (e) => {
        e.preventDefault();
        if (!form.amount || !form.description) return alert('Complete los campos de monto y descripcion.');

        const amount = Math.max(0, Number(form.amount || 0));
        const status = normalizeExpenseStatus(form.status);
        const paidAmount = getAppliedAmount(status, amount, form.paidAmount);

        if (!Number.isFinite(amount) || amount <= 0) return alert('Ingrese un monto valido.');
        if (paidAmount > Number(userCashBalance || 0)) {
            return alert(`Saldo insuficiente en caja. Disponible: $${Number(userCashBalance || 0).toLocaleString()}`);
        }
        if (status === 'Abono' && paidAmount <= 0) {
            return alert('Para estado Abono debe indicar un valor abonado mayor a cero.');
        }

        const newExpense = toExpenseViewModel({
            id: Date.now(),
            ...form,
            amount,
            paidAmount,
            status,
            date: new Date().toISOString(),
            user_id: currentUser?.id || null,
            user_name: currentUser?.name || currentUser?.email || 'Sistema',
        });

        await onRegisterExpense?.(newExpense);
        setExpenses([newExpense, ...normalizedExpenses]);
        onLog?.({
            module: 'Gastos',
            action: 'Nuevo Gasto',
            details: `${newExpense.type}: $${amount} - ${newExpense.description} | Estado: ${newExpense.status} | Saldo: $${newExpense.balance.toLocaleString()}`,
        });

        if (window.confirm('Desea imprimir el comprobante ahora?')) {
            setSelectedReceipt(newExpense);
            setTimeout(() => printExpenseReceipt(newExpense, 'a4'), 80);
        }

        setForm(INITIAL_FORM);
        alert('Gasto registrado con exito.');
    };

    const handlePrintSelected = (expense) => {
        setSelectedReceipt(expense);
        setTimeout(() => printExpenseReceipt(expense, 'a4'), 80);
    };

    const handleRowDraftChange = (expenseId, key, value) => {
        setRowDrafts((prev) => ({
            ...prev,
            [expenseId]: {
                ...(prev[expenseId] || {}),
                [key]: value,
            },
        }));
    };

    const handleSaveExpenseStatus = async (expense) => {
        const draft = rowDrafts[expense.id] || {};
        const status = normalizeExpenseStatus(draft.status || expense.status);
        const paidAmount = getAppliedAmount(status, expense.amount, draft.paidAmount);
        const updatedExpense = toExpenseViewModel({
            ...expense,
            status,
            paidAmount,
        });

        await onUpdateExpense?.(expense, updatedExpense);
        setExpenses(normalizedExpenses.map((row) => (row.id === expense.id ? updatedExpense : row)));
        onLog?.({
            module: 'Gastos',
            action: 'Actualizar Estado',
            details: `Gasto ${expense.id}: ${expense.status} -> ${updatedExpense.status} | Abonado: $${updatedExpense.paidAmount.toLocaleString()} | Saldo: $${updatedExpense.balance.toLocaleString()}`,
        });
        alert('Estado del gasto actualizado.');
    };

    const visibleExpenses = normalizedExpenses.filter((expense) => (
        !statusFilter || normalizeExpenseStatus(expense.status) === statusFilter
    ));

    const totalExpenses = visibleExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalPending = visibleExpenses.reduce((sum, item) => sum + Number(item.balance || 0), 0);
    const { sortedRows: sortedExpenses, sortConfig, setSortKey } = useTableSort(
        visibleExpenses,
        {
            date: { getValue: (e) => e?.date, type: 'date' },
            beneficiary: { getValue: (e) => e?.beneficiary || '', type: 'string' },
            amount: { getValue: (e) => Number(e?.amount || 0), type: 'number' },
            balance: { getValue: (e) => Number(e?.balance || 0), type: 'number' },
            status: { getValue: (e) => e?.status || '', type: 'string' },
        },
        'date',
        'desc'
    );
    const expensesPagination = usePagination(sortedExpenses, 15);

    return (
        <div className="gastos-module">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <h2>Modulo de Gastos e Inversion</h2>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
                        Caja disponible: ${Number(userCashBalance || 0).toLocaleString()}
                    </span>
                    <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                        Por pagar: ${Number(totalPending || 0).toLocaleString()}
                    </span>
                    <button className="btn" onClick={() => setActiveTab('home')}>{'\uD83C\uDFE0'} Regresar</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="card">
                    <h3>Registrar gasto</h3>
                    <form onSubmit={handleAddExpense}>
                        <div className="input-group">
                            <label className="input-label">Tipo de gasto</label>
                            <select className="input-field" value={form.type} onChange={(e) => handleFormChange('type', e.target.value)}>
                                <option value="Oficina">Oficina / Insumos</option>
                                <option value="Inversion">Inversion / Activos</option>
                                <option value="Servicios">Servicios publicos</option>
                                <option value="Personal">Pago personal / Nomina</option>
                                <option value="Otros">Otros</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Beneficiario</label>
                            <input type="text" className="input-field" value={form.beneficiary} onChange={(e) => handleFormChange('beneficiary', e.target.value)} placeholder="A quien se le paga" />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Identificacion / NIT</label>
                            <input type="text" className="input-field" value={form.docId} onChange={(e) => handleFormChange('docId', e.target.value)} placeholder="C.C. o NIT del beneficiario" />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Monto total ($)</label>
                            <input type="number" className="input-field" value={form.amount} onChange={(e) => handleFormChange('amount', e.target.value)} placeholder="0" />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Estado</label>
                            <select className="input-field" value={form.status} onChange={(e) => handleFormChange('status', e.target.value)}>
                                {EXPENSE_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                        {normalizeExpenseStatus(form.status) === 'Abono' && (
                            <div className="input-group">
                                <label className="input-label">Valor abonado ($)</label>
                                <input type="number" className="input-field" value={form.paidAmount} onChange={(e) => handleFormChange('paidAmount', e.target.value)} placeholder="0" />
                            </div>
                        )}
                        {(normalizeExpenseStatus(form.status) === 'Pagado' || normalizeExpenseStatus(form.status) === 'Abono') && (
                            <>
                                <div className="input-group">
                                    <label className="input-label">Forma de pago</label>
                                    <select className="input-field" value={form.paymentMethod} onChange={(e) => handleFormChange('paymentMethod', e.target.value)}>
                                        <option value="Efectivo">Efectivo</option>
                                        <option value="Transferencia">Transferencia</option>
                                        <option value="Tarjeta">Tarjeta</option>
                                        <option value="Otro">Otro</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Referencia pago</label>
                                    <input type="text" className="input-field" value={form.paymentReference} onChange={(e) => handleFormChange('paymentReference', e.target.value)} placeholder="Comprobante o referencia" />
                                </div>
                            </>
                        )}
                        <div className="input-group">
                            <label className="input-label">Descripcion</label>
                            <textarea className="input-field" style={{ height: '60px' }} value={form.description} onChange={(e) => handleFormChange('description', e.target.value)} placeholder="Detalle del gasto" />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar gasto</button>
                    </form>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                        <h3>Historial reciente</h3>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: '170px' }}>
                                <option value="">Todos los estados</option>
                                {EXPENSE_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                                Total: <span style={{ color: '#e11d48' }}>${totalExpenses.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'rgba(12, 12, 24, 0.95)', zIndex: 1 }}>
                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                                        <SortButton label="Fecha" sortKey="date" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                                        <SortButton label="Beneficiario" sortKey="beneficiary" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                                        <SortButton label="Estado" sortKey="status" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>
                                        <SortButton label="Monto" sortKey="amount" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>
                                        <SortButton label="Saldo" sortKey="balance" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>Accion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expensesPagination.totalItems === 0 ? (
                                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No hay gastos registrados</td></tr>
                                ) : (
                                    expensesPagination.pageItems.map((expense) => {
                                        const draft = rowDrafts[expense.id] || {};
                                        const draftStatus = normalizeExpenseStatus(draft.status || expense.status);
                                        return (
                                            <tr key={expense.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                                                    {new Date(expense.date).toLocaleDateString()}
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{expense.type}</div>
                                                </td>
                                                <td style={{ padding: '0.75rem' }}>
                                                    <strong>{expense.beneficiary || 'Sin beneficiario'}</strong>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{String(expense.description || '').slice(0, 44) || 'Sin descripcion'}</div>
                                                </td>
                                                <td style={{ padding: '0.75rem', minWidth: '180px' }}>
                                                    <select className="input-field" value={draftStatus} onChange={(e) => handleRowDraftChange(expense.id, 'status', e.target.value)} style={{ marginBottom: '0.45rem' }}>
                                                        {EXPENSE_STATUS_OPTIONS.map((status) => (
                                                            <option key={status} value={status}>{status}</option>
                                                        ))}
                                                    </select>
                                                    {draftStatus === 'Abono' && (
                                                        <input
                                                            type="number"
                                                            className="input-field"
                                                            value={draft.paidAmount ?? expense.paidAmount ?? ''}
                                                            onChange={(e) => handleRowDraftChange(expense.id, 'paidAmount', e.target.value)}
                                                            placeholder="Abono"
                                                        />
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>${Number(expense.amount || 0).toLocaleString()}</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right', color: Number(expense.balance || 0) > 0 ? '#b45309' : '#166534', fontWeight: '700' }}>
                                                    ${Number(expense.balance || 0).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                        <button className="btn" onClick={() => handlePrintSelected(expense)} title="Imprimir comprobante">{'\uD83D\uDDA8\uFE0F'}</button>
                                                        <button className="btn btn-primary" onClick={() => handleSaveExpenseStatus(expense)} title="Guardar estado">Guardar</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls
                        page={expensesPagination.page}
                        totalPages={expensesPagination.totalPages}
                        totalItems={expensesPagination.totalItems}
                        pageSize={expensesPagination.pageSize}
                        onPageChange={expensesPagination.setPage}
                    />
                </div>
            </div>

            {selectedReceipt && (
                <div className="card" style={{ marginTop: '1.5rem', borderStyle: 'dashed' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Ultimo comprobante</h3>
                            <p style={{ margin: '0.35rem 0 0 0', color: '#64748b' }}>
                                Beneficiario: {selectedReceipt.beneficiary || 'Sin beneficiario'} | Estado: {selectedReceipt.status}
                            </p>
                        </div>
                        <button className="btn btn-primary" onClick={() => printExpenseReceipt(selectedReceipt, 'a4')}>{'\uD83D\uDDA8\uFE0F'} Imprimir A4</button>
                    </div>
                </div>
            )}
        </div>
    );
}
