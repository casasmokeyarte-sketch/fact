import { COMPANY_INFO } from '../constants';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPageCss(mode) {
  const safeMode = mode === '58mm' ? '58mm' : 'a4';

  if (safeMode === '58mm') {
    return `
      @page { size: 58mm auto; margin: 0; }
      body { width: 58mm; margin: 0 auto; padding: 2mm 1.5mm; }
      .doc { width: 58mm; margin: 0 auto; border: none; padding: 0; }
      .logo { max-width: 34mm !important; }
      .company, .meta, .footer { font-size: 9px !important; }
      h1 { font-size: 13px !important; margin: 6px 0 4px 0 !important; }
      h2, h3, h4 { font-size: 11px !important; }
      table { width: 100% !important; table-layout: fixed; }
      th, td { font-size: 9px !important; padding: 3px 2px !important; word-break: break-word; }
      pre { font-size: 9px !important; }
    `;
  }

  return `
    @page { size: A4 portrait; margin: 12mm; }
    body { width: auto; margin: 0; padding: 0; }
    .doc { max-width: 760px; margin: 0 auto; }
    th, td { font-size: 12px; }
  `;
}

function openPrintWindow(title) {
  const popup = window.open('', '_blank', 'width=1000,height=780');
  if (!popup) return null;
  popup.document.title = title;
  return popup;
}

function printInHiddenIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc || !iframe.contentWindow) {
    iframe.remove();
    alert('No se pudo iniciar impresion en segundo plano.');
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  }, 220);
}

function renderDocument({ title, subtitle, contentHtml, mode }) {
  const logoUrl = new URL(COMPANY_INFO.logo, window.location.origin).href;
  const pageCss = buildPageCss(mode);

  return `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111827; }
          .doc { border: 1px solid #e5e7eb; padding: 10px; }
          .head { text-align: center; border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 10px; }
          .logo { max-width: 90px; margin-bottom: 6px; }
          .company { font-size: 11px; line-height: 1.2; }
          .meta { margin-top: 10px; font-size: 11px; color: #475569; text-align: center; }
          .content table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          .content th, .content td { border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: left; vertical-align: top; }
          .content th { background: #f8fafc; }
          .content pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: 'Courier New', Courier, monospace; }
          .footer { margin-top: 12px; font-size: 10px; color: #4b5563; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
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
            <h1>${escapeHtml(title)}</h1>
            ${subtitle ? `<div class="meta">${escapeHtml(subtitle)}</div>` : ''}
          </div>
          <div class="content">${contentHtml}</div>
          <div class="footer">Impreso el ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <script>
          setTimeout(() => { window.focus(); window.print(); }, 180);
        </script>
      </body>
    </html>
  `;
}

