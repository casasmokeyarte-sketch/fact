import React, { useMemo, useState } from 'react';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';
import { useTableSort } from '../lib/useTableSort';
import { SortButton } from './SortButton';

const SCOPE_OPTIONS = [
  { value: 'CLIENTE', label: 'Cliente' },
  { value: 'FACTURA', label: 'Factura' },
  { value: 'PRODUCTO', label: 'Producto' },
];

const NOTE_CLASS_OPTIONS = [
  { value: 'CREDITO', label: 'Nota credito' },
  { value: 'DEBITO', label: 'Nota debito' },
  { value: 'AJUSTE', label: 'Ajuste comercial' },
  { value: 'NOVEDAD', label: 'Novedad operativa' },
];

const DIRECTION_OPTIONS = [
  { value: 'SUMA', label: 'Suma' },
  { value: 'RESTA', label: 'Resta' },
  { value: 'NEUTRO', label: 'Solo registro' },
];

const REASON_OPTIONS = {
  CLIENTE: [
    { value: 'SALDO_FAVOR', label: 'Saldo a favor', direction: 'SUMA', noteClass: 'CREDITO' },
    { value: 'CARGO_ADICIONAL', label: 'Cargo adicional', direction: 'SUMA', noteClass: 'DEBITO' },
    { value: 'ACUERDO_COMERCIAL', label: 'Acuerdo comercial', direction: 'NEUTRO', noteClass: 'AJUSTE' },
  ],
  FACTURA: [
    { value: 'SOBRECOBRO', label: 'Sobrecobro', direction: 'RESTA', noteClass: 'CREDITO' },
    { value: 'COBRO_FALTANTE', label: 'Cobro faltante', direction: 'SUMA', noteClass: 'DEBITO' },
    { value: 'AJUSTE_PRECIO', label: 'Ajuste de precio', direction: 'NEUTRO', noteClass: 'AJUSTE' },
    { value: 'DESCUENTO_POSTERIOR', label: 'Descuento posterior', direction: 'RESTA', noteClass: 'CREDITO' },
  ],
  PRODUCTO: [
    { value: 'MAYOR_DESPACHO', label: 'Mayor despacho', direction: 'SUMA', noteClass: 'DEBITO' },
    { value: 'MENOR_DESPACHO', label: 'Menor despacho', direction: 'RESTA', noteClass: 'CREDITO' },
    { value: 'FALTANTE', label: 'Faltante', direction: 'RESTA', noteClass: 'NOVEDAD' },
    { value: 'SOBRANTE', label: 'Sobrante', direction: 'SUMA', noteClass: 'NOVEDAD' },
    { value: 'AVERIA', label: 'Averia / daño', direction: 'RESTA', noteClass: 'NOVEDAD' },
    { value: 'AJUSTE_INVENTARIO', label: 'Ajuste de articulo', direction: 'NEUTRO', noteClass: 'AJUSTE' },
  ],
};

const emptyForm = {
  scope: 'CLIENTE',
  noteClass: 'CREDITO',
  direction: 'SUMA',
  reasonCode: 'SALDO_FAVOR',
  clientId: '',
  invoiceId: '',
  productId: '',
  amount: '',
  quantity: '',
  description: '',
};

const getReasonOptions = (scope) => REASON_OPTIONS[scope] || [];

