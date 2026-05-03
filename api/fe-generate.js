/**
 * api/fe-generate.js
 * Endpoint Vercel: genera XML UBL 2.1 DIAN + calcula CUFE
 * y persiste el documento en fe_documents.
 *
 * POST /api/fe-generate
 * Authorization: Bearer <supabase_access_token>
 * Body: {
 *   invoice_id: string,   // UUID de la factura en invoices
 *   items_tax: [          // opcional: tasas de IVA por item [{product_id, tax_rate}]
 *     { product_id: string, tax_rate: number }
 *   ]
 * }
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ---------- helpers HTTP --------------------------------------------------

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const raw = String(req.headers?.authorization || '');
  if (!raw.toLowerCase().startsWith('bearer ')) return '';
  return raw.slice(7).trim();
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

// ---------- Supabase ------------------------------------------------------

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAuth(req) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, message: 'Falta token de autorizacion' };
  const sb = getAdminSupabase();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, message: 'Token invalido o expirado' };
  return { ok: true, user: data.user };
}

// ---------- Utilidades numericas ------------------------------------------

function fmt2(n) {
  return Number(n || 0).toFixed(2);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Digito de verificacion NIT
function calcDv(nit) {
  const digits = String(nit).replace(/\D/g, '');
  const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
  const arr = digits.split('').reverse();
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += parseInt(arr[i]) * weights[i];
  const rem = sum % 11;
  return rem < 2 ? rem : 11 - rem;
}

// Codigo tipo documento DIAN: 31=NIT, 13=CC, 22=pasaporte, 42=doc extranjero
function dianDocScheme(docType) {
  const t = String(docType || '').toLowerCase();
  if (t === 'nit' || t === '31') return '31';
  if (t === 'cc' || t === '13') return '13';
  if (t === 'ce' || t === '22') return '22';
  if (t === 'pasaporte') return '22';
  if (t === 'nit_extranjero' || t === '42') return '42';
  // Intenta detectar por longitud
  if (/^\d{9,10}$/.test(String(docType || ''))) return '31';
  return '13';
}

// ---------- CUFE / Software Security Code ---------------------------------

/**
 * CUFE = SHA384(NumFac + FecFac + HorFac + ValFac
 *              + "01" + ValImp1 + "04" + ValImp2 + "03" + ValImp3
 *              + ValTot + NitOFE + NumAdq + ClTec + TipoAmb)
 * Todos los valores monetarios con 2 decimales, sin puntos de miles.
 */
function buildCufe({ numFac, fecFac, horFac, valFac, valImp1, valImp2, valImp3, valTot, nitOFE, numAdq, clTec, tipoAmb }) {
  const s = [
    numFac,
    fecFac,
    horFac,
    fmt2(valFac),
    '01', fmt2(valImp1),
    '04', fmt2(valImp2),
    '03', fmt2(valImp3),
    fmt2(valTot),
    nitOFE,
    numAdq,
    clTec,
    String(tipoAmb),
  ].join('');
  return crypto.createHash('sha384').update(s, 'utf8').digest('hex');
}

/**
 * SoftwareSecurityCode = SHA384(softwareId + softwarePin + sequenceNumber)
 */
function buildSecurityCode(softwareId, softwarePin, sequenceNumber) {
  const s = `${softwareId}${softwarePin}${sequenceNumber}`;
  return crypto.createHash('sha384').update(s, 'utf8').digest('hex');
}

// ---------- URL QR --------------------------------------------------------

function buildQrPayload(cufe, tipoAmb) {
  const baseUrl = tipoAmb === '1'
    ? 'https://catalogo-vpfe.dian.gov.co/document/searchqr'
    : 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr';
  return `${baseUrl}?documentkey=${cufe}`;
}

// ---------- Tipo de medio de pago DIAN ------------------------------------

function dianPaymentMeans(paymentMode) {
  const m = String(paymentMode || '').toLowerCase();
  if (m === 'credito' || m === 'credit') return { code: '1', means: '42', due: true };
  if (m === 'transferencia' || m === 'transfer') return { code: '1', means: '42', due: false };
  if (m === 'tarjeta' || m === 'card') return { code: '1', means: '48', due: false };
  return { code: '1', means: '10', due: false }; // Efectivo por defecto
}

