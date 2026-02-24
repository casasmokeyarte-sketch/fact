import React, { useState } from 'react';

export function NotasModule({ clients, sales, onLog }) {
    const [notes, setNotes] = useState([]);
    const [form, setForm] = useState({ clientId: '', invoiceId: '', type: 'Credito', amount: '', reason: '' });

    const handleAddNote = (e) => {
        e.preventDefault();
        if (!form.clientId || !form.amount || !form.reason) return alert("Complete todos los campos obligatorios.");

        const client = clients.find(c => String(c.id) === String(form.clientId));
        const newNote = {
            id: `N-${Date.now()}`,
            ...form,
            clientName: client?.name || 'Otro',
            amount: Number(form.amount),
            date: new Date().toISOString()
        };

        setNotes([newNote, ...notes]);
        onLog?.({
            module: 'Notas',
            action: `Nota de ${form.type}`,
            details: `Cliente: ${client?.name}. Monto: $${form.amount}. Motivo: ${form.reason}`
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
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>ID</th>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Cliente</th>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Tipo</th>
                                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {notes.length === 0 ? (
                                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>No hay notas registradas</td></tr>
                                ) : (
                                    notes.map(n => (
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
                </div>
            </div>
        </div>
    );
}