export function NotasModule({
  currentUser,
  clients = [],
  sales = [],
  products = [],
  notes = [],
  onLog,
  onSaveNote,
  onCreateNote,
}) {
  const [form, setForm] = useState(emptyForm);

  const invoiceOptions = useMemo(() => (
    (sales || []).map((sale) => ({
      id: String(sale?.db_id || sale?.id || ''),
      code: String(sale?.id || sale?.db_id || ''),
      clientName: sale?.clientName || 'Cliente',
      clientDoc: sale?.clientDoc || '',
      total: Number(sale?.total || 0),
      items: Array.isArray(sale?.items) ? sale.items : [],
    }))
  ), [sales]);

  const selectedInvoice = invoiceOptions.find((sale) => String(sale.id) === String(form.invoiceId));
  const scopedProducts = useMemo(() => {
    if (form.scope === 'FACTURA' && selectedInvoice) {
      return (selectedInvoice.items || []).map((item) => ({
        id: String(item?.productId || item?.id || ''),
        name: item?.name || 'Producto',
      })).filter((item) => item.id);
    }

    return (products || []).map((product) => ({
      id: String(product?.id || ''),
      name: product?.name || 'Producto',
    })).filter((product) => product.id);
  }, [form.scope, selectedInvoice, products]);

  const clientOptions = useMemo(() => {
    const fromClients = (clients || []).map((client) => ({
      id: String(client?.id || client?.document || ''),
      name: client?.name || 'Cliente',
      document: client?.document || '',
    }));

    const fromInvoices = invoiceOptions
      .filter((sale) => sale.clientName)
      .map((sale) => ({
        id: `${sale.clientDoc || sale.clientName}`,
        name: sale.clientName,
        document: sale.clientDoc || '',
      }));

    const byKey = new Map();
    [...fromClients, ...fromInvoices].forEach((client) => {
      const key = String(client.id || client.document || client.name || '').trim();
      if (!key) return;
      byKey.set(key, client);
    });

    return Array.from(byKey.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [clients, invoiceOptions]);

  const reasonOptions = useMemo(() => getReasonOptions(form.scope), [form.scope]);

  const { sortedRows: sortedNotes, sortConfig, setSortKey } = useTableSort(
    notes,
    {
      date: { getValue: (note) => note?.date || '', type: 'string' },
      scope: { getValue: (note) => note?.scope || '', type: 'string' },
      noteClass: { getValue: (note) => note?.noteClass || '', type: 'string' },
      client: { getValue: (note) => note?.clientName || '', type: 'string' },
      amount: { getValue: (note) => Number(note?.amount || 0), type: 'number' },
      quantity: { getValue: (note) => Number(note?.quantity || 0), type: 'number' },
    },
    'date',
    'desc'
  );
  const notesPagination = usePagination(sortedNotes, 15);

  const applyScopeDefaults = (scope) => {
    const nextReason = getReasonOptions(scope)[0];
    setForm((prev) => ({
      ...prev,
      scope,
      noteClass: nextReason?.noteClass || prev.noteClass,
      direction: nextReason?.direction || prev.direction,
      reasonCode: nextReason?.value || '',
      invoiceId: '',
      productId: '',
    }));
  };

  const applyReasonDefaults = (reasonCode) => {
    const reason = reasonOptions.find((item) => item.value === reasonCode);
    setForm((prev) => ({
      ...prev,
      reasonCode,
      noteClass: reason?.noteClass || prev.noteClass,
      direction: reason?.direction || prev.direction,
    }));
  };

  const handleInvoiceChange = (invoiceId) => {
    const invoice = invoiceOptions.find((sale) => String(sale.id) === String(invoiceId));
    const matchingClient = clientOptions.find((client) => (
      String(client.document || '').trim() !== '' &&
      String(client.document || '').trim() === String(invoice?.clientDoc || '').trim()
    )) || clientOptions.find((client) => String(client.name || '').trim().toLowerCase() === String(invoice?.clientName || '').trim().toLowerCase());

    setForm((prev) => ({
      ...prev,
      invoiceId,
      clientId: matchingClient?.id || prev.clientId,
      productId: '',
    }));
  };

  const handleAddNote = async (e) => {
    e.preventDefault();

    if (!form.description.trim()) return alert('Debe escribir la descripcion de la novedad o ajuste.');
    if (form.scope !== 'PRODUCTO' && !form.clientId && !form.invoiceId) return alert('Seleccione al menos un cliente o una factura.');
    if (form.scope === 'FACTURA' && !form.invoiceId) return alert('Debe seleccionar la factura relacionada.');
    if (form.scope === 'PRODUCTO' && !form.productId) return alert('Debe seleccionar el articulo relacionado.');

    const client = clientOptions.find((item) => String(item.id) === String(form.clientId));
    const product = scopedProducts.find((item) => String(item.id) === String(form.productId));
    const reason = reasonOptions.find((item) => item.value === form.reasonCode);

    const newNote = {
      id: `NOTE-${Date.now()}`,
      date: new Date().toISOString(),
      noteClass: form.noteClass,
      scope: form.scope,
      reasonCode: form.reasonCode,
      reasonLabel: reason?.label || form.reasonCode,
      direction: form.direction,
      amount: Number(form.amount || 0),
      quantity: Number(form.quantity || 0),
      clientId: client?.id || '',
      clientName: client?.name || selectedInvoice?.clientName || '',
      clientDocument: client?.document || selectedInvoice?.clientDoc || '',
      invoiceId: selectedInvoice?.id || '',
      invoiceCode: selectedInvoice?.code || '',
      productId: product?.id || '',
      productName: product?.name || '',
      description: form.description.trim(),
      status: 'ACTIVA',
      createdBy: {
        id: currentUser?.id || null,
        name: currentUser?.name || currentUser?.email || 'Sistema',
      },
    };

    try {
      const savedNote = await Promise.resolve(onSaveNote?.(newNote));
      const finalNote = savedNote || newNote;

      onLog?.({
        module: 'Notas',
        action: `${finalNote.noteClass} ${finalNote.scope}`,
        details: [
          `Motivo: ${finalNote.reasonLabel}`,
          finalNote.clientName ? `Cliente: ${finalNote.clientName}` : null,
          finalNote.invoiceCode ? `Factura: ${finalNote.invoiceCode}` : null,
          finalNote.productName ? `Articulo: ${finalNote.productName}` : null,
          Number(finalNote.quantity || 0) !== 0 ? `Cantidad: ${finalNote.quantity}` : null,
          Number(finalNote.amount || 0) !== 0 ? `Monto: $${Number(finalNote.amount || 0).toLocaleString()}` : null,
          `Detalle: ${finalNote.description}`,
        ].filter(Boolean).join(' | ')
      });

      await Promise.resolve(onCreateNote?.(finalNote));
      alert('Nota registrada correctamente.');
      setForm(emptyForm);
    } catch (error) {
      console.error('No se pudo guardar la nota:', error);
      alert(error?.message || 'No se pudo guardar la nota.');
    }
  };

  return (
    <div className="notas-module">
      <h2>Notas y Ajustes Comerciales</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.9fr', gap: '2rem' }}>
        <div className="card">
          <h3>Registrar Nota</h3>
          <form onSubmit={handleAddNote}>
            <div className="input-group">
              <label className="input-label">Alcance</label>
              <select className="input-field" value={form.scope} onChange={(e) => applyScopeDefaults(e.target.value)}>
                {SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Clase</label>
              <select className="input-field" value={form.noteClass} onChange={(e) => setForm((prev) => ({ ...prev, noteClass: e.target.value }))}>
                {NOTE_CLASS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Motivo</label>
              <select className="input-field" value={form.reasonCode} onChange={(e) => applyReasonDefaults(e.target.value)}>
                {reasonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Efecto</label>
              <select className="input-field" value={form.direction} onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value }))}>
                {DIRECTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Cliente</label>
              <select className="input-field" value={form.clientId} onChange={(e) => setForm((prev) => ({ ...prev, clientId: e.target.value }))}>
                <option value="">Seleccione...</option>
                {clientOptions.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}{client.document ? ` (${client.document})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {(form.scope === 'FACTURA' || form.scope === 'PRODUCTO') && (
              <div className="input-group">
                <label className="input-label">Factura</label>
                <select className="input-field" value={form.invoiceId} onChange={(e) => handleInvoiceChange(e.target.value)}>
                  <option value="">Seleccione...</option>
                  {invoiceOptions.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.code} | {invoice.clientName} | ${invoice.total.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.scope === 'PRODUCTO' && (
              <div className="input-group">
                <label className="input-label">Articulo</label>
                <select className="input-field" value={form.productId} onChange={(e) => setForm((prev) => ({ ...prev, productId: e.target.value }))}>
                  <option value="">Seleccione...</option>
                  {scopedProducts.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="input-group">
                <label className="input-label">Monto ($)</label>
                <input type="number" className="input-field" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0" />
              </div>
              <div className="input-group">
                <label className="input-label">Cantidad</label>
                <input type="number" className="input-field" value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))} placeholder="0" />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Descripcion formal</label>
              <textarea
                className="input-field"
                rows="4"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Ej: se cobro de mas una unidad; se deja ajuste por sobrecobro y saldo a favor del cliente."
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Guardar Nota</button>
          </form>
        </div>

        <div className="card">
          <h3>Historial Formal de Notas</h3>
          <div className="table-container">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th><SortButton label="Fecha" sortKey="date" sortConfig={sortConfig} onChange={setSortKey} /></th>
                  <th><SortButton label="Alcance" sortKey="scope" sortConfig={sortConfig} onChange={setSortKey} /></th>
                  <th><SortButton label="Clase" sortKey="noteClass" sortConfig={sortConfig} onChange={setSortKey} /></th>
                  <th>Referencia</th>
                  <th><SortButton label="Cliente" sortKey="client" sortConfig={sortConfig} onChange={setSortKey} /></th>
                  <th><SortButton label="Cantidad" sortKey="quantity" sortConfig={sortConfig} onChange={setSortKey} /></th>
                  <th><SortButton label="Monto" sortKey="amount" sortConfig={sortConfig} onChange={setSortKey} /></th>
                </tr>
              </thead>
              <tbody>
                {notesPagination.totalItems === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No hay notas registradas</td></tr>
                ) : (
                  notesPagination.pageItems.map((note) => (
                    <tr key={note.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.7rem' }}>{new Date(note.date).toLocaleString()}</td>
                      <td style={{ padding: '0.7rem' }}>{note.scope}</td>
                      <td style={{ padding: '0.7rem' }}>{note.noteClass}</td>
                      <td style={{ padding: '0.7rem' }}>
                        <div>{note.reasonLabel}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {note.invoiceCode ? `Fact: ${note.invoiceCode}` : ''}{note.invoiceCode && note.productName ? ' | ' : ''}{note.productName || ''}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{note.description}</div>
                      </td>
                      <td style={{ padding: '0.7rem' }}>{note.clientName || 'Sin cliente'}</td>
                      <td style={{ padding: '0.7rem', textAlign: 'right' }}>
                        {Number(note.quantity || 0) === 0 ? '-' : `${note.direction === 'RESTA' ? '-' : note.direction === 'SUMA' ? '+' : ''}${Number(note.quantity || 0)}`}
                      </td>
                      <td style={{ padding: '0.7rem', textAlign: 'right' }}>
                        {Number(note.amount || 0) === 0 ? '-' : `${note.direction === 'RESTA' ? '-' : note.direction === 'SUMA' ? '+' : ''}$${Math.abs(Number(note.amount || 0)).toLocaleString()}`}
                      </td>
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
