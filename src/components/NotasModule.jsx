import React, { useState } from 'react';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';

export function NotasModule({ clients, sales, onLog, onCreateNote }) {
    const [notes, setNotes] = useState([]);
    const [form, setForm] = useState({ clientId: '', invoiceId: '', type: 'Credito', amount: '', reason: '' });
    const { sortedRows: sortedNotes, sortConfig, setSortKey } = useTableSort(
        notes,
        {
            id: { getValue: (n) => n?.id || '', type: 'string' },
            client: { getValue: (n) => n?.clientName || '', type: 'string' },
            type: { getValue: (n) => n?.type || '', type: 'string' },
            amount: { getValue: (n) => Number(n?.amount || 0), type: 'number' },
        },
        'id',
        'desc'
    );
    const notesPagination = usePagination(sortedNotes, 15);

    const handleAddNote = (e) => {
        e.preventDefault();
        if (!form.clientId || !form.amount || !form.reason) return alert("Complete todos los campos obligatorios.");

        const client = clients.find(c => String(c.id) === String(form.clientId));
        const newNote = {
            id: `N-${Date.now()}`,
            ...form,
            clientName: client?.name || 'Otro',
            clientDocument: client?.document || '',
            amount: Number(form.amount),
            date: new Date().toISOString()
        };

        setNotes([newNote, ...notes]);
        onLog?.({
            module: 'Notas',
            action: `Nota de ${form.type}`,
            details: `Cliente: ${client?.name}. Monto: $${form.amount}. Motivo: ${form.reason}`
        });

        Promise.resolve(onCreateNote?.(newNote)).catch((error) => {
            console.error('No se pudo sincronizar la nota con CRM:', error);
        });

        alert(`Nota de ${form.type} generada correctamente.`);
        setForm({ clientId: '', invoiceId: '', type: 'Credito', amount: '', reason: '' });
    };

    return (
        <div className="notas-module">
            <h2>Notas de Credito y Debito</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="card">
                    <h3>Emitir Nueva Nota</h3>
                    <form onSubmit={handleAddNote}>
                        <div className="input-group">
                            <label className="input-label">Cliente</label>
                            <select
                                className="input-field"
                                value={form.clientId}
                                onChange={e => setForm({ ...form, clientId: e.target.value })}
                            >
                                <option value="">Seleccione cliente...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Tipo</label>
                            <select
                                className="input-field"
                                value={form.type}
                                onChange={e => setForm({ ...form, type: e.target.value })}
                            >
                                <option value="Credito">Nota de Credito (Saldo a favor)</option>
                                <option value="Debito">Nota de Debito (Cargo extra)</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Monto ($)</label>
                            <input
                                type="number"
                                className="input-field"
                                value={form.amount}
                                onChange={e => setForm({ ...form, amount: e.target.value })}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Motivo / Descripción</label>
                            <textarea
                                className="input-field"
                                value={form.reason}
                                onChange={e => setForm({ ...form, reason: e.target.value })}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Generar Nota</button>
                    </form>
                </div>

                <div className="card">
                    <h3>Registro de Notas</h3>
                    <div className="table-container">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                                        <SortButton label="ID" sortKey="id" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                                        <SortButton label="Cliente" sortKey="client" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                                        <SortButton label="Tipo" sortKey="type" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>
                                        <SortButton label="Monto" sortKey="amount" sortConfig={sortConfig} onChange={setSortKey} />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {notesPagination.totalItems === 0 ? (
                                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>No hay notas registradas</td></tr>
                                ) : (
                                    notesPagination.pageItems.map(n => (
                                        <tr key={n.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.75rem', fontSize: '0.7rem' }}>{n.id}</td>
                                            <td style={{ padding: '0.75rem' }}>{n.clientName}</td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <span
                                                    style={{
                                                        background: n.type === 'Credito' ? '#dcfce7' : '#fee2e2',
                                                        color: n.type === 'Credito' ? '#166534' : '#991b1b',
                                                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem'
                                                    }}
                                                >
                                                    {n.type}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right' }}>${n.amount.toLocaleString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <PaginationControls
                        page={notesPagination.page}
                        totalPages={notesPagination.totalPages}
                        totalItems={notesPagination.totalItems}
                        pageSize={notesPagination.pageSize}
                        onPageChange={notesPagination.setPage}
                    />
                </div>
            </div>
        </div>
    );
}
