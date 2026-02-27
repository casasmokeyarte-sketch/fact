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
  if (!popup) {
    alert('Permita ventanas emergentes para imprimir.');
    return null;
  }
  popup.document.title = title;
  return popup;
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
  const popup = openPrintWindow(title || 'Reporte');
  if (!popup) return;
  popup.document.open();
  popup.document.write(renderDocument({ title, subtitle, contentHtml, mode }));
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