// ---------- Tipo de organizacion ------------------------------------------

function dianOrgType(isNit) {
  return isNit ? '1' : '2';
}

// ---------- Generador XML UBL 2.1 Colombia --------------------------------

function buildInvoiceXml({
  settings,
  resolution,
  invoice,
  items,
  client,
  cufe,
  securityCode,
  qrPayload,
  issueDate,
  issueTime,
  prefix,
  sequenceNumber,
  tipoAmb,
  taxSummary,
}) {
  const {
    issuer_nit: nitOFE,
    issuer_dv: dvOFE,
    issuer_legal_name: nameOFE,
    software_id: softwareId,
  } = settings;

  const invoiceId = `${prefix}${sequenceNumber}`;
  const clientDoc = String(client?.document || client?.client_doc || 'CONSUMIDOR FINAL');
  const clientName = esc(client?.name || client?.client_name || 'Consumidor Final');
  const clientAddress = esc(client?.address || 'Colombia');
  const clientEmail = esc(client?.email || '');
  const clientDocScheme = clientDoc === 'CONSUMIDOR FINAL' ? '13' : dianDocScheme('nit');

  const pm = dianPaymentMeans(invoice.payment_mode);
  const dueDateStr = invoice.due_date
    ? new Date(invoice.due_date).toISOString().slice(0, 10)
    : issueDate;

  const { ivaBase, ivaAmount, incBase, incAmount } = taxSummary;
  const lineCount = items.length;

  // Resolucion
  const resCut = resolution.valid_date_to
    ? new Date(resolution.valid_date_to).toISOString().slice(0, 10)
    : '2030-12-31';
  const resStart = resolution.valid_date_from
    ? new Date(resolution.valid_date_from).toISOString().slice(0, 10)
    : issueDate;

  const subtotal = Number(invoice.subtotal || 0);
  const total = Number(invoice.total || 0);

  // Construye lineas de factura
  const linesXml = items.map((item, idx) => {
    const itemTaxRate = Number(item._taxRate ?? 0);
    const itemBase = Number(item.price || 0) * Number(item.quantity || 1);
    const itemTax = itemTaxRate > 0 ? itemBase * (itemTaxRate / 100) : 0;
    const itemTotal = itemBase + itemTax;
    const taxCode = itemTaxRate > 0 ? '01' : 'ZZ';
    const taxName = itemTaxRate > 0 ? 'IVA' : 'ZZ';
    const taxPercent = itemTaxRate > 0 ? String(itemTaxRate.toFixed(2)) : '0.00';

    return `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="94">${Number(item.quantity || 1)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="COP">${fmt2(itemBase)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="COP">${fmt2(itemTax)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="COP">${fmt2(itemBase)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="COP">${fmt2(itemTax)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>${taxPercent}</cbc:Percent>
            <cac:TaxScheme>
              <cbc:ID>${taxCode}</cbc:ID>
              <cbc:Name>${taxName}</cbc:Name>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Description>${esc(item.name || item.product_name || 'Producto')}</cbc:Description>
        <cac:SellersItemIdentification>
          <cbc:ID>${esc(item.product_id || String(idx + 1))}</cbc:ID>
        </cac:SellersItemIdentification>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="COP">${fmt2(item.price || 0)}</cbc:PriceAmount>
        <cbc:BaseQuantity unitCode="94">1</cbc:BaseQuantity>
      </cac:Price>
    </cac:InvoiceLine>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${esc(resolution.resolution_number)}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${resStart}</cbc:StartDate>
              <cbc:EndDate>${resCut}</cbc:EndDate>
            </sts:AuthorizationPeriod>
            <sts:AuthorizedInvoices>
              <sts:Prefix>${esc(prefix)}</sts:Prefix>
              <sts:From>${resolution.from_number}</sts:From>
              <sts:To>${resolution.to_number}</sts:To>
            </sts:AuthorizedInvoices>
          </sts:InvoiceControl>
          <sts:InvoiceSource>
            <cbc:IdentificationCode listAgencyID="6"
              listAgencyName="United Nations Economic Commission for Europe"
              listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode>
          </sts:InvoiceSource>
          <sts:SoftwareProvider>
            <sts:ProviderID schemeAgencyID="195"
              schemeAgencyName="CO, DIAN (Direcci\u00f3n de Impuestos y Aduanas Nacionales)"
              schemeID="${dvOFE}" schemeName="31">${nitOFE}</sts:ProviderID>
            <sts:SoftwareID schemeAgencyID="195"
              schemeAgencyName="CO, DIAN (Direcci\u00f3n de Impuestos y Aduanas Nacionales)">${esc(softwareId)}</sts:SoftwareID>
          </sts:SoftwareProvider>
          <sts:SoftwareSecurityCode schemeAgencyID="195"
            schemeAgencyName="CO, DIAN (Direcci\u00f3n de Impuestos y Aduanas Nacionales)">${securityCode}</sts:SoftwareSecurityCode>
          <sts:AuthorizationProvider>
            <sts:AuthorizationProviderID schemeAgencyID="195"
              schemeAgencyName="CO, DIAN (Direcci\u00f3n de Impuestos y Aduanas Nacionales)"
              schemeID="4" schemeName="31">800197268</sts:AuthorizationProviderID>
          </sts:AuthorizationProvider>
          <sts:QRCode>${esc(qrPayload)}</sts:QRCode>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ProfileExecutionID>${tipoAmb}</cbc:ProfileExecutionID>
  <cbc:ID>${invoiceId}</cbc:ID>
  <cbc:UUID schemeID="${tipoAmb}" schemeName="CUFE-SHA384">${cufe}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listAgencyID="6"
    listAgencyName="United Nations Economic Commission for Europe"
    listID="UN/ECE 1001 Invoice Status Code"
    listName="Tipo Factura"
    listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:InvoiceTypeCode-2.1">01</cbc:InvoiceTypeCode>
  <cbc:Note>Generado por FACT - Software Propio</cbc:Note>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${lineCount}</cbc:LineCountNumeric>

  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID>${dianOrgType(true)}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${esc(nameOFE)}</cbc:Name>
      </cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          <cbc:CityName>Bogot\u00e1 D.C.</cbc:CityName>
          <cbc:CountrySubentityCode>CO-DC</cbc:CountrySubentityCode>
          <cbc:CountrySubentity>Bogot\u00e1 D.C.</cbc:CountrySubentity>
          <cac:AddressLine>
            <cbc:Line>${esc(settings.issuer_address || 'Colombia')}</cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>CO</cbc:IdentificationCode>
            <cbc:Name languageID="es">Colombia</cbc:Name>
          </cac:Country>
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${esc(nameOFE)}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195"
          schemeAgencyName="CO, DIAN (Direcci\u00f3n de Impuestos y Aduanas Nacionales)"
          schemeID="${dvOFE}" schemeName="31">${nitOFE}</cbc:CompanyID>
        <cbc:TaxLevelCode listName="48">O-99</cbc:TaxLevelCode>
        <cac:RegistrationAddress>
          <cbc:CityName>Bogot\u00e1 D.C.</cbc:CityName>
          <cbc:CountrySubentityCode>CO-DC</cbc:CountrySubentityCode>
          <cac:Country>
            <cbc:IdentificationCode>CO</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(nameOFE)}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195"
          schemeAgencyName="CO, DIAN (Direcci\u00f3n de Impuestos y Aduanas Nacionales)"
          schemeID="${dvOFE}" schemeName="31">${nitOFE}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:ElectronicMail>${esc(settings.issuer_email || '')}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cbc:AdditionalAccountID>${dianOrgType(clientDocScheme === '31')}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${clientName}</cbc:Name>
      </cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          <cbc:CityName>Colombia</cbc:CityName>
          <cac:AddressLine>
            <cbc:Line>${clientAddress}</cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>CO</cbc:IdentificationCode>
            <cbc:Name languageID="es">Colombia</cbc:Name>
          </cac:Country>
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${clientName}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195"
          schemeAgencyName="CO, DIAN (Direcci\u00f3n de Impuestos y Aduanas Nacionales)"
          schemeID="0" schemeName="${clientDocScheme}">${esc(clientDoc)}</cbc:CompanyID>
        <cbc:TaxLevelCode listName="49">R-99-PN</cbc:TaxLevelCode>
        <cac:TaxScheme>
          <cbc:ID>ZZ</cbc:ID>
          <cbc:Name>No aplica</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${clientName}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195"
          schemeAgencyName="CO, DIAN (Direcci\u00f3n de Impuestos y Aduanas Nacionales)"
          schemeID="0" schemeName="${clientDocScheme}">${esc(clientDoc)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      ${clientEmail ? `<cac:Contact><cbc:ElectronicMail>${clientEmail}</cbc:ElectronicMail></cac:Contact>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:PaymentMeans>
    <cbc:ID>${pm.code}</cbc:ID>
    <cbc:PaymentMeansCode>${pm.means}</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${dueDateStr}</cbc:PaymentDueDate>
  </cac:PaymentMeans>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${fmt2(ivaAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">${fmt2(ivaBase)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">${fmt2(ivaAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${ivaAmount > 0 ? '19.00' : '0.00'}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  ${incAmount > 0 ? `<cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${fmt2(incAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">${fmt2(incBase)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">${fmt2(incAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>8.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>04</cbc:ID>
          <cbc:Name>INC</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>` : ''}

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${fmt2(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${fmt2(subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${fmt2(total)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="COP">0.00</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="COP">0.00</cbc:ChargeTotalAmount>
    <cbc:PayableAmount currencyID="COP">${fmt2(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;
}

// ---------- Handler principal ---------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.message });

  let body;
  try { body = await readBody(req); } catch { return json(res, 400, { error: 'Body invalido' }); }

  const { invoice_id, items_tax = [] } = body || {};
  if (!invoice_id) return json(res, 400, { error: 'Se requiere invoice_id' });

  const sb = getAdminSupabase();

  try {
    // 1) Obtener company_id del usuario autenticado
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('company_id')
      .eq('user_id', auth.user.id)
      .single();
    if (profileError || !profile) throw new Error('Perfil no encontrado');
    const companyId = profile.company_id;

    // 2) Cargar configuracion DIAN
    const { data: settings, error: settingsError } = await sb
      .from('fe_dian_settings')
      .select('*')
      .eq('company_id', companyId)
      .single();
    if (settingsError || !settings) throw new Error('Configure primero los datos DIAN en fe_dian_settings');
    if (!settings.enabled) throw new Error('La facturacion electronica no esta habilitada para esta empresa');

    // 3) Cargar factura
    const { data: invoice, error: invError } = await sb
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('company_id', companyId)
      .single();
    if (invError || !invoice) throw new Error('Factura no encontrada');

    // 4) Cargar items
    const { data: items, error: itemsError } = await sb
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice_id);
    if (itemsError) throw new Error('Error cargando items de factura');

    // 5) Cargar cliente
    let client = null;
    if (invoice.client_id) {
      const { data: c } = await sb.from('clients').select('*').eq('id', invoice.client_id).single();
      client = c;
    }

    // 6) Verificar si ya existe documento generado para esta factura
    const { data: existing } = await sb
      .from('fe_documents')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('invoice_id', invoice_id)
      .neq('status', 'error')
      .maybeSingle();
    if (existing) {
      return json(res, 409, {
        error: 'Ya existe un documento FE para esta factura',
        document_id: existing.id,
        status: existing.status,
      });
    }

    // 7) Obtener siguiente numero de resolucion (usa funcion PostgreSQL)
    const prefix = settings.fe_prefix || 'SETP';
    const { data: numRows, error: numError } = await sb
      .rpc('fe_next_sequence', {
        p_company_id: companyId,
        p_doc_type: 'factura',
        p_prefix: prefix,
      });
    if (numError) throw new Error(`Error numeracion: ${numError.message}`);
    const numRow = numRows?.[0];
    if (!numRow) throw new Error('No se obtuvo numero de secuencia');

    const { resolution_number, technical_key, sequence_number, valid_date_from, valid_date_to } = numRow;

    // 8) Calcular fechas/horas
    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    const issueTimeTz = now.toTimeString().slice(0, 8) + '-05:00';

    // 9) Mezclar tasa de IVA por item
    const taxMap = Object.fromEntries(items_tax.map((t) => [t.product_id, Number(t.tax_rate ?? 0)]));
    const enrichedItems = (items || []).map((item) => ({
      ...item,
      _taxRate: taxMap[item.product_id] ?? 0,
    }));

    // 10) Calcular totales de impuestos
    let ivaBase = 0, ivaAmount = 0, incBase = 0, incAmount = 0;
    for (const item of enrichedItems) {
      const taxRate = item._taxRate;
      const base = Number(item.price || 0) * Number(item.quantity || 1);
      if (taxRate === 19) { ivaBase += base; ivaAmount += base * 0.19; }
      else if (taxRate === 5) { ivaBase += base; ivaAmount += base * 0.05; }
      else if (taxRate === 8) { incBase += base; incAmount += base * 0.08; }
    }

    const tipoAmb = settings.environment === 'produccion' ? '1' : '2';
    const nitOFE = String(settings.issuer_nit).replace(/\D/g, '');
    const dvOFE = settings.issuer_dv || String(calcDv(nitOFE));
    const numAdq = String(client?.document || invoice.client_doc || '222222222222');

    // 11) CUFE
    const cufe = buildCufe({
      numFac: `${prefix}${sequence_number}`,
      fecFac: issueDate,
      horFac: issueTimeTz,
      valFac: invoice.subtotal || 0,
      valImp1: ivaAmount,
      valImp2: incAmount,
      valImp3: 0,
      valTot: invoice.total || 0,
      nitOFE,
      numAdq,
      clTec: technical_key,
      tipoAmb,
    });

    // 12) Codigo de seguridad software
    const securityCode = buildSecurityCode(
      settings.software_id || '',
      settings.software_pin || '',
      sequence_number,
    );

    // 13) QR
    const qrPayload = buildQrPayload(cufe, tipoAmb);

    // 14) Resolucion para el XML
    const resolution = {
      resolution_number,
      technical_key,
      from_number: numRow.resolution_id ? undefined : 990000000,
      to_number: undefined,
      valid_date_from,
      valid_date_to,
    };

    // Enriquecer resolucion con from/to
    const { data: resolutionFull } = await sb
      .from('fe_numbering_resolutions')
      .select('from_number, to_number')
      .eq('id', numRow.resolution_id)
      .single();
    if (resolutionFull) {
      resolution.from_number = resolutionFull.from_number;
      resolution.to_number = resolutionFull.to_number;
    }

    // Ajustar settings con dv calculado
    const settingsWithDv = { ...settings, issuer_dv: dvOFE };

    // 15) Generar XML
    const xmlUnsigned = buildInvoiceXml({
      settings: settingsWithDv,
      resolution,
      invoice,
      items: enrichedItems,
      client: client || { document: numAdq, name: invoice.client_name },
      cufe,
      securityCode,
      qrPayload,
      issueDate,
      issueTime: issueTimeTz,
      prefix,
      sequenceNumber: sequence_number,
      tipoAmb,
      taxSummary: { ivaBase, ivaAmount, incBase, incAmount },
    });

    // 16) Persistir en fe_documents
    const { data: feDoc, error: docError } = await sb
      .from('fe_documents')
      .insert({
        company_id: companyId,
        invoice_id,
        source_type: 'invoice',
        doc_type: 'factura',
        prefix,
        sequence_number,
        issue_date: now.toISOString(),
        currency: 'COP',
        xml_unsigned: xmlUnsigned,
        cufe,
        qr_payload: qrPayload,
        status: 'pending',
        created_by: auth.user.id,
      })
      .select('id, status, cufe, prefix, sequence_number')
      .single();
    if (docError) throw new Error(`Error guardando documento FE: ${docError.message}`);

    // 17) Registrar evento xml_generated
    await sb.from('fe_document_events').insert({
      company_id: companyId,
      document_id: feDoc.id,
      event_type: 'xml_generated',
      detail: 'XML UBL 2.1 generado correctamente',
      payload: { cufe, prefix, sequence_number, lines: items?.length ?? 0 },
      created_by: auth.user.id,
    });

    return json(res, 200, {
      ok: true,
      document_id: feDoc.id,
      status: feDoc.status,
      cufe: feDoc.cufe,
      invoice_number: `${prefix}${sequence_number}`,
      qr_payload: qrPayload,
    });

  } catch (err) {
    console.error('[fe-generate]', err);
    return json(res, 500, { error: err.message || 'Error interno al generar documento FE' });
  }
}
