import React, { useState } from 'react';
import { COMPANY_INFO } from '../constants';

export function GastosModule({ expenses, setExpenses, onLog, setActiveTab }) {
    const [form, setForm] = useState({ type: 'Oficina', amount: '', description: '', beneficiary: '', docId: '' });
    const [selectedReceipt, setSelectedReceipt] = useState(null);

    const handleAddExpense = (e) => {
        e.preventDefault();
        if (!form.amount || !form.description) return alert("Complete los campos de Monto y Descripción.");

        const newExpense = {
            id: Date.now(),
            ...form,
            amount: Number(form.amount),
            date: new Date().toISOString()
        };

        setExpenses([newExpense, ...expenses]);
        onLog?.({
            module: 'Gastos',
            action: 'Nuevo Gasto',
            details: `${form.type}: $${form.amount} - ${form.description}${form.beneficiary ? ` (A: ${form.beneficiary})` : ''}`
        });

        if (window.confirm("ADesea imprimir el recibo de caja ahora?")) {
            setSelectedReceipt(newExpense);
        }

        setForm({ type: 'Oficina', amount: '', description: '', beneficiary: '', docId: '' });
        alert("Gasto registrado con Axito.");
    };

    const handlePrintSelected = (g) => {
        setSelectedReceipt(g);
        setTimeout(() => window.print(), 100);
    };

    const totalExpenses = expenses.reduce((sum, g) => sum + g.amount, 0);

    if (selectedReceipt) {
        return (
            <div className="receipt-view">
                <style>{`
                    @media print {
                        body * { visibility: hidden; }
                        .printable-receipt, .printable-receipt * { visibility: visible; }
                        .printable-receipt { position: absolute; left: 0; top: 0; width: 100%; border: none; }
                    }
                `}</style>
                <div className="no-print" style={{ marginBottom: '2rem' }}>
                    <button className="btn" onClick={() => setSelectedReceipt(null)}>{'\u2B05'} Volver al Modulo</button>
                    <button className="btn btn-primary" onClick={() => window.print()} style={{ marginLeft: '1rem' }}>{'\uD83D\uDDA8\uFE0F'} Imprimir Recibo</button>
                </div>

                <div className="printable-receipt card" style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem', border: '2px solid #333' }}>
                    <div style={{ textAlign: 'center', borderBottom: '1px solid #94a3b8', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                        <img src={COMPANY_INFO.logo} alt="Logo" style={{ maxWidth: '95px', marginBottom: '0.4rem' }} />
                        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{COMPANY_INFO.name}</h2>
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>NIT: {COMPANY_INFO.nit}</p>
                        <p style={{ margin: '0.15rem 0', fontSize: '0.8rem' }}>{COMPANY_INFO.address}</p>
                        <p style={{ margin: '0.15rem 0', fontSize: '0.8rem' }}>Tel: {COMPANY_INFO.phone} | {COMPANY_INFO.email}</p>
                    </div>

                    <div style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '1rem', marginBottom: '2rem' }}>
                        <h1 style={{ margin: 0 }}>RECIBO DE CAJA</h1>
                        <p style={{ margin: '0.5rem 0', fontWeight: 'bold' }}>SOPORTE DE EGRESO # {selectedReceipt.id.toString().slice(-6)}</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                        <div>
                            <p><strong>FECHA:</strong> {new Date(selectedReceipt.date).toLocaleDateString()} {new Date(selectedReceipt.date).toLocaleTimeString()}</p>
                            <p><strong>PAGADO A:</strong> {selectedReceipt.beneficiary || '___________________________'}</p>
                            <p><strong>C.C. / NIT:</strong> {selectedReceipt.docId || '___________________________'}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', border: '2px solid #333', padding: '0.5rem', display: 'inline-block' }}>
                                VALOR: ${selectedReceipt.amount.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '3rem', minHeight: '100px', border: '1px solid #ccc', padding: '1rem' }}>
                        <p><strong>CONCEPTO DE:</strong></p>
                        <p>{selectedReceipt.description}</p>
                        <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>CategorAa: {selectedReceipt.type}</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', marginTop: '5rem' }}>
                        <div style={{ borderTop: '1px solid #333', textAlign: 'center', paddingTop: '0.5rem' }}>
                            <p style={{ margin: 0, fontWeight: 'bold' }}>FIRMA DEL BENEFICIARIO</p>
                            <p style={{ margin: 0, fontSize: '0.8rem' }}>C.C. / NIT:</p>
                        </div>
                        <div style={{ borderTop: '1px solid #333', textAlign: 'center', paddingTop: '0.5rem' }}>
                            <p style={{ margin: 0, fontWeight: 'bold' }}>AUTORIZADO POR</p>
                            <p style={{ margin: 0, fontSize: '0.8rem' }}>Sello de la Empresa</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="gastos-module">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Modulo de Gastos e Inversiòn n</h2>
                <button className="btn" onClick={() => setActiveTab('home')}>{'\uD83C\uDFE0'} Regresar</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                <div className="card">
                    <h3>Registrar Gasto</h3>
                    <form onSubmit={handleAddExpense}>
                        <div className="input-group">
                            <label className="input-label">Tipo de Gasto</label>
                            <select
                                className="input-field"
                                value={form.type}
                                onChange={e => setForm({ ...form, type: e.target.value })}
                            >
                                <option value="Oficina">Oficina / Insumos</option>
                                <option value="Inversiòn n">Inversiòn n / Activos</option>
                                <option value="Servicios">Servicios PAblicos</option>
                                <option value="Personal">Pago Personal / NAmina</option>
                                <option value="Otros">Otros</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Beneficiario (Nombre)</label>
                            <input
                                type="text"
                                className="input-field"
                                value={form.beneficiary}
                                onChange={e => setForm({ ...form, beneficiary: e.target.value })}
                                placeholder="A quiAn se le paga..."
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">IdentificaciAn / NIT</label>
                            <input
                                type="text"
                                className="input-field"
                                value={form.docId}
                                onChange={e => setForm({ ...form, docId: e.target.value })}
                                placeholder="C.C. o NIT del beneficiario"
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Monto ($)</label>
                            <input
                                type="number"
                                className="input-field"
                                value={form.amount}
                                onChange={e => setForm({ ...form, amount: e.target.value })}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Descripciòn</label>
                            <textarea
                                className="input-field"
                                style={{ height: '60px' }}
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Detalle del gasto..."
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar Gasto</button>
                    </form>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3>Historial Reciente</h3>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                            Total: <span style={{ color: '#e11d48' }}>${totalExpenses.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Fecha</th>
                                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Beneficiario</th>
                                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>Monto</th>
                                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>AcciAn</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.length === 0 ? (
                                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No hay gastos registrados</td></tr>
                                ) : (
                                    expenses.map(g => (
                                        <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                                                {new Date(g.date).toLocaleDateString()}
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{g.type}</div>
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <strong>{g.beneficiary || 'Sin beneficiario'}</strong>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{g.description.slice(0, 30)}...</div>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600' }}>${g.amount.toLocaleString()}</td>
                                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                <button className="btn" onClick={() => handlePrintSelected(g)} title="Imprimir Recibo">{'\uD83D\uDDA8\uFE0F'}</button>
                                            </td>
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
