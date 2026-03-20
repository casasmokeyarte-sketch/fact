import React, { useEffect, useMemo, useState } from 'react';
import { printInvoiceDocument } from '../lib/printInvoice.js';
import { PaginationControls } from './PaginationControls';
import { usePagination } from '../lib/usePagination';

const AUTH_REQUEST_LOG_PREFIX = 'AUTH_REQUEST_EVENT::';

export function HistorialModule({
  sales,
  products = [],
  logs = [],
  currentUser,
  isAdmin,
  onDeleteInvoice,
  onCancelInvoice,
  onReturnInvoice,
  onLog,
  preselectedProductId = '',
  setPreselectedProductId
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [movementScope, setMovementScope] = useState('mine');
  const [invoiceScope, setInvoiceScope] = useState(isAdmin ? 'all' : 'mine');
  const [openInvoiceMenuId, setOpenInvoiceMenuId] = useState(null);
  const [openProductMenuId, setOpenProductMenuId] = useState(null);
  const [productMovementView, setProductMovementView] = useState(null);

  useEffect(() => {
    setInvoiceScope(isAdmin ? 'all' : 'mine');
  }, [isAdmin]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!openInvoiceMenuId && !openProductMenuId) return;
      const root = event.target?.closest?.('[data-menu-root="1"]');
      if (!root) {
        setOpenInvoiceMenuId(null);
        setOpenProductMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openInvoiceMenuId, openProductMenuId]);

  const getInvoiceCode = (invoice) => (
    invoice?.invoiceCode ||
    invoice?.mixedDetails?.invoiceCode ||
    invoice?.mixedDetails?.invoice_code ||
    invoice?.id ||
    'N/A'
  );

  const getInvoiceKey = (invoice) => String(invoice?.db_id || invoice?.id || '');
  const normalizeName = (value) => String(value || '').trim().toLowerCase();
  const normalizeDateKey = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  };
  const isDateInSelectedRange = (value) => {
    const dateKey = normalizeDateKey(value);
    if (!dateKey) return false;
    if (dateFrom && dateKey < dateFrom) return false;
    if (dateTo && dateKey > dateTo) return false;
    return true;
  };
  const getItemProductId = (item) => item?.productId ?? item?.product_id ?? item?.id ?? null;
  const parseAuthRequestEvent = (details) => {
    const raw = String(details || '');
    if (!raw.startsWith(AUTH_REQUEST_LOG_PREFIX)) return null;
    try {
      const parsed = JSON.parse(raw.slice(AUTH_REQUEST_LOG_PREFIX.length));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };
  const isOwnedByCurrentUser = (record) => {
    const ownId = String(currentUser?.id || '').trim();
    const recordId = String(record?.user_id || record?.userId || '').trim();
    if (ownId && recordId) return ownId === recordId;

    const ownName = normalizeName(currentUser?.name || currentUser?.email || '');
    const recordName = normalizeName(
      record?.user_name ||
      record?.user ||
      record?.mixedDetails?.user_name ||
      record?.mixedDetails?.user ||
      ''
    );
    if (ownName && recordName) return ownName === recordName;

    return false;
  };

  const getInvoiceUser = (invoice) => (
    invoice?.user_name ||
    invoice?.user ||
    invoice?.username ||
    invoice?.mixedDetails?.user_name ||
    invoice?.mixedDetails?.user ||
    invoice?.mixed_details?.user_name ||
    invoice?.mixed_details?.user ||
    'Sin usuario'
  );

  const normalizedSearch = searchTerm.toLowerCase();
  const advisorOptions = useMemo(() => (
    Array.from(new Set((sales || []).map((sale) => getInvoiceUser(sale)).filter(Boolean))).sort()
  ), [sales]);
  const paymentOptions = useMemo(() => (
    Array.from(new Set((sales || []).map((sale) => String(sale?.paymentMode || '').trim()).filter(Boolean))).sort()
  ), [sales]);
  const salesByScope = (sales || []).filter((s) => (
    invoiceScope === 'all' ? true : isOwnedByCurrentUser(s)
  ));
  const filteredSales = salesByScope.filter((s) =>
    (String(getInvoiceCode(s)).toLowerCase().includes(normalizedSearch) ||
    String(s?.clientName ?? '').toLowerCase().includes(normalizedSearch)) &&
    (!advisorFilter || getInvoiceUser(s) === advisorFilter) &&
    (!statusFilter || String(s?.status || 'pagado').toLowerCase() === statusFilter) &&
    (!paymentFilter || String(s?.paymentMode || '').trim() === paymentFilter) &&
    isDateInSelectedRange(s?.date)
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  const facturationMovements = useMemo(() => {
    const ownId = String(currentUser?.id || '').trim();
    const source = (logs || []).filter((log) => String(log?.module || '').toLowerCase() === 'facturacion');
    const scoped = movementScope === 'all'
      ? source
      : source.filter((log) => String(log?.user_id || '').trim() === ownId);
    return scoped
      .filter((log) => isDateInSelectedRange(log?.timestamp))
      .sort((a, b) => new Date(b?.timestamp || 0) - new Date(a?.timestamp || 0));
  }, [logs, movementScope, currentUser?.id, dateFrom, dateTo]);

  const salesPagination = usePagination(filteredSales, 15);
  const movementPagination = usePagination(facturationMovements, 15);
  const productMovementPagination = usePagination(productMovementView?.movements || [], 15);

  const productMovementsById = useMemo(() => {
    const movementMap = {};
    const ensureBucket = (productId) => {
      const id = String(productId || '').trim();
      if (!id) return null;
      if (!movementMap[id]) movementMap[id] = [];
      return movementMap[id];
    };

    const nameToIds = new Map();
    (products || []).forEach((product) => {
      const key = normalizeName(product?.name);
      if (!key) return;
      const list = nameToIds.get(key) || [];
      if (!list.includes(product.id)) list.push(product.id);
      nameToIds.set(key, list);
    });
    (sales || []).forEach((invoice) => {
      (invoice?.items || []).forEach((item) => {
        const productId = getItemProductId(item);
        const key = normalizeName(item?.name);
        if (!key || !productId) return;
        const list = nameToIds.get(key) || [];
        if (!list.includes(productId)) list.push(productId);
        nameToIds.set(key, list);
      });
    });

    (sales || []).forEach((invoice) => {
      const invoiceCode = getInvoiceCode(invoice);
      const saleUser = getInvoiceUser(invoice);
      const status = String(invoice?.status || 'pagado').toLowerCase();
      const saleDate = invoice?.date || new Date().toISOString();

      (invoice?.items || []).forEach((item) => {
        const productId = getItemProductId(item);
        const bucket = ensureBucket(productId);
        if (!bucket) return;
        const quantity = Number(item?.quantity || 0);
        const baseName = item?.name || 'Producto';

        bucket.push({
          type: 'Salida por factura',
          direction: 'out',
          invoiceCode,
          quantity,
          timestamp: saleDate,
          user: saleUser,
          details: `${baseName} x${quantity} en factura #${invoiceCode}`,
        });

        if (status === 'anulada') {
          const cancellation = invoice?.mixedDetails?.cancellation || {};
          bucket.push({
            type: 'Anulacion factura',
            direction: 'in',
            invoiceCode,
            quantity,
            timestamp: cancellation?.at || saleDate,
            user: cancellation?.by || saleUser,
            details: `Reintegro por anulacion. Motivo: ${cancellation?.reason || 'N/A'}`
          });
        }

        if (status === 'devuelta') {
          const returnData = invoice?.mixedDetails?.returnData || {};
          bucket.push({
            type: 'Devolucion factura',
            direction: 'in',
            invoiceCode,
            quantity,
            timestamp: returnData?.at || saleDate,
            user: returnData?.by || saleUser,
            details: `Reintegro por devolucion (${returnData?.mode || 'N/A'}). Motivo: ${returnData?.reason || 'N/A'}`
          });
        }
      });
    });

    (logs || []).forEach((log) => {
      const moduleName = String(log?.module || '').toLowerCase();
      if (moduleName !== 'inventario') return;

      const action = String(log?.action || '');
      const actionLower = action.toLowerCase();
      const details = String(log?.details || '');
      const detailsLower = details.toLowerCase();
      const matchedIds = [];
      nameToIds.forEach((ids, normalizedProductName) => {
        if (normalizedProductName && detailsLower.includes(normalizedProductName)) {
          ids.forEach((id) => {
            if (!matchedIds.includes(id)) matchedIds.push(id);
          });
        }
      });

      if (matchedIds.length === 0) return;

      matchedIds.forEach((productId) => {
        const bucket = ensureBucket(productId);
        if (!bucket) return;
        const item = {
          type: 'Movimiento inventario',
          direction: 'neutral',
          invoiceCode: null,
          quantity: null,
          timestamp: log?.timestamp || new Date().toISOString(),
          user: log?.user_name || log?.user || 'Sistema',
          details
        };

        if (actionLower.includes('ajuste')) {
          const m = details.match(/en\s+(bodega|ventas):\s*([+-]?\d+(?:\.\d+)?)\s*->\s*([+-]?\d+(?:\.\d+)?)/i);
          const prev = Number(m?.[2]);
          const next = Number(m?.[3]);
          const delta = Number.isFinite(prev) && Number.isFinite(next) ? (next - prev) : null;
          item.type = 'Ajuste stock';
          item.quantity = delta;
          item.direction = delta == null ? 'neutral' : (delta >= 0 ? 'in' : 'out');
        } else if (actionLower.includes('aceptar desde boveda')) {
          const m = details.match(/recibio\s+(\d+(?:\.\d+)?)\s+unidades/i);
          const qty = Number(m?.[1]);
          item.type = 'Entrada desde bodega';
          item.quantity = Number.isFinite(qty) ? qty : null;
          item.direction = 'in';
        } else if (actionLower.includes('entrada aprobada desde bodega')) {
          const m = details.match(/autorizo\s+(\d+(?:\.\d+)?)\s+unidades/i);
          const qty = Number(m?.[1]);
          item.type = 'Entrada aprobada';
          item.quantity = Number.isFinite(qty) ? qty : null;
          item.direction = 'in';
        } else if (actionLower.includes('entrada rechazada desde bodega')) {
          const m = details.match(/entrada de\s+(\d+(?:\.\d+)?)\s+unidades/i);
          const qty = Number(m?.[1]);
          item.type = 'Entrada rechazada';
          item.quantity = Number.isFinite(qty) ? qty : null;
          item.direction = 'neutral';
        } else if (actionLower.includes('solicitud inventario')) {
          const m = details.match(/solicito\s+(\d+(?:\.\d+)?)\s+unidades/i);
          const qty = Number(m?.[1]);
          item.type = 'Solicitud de entrada';
          item.quantity = Number.isFinite(qty) ? qty : null;
          item.direction = 'neutral';
        } else if (actionLower.includes('salida forzada')) {
          item.type = 'Salida forzada';
          item.direction = 'out';
        } else if (actionLower.includes('entrada forzada')) {
          item.type = 'Entrada forzada';
          item.direction = 'in';
        }

        bucket.push(item);
      });
    });

    (logs || []).forEach((log) => {
      if (String(log?.module || '') !== 'Autorizaciones') return;
      const event = parseAuthRequestEvent(log?.details);
      if (!event?.requestId) return;
      if (String(event?.module || '') !== 'Inventario') return;

      const inventoryRequest = event?.inventoryRequest || null;
      const productId = String(inventoryRequest?.productId || '').trim();
      const bucket = ensureBucket(productId);
      if (!bucket) return;

      const quantity = Number(inventoryRequest?.quantity || 0);
      const productName = inventoryRequest?.productName || products.find((p) => String(p?.id) === productId)?.name || 'Producto';

      if (event.type === 'CREATED') {
        bucket.push({
          type: 'Solicitud de entrada',
          direction: 'neutral',
          invoiceCode: null,
          quantity: Number.isFinite(quantity) ? quantity : null,
          timestamp: event?.createdAt || log?.timestamp || new Date().toISOString(),
          user: event?.requestedBy?.name || log?.user_name || 'Sistema',
          details: `Solicitud de ${Number(quantity || 0).toLocaleString()} unidades de ${productName} desde bodega.`
        });
        return;
      }

      if (event.type === 'RESOLVED') {
        const approved = event?.decision === 'APPROVED';
        bucket.push({
          type: approved ? 'Entrada aprobada' : 'Entrada rechazada',
          direction: approved ? 'in' : 'neutral',
          invoiceCode: null,
          quantity: Number.isFinite(quantity) ? quantity : null,
          timestamp: event?.resolvedAt || log?.timestamp || new Date().toISOString(),
          user: event?.resolvedBy?.name || log?.user_name || 'Sistema',
          details: approved
            ? `Autorizacion aprobada para sumar ${Number(quantity || 0).toLocaleString()} unidades de ${productName} al inventario de ventas.`
            : `Autorizacion rechazada para mover ${Number(quantity || 0).toLocaleString()} unidades de ${productName}.`
        });
      }
    });

    Object.keys(movementMap).forEach((productId) => {
      movementMap[productId] = movementMap[productId]
        .sort((a, b) => new Date(b?.timestamp || 0) - new Date(a?.timestamp || 0))
        .slice(0, 200);
    });
    return movementMap;
  }, [sales, products, logs]);

  useEffect(() => {
    const productId = String(preselectedProductId || '').trim();
    if (!productId) return;
    const movementList = productMovementsById[productId] || [];
    const productName = products.find((p) => String(p.id) === productId)?.name || 'Producto';
    const sourceInvoice = (sales || [])
      .find((invoice) => (invoice?.items || []).some((it) => String(getItemProductId(it)) === productId));
    setProductMovementView({
      productId,
      productName,
      invoiceCode: sourceInvoice ? getInvoiceCode(sourceInvoice) : 'N/A',
      movements: movementList
    });
    setPreselectedProductId?.('');
  }, [preselectedProductId, productMovementsById, products, sales]);

  const handleDelete = (invoice) => {
    const code = getInvoiceCode(invoice);
    if (!isAdmin) return alert('Solo el administrador puede eliminar facturas.');
    if (confirm(`Seguro de eliminar la factura ${code}? El stock sera devuelto.`)) {
      onDeleteInvoice?.(invoice);
    }
    setOpenInvoiceMenuId(null);
  };

  const handleCancel = (invoice) => {
    if (!isAdmin) return alert('Solo administrador puede anular.');
    const reason = String(prompt('Motivo de anulacion (obligatorio):') || '').trim();
    if (reason.length < 10) return alert('Debe ingresar un motivo minimo de 10 caracteres.');
    onCancelInvoice?.(invoice, reason);
    setOpenInvoiceMenuId(null);
  };

  const handleReturn = (invoice) => {
    const mode = String(prompt('Tipo de devolucion: DINERO o CAMBIO') || '').trim().toUpperCase();
    if (!['DINERO', 'CAMBIO'].includes(mode)) return alert('Tipo invalido. Use DINERO o CAMBIO.');
    const reason = String(prompt('Motivo de devolucion (obligatorio):') || '').trim();
    if (reason.length < 10) return alert('Debe ingresar un motivo minimo de 10 caracteres.');
    onReturnInvoice?.(invoice, mode, reason);
    setOpenInvoiceMenuId(null);
  };

  const handlePrint = (invoice, mode = '58mm') => {
    const code = getInvoiceCode(invoice);
    printInvoiceDocument(invoice, mode);
    onLog?.({ module: 'Historial', action: 'Reimpresion', details: `Factura ${code} reimpresa (${mode})` });
    setOpenInvoiceMenuId(null);
  };

  const handlePreview = (invoice) => {
    setPreviewInvoice(invoice);
    const code = getInvoiceCode(invoice);
    onLog?.({ module: 'Historial', action: 'Vista Previa', details: `Vista previa factura ${code}` });
    setOpenInvoiceMenuId(null);
  };

  const openProductMovements = (invoice, item) => {
    const productId = getItemProductId(item);
    const movementList = productMovementsById[String(productId || '')] || [];
    const productName = item?.name || products.find((p) => String(p.id) === String(productId))?.name || 'Producto';

    setProductMovementView({
      productId: String(productId || ''),
      productName,
      invoiceCode: getInvoiceCode(invoice),
      movements: movementList
    });
    setOpenProductMenuId(null);
  };

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

  const getInvoiceStatusMeta = (invoice) => {
    const normalizedStatus = String(invoice?.status || 'pagado').trim().toLowerCase();
    if (normalizedStatus === 'anulada') {
      return {
        label: 'ANULADO',
        color: '#b91c1c',
        bg: '#fef2f2',
        details: invoice?.mixedDetails?.cancellation || null,
      };
    }
    if (normalizedStatus === 'devuelta') {
      return {
        label: 'DEVOLUCION',
        color: '#0369a1',
        bg: '#eff6ff',
        details: invoice?.mixedDetails?.returnData || null,
      };
    }
    return null;
  };

  const productMovementSummary = useMemo(() => {
    const movements = productMovementView?.movements || [];
    return movements.reduce((acc, movement) => {
      const qty = Number(movement?.quantity);
      if (!Number.isFinite(qty)) return acc;
      if (movement?.direction === 'in') acc.entries += qty;
      if (movement?.direction === 'out') acc.exits += Math.abs(qty);
      return acc;
    }, { entries: 0, exits: 0 });
  }, [productMovementView]);

  const renderInvoiceStatusBadge = (invoice) => {
    const statusMeta = getInvoiceStatusMeta(invoice);
    if (!statusMeta) {
      return <span className="badge">{String(invoice?.status || 'pagado')}</span>;
    }

    return (
      <span
        className="badge"
        style={{
          backgroundColor: statusMeta.bg,
          color: statusMeta.color,
          border: `1px solid ${statusMeta.color}`,
          fontWeight: 800,
          letterSpacing: '0.4px',
        }}
      >
        {statusMeta.label}
      </span>
    );
  };

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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr)', gap: '0.75rem', marginTop: '0.75rem' }}>
          <input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
              {movementPagination.totalItems === 0 ? (
                <tr><td colSpan="4" style={{ padding: '0.75rem', textAlign: 'center' }}>Sin movimientos para el filtro actual.</td></tr>
              ) : (
                movementPagination.pageItems.map((log, index) => (
                  <tr key={`${log?.timestamp || index}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem' }}>{log?.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}</td>
                    <td style={{ padding: '0.5rem' }}>{log?.user_name || log?.user || 'Sistema'}</td>
                    <td style={{ padding: '0.5rem' }}>{log?.action || 'N/A'}</td>
                    <td style={{ padding: '0.5rem' }}>{log?.details || ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={movementPagination.page}
          totalPages={movementPagination.totalPages}
          totalItems={movementPagination.totalItems}
          pageSize={movementPagination.pageSize}
          onPageChange={movementPagination.setPage}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>Historial de Facturas</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className={`btn ${invoiceScope === 'mine' ? 'btn-primary' : ''}`} onClick={() => setInvoiceScope('mine')}>
            Mis facturas
          </button>
          {isAdmin && (
            <button className={`btn ${invoiceScope === 'all' ? 'btn-primary' : ''}`} onClick={() => setInvoiceScope('all')}>
              Todas
            </button>
          )}
          <input
            type="text"
            className="input-field"
            placeholder="Buscar por factura o cliente..."
            style={{ maxWidth: '300px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <select className="input-field" value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)}>
            <option value="">Todos los asesores</option>
            {advisorOptions.map((advisor) => (
              <option key={advisor} value={advisor}>{advisor}</option>
            ))}
          </select>
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
            {paymentOptions.map((payment) => (
              <option key={payment} value={payment}>{payment}</option>
            ))}
          </select>
          <input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
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
              {salesPagination.totalItems === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>No se encontraron ventas</td></tr>
              ) : (
                salesPagination.pageItems.map((s) => {
                  const invoiceKey = getInvoiceKey(s);
                  const invoiceMenuOpen = openInvoiceMenuId === invoiceKey;
                  return (
                    <tr key={invoiceKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 'bold' }}>#{getInvoiceCode(s)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(s.date).toLocaleString()}</div>
                      </td>
                      <td style={{ padding: '1rem' }}>{s.clientName || 'Cliente Ocasional'}</td>
                      <td style={{ padding: '1rem' }}>{getInvoiceUser(s)}</td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontSize: '0.85rem', display: 'grid', gap: '0.2rem' }}>
                          {(s.items || []).map((it, idx) => {
                            const productMenuId = `${invoiceKey}-${idx}`;
                            const isOpen = openProductMenuId === productMenuId;
                            return (
                              <div key={`${productMenuId}-${it?.id || it?.name || 'item'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                                <span>{it.name} x{it.quantity}</span>
                                <div data-menu-root="1" style={{ position: 'relative' }}>
                                  <button
                                    className="btn"
                                    style={{ padding: '0 6px', lineHeight: 1, minHeight: '22px' }}
                                    title="Opciones del producto"
                                    onClick={() => setOpenProductMenuId((prev) => (prev === productMenuId ? null : productMenuId))}
                                  >
                                    {'\u22EE'}
                                  </button>
                                  {isOpen && (
                                    <div className="card" style={{ position: 'absolute', right: 0, top: '105%', minWidth: '190px', zIndex: 20, padding: '0.4rem' }}>
                                      <button className="btn" style={{ width: '100%' }} onClick={() => openProductMovements(s, it)}>
                                        Ver movimientos del producto
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span className="badge">{s.paymentMode}</span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {renderInvoiceStatusBadge(s)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                        ${Number(s.total || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div data-menu-root="1" style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            className="btn"
                            style={{ padding: '4px 10px' }}
                            title="Opciones de la factura"
                            onClick={() => setOpenInvoiceMenuId((prev) => (prev === invoiceKey ? null : invoiceKey))}
                          >
                            {'\u22EE'}
                          </button>
                          {invoiceMenuOpen && (
                            <div className="card" style={{ position: 'absolute', right: 0, top: '105%', minWidth: '220px', zIndex: 30, padding: '0.4rem' }}>
                              <button className="btn" style={{ width: '100%', marginBottom: '0.3rem' }} onClick={() => handlePreview(s)}>Ver factura</button>
                              <button className="btn" style={{ width: '100%', marginBottom: '0.3rem' }} onClick={() => handlePrint(s, '58mm')}>Imprimir 58mm</button>
                              <button className="btn" style={{ width: '100%', marginBottom: '0.3rem' }} onClick={() => handlePrint(s, 'a4')}>Imprimir A4</button>
                              {isAdmin && !['anulada', 'devuelta'].includes(String(s?.status || '').toLowerCase()) && (
                                <>
                                  <button className="btn" style={{ width: '100%', marginBottom: '0.3rem', borderColor: '#b45309', color: '#b45309' }} onClick={() => handleCancel(s)}>Anular</button>
                                  <button className="btn" style={{ width: '100%', marginBottom: '0.3rem', borderColor: '#0369a1', color: '#0369a1' }} onClick={() => handleReturn(s)}>Devolver</button>
                                </>
                              )}
                              {isAdmin && (
                                <button className="btn" style={{ width: '100%', color: '#e11d48', borderColor: '#e11d48' }} onClick={() => handleDelete(s)}>Eliminar</button>
                              )}
                            </div>
                          )}
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
          page={salesPagination.page}
          totalPages={salesPagination.totalPages}
          totalItems={salesPagination.totalItems}
          pageSize={salesPagination.pageSize}
          onPageChange={salesPagination.setPage}
        />
      </div>

      {productMovementView && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1250,
          padding: '1rem'
        }}>
          <div className="card" style={{ width: 'min(980px, 100%)', maxHeight: '88vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Movimientos del producto</h3>
                <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                  {productMovementView.productName} ({productMovementView.productId || 'sin id'}) - Desde factura #{productMovementView.invoiceCode}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.88rem' }}>
                  <span><strong>Entradas:</strong> {productMovementSummary.entries.toLocaleString()}</span>
                  <span><strong>Salidas:</strong> {productMovementSummary.exits.toLocaleString()}</span>
                  <span><strong>Balance:</strong> {(productMovementSummary.entries - productMovementSummary.exits).toLocaleString()}</span>
                </div>
              </div>
              <button className="btn" onClick={() => setProductMovementView(null)}>Cerrar</button>
            </div>

            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Fecha</th>
                    <th style={{ padding: '0.5rem' }}>Tipo</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Cantidad</th>
                    <th style={{ padding: '0.5rem' }}>Factura</th>
                    <th style={{ padding: '0.5rem' }}>Usuario</th>
                    <th style={{ padding: '0.5rem' }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {productMovementPagination.totalItems === 0 ? (
                    <tr><td colSpan="6" style={{ padding: '0.75rem', textAlign: 'center' }}>Sin movimientos detectados para este producto.</td></tr>
                  ) : (
                    productMovementPagination.pageItems.map((mv, idx) => {
                      const qty = Number(mv?.quantity);
                      const qtyLabel = Number.isFinite(qty)
                        ? `${qty > 0 ? '+' : ''}${qty.toLocaleString()}`
                        : 'N/A';
                      const qtyColor = mv?.direction === 'in' ? '#15803d' : mv?.direction === 'out' ? '#b91c1c' : '#334155';
                      return (
                        <tr key={`${mv?.timestamp || idx}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.5rem' }}>{mv?.timestamp ? new Date(mv.timestamp).toLocaleString() : 'N/A'}</td>
                          <td style={{ padding: '0.5rem' }}>{mv?.type || 'Movimiento'}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', color: qtyColor, fontWeight: 700 }}>{qtyLabel}</td>
                          <td style={{ padding: '0.5rem' }}>{mv?.invoiceCode ? `#${mv.invoiceCode}` : 'N/A'}</td>
                          <td style={{ padding: '0.5rem' }}>{mv?.user || 'Sistema'}</td>
                          <td style={{ padding: '0.5rem' }}>{mv?.details || ''}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={productMovementPagination.page}
              totalPages={productMovementPagination.totalPages}
              totalItems={productMovementPagination.totalItems}
              pageSize={productMovementPagination.pageSize}
              onPageChange={productMovementPagination.setPage}
            />
          </div>
        </div>
      )}

      {previewInvoice && (
        (() => {
          const discount = getDiscountInfo(previewInvoice);
          const authorization = getAuthorizationInfo(previewInvoice);
          const statusMeta = getInvoiceStatusMeta(previewInvoice);
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
                  <div><strong>Fecha:</strong> {previewInvoice?.date ? new Date(previewInvoice.date).toLocaleString() : 'N/A'}</div>
                  <div><strong>Cliente:</strong> {previewInvoice?.clientName || 'Cliente Ocasional'}</div>
                  <div><strong>Documento:</strong> {previewInvoice?.clientDoc || 'N/A'}</div>
                  <div><strong>Usuario:</strong> {getInvoiceUser(previewInvoice)}</div>
                  <div><strong>Pago:</strong> {previewInvoice?.paymentMode || 'N/A'}</div>
                  <div><strong>Total:</strong> ${Number(previewInvoice?.total || 0).toLocaleString()}</div>
                </div>

                {statusMeta && (
                  <div className="card" style={{ marginBottom: '0.75rem', border: `2px solid ${statusMeta.color}`, backgroundColor: statusMeta.bg }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: statusMeta.color, letterSpacing: '1px' }}>{statusMeta.label}</div>
                    {statusMeta.details?.mode && <div><strong>Tipo:</strong> {statusMeta.details.mode}</div>}
                    {statusMeta.details?.at && <div><strong>Fecha:</strong> {new Date(statusMeta.details.at).toLocaleString()}</div>}
                    {statusMeta.details?.by && <div><strong>Responsable:</strong> {statusMeta.details.by}</div>}
                    {statusMeta.details?.reason && <div><strong>Motivo:</strong> {statusMeta.details.reason}</div>}
                    {Number(statusMeta.details?.refundedCash || 0) > 0 && (
                      <div><strong>Reintegro caja:</strong> ${Number(statusMeta.details.refundedCash || 0).toLocaleString()}</div>
                    )}
                  </div>
                )}

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
                  <div className="card card--muted" style={{ marginTop: '0.75rem' }}>
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
                  <div className="card card--muted" style={{ marginTop: '0.75rem' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Abonos de cartera</div>
                    {previewInvoice.abonos.slice(0, 10).map((a, idx) => (
                      <div key={`${a?.id || idx}-${idx}`} style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                        {a?.date ? new Date(a.date).toLocaleString() : 'N/A'} - ${Number(a?.amount || 0).toLocaleString()} - {a?.method || 'N/A'} {a?.reference ? `(${a.reference})` : ''}
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
