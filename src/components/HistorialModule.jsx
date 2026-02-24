import React, { useState } from 'react';
import { printInvoiceDocument } from '../lib/printInvoice.js';

export function HistorialModule({ sales, isAdmin, onDeleteInvoice, onLog }) {
    const [searchTerm, setSearchTerm] = useState('');
    const getInvoiceCode = (invoice) => (
        invoice?.invoiceCode ||
        invoice?.mixedDetails?.invoiceCode ||
        invoice?.mixedDetails?.invoice_code ||
        invoice?.id ||
        'N/A'
    );

    const normalizedSearch = searchTerm.toLowerCase();
    const filteredSales = sales.filter(s =>
        String(getInvoiceCode(s)).toLowerCase().includes(normalizedSearch) ||
        String(s?.clientName ?? '').toLowerCase().includes(normalizedSearch)
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    const handleDelete = (invoice) => {
        const code = getInvoiceCode(invoice);
        if (!isAdmin) return alert('Solo el administrador puede eliminar facturas.');
        if (confirm(`AEstA seguro de eliminar la factura ${code}? El stock serA devuelto.`)) {
            onDeleteInvoice(invoice);
        }
    };

    const handlePrint = (invoice, mode = '58mm') => {
        const code = getInvoiceCode(invoice);
        printInvoiceDocument(invoice, mode);
        onLog?.({ module: 'Historial', action: 'Reimpresion', details: `Factura ${code} reimpresa (${mode})` });
    };

    return (
        <div className="historial-module">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2>Historial de Facturas</h2>
                <input
                    type="text"
                    className="input-field"
                    placeholder="Buscar por ID o Cliente..."
                    style={{ maxWidth: '300px' }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="card">
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>ID / Fecha</th>
                                <th style={{ padding: '1rem' }}>Cliente</th>
                                <th style={{ padding: '1rem' }}>Productos</th>
                                <th style={{ padding: '1rem' }}>Pago</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Total</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSales.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}>No se encontraron ventas</td></tr>
                            ) : (
                                filteredSales.map((s) => (
                                    <tr key={s.db_id || s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontWeight: 'bold' }}>#{getInvoiceCode(s)}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(s.date).toLocaleString()}</div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>{s.clientName || 'Cliente Ocasional'}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontSize: '0.85rem' }}>
                                                {(s.items || []).map((it, idx) => (
                                                    <div key={idx}>{it.name} x{it.quantity}</div>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className="badge">{s.paymentMode}</span>
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                                            ${s.total.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                                                <button className="btn" style={{ padding: '4px 8px' }} onClick={() => handlePrint(s, '58mm')} title="Imprimir 58mm">58mm</button>
                                                <button className="btn" style={{ padding: '4px 8px' }} onClick={() => handlePrint(s, 'a4')} title="Imprimir A4">A4</button>
                                                {isAdmin && (
                                                    <button
                                                        className="btn"
                                                        style={{ padding: '4px 8px', color: '#e11d48', borderColor: '#e11d48' }}
                                                        onClick={() => handleDelete(s)}
                                                        title="Eliminar"
                                                    >
                                                        {'\uD83D\uDDD1\uFE0F'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
