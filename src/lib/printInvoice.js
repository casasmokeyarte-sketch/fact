import JsBarcode from 'jsbarcode';
import { COMPANY_INFO } from '../constants';
import { getAssetUrl } from './runtime.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildShippingGuideNumber(invoice) {
  const stored = String(
    invoice?.shippingGuideNumber ||
    invoice?.mixedDetails?.shippingGuide?.number ||
    ''
  ).trim();
  if (stored) return stored;

  const invoiceCode = String(
    invoice?.invoiceCode ||
    invoice?.mixedDetails?.invoiceCode ||
    invoice?.mixedDetails?.invoice_code ||
    invoice?.id ||
    'SN'
  ).trim().replace(/\s+/g, '');

  return `GE-${invoiceCode || 'SN'}`;
}

function getShippingPaymentStatus(invoice, override) {
  const normalizedOverride = String(override || '').trim().toLowerCase();
  if (normalizedOverride === 'pagado' || normalizedOverride === 'pendiente') return normalizedOverride;

  const normalizedStatus = String(invoice?.status || '').trim().toLowerCase();
  if (normalizedStatus === 'pendiente') return 'pendiente';
  if (Number(invoice?.balance || 0) > 0) return 'pendiente';

  const paymentMode = String(invoice?.paymentMode || '').trim().toLowerCase();
  if (paymentMode.includes('credito') || paymentMode.includes('crédito')) return 'pendiente';

  return 'pagado';
}

function buildBarcodeSvgMarkup(value) {
  if (typeof document === 'undefined') return '';

  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, String(value || 'SIN-CODIGO'), {
      format: 'CODE128',
      displayValue: true,
      fontSize: 14,
      height: 52,
      margin: 0,
      width: 1.6,
    });
    return svg.outerHTML;
  } catch {
    return `<div style="font-weight:700; letter-spacing:1px;">${escapeHtml(value || 'SIN-CODIGO')}</div>`;
  }
}

