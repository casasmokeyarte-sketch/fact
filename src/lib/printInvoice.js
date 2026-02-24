import { COMPANY_INFO } from '../constants';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printInvoiceDocument(invoice, mode = '58mm') {
  const safeMode = mode === 'a4' ? 'a4' : '58mm';
  const invoiceCode = String(
    invoice?.invoiceCode ||
    invoice?.mixedDetails?.invoiceCode ||
    invoice?.mixedDetails?.invoice_code ||
    invoice?.id ||
    'N/A'
  );
  const invoiceUser = String(
    invoice?.user_name ||
    invoice?.user ||
    invoice?.mixedDetails?.user_name ||
    invoice?.mixedDetails?.user ||
    'Sistema'
  );
  const logoUrl = new URL(COMPANY_INFO.logo, window.location.origin).href;
  const itemsRows = (invoice?.items || [])
    .map((it) => `
      <tr>
        <td>${escapeHtml(it?.name || 'Producto')}</td>
        <td style="text-align:center;">${Number(it?.quantity || 0)}</td>
        <td style="text-align:right;">$${Number(it?.total || 0).toLocaleString('es-CO')}</td>
      </tr>
    `)
    .join('');

  const popup = window.open('', '_blank', 'width=1000,height=780');
  if (!popup) {
    alert('Permita ventanas emergentes para imprimir.');
    return;
  }

  const pageCss = safeMode === 'a4'
    ? `
      @page { size: A4 portrait; margin: 12mm; }
      body { width: auto; margin: 0; padding: 0; }
      .doc { max-width: 760px; margin: 0 auto; }
      th, td { font-size: 13px; }
      .total { font-size: 20px; }
    `
    : `
      @page { size: 58mm auto; margin: 0; }
      body { width: 58mm; margin: 0 auto; padding: 2mm 1.5mm; }
      .doc { width: 58mm; margin: 0 auto; }
      .logo { max-width: 34mm !important; }
      th, td { font-size: 10px; padding: 3px 2px !important; }
      .meta, .company, .footer { font-size: 9px !important; }
      .total { font-size: 16px; }
    `;

  popup.document.open();
  popup.document.write(`
    <html>
      <head>
        <title>Factura ${escapeHtml(invoiceCode)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111827; }
          .doc { border: 1px solid #e5e7eb; padding: 10px; }
          .head { text-align: center; border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 10px; }
          .logo { max-width: 90px; margin-bottom: 6px; }
          .company { font-size: 11px; line-height: 1.2; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 6px; font-size: 12px; }
          th { text-align: left; background: #f9fafb; }
          .total { text-align: right; margin-top: 10px; font-weight: 700; }
          .footer { margin-top: 12px; font-size: 10px; color: #4b5563; text-align: center; }
          ${pageCss}
        </style>
      </head>
      <body>
        <div class="doc">
          <div class="head">
            <img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo" />
            <div class="company"><strong>${escapeHtml(COMPANY_INFO.name)}</strong></div>
            <div class="company">NIT: ${escapeHtml(COMPANY_INFO.nit)}</div>
            <div class="company">${escapeHtml(COMPANY_INFO.address)}</div>
            <div class="company">Tel: ${escapeHtml(COMPANY_INFO.phone)} | ${escapeHtml(COMPANY_INFO.email)}</div>
          </div>
          <div class="meta">
            <div>
              <div><strong>Consecutivo:</strong> ${escapeHtml(invoiceCode)}</div>
              <div><strong>Fecha:</strong> ${escapeHtml(new Date(invoice?.date || Date.now()).toLocaleString())}</div>
            </div>
            <div>
              <div><strong>Cliente:</strong> ${escapeHtml(invoice?.clientName || 'Cliente Ocasional')}</div>
              <div><strong>Documento:</strong> ${escapeHtml(invoice?.clientDoc || 'N/A')}</div>
              <div><strong>Pago:</strong> ${escapeHtml(invoice?.paymentMode || 'N/A')}</div>
              <div><strong>Atendio:</strong> ${escapeHtml(invoiceUser)}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th style="text-align:center;">Cant.</th>
                <th style="text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>
          <div class="total">TOTAL: $${Number(invoice?.total || 0).toLocaleString('es-CO')}</div>
          <div class="footer">Gracias por su compra</div>
        </div>
        <script>
          setTimeout(() => { window.focus(); window.print(); }, 180);
        </script>
      </body>
    </html>
  `);
  popup.document.close();
}