export function printReportHtml({ title, subtitle = '', contentHtml = '', mode = 'a4' }) {
  const html = renderDocument({ title, subtitle, contentHtml, mode });
  const popup = openPrintWindow(title || 'Reporte');
  if (!popup) {
    printInHiddenIframe(html);
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

export function printShiftClosure(shift, mode = '58mm') {
  const shiftDate = shift?.endTime ? new Date(shift.endTime).toLocaleString() : new Date().toLocaleString();
  const safeText = `<pre>${escapeHtml(shift?.reportText || 'Sin detalle de cierre.')}</pre>`;
  printReportHtml({
    title: `Cierre de Jornada #${String(shift?.id || 'N/A')}`,
    subtitle: `Fecha de cierre: ${shiftDate}`,
    contentHtml: safeText,
    mode
  });
}

export function printShiftOpening(shift, mode = '58mm') {
  const shiftDate = shift?.startTime ? new Date(shift.startTime).toLocaleString() : new Date().toLocaleString();
  const safeText = `<pre>${escapeHtml(shift?.openingReportText || 'Sin detalle de apertura.')}</pre>`;
  printReportHtml({
    title: `Apertura de Jornada #${String(shift?.id || 'N/A')}`,
    subtitle: `Fecha de apertura: ${shiftDate}`,
    contentHtml: safeText,
    mode
  });
}

export function printExternalCashReceipt(receipt, mode = 'a4') {
  const receiptDate = receipt?.date ? new Date(receipt.date).toLocaleString() : new Date().toLocaleString();
  const contentHtml = `
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:16px;margin-bottom:18px;">
      <div style="border:1px solid #cbd5e1;padding:14px;">
        <div><strong>Recibido de:</strong> ${escapeHtml(receipt?.thirdPartyName || 'N/A')}</div>
        <div style="margin-top:8px;"><strong>Documento:</strong> ${escapeHtml(receipt?.thirdPartyDocument || 'No informado')}</div>
        <div style="margin-top:8px;"><strong>Concepto:</strong> ${escapeHtml(receipt?.concept || 'Sin concepto')}</div>
      </div>
      <div style="border:1px solid #cbd5e1;padding:14px;">
        <div><strong>Consecutivo:</strong> ${escapeHtml(receipt?.receiptCode || 'N/A')}</div>
        <div style="margin-top:8px;"><strong>Valor:</strong> $${Number(receipt?.amount || 0).toLocaleString('es-CO')}</div>
        <div style="margin-top:8px;"><strong>Forma de pago:</strong> ${escapeHtml(receipt?.paymentMethod || 'N/A')}</div>
        <div style="margin-top:8px;"><strong>Referencia:</strong> ${escapeHtml(receipt?.paymentReference || 'No aplica')}</div>
      </div>
    </div>
    <div style="border:1px solid #cbd5e1;padding:14px;min-height:110px;">
      <strong>Observaciones:</strong>
      <p style="margin:10px 0 0 0;">${escapeHtml(receipt?.notes || 'Sin observaciones adicionales.')}</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:58px;">
      <div style="border-top:1px solid #111827;padding-top:10px;text-align:center;"><strong>Firma quien entrega</strong></div>
      <div style="border-top:1px solid #111827;padding-top:10px;text-align:center;"><strong>Firma tercero</strong></div>
    </div>
  `;

  printReportHtml({
    title: 'Recibo de Caja Externo',
    subtitle: `${String(receipt?.receiptCode || 'N/A')} | Fecha: ${receiptDate}`,
    contentHtml,
    mode
  });
}

export function printExpenseReceipt(expense, mode = 'a4') {
  const expenseDate = expense?.date ? new Date(expense.date).toLocaleString() : new Date().toLocaleString();
  const amount = Number(expense?.amount || 0);
  const paidAmount = Math.max(0, Number(expense?.paidAmount ?? expense?.paid_amount ?? amount));
  const balance = Math.max(0, amount - paidAmount);
  const contentHtml = `
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:16px;margin-bottom:18px;">
      <div style="border:1px solid #cbd5e1;padding:14px;">
        <div><strong>Beneficiario:</strong> ${escapeHtml(expense?.beneficiary || 'No informado')}</div>
        <div style="margin-top:8px;"><strong>Documento:</strong> ${escapeHtml(expense?.docId || expense?.doc_id || 'No informado')}</div>
        <div style="margin-top:8px;"><strong>Tipo:</strong> ${escapeHtml(expense?.type || expense?.category || 'Gasto')}</div>
        <div style="margin-top:8px;"><strong>Descripcion:</strong> ${escapeHtml(expense?.description || 'Sin descripcion')}</div>
      </div>
      <div style="border:1px solid #cbd5e1;padding:14px;">
        <div><strong>Estado:</strong> ${escapeHtml(expense?.status || 'Pagado')}</div>
        <div style="margin-top:8px;"><strong>Total:</strong> $${amount.toLocaleString('es-CO')}</div>
        <div style="margin-top:8px;"><strong>Abonado:</strong> $${paidAmount.toLocaleString('es-CO')}</div>
        <div style="margin-top:8px;"><strong>Saldo:</strong> $${balance.toLocaleString('es-CO')}</div>
        <div style="margin-top:8px;"><strong>Pago:</strong> ${escapeHtml(expense?.paymentMethod || expense?.payment_method || 'No aplica')}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:58px;">
      <div style="border-top:1px solid #111827;padding-top:10px;text-align:center;"><strong>Firma beneficiario</strong></div>
      <div style="border-top:1px solid #111827;padding-top:10px;text-align:center;"><strong>Autorizado por</strong></div>
    </div>
  `;

  printReportHtml({
    title: 'Comprobante de Gasto / Cuenta por Pagar',
    subtitle: `Fecha: ${expenseDate}`,
    contentHtml,
    mode
  });
}
