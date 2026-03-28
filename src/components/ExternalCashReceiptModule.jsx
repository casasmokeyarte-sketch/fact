import React, { useMemo, useState } from 'react';
import { COMPANY_INFO } from '../constants';
import { printExternalCashReceipt } from '../lib/printReports';
import { getNextExternalCashReceiptCode } from '../lib/externalCashReceipts';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';

const INITIAL_FORM = {
  thirdPartyName: '',
  thirdPartyDocument: '',
  amount: '',
  concept: '',
  paymentMethod: 'Efectivo',
  paymentReference: '',
  notes: '',
};

export function ExternalCashReceiptModule({
  receipts = [],
  currentUser,
  onCreateReceipt,
  setActiveTab,
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const nextReceiptCode = useMemo(() => getNextExternalCashReceiptCode(receipts), [receipts]);

  const { sortedRows, sortConfig, setSortKey } = useTableSort(
    receipts,
    {
      date: { getValue: (item) => item?.date, type: 'date' },
      receiptCode: { getValue: (item) => item?.receiptCode || '', type: 'string' },
      thirdPartyName: { getValue: (item) => item?.thirdPartyName || '', type: 'string' },
      amount: { getValue: (item) => Number(item?.amount || 0), type: 'number' },
    },
    'date',
    'desc'
  );
  const pagination = usePagination(sortedRows, 15);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const amount = Number(form.amount || 0);
    if (!form.thirdPartyName.trim()) return alert('Ingrese el nombre de la persona externa.');
    if (!Number.isFinite(amount) || amount <= 0) return alert('Ingrese un valor valido.');
    if (!form.concept.trim()) return alert('Ingrese el concepto del recibo.');

    const receipt = {
      id: `rc-ext-${Date.now()}`,
      receiptCode: nextReceiptCode,
      thirdPartyName: form.thirdPartyName.trim(),
      thirdPartyDocument: form.thirdPartyDocument.trim(),
      amount,
      concept: form.concept.trim(),
      paymentMethod: form.paymentMethod,
      paymentReference: form.paymentReference.trim(),
      notes: form.notes.trim(),
      date: new Date().toISOString(),
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || currentUser?.email || 'Sistema',
    };

    await onCreateReceipt?.(receipt);
    setSelectedReceipt(receipt);
    setTimeout(() => printExternalCashReceipt(receipt, 'a4'), 80);
    setForm(INITIAL_FORM);
  };

  const handlePrint = (receipt) => {
    setSelectedReceipt(receipt);
    setTimeout(() => printExternalCashReceipt(receipt, 'a4'), 80);
  };

  return (
    <div className="external-cash-receipt-module">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ marginBottom: '0.35rem' }}>Recibo de Caja externos</h2>
          <p style={{ margin: 0, color: '#64748b' }}>
            Recibo libre para terceros externos. Genera consecutivo propio y afecta el cuadre de jornada segun la forma de pago.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge" style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
            Proximo: {nextReceiptCode}
          </span>
          <button className="btn" onClick={() => setActiveTab('home')}>{'\uD83C\uDFE0'} Regresar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.4fr)', gap: '2rem' }}>
        <div className="card">
          <h3>Generar recibo</h3>
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Consecutivo</label>
              <input className="input-field" value={nextReceiptCode} readOnly />
            </div>
            <div className="input-group">
              <label className="input-label">Nombre de la persona</label>
              <input className="input-field" value={form.thirdPartyName} onChange={(e) => handleChange('thirdPartyName', e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="input-group">
              <label className="input-label">Documento / NIT</label>
              <input className="input-field" value={form.thirdPartyDocument} onChange={(e) => handleChange('thirdPartyDocument', e.target.value)} placeholder="Documento del tercero" />
            </div>
            <div className="input-group">
              <label className="input-label">Valor recibido ($)</label>
              <input type="number" className="input-field" value={form.amount} onChange={(e) => handleChange('amount', e.target.value)} placeholder="0" />
            </div>
            <div className="input-group">
              <label className="input-label">Forma de pago</label>
              <select className="input-field" value={form.paymentMethod} onChange={(e) => handleChange('paymentMethod', e.target.value)}>
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Referencia pago</label>
              <input className="input-field" value={form.paymentReference} onChange={(e) => handleChange('paymentReference', e.target.value)} placeholder="Comprobante, voucher o referencia" />
            </div>
            <div className="input-group">
              <label className="input-label">Concepto</label>
              <textarea className="input-field" style={{ height: '68px' }} value={form.concept} onChange={(e) => handleChange('concept', e.target.value)} placeholder="Concepto del recibo" />
            </div>
            <div className="input-group">
              <label className="input-label">Observaciones</label>
              <textarea className="input-field" style={{ height: '58px' }} value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="Observaciones opcionales" />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Guardar e imprimir recibo
            </button>
          </form>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Historial de recibos</h3>
            <div style={{ color: '#64748b' }}>{receipts.length} registro(s)</div>
          </div>

          <div className="table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'rgba(12, 12, 24, 0.95)', zIndex: 1 }}>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                    <SortButton label="Fecha" sortKey="date" sortConfig={sortConfig} onChange={setSortKey} />
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                    <SortButton label="Recibo" sortKey="receiptCode" sortConfig={sortConfig} onChange={setSortKey} />
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>
                    <SortButton label="Persona" sortKey="thirdPartyName" sortConfig={sortConfig} onChange={setSortKey} />
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.75rem' }}>
                    <SortButton label="Valor" sortKey="amount" sortConfig={sortConfig} onChange={setSortKey} />
                  </th>
                  <th style={{ textAlign: 'center', padding: '0.75rem' }}>Accion</th>
                </tr>
              </thead>
              <tbody>
                {pagination.totalItems === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      No hay recibos externos registrados.
                    </td>
                  </tr>
                ) : (
                  pagination.pageItems.map((receipt) => (
                    <tr key={receipt.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                        {new Date(receipt.date).toLocaleDateString()}
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{receipt.paymentMethod}</div>
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: '700' }}>{receipt.receiptCode}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <strong>{receipt.thirdPartyName}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{receipt.concept.slice(0, 46) || 'Sin concepto'}</div>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '700', color: '#166534' }}>
                        ${Number(receipt.amount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <button className="btn" onClick={() => handlePrint(receipt)} title="Imprimir A4">{'\uD83D\uDDA8\uFE0F'}</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
          />
        </div>
      </div>

      {selectedReceipt && (
        <div className="card" style={{ marginTop: '2rem', borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ marginBottom: '0.3rem' }}>Vista previa A4</h3>
              <p style={{ margin: 0, color: '#64748b' }}>Formato membrete listo para impresion.</p>
            </div>
            <button className="btn btn-primary" onClick={() => printExternalCashReceipt(selectedReceipt, 'a4')}>{'\uD83D\uDDA8\uFE0F'} Imprimir A4</button>
          </div>

          <div className="printable-area" style={{ maxWidth: '900px', margin: '0 auto', background: '#fff', color: '#0f172a', padding: '2.5rem', border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.5rem', borderBottom: '3px solid #0f172a', paddingBottom: '1.2rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <img src={COMPANY_INFO.logo} alt="Logo" style={{ width: '90px', height: '90px', objectFit: 'contain' }} />
                <div>
                  <h1 style={{ margin: 0, fontSize: '1.45rem' }}>{COMPANY_INFO.name}</h1>
                  <div style={{ marginTop: '0.35rem', color: '#475569', lineHeight: 1.5 }}>
                    <div>NIT: {COMPANY_INFO.nit}</div>
                    <div>{COMPANY_INFO.address}</div>
                    <div>{COMPANY_INFO.phone} | {COMPANY_INFO.email}</div>
                  </div>
                </div>
              </div>
              <div style={{ minWidth: '220px', border: '2px solid #0f172a', padding: '0.9rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569' }}>Recibo de caja</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '0.35rem' }}>{selectedReceipt.receiptCode}</div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.45rem' }}>{new Date(selectedReceipt.date).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ border: '1px solid #cbd5e1', padding: '1rem' }}>
                <div><strong>Recibido de:</strong> {selectedReceipt.thirdPartyName}</div>
                <div style={{ marginTop: '0.5rem' }}><strong>Documento:</strong> {selectedReceipt.thirdPartyDocument || 'No informado'}</div>
                <div style={{ marginTop: '0.5rem' }}><strong>Concepto:</strong> {selectedReceipt.concept}</div>
              </div>
              <div style={{ border: '1px solid #cbd5e1', padding: '1rem' }}>
                <div><strong>Valor:</strong> ${Number(selectedReceipt.amount || 0).toLocaleString()}</div>
                <div style={{ marginTop: '0.5rem' }}><strong>Forma de pago:</strong> {selectedReceipt.paymentMethod}</div>
                <div style={{ marginTop: '0.5rem' }}><strong>Referencia:</strong> {selectedReceipt.paymentReference || 'No aplica'}</div>
              </div>
            </div>

            <div style={{ border: '1px solid #cbd5e1', padding: '1rem', minHeight: '110px', marginBottom: '2rem' }}>
              <strong>Observaciones:</strong>
              <p style={{ marginBottom: 0 }}>{selectedReceipt.notes || 'Sin observaciones adicionales.'}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '3rem' }}>
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: '0.75rem', textAlign: 'center' }}>
                <strong>Firma quien entrega</strong>
              </div>
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: '0.75rem', textAlign: 'center' }}>
                <strong>Firma tercero</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
