import React, { useState } from 'react';
import { printInvoiceDocument } from '../lib/printInvoice.js';

export function HistorialModule({ sales, isAdmin, onDeleteInvoice, onLog }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [previewInvoice, setPreviewInvoice] = useState(null);
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

    const handlePreview = (invoice) => {
        setPreviewInvoice(invoice);
        const code = getInvoiceCode(invoice);
        onLog?.({ module: 'Historial', action: 'Vista Previa', details: `Vista previa factura ${code}` });
    };

    const getInvoiceUser = (invoice) => (
        invoice?.user_name ||
        invoice?.user ||
        invoice?.mixedDetails?.user_name ||
        invoice?.mixedDetails?.user ||
        'Sin usuario'
    );

    const getDiscountInfo = (invoice) => {
        const automaticPercent = Number(invoice?.automaticDiscountPercent ?? invoice?.mixedDetails?.discount?.automaticPercent ?? 0);
        const automaticAmount = Number(invoice?.automaticDiscountAmount ?? invoice?.mixedDetails?.discount?.automaticAmount ?? 0);
        const extraAmount = Number(invoice?.extraDiscount ?? invoice?.mixedDetails?.discount?.extraAmount ?? 0);
        const totalAmount = Number(invoice?.totalDiscount ?? invoice?.mixedDetails?.discount?.totalAmount ?? (automaticAmount + extraAmount));
        return { automaticPercent, automaticAmount, extraAmount, totalAmount };
    };

    const getAuthorizationInfo = (invoice) => (
        invoice?.authorization ||
        invoice?.mixedDetails?.authorization ||
        null
    );

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
                                <th style={{ padding: '1rem' }}>Usuario</th>
                                <th style={{ padding: '1rem' }}>Productos</th>
                                <th style={{ padding: '1rem' }}>Pago</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Total</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSales.length === 0 ? (
                                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>No se encontraron ventas</td></tr>
                            ) : (
                                filteredSales.map((s) => (
                                    <tr key={s.db_id || s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontWeight: 'bold' }}>#{getInvoiceCode(s)}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(s.date).toLocaleString()}</div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>{s.clientName || 'Cliente Ocasional'}</td>
                                        <td style={{ padding: '1rem' }}>{getInvoiceUser(s)}</td>
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
                                                <button className="btn" style={{ padding: '4px 8px' }} onClick={() => handlePreview(s)} title="Vista previa">Ver</button>
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

            {previewInvoice && (
                (() => {
                    const discount = getDiscountInfo(previewInvoice);
                    const authorization = getAuthorizationInfo(previewInvoice);
                    const subtotal = Number(previewInvoice?.subtotal || 0);
                    const deliveryFee = Number(previewInvoice?.deliveryFee || 0);
                    const automaticLabel = discount.automaticPercent > 0
                        ? `${discount.automaticPercent}%`
                        : '0%';
                    return (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1200,
                    padding: '1rem'
                }}>
                    <div className="card" style={{ width: 'min(920px, 100%)', maxHeight: '90vh', overflow: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h3 style={{ margin: 0 }}>Vista previa factura #{getInvoiceCode(previewInvoice)}</h3>
                            <button className="btn" onClick={() => setPreviewInvoice(null)}>Cerrar</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div><strong>Fecha:</strong> {new Date(previewInvoice?.date || Date.now()).toLocaleString()}</div>
                            <div><strong>Cliente:</strong> {previewInvoice?.clientName || 'Cliente Ocasional'}</div>
                            <div><strong>Documento:</strong> {previewInvoice?.clientDoc || 'N/A'}</div>
                            <div><strong>Usuario:</strong> {getInvoiceUser(previewInvoice)}</div>
                            <div><strong>Pago:</strong> {previewInvoice?.paymentMode || 'N/A'}</div>
                            <div><strong>Total:</strong> ${Number(previewInvoice?.total || 0).toLocaleString()}</div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                    <th style={{ padding: '0.5rem' }}>Producto</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Cantidad</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(previewInvoice?.items || []).map((it, idx) => (
                                    <tr key={`${it?.id || it?.name || 'item'}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '0.5rem' }}>{it?.name || 'Producto'}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>{Number(it?.quantity || 0)}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>${Number(it?.total || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div><strong>Subtotal:</strong> ${subtotal.toLocaleString()}</div>
                            <div><strong>Domicilio:</strong> ${deliveryFee.toLocaleString()}</div>
                            <div><strong>Descuento cliente ({automaticLabel}):</strong> -${discount.automaticAmount.toLocaleString()}</div>
                            <div><strong>Descuento extra:</strong> -${discount.extraAmount.toLocaleString()}</div>
                            <div><strong>Descuento total:</strong> -${discount.totalAmount.toLocaleString()}</div>
                            <div><strong>Total final:</strong> ${Number(previewInvoice?.total || 0).toLocaleString()}</div>
                        </div>

                        {authorization?.required && (
                            <div className="card" style={{ marginTop: '0.75rem', backgroundColor: '#f8fafc' }}>
                                <div><strong>Autorizacion:</strong> {authorization?.reasonLabel || authorization?.reasonType || 'Manual'}</div>
                                <div><strong>Estado:</strong> {authorization?.status || 'N/A'}</div>
                                <div>
                                    <strong>Aprobado por:</strong> {authorization?.approvedBy?.name || 'No registrado'}
                                    {authorization?.approvedBy?.role ? ` (${authorization.approvedBy.role})` : ''}
                                </div>
                                {authorization?.approvedAt && <div><strong>Fecha autorizacion:</strong> {new Date(authorization.approvedAt).toLocaleString()}</div>}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                            <button className="btn" onClick={() => handlePrint(previewInvoice, '58mm')}>Imprimir 58mm</button>
                            <button className="btn btn-primary" onClick={() => handlePrint(previewInvoice, 'a4')}>Imprimir A4</button>
                        </div>
                    </div>
                </div>
                    );
                })()
            )}
        </div>
    );
}
