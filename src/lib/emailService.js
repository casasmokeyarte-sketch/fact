import emailjs from '@emailjs/browser';

// EmailJS Configuration
const EMAILJS_SERVICE_ID = 'service_abc1234';
const EMAILJS_TEMPLATE_ID = 'template_cbpwifd';
const EMAILJS_PUBLIC_KEY = 'T1dgk5mYlhlkBiu8q';

// Initialize EmailJS
export const initEmailJS = () => {
  emailjs.init(EMAILJS_PUBLIC_KEY);
};

// Send invoice email
export const sendInvoiceEmail = async (invoiceData, clientEmail) => {
  try {
    const templateParams = {
      user_email: clientEmail,
      from_name: 'CASA SMOKE Y ARTE',
      client_name: invoiceData.clientName,
      invoice_number: invoiceData.id,
      invoice_date: new Date(invoiceData.date).toLocaleDateString('es-CO'),
      total: `$${invoiceData.total.toLocaleString()}`,
      subtotal: `$${invoiceData.subtotal.toLocaleString()}`,
      delivery_fee: `$${invoiceData.deliveryFee.toLocaleString()}`,
      payment_mode: invoiceData.paymentMode,
      company_name: 'CASA SMOKE Y ARTE',
      company_nit: '900.123.456-7',
      company_phone: '+57 300 123 4567',
      company_address: 'Calle 123 #45-67, BogotA',
      items_html: generateItemsHTML(invoiceData.items),
      message: `Factura #${invoiceData.id} por un total de $${invoiceData.total.toLocaleString()}`
    };

    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      templateParams,
      EMAILJS_PUBLIC_KEY
    );

    return { success: true, response };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
};

// Generate HTML table for invoice items
const generateItemsHTML = (items) => {
  if (!items || items.length === 0) return '<p>No hay items</p>';

  let html = `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Producto</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Cant.</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Precio</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  items.forEach(item => {
    html += `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${item.name}${item.isGift ? ' <span style="color: #dc2626;">(REGALO)</span>' : ''}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.quantity}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${item.price.toLocaleString()}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${item.total.toLocaleString()}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  return html;
};
