/**
 * src/lib/feRepresentation.js
 * Utilidades para construir e imprimir la representacion grafica
 * de Facturacion Electronica (DIAN) con QR.
 */

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-CO');
}

export function buildDianQrImageUrl(qrPayload) {
  const safePayload = String(qrPayload || '').trim();
  if (!safePayload) return '';
  return `https://quickchart.io/qr?size=280&text=${encodeURIComponent(safePayload)}`;
}

export function buildFeRepresentationHtml({ document, invoice, settings }) {
  const doc = document || {};
  const inv = invoice || {};
  const cfg = settings || {};

  const invoiceNumber = `${doc.prefix || ''}${doc.sequence_number || ''}` || '-';
  const qrUrl = buildDianQrImageUrl(doc.qr_payload);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Factura Electronica ${escapeHtml(invoiceNumber)}</title>
  <style>
    body { font-family: "Segoe UI", Tahoma, sans-serif; margin: 24px; color: #0f172a; }
    .header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .card { border: 1px solid #dbe3ef; border-radius: 10px; padding: 14px; margin-top: 14px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
    .label { font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.03em; }
    .value { font-size: 14px; font-weight: 600; }
    .mono { font-family: Consolas, "Courier New", monospace; word-break: break-all; }
    .qr { width: 200px; height: 200px; border: 1px solid #dbe3ef; border-radius: 8px; object-fit: contain; }
    .muted { color: #64748b; font-size: 12px; }
    @media print { body { margin: 8mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2 style="margin:0">Factura Electronica DIAN</h2>
      <div class="muted">Software Propio</div>
      <div style="margin-top:8px" class="value">${escapeHtml(cfg.issuer_legal_name || 'Emisor')}</div>
      <div class="muted">NIT: ${escapeHtml(cfg.issuer_nit || '-')}</div>
      <div class="muted">Ambiente: ${escapeHtml(cfg.environment || '-')}</div>
    </div>
    <div style="text-align:right">
      ${qrUrl ? `<img class="qr" src="${qrUrl}" alt="QR DIAN" />` : ''}
      <div class="muted" style="margin-top:6px">QR de validacion DIAN</div>
    </div>
  </div>

  <div class="card grid">
    <div>
      <div class="label">Numero FE</div>
      <div class="value">${escapeHtml(invoiceNumber)}</div>
    </div>
    <div>
      <div class="label">Estado</div>
      <div class="value">${escapeHtml(doc.status || '-')}</div>
    </div>
    <div>
      <div class="label">Fecha emision</div>
      <div class="value">${escapeHtml(formatDate(doc.issue_date || inv.date))}</div>
    </div>
    <div>
      <div class="label">Total</div>
      <div class="value">${escapeHtml(formatCurrency(inv.total))}</div>
    </div>
    <div>
      <div class="label">Cliente</div>
      <div class="value">${escapeHtml(inv.client_name || inv.clientName || 'Cliente')}</div>
    </div>
    <div>
      <div class="label">Documento cliente</div>
      <div class="value">${escapeHtml(inv.client_doc || inv.clientDoc || '-')}</div>
    </div>
  </div>

  <div class="card">
    <div class="label">CUFE</div>
    <div class="value mono">${escapeHtml(doc.cufe || '-')}</div>
  </div>

  <div class="card">
    <div class="label">Track ID DIAN</div>
    <div class="value mono">${escapeHtml(doc.dian_track_id || '-')}</div>
  </div>

  <div class="card">
    <div class="label">Payload QR</div>
    <div class="value mono">${escapeHtml(doc.qr_payload || '-')}</div>
  </div>
</body>
</html>`;
}

export function openFeRepresentationPrint(bundle) {
  if (typeof window === 'undefined') {
    throw new Error('La impresion solo esta disponible en el navegador');
  }

  const html = buildFeRepresentationHtml(bundle || {});
  const w = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
  if (!w) throw new Error('No se pudo abrir la ventana de impresion');

  w.document.open();
  w.document.write(html);
  w.document.close();

  setTimeout(() => {
    w.focus();
    w.print();
  }, 250);
}