export function printShippingGuideDocument(invoice, options = {}) {
  const guideNumber = buildShippingGuideNumber(invoice);
  const barcodeMarkup = buildBarcodeSvgMarkup(guideNumber);
  const paymentStatus = getShippingPaymentStatus(invoice, options.paymentStatus);
  const isPaid = paymentStatus === 'pagado';
  const invoiceCode = String(
    invoice?.invoiceCode ||
    invoice?.mixedDetails?.invoiceCode ||
    invoice?.mixedDetails?.invoice_code ||
    invoice?.id ||
    'N/A'
  );
  const invoiceDate = invoice?.date ? new Date(invoice.date) : new Date();
  const invoiceUser = String(
    invoice?.user_name ||
    invoice?.user ||
    invoice?.mixedDetails?.user_name ||
    invoice?.mixedDetails?.user ||
    'Sistema'
  );
  const senderName = String(
    options.senderName ||
    invoice?.senderName ||
    invoice?.mixedDetails?.shippingGuide?.senderName ||
    invoiceUser ||
    'No registrado'
  ).trim() || 'No registrado';
  const senderDocument = String(
    options.senderDocument ||
    invoice?.senderDocument ||
    invoice?.mixedDetails?.shippingGuide?.senderDocument ||
    'N/A'
  ).trim() || 'N/A';
  const senderPhone = String(
    options.senderPhone ||
    invoice?.senderPhone ||
    invoice?.mixedDetails?.shippingGuide?.senderPhone ||
    COMPANY_INFO.phone ||
    'No registrado'
  ).trim() || 'No registrado';
  const senderAddress = String(
    options.senderAddress ||
    invoice?.senderAddress ||
    invoice?.mixedDetails?.shippingGuide?.senderAddress ||
    COMPANY_INFO.address ||
    'No registrado'
  ).trim() || 'No registrado';

  const recipientName = String(
    options.recipientName ||
    invoice?.clientName ||
    invoice?.client_name ||
    'Cliente Ocasional'
  ).trim() || 'Cliente Ocasional';
  const recipientDocument = String(
    options.recipientDocument ||
    invoice?.clientDoc ||
    invoice?.client_doc ||
    'N/A'
  ).trim() || 'N/A';
  const recipientAddress = String(
    options.recipientAddress ||
    invoice?.shippingAddress ||
    invoice?.address ||
    invoice?.clientAddress ||
    invoice?.mixedDetails?.shippingGuide?.address ||
    'Direccion pendiente por registrar'
  ).trim();
  const recipientPhone = String(
    options.recipientPhone ||
    invoice?.phone ||
    invoice?.clientPhone ||
    invoice?.mixedDetails?.shippingGuide?.phone ||
    'No registrado'
  ).trim();
  const packageCount = Math.max(1, Number(options.packageCount ?? invoice?.mixedDetails?.shippingGuide?.packageCount ?? 1) || 1);
  const productItems = Array.isArray(invoice?.items) ? invoice.items : [];
  const productSummary = productItems
    .map((item) => `${item?.name || 'Producto'} x${Number(item?.quantity || 0)}`)
    .join(', ');
  const declaredContent = String(
    options.declaredContent ||
    invoice?.mixedDetails?.shippingGuide?.declaredContent ||
    productSummary ||
    'Mercancia segun factura'
  ).trim();
  const emergencyNote = String(
    options.emergencyNote ||
    options.notes ||
    invoice?.mixedDetails?.shippingGuide?.emergencyNote ||
    invoice?.mixedDetails?.shippingGuide?.notes ||
    ''
  ).trim();
  const amountToCollect = isPaid ? 0 : Math.max(0, Number(options.amountToCollect ?? invoice?.balance ?? invoice?.total ?? 0));
  const policyLines = [
    'Verifique que el paquete este sellado antes de entregarlo.',
    'No entregar a terceros sin validacion del destinatario.',
    'Si el envio va pendiente, recaudar el valor indicado antes de la entrega.',
    'Registrar novedad si el destinatario rechaza, reprograma o no se ubica.',
  ];
  const logoUrl = getAssetUrl(COMPANY_INFO.logo);
  const copies = [
    { title: 'Copia paquete' },
    { title: 'Copia control' },
  ];

  const popup = window.open('', '_blank', 'width=1200,height=900');
  if (!popup) {
    alert('Permita ventanas emergentes para imprimir la guia de envio.');
    return;
  }

  const cardsHtml = copies.map((copy) => `
    <section class="guide-card">
      <div class="guide-topbar">
        <div>
          <div class="mini-label">GUIA DE ENVIO</div>
          <div class="guide-number">${escapeHtml(guideNumber)}</div>
        </div>
        <div class="copy-tag">${escapeHtml(copy.title)}</div>
      </div>

      <div class="company-box">
        <img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo" />
        <div>
          <div class="company-name">${escapeHtml(COMPANY_INFO.name)}</div>
          <div>NIT: ${escapeHtml(COMPANY_INFO.nit)}</div>
          <div>${escapeHtml(COMPANY_INFO.address)}</div>
          <div>Tel: ${escapeHtml(COMPANY_INFO.phone)}</div>
        </div>
      </div>

      <div class="status-row">
        <div class="status-pill ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'PAGADO' : 'PENDIENTE POR COBRAR'}</div>
        <div class="meta-chip">Factura: ${escapeHtml(invoiceCode)}</div>
        <div class="meta-chip">Fecha: ${escapeHtml(invoiceDate.toLocaleDateString())}</div>
      </div>

      <div class="two-col">
        <div class="box">
          <div class="box-title">Destinatario</div>
          <div><strong>${escapeHtml(recipientName)}</strong></div>
          <div>Documento: ${escapeHtml(recipientDocument)}</div>
          <div>Direccion: ${escapeHtml(recipientAddress)}</div>
          <div>Telefono: ${escapeHtml(recipientPhone)}</div>
        </div>
        <div class="box">
          <div class="box-title">Datos del envio</div>
          <div>Remite: ${escapeHtml(senderName)}</div>
          <div>Documento: ${escapeHtml(senderDocument)}</div>
          <div>Telefono: ${escapeHtml(senderPhone)}</div>
          <div>Direccion: ${escapeHtml(senderAddress)}</div>
          <div>Asesor sistema: ${escapeHtml(invoiceUser)}</div>
          <div>Bultos: ${packageCount}</div>
          <div>Total factura: $${Number(invoice?.total || 0).toLocaleString('es-CO')}</div>
          <div>Valor a recaudar: $${amountToCollect.toLocaleString('es-CO')}</div>
        </div>
      </div>

      <div class="box product-box" style="margin-top: 8px;">
        <div class="box-title">Productos comprados</div>
        ${productItems.length > 0 ? `
          <table class="items-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
              </tr>
            </thead>
            <tbody>
              ${productItems.slice(0, 8).map((item) => `
                <tr>
                  <td>${escapeHtml(item?.name || 'Producto')}</td>
                  <td>${Number(item?.quantity || 0).toLocaleString('es-CO')}</td>
                </tr>
              `).join('')}
              ${productItems.length > 8 ? `
                <tr>
                  <td colspan="2">+${productItems.length - 8} producto(s) adicional(es)</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        ` : `<div>Mercancia segun factura</div>`}
      </div>

      <div class="two-col compact-row" style="margin-top: 8px;">
        <div class="box">
          <div class="box-title">Contenido declarado</div>
          <div>${escapeHtml(declaredContent)}</div>
        </div>
        <div class="box note-box">
          <div class="box-title">Nota / emergencia</div>
          <div>${emergencyNote ? escapeHtml(emergencyNote) : '&nbsp;'}</div>
        </div>
      </div>

      <div class="box" style="margin-top: 10px;">
        <div class="box-title">Codigo de guia</div>
        <div class="barcode-box">
          ${barcodeMarkup}
        </div>
      </div>

      <div class="two-col compact-row" style="margin-top: 8px;">
        <div class="box policy-box">
          <div class="box-title">Politicas operativas</div>
          <ul>
            ${policyLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
          </ul>
        </div>
        <div class="box signature-box">
          <div class="box-title">Control de entrega</div>
          <div class="signature-line">Recibe: __________________________</div>
          <div class="signature-line">CC/NIT: __________________________</div>
          <div class="signature-line">Fecha: ___________________________</div>
          <div class="signature-line">Observaciones: __________________</div>
        </div>
      </div>
    </section>
  `).join('');

  popup.document.open();
  popup.document.write(`
    <html>
      <head>
        <title>Guia de envio ${escapeHtml(guideNumber)}</title>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #fff; font-size: 11px; }
          .sheet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6mm; align-items: stretch; }
          .guide-card { border: 2px solid #111827; padding: 8px; min-height: 190mm; display: flex; flex-direction: column; }
          .guide-topbar { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 6px; margin-bottom: 7px; }
          .mini-label { font-size: 10px; font-weight: 700; letter-spacing: 1px; }
          .guide-number { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; }
          .copy-tag { font-size: 10px; border: 1px solid #111827; padding: 3px 6px; font-weight: 700; }
          .company-box { display: grid; grid-template-columns: 70px 1fr; gap: 8px; align-items: center; margin-bottom: 7px; }
          .logo { width: 66px; max-height: 44px; object-fit: contain; }
          .company-name { font-size: 13px; font-weight: 800; }
          .status-row { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 7px; }
          .status-pill { padding: 4px 7px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; border: 2px solid #111827; }
          .status-pill.paid { background: #dcfce7; color: #166534; border-color: #166534; }
          .status-pill.pending { background: #fef3c7; color: #92400e; border-color: #92400e; }
          .meta-chip { padding: 4px 7px; background: #f3f4f6; font-size: 10px; border: 1px solid #d1d5db; }
          .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
          .compact-row { flex: 0 0 auto; }
          .box { border: 1px solid #111827; padding: 6px; min-height: 54px; overflow-wrap: anywhere; }
          .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
          .product-box { min-height: 58px; }
          .items-table { width: 100%; border-collapse: collapse; font-size: 10px; }
          .items-table th, .items-table td { border-bottom: 1px solid #d1d5db; padding: 2px 3px; text-align: left; }
          .items-table th:last-child, .items-table td:last-child { width: 44px; text-align: center; }
          .note-box { background: #fff; min-height: 48px; }
          .barcode-box { display: flex; justify-content: center; align-items: center; min-height: 58px; }
          .barcode-box svg { width: 100%; max-height: 58px; }
          ul { margin: 0; padding-left: 14px; font-size: 10px; line-height: 1.28; }
          .policy-box { min-height: 74px; }
          .signature-box { display: flex; flex-direction: column; justify-content: flex-start; }
          .signature-line { margin-top: 7px; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="sheet">${cardsHtml}</div>
        <script>
          setTimeout(() => { window.focus(); window.print(); }, 220);
        </script>
      </body>
    </html>
  `);
  popup.document.close();
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
  const logoUrl = getAssetUrl(COMPANY_INFO.logo);
  const itemsRows = (invoice?.items || [])
    .map((it) => `
      <tr>
        <td>${escapeHtml(it?.name || 'Producto')}</td>
        <td style="text-align:center;">${Number(it?.quantity || 0)}</td>
        <td style="text-align:right;">$${Number(it?.total || 0).toLocaleString('es-CO')}</td>
      </tr>
    `)
    .join('');
  const mixedParts = Array.isArray(invoice?.mixedDetails?.parts) ? invoice.mixedDetails.parts : [];
  const paymentRef = String(
    invoice?.mixedDetails?.payment_reference ||
    invoice?.paymentRef ||
    ''
  ).trim();
  const paymentMethodDetail = String(
    invoice?.mixedDetails?.payment_method_detail ||
    invoice?.mixedDetails?.otherPaymentDetail ||
    ''
  ).trim();
  const automaticDiscountPercent = Number(invoice?.automaticDiscountPercent ?? invoice?.mixedDetails?.discount?.automaticPercent ?? 0);
  const automaticDiscountAmount = Number(invoice?.automaticDiscountAmount ?? invoice?.mixedDetails?.discount?.automaticAmount ?? 0);
  const promoDiscountAmount = Number(invoice?.promoDiscountAmount ?? invoice?.mixedDetails?.discount?.promoAmount ?? 0);
  const promoName = String(
    invoice?.promoName ??
    invoice?.mixedDetails?.discount?.promotion?.name ??
    ''
  ).trim();
  const extraDiscountAmount = Number(invoice?.extraDiscount ?? invoice?.mixedDetails?.discount?.extraAmount ?? 0);
  const totalDiscountAmount = Number(
    invoice?.totalDiscount ??
    invoice?.mixedDetails?.discount?.totalAmount ??
    (automaticDiscountAmount + promoDiscountAmount + extraDiscountAmount)
  );
  const subtotalAmount = Number(invoice?.subtotal ?? 0);
  const deliveryFeeAmount = Number(invoice?.deliveryFee ?? 0);
  const authorization = invoice?.authorization || invoice?.mixedDetails?.authorization || null;
  const normalizedStatus = String(invoice?.status || 'pagado').trim().toLowerCase();
  const isCancelled = normalizedStatus === 'anulada';
  const isReturned = normalizedStatus === 'devuelta';
  const cancellationData = invoice?.mixedDetails?.cancellation || null;
  const returnData = invoice?.mixedDetails?.returnData || null;
  const statusStampLabel = isCancelled ? 'ANULADO' : (isReturned ? 'DEVOLUCION' : '');
  const statusStampColor = isCancelled ? '#b91c1c' : '#0369a1';
  const statusDetailsHtml = isCancelled
    ? `
      <div class="status-note">
        <div><strong>Documento:</strong> ANULADO</div>
        <div><strong>Fecha:</strong> ${escapeHtml(cancellationData?.at ? new Date(cancellationData.at).toLocaleString() : 'N/A')}</div>
        <div><strong>Responsable:</strong> ${escapeHtml(cancellationData?.by || 'N/A')}</div>
        <div><strong>Motivo:</strong> ${escapeHtml(cancellationData?.reason || 'N/A')}</div>
        ${Number(cancellationData?.refundedCash || 0) > 0 ? `<div><strong>Reintegro caja:</strong> $${Number(cancellationData.refundedCash || 0).toLocaleString('es-CO')}</div>` : ''}
      </div>
    `
    : (isReturned
      ? `
        <div class="status-note">
          <div><strong>Documento:</strong> DEVOLUCION</div>
          <div><strong>Tipo:</strong> ${escapeHtml(returnData?.mode || 'N/A')}</div>
          <div><strong>Fecha:</strong> ${escapeHtml(returnData?.at ? new Date(returnData.at).toLocaleString() : 'N/A')}</div>
          <div><strong>Responsable:</strong> ${escapeHtml(returnData?.by || 'N/A')}</div>
          <div><strong>Motivo:</strong> ${escapeHtml(returnData?.reason || 'N/A')}</div>
          ${Number(returnData?.refundedCash || 0) > 0 ? `<div><strong>Reintegro caja:</strong> $${Number(returnData.refundedCash || 0).toLocaleString('es-CO')}</div>` : ''}
        </div>
      `
      : '');

  const mixedDetailsHtml = mixedParts.length > 0
    ? `
      <div class="pay-details">
        <div><strong>Desglose Mixto:</strong></div>
        ${mixedParts.map((part, idx) => {
          const method = String(part?.method || 'N/A');
          const amount = Number(part?.amount || 0).toLocaleString('es-CO');
          const ref = String(part?.reference || '').trim();
          const otherDetail = String(part?.otherDetail || '').trim();
          return `
            <div>
              ${idx + 1}) ${escapeHtml(method)}: $${amount}
              ${ref ? ` | Ref: ${escapeHtml(ref)}` : ''}
              ${otherDetail ? ` | Detalle: ${escapeHtml(otherDetail)}` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `
    : '';

  const singlePaymentExtraHtml = !mixedParts.length && (paymentRef || paymentMethodDetail)
    ? `
      <div class="pay-details">
        ${paymentRef ? `<div><strong>Referencia:</strong> ${escapeHtml(paymentRef)}</div>` : ''}
        ${paymentMethodDetail ? `<div><strong>Detalle medio:</strong> ${escapeHtml(paymentMethodDetail)}</div>` : ''}
      </div>
    `
    : '';

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
          .pay-details { margin-top: 8px; font-size: 11px; color: #374151; }
          .status-stamp {
            margin: 0 auto 10px;
            width: fit-content;
            padding: 6px 18px;
            border: 3px solid ${statusStampColor};
            color: ${statusStampColor};
            font-weight: 800;
            letter-spacing: 2px;
            transform: rotate(-9deg);
            opacity: 0.88;
            font-size: 20px;
          }
          .status-note {
            margin-top: 10px;
            padding: 10px;
            border: 1px dashed ${statusStampColor};
            background: ${isCancelled ? '#fef2f2' : '#eff6ff'};
            color: #1f2937;
            font-size: 11px;
            line-height: 1.45;
          }
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
          ${statusStampLabel ? `<div class="status-stamp">${escapeHtml(statusStampLabel)}</div>` : ''}
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
          ${mixedDetailsHtml}
          ${singlePaymentExtraHtml}
          <div class="pay-details">
            <div><strong>Subtotal:</strong> $${subtotalAmount.toLocaleString('es-CO')}</div>
            <div><strong>Domicilio:</strong> $${deliveryFeeAmount.toLocaleString('es-CO')}</div>
            ${automaticDiscountAmount > 0 ? `<div><strong>Desc. cliente (${automaticDiscountPercent}%):</strong> -$${automaticDiscountAmount.toLocaleString('es-CO')}</div>` : ''}
            ${promoDiscountAmount > 0 ? `<div><strong>Promo${promoName ? ` (${escapeHtml(promoName)})` : ''}:</strong> -$${promoDiscountAmount.toLocaleString('es-CO')}</div>` : ''}
            ${extraDiscountAmount > 0 ? `<div><strong>Desc. extra:</strong> -$${extraDiscountAmount.toLocaleString('es-CO')}</div>` : ''}
            <div><strong>Descuento total:</strong> -$${totalDiscountAmount.toLocaleString('es-CO')}</div>
          </div>
          ${authorization?.required ? `
            <div class="pay-details">
              <div><strong>Autorizacion:</strong> ${escapeHtml(authorization?.reasonLabel || authorization?.reasonType || 'Manual')}</div>
              <div><strong>Estado:</strong> ${escapeHtml(authorization?.status || 'N/A')}</div>
              <div><strong>Aprobado por:</strong> ${escapeHtml(authorization?.approvedBy?.name || 'No registrado')}</div>
            </div>
          ` : ''}
          ${statusDetailsHtml}
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
