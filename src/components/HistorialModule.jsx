import React, { useMemo, useState } from 'react';
import { printInvoiceDocument } from '../lib/printInvoice.js';

export function HistorialModule({
  sales,
  logs = [],
  currentUser,
  isAdmin,
  onDeleteInvoice,
  onCancelInvoice,
  onReturnInvoice,
  onLog
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [movementScope, setMovementScope] = useState('mine');

  const getInvoiceCode = (invoice) => (
    invoice?.invoiceCode ||
    invoice?.mixedDetails?.invoiceCode ||
    invoice?.mixedDetails?.invoice_code ||
    invoice?.id ||
    'N/A'
  );

  const normalizedSearch = searchTerm.toLowerCase();
  const filteredSales = (sales || []).filter((s) =>
    String(getInvoiceCode(s)).toLowerCase().includes(normalizedSearch) ||
    String(s?.clientName ?? '').toLowerCase().includes(normalizedSearch)
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  const facturationMovements = useMemo(() => {
    const ownId = String(currentUser?.id || '').trim();
    const source = (logs || []).filter((log) => String(log?.module || '').toLowerCase() === 'facturacion');
    const scoped = movementScope === 'all'
      ? source
      : source.filter((log) => String(log?.user_id || '').trim() === ownId);
    return scoped.sort((a, b) => new Date(b?.timestamp || 0) - new Date(a?.timestamp || 0)).slice(0, 120);
  }, [logs, movementScope, currentUser?.id]);

  const handleDelete = (invoice) => {
    const code = getInvoiceCode(invoice);
    if (!isAdmin) return alert('Solo el administrador puede eliminar facturas.');
    if (confirm(`Seguro de eliminar la factura ${code}? El stock sera devuelto.`)) {
      onDeleteInvoice?.(invoice);
    }
  };

  const handleCancel = (invoice) => {
    if (!isAdmin) return alert('Solo administrador puede anular.');
    const reason = String(prompt('Motivo de anulacion (obligatorio):') || '').trim();
    if (reason.length < 10) return alert('Debe ingresar un motivo minimo de 10 caracteres.');
    onCancelInvoice?.(invoice, reason);
  };

  const handleReturn = (invoice) => {
    const mode = String(prompt('Tipo de devolucion: DINERO o CAMBIO') || '').trim().toUpperCase();
    if (!['DINERO', 'CAMBIO'].includes(mode)) return alert('Tipo invalido. Use DINERO o CAMBIO.');
    const reason = String(prompt('Motivo de devolucion (obligatorio):') || '').trim();
    if (reason.length < 10) return alert('Debe ingresar un motivo minimo de 10 caracteres.');
    onReturnInvoice?.(invoice, mode, reason);
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
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Movimientos de Facturacion</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className={`btn ${movementScope === 'mine' ? 'btn-primary' : ''}`} onClick={() => setMovementScope('mine')}>
              Mis movimientos
            </button>
            {isAdmin && (
              <button className={`btn ${movementScope === 'all' ? 'btn-primary' : ''}`} onClick={() => setMovementScope('all')}>
                Todos
              </button>
            )}
          </div>
        </div>
        <div className="table-container" style={{ marginTop: '0.75rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Fecha</th>
                <th style={{ padding: '0.5rem' }}>Usuario</th>
                <th style={{ padding: '0.5rem' }}>Accion</th>
                <th style={{ padding: '0.5rem' }}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {facturationMovements.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '0.75rem', textAlign: 'center' }}>Sin movimientos para el filtro actual.</td></tr>
              ) : (
                facturationMovements.map((log, index) => (
                  <tr key={`${log?.timestamp || index}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem' }}>{new Date(log?.timestamp || Date.now()).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem' }}>{log?.user_name || log?.user || 'Sistema'}</td>
                    <td style={{ padding: '0.5rem' }}>{log?.action || 'N/A'}</td>
                    <td style={{ padding: '0.5rem' }}>{log?.details || ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                <th style={{ padding: '1rem' }}>Estado</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Total</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>No se encontraron ventas</td></tr>
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
                    <td style={{ padding: '1rem' }}>
                      <span className="badge">{String(s?.status || 'pagado')}</span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                      ${Number(s.total || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn" style={{ padding: '4px 8px' }} onClick={() => handlePreview(s)} title="Vista previa">Ver</button>
                        <button className="btn" style={{ padding: '4px 8px' }} onClick={() => handlePrint(s, '58mm')} title="Imprimir 58mm">58mm</button>
                        <button className="btn" style={{ padding: '4px 8px' }} onClick={() => handlePrint(s, 'a4')} title="Imprimir A4">A4</button>
                        {isAdmin && !['anulada', 'devuelta'].includes(String(s?.status || '').toLowerCase()) && (
                          <>
                            <button className="btn" style={{ padding: '4px 8px', borderColor: '#b45309', color: '#b45309' }} onClick={() => handleCancel(s)}>
                              Anular
                            </button>
                            <button className="btn" style={{ padding: '4px 8px', borderColor: '#0369a1', color: '#0369a1' }} onClick={() => handleReturn(s)}>
                              Devolver
                            </button>
                          </>
                        )}
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

                {Array.isArray(previewInvoice?.abonos) && previewInvoice.abonos.length > 0 && (
                  <div className="card" style={{ marginTop: '0.75rem', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Abonos de cartera</div>
                    {previewInvoice.abonos.slice(0, 10).map((a, idx) => (
                      <div key={`${a?.id || idx}-${idx}`} style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                        {new Date(a?.date || Date.now()).toLocaleString()} - ${Number(a?.amount || 0).toLocaleString()} - {a?.method || 'N/A'} {a?.reference ? `(${a.reference})` : ''}
                      </div>
                    ))}
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
