/**
 * api/fe-send.js
 * Endpoint Vercel: empaqueta el XML firmado en ZIP y lo envía a DIAN
 * mediante el servicio SOAP WcfDianCustomerServices (SendBillSync).
 *
 * POST /api/fe-send
 * Authorization: Bearer <supabase_access_token>
 * Body: { document_id: string }
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL              - URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (solo backend)
 *
 * La URL del servicio DIAN se obtiene de fe_dian_settings.environment:
 *   habilitacion -> https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc
 *   produccion   -> https://vpfe.dian.gov.co/WcfDianCustomerServices.svc
 *
 * Flujo:
 *   1. Valida token Bearer -> extrae user y company_id
 *   2. Verifica que el documento este en status 'signed'
 *   3. Carga fe_dian_settings para obtener environment y NIT del emisor
 *   4. Empaqueta xml_signed en un ZIP (nombre: NIT_prefix+numero.zip)
 *   5. Envia via SOAP SendBillSync (ZIP en base64)
 *   6. Parsea la respuesta DIAN:
 *      - IsValid=true  → status='validated', guarda XmlDocumentKey como track_id
 *      - IsValid=false → status='rejected', guarda StatusMessage como last_error
 *      - Error SOAP    → status='error'
 *   7. Persiste cambios en fe_documents y registra evento
 *
 * Referencia DIAN:
 *   Anexo Tecnico Factura Electronica de Venta v1.9.x - Seccion envio
 */

import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

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
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

// ---------- Supabase ------------------------------------------------------

function getAdminSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function requireAuth(req) {
  const token = getBearerToken(req);
  if (!token) throw new Error('Token requerido');
  const supabase = getAdminSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Token invalido o expirado');
  return user;
}

async function getUserCompanyId(userId) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .single();
  if (error || !data?.company_id) throw new Error('No se encontro empresa del usuario');
  return data.company_id;
}

// ---------- URL DIAN por ambiente -----------------------------------------

function getDianSoapUrl(environment) {
  if (environment === 'produccion') {
    return 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc';
  }
  // habilitacion (default)
  return 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc';
}

// ---------- Construccion del ZIP ------------------------------------------

/**
 * Empaqueta el XML firmado en un ZIP.
 * DIAN exige que el ZIP tenga exactamente un archivo con nombre:
 *   nit_prefix+numero.xml  (sin guiones)
 * El ZIP se codifica en base64 para incluirlo en el SOAP.
 *
 * @param {{ xmlSigned: string, issuerNit: string, prefix: string, sequenceNumber: number }} params
 * @returns {Promise<{ zipB64: string, zipFileName: string }>}
 */
async function buildZip({ xmlSigned, issuerNit, prefix, sequenceNumber }) {
  const xmlFileName = `${issuerNit}${prefix}${sequenceNumber}.xml`;
  const zipFileName = `${issuerNit}${prefix}${sequenceNumber}.zip`;

  const zip = new JSZip();
  zip.file(xmlFileName, xmlSigned, { binary: false });

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    zipB64: zipBuffer.toString('base64'),
    zipFileName,
  };
}

// ---------- SOAP SendBillSync ---------------------------------------------

/**
 * Construye el envelope SOAP para SendBillSync.
 * @param {{ fileName: string, contentFileB64: string }} params
 */
function buildSendBillSyncEnvelope({ fileName, contentFileB64 }) {
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<soapenv:Envelope`,
    `  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"`,
    `  xmlns:wcf="http://wcf.dian.colombia">`,
    `  <soapenv:Header/>`,
    `  <soapenv:Body>`,
    `    <wcf:SendBillSync>`,
    `      <wcf:fileName>${fileName}</wcf:fileName>`,
    `      <wcf:contentFile>${contentFileB64}</wcf:contentFile>`,
    `    </wcf:SendBillSync>`,
    `  </soapenv:Body>`,
    `</soapenv:Envelope>`,
  ].join('\n');
}

/**
 * Envia el SOAP a DIAN y retorna el texto de la respuesta.
 * @param {{ soapUrl: string, envelope: string, timeoutMs?: number }} params
 * @returns {Promise<string>} XML de respuesta
 */
async function callDianSoap({ soapUrl, envelope, timeoutMs = 60000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(soapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync',
      },
      body: envelope,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SOAP HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

// ---------- Parseo de respuesta DIAN --------------------------------------

/**
 * Extrae el contenido de una etiqueta XML de la respuesta SOAP.
 * Soporta namespaces (cualquier prefijo antes de la etiqueta).
 * @param {string} xml
 * @param {string} tagLocalName - nombre local del tag (sin prefijo)
 * @returns {string|null}
 */
function extractTag(xml, tagLocalName) {
  const re = new RegExp(`<[^>]*:?${tagLocalName}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tagLocalName}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Parsea la respuesta SOAP de SendBillSync / GetStatusZip.
 * @param {string} soapResponse
 * @returns {{ isValid: boolean, statusCode: string, statusDescription: string, trackId: string|null, rawXml: string }}
 */
function parseDianResponse(soapResponse) {
  // DIAN retorna IsValid como string 'true'/'false' dentro del XML
  const isValidStr = extractTag(soapResponse, 'IsValid') ?? 'false';
  const isValid = isValidStr.toLowerCase() === 'true';
  const statusCode = extractTag(soapResponse, 'StatusCode') ?? '';
  const statusDescription = extractTag(soapResponse, 'StatusDescription') ?? '';
  // XmlDocumentKey es el trackId que DIAN asigna
  const trackId = extractTag(soapResponse, 'XmlDocumentKey');
  // Errors puede venir en varios formatos; extraemos el texto simple si existe
  const errors = extractTag(soapResponse, 'ErrorMessage')
    ?? extractTag(soapResponse, 'Errors')
    ?? '';

  return { isValid, statusCode, statusDescription, trackId, errors, rawXml: soapResponse };
}

// ---------- Handler principal ---------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metodo no permitido' });

  let user, companyId, body;

  try {
    user = await requireAuth(req);
    companyId = await getUserCompanyId(user.id);
    body = await readBody(req);
  } catch (err) {
    return json(res, 401, { error: err.message });
  }

  const { document_id } = body ?? {};
  if (!document_id) return json(res, 400, { error: 'document_id requerido' });

  const supabase = getAdminSupabase();

  // ---- Cargar documento FE
  const { data: doc, error: docError } = await supabase
    .from('fe_documents')
    .select('id, company_id, xml_signed, status, prefix, sequence_number, doc_type, issue_date')
    .eq('id', document_id)
    .single();

  if (docError || !doc) return json(res, 404, { error: 'Documento no encontrado' });
  if (doc.company_id !== companyId) return json(res, 403, { error: 'Documento de otra empresa' });
  if (!doc.xml_signed) return json(res, 422, { error: 'El documento no tiene XML firmado (xml_signed vacio)' });
  if (doc.status === 'validated') return json(res, 409, { error: 'El documento ya fue validado por DIAN' });
  if (doc.status !== 'signed') {
    return json(res, 409, {
      error: `El documento esta en estado '${doc.status}'. Debe estar en 'signed' para enviar a DIAN`,
    });
  }

  // ---- Cargar configuracion DIAN de la empresa
  const { data: settings, error: settingsError } = await supabase
    .from('fe_dian_settings')
    .select('environment, issuer_nit, software_id')
    .eq('company_id', companyId)
    .single();

  if (settingsError || !settings) {
    return json(res, 422, { error: 'No se encontro configuracion DIAN para esta empresa' });
  }
  if (!settings.issuer_nit) {
    return json(res, 422, { error: 'NIT del emisor no configurado en fe_dian_settings' });
  }

  // ---- Registrar inicio del evento
  await supabase.from('fe_document_events').insert({
    document_id: doc.id,
    company_id: companyId,
    event_type: 'send_attempt',
    detail: `Enviando a DIAN (ambiente: ${settings.environment ?? 'habilitacion'})`,
  });

  // ---- Construir ZIP
  let zipB64, zipFileName;
  try {
    ({ zipB64, zipFileName } = await buildZip({
      xmlSigned: doc.xml_signed,
      issuerNit: settings.issuer_nit,
      prefix: doc.prefix,
      sequenceNumber: doc.sequence_number,
    }));
  } catch (err) {
    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'send_error',
      detail: `Error creando ZIP: ${err.message}`,
    });
    await supabase.from('fe_documents')
      .update({ status: 'error', last_error: `ZIP: ${err.message}` })
      .eq('id', doc.id);
    return json(res, 500, { error: `Error creando ZIP: ${err.message}` });
  }

  // ---- Llamar SOAP DIAN
  const soapUrl = getDianSoapUrl(settings.environment);
  const envelope = buildSendBillSyncEnvelope({ fileName: zipFileName, contentFileB64: zipB64 });

  let soapResponseText;
  try {
    soapResponseText = await callDianSoap({ soapUrl, envelope });
  } catch (err) {
    const errMsg = err.name === 'AbortError'
      ? 'Timeout al conectar con DIAN (60s)'
      : `Error de red DIAN: ${err.message}`;
    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'send_error',
      detail: errMsg,
    });
    await supabase.from('fe_documents')
      .update({ status: 'error', last_error: errMsg, attempt_count: (doc.attempt_count ?? 0) + 1 })
      .eq('id', doc.id);
    return json(res, 502, { error: errMsg });
  }

  // ---- Parsear respuesta DIAN
  const dianResult = parseDianResponse(soapResponseText);

  // Incrementar attempt_count siempre
  const newAttemptCount = (doc.attempt_count ?? 0) + 1;

  if (dianResult.isValid) {
    // Documento validado directamente (SendBillSync puede retornar validado)
    await supabase.from('fe_documents').update({
      status: 'validated',
      dian_track_id: dianResult.trackId,
      validated_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      last_error: null,
      attempt_count: newAttemptCount,
    }).eq('id', doc.id);

    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'validated',
      detail: `Validado por DIAN. Codigo: ${dianResult.statusCode}`,
      payload: { statusCode: dianResult.statusCode, statusDescription: dianResult.statusDescription, trackId: dianResult.trackId },
    });

    return json(res, 200, {
      ok: true,
      document_id: doc.id,
      status: 'validated',
      dian_track_id: dianResult.trackId,
      status_code: dianResult.statusCode,
      status_description: dianResult.statusDescription,
      invoice_number: `${doc.prefix}${doc.sequence_number}`,
    });

  } else if (dianResult.statusCode === '00' || dianResult.statusCode === '') {
    // En proceso: DIAN acepto el documento pero aun no finaliza validacion
    // (esto puede ocurrir con SendBillAsync; con SendBillSync es inusual)
    await supabase.from('fe_documents').update({
      status: 'sent',
      dian_track_id: dianResult.trackId,
      sent_at: new Date().toISOString(),
      last_error: null,
      attempt_count: newAttemptCount,
    }).eq('id', doc.id);

    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'sent',
      detail: `Enviado a DIAN, pendiente de validacion. TrackId: ${dianResult.trackId}`,
      payload: { statusCode: dianResult.statusCode, trackId: dianResult.trackId },
    });

    return json(res, 200, {
      ok: true,
      document_id: doc.id,
      status: 'sent',
      dian_track_id: dianResult.trackId,
      status_code: dianResult.statusCode,
      invoice_number: `${doc.prefix}${doc.sequence_number}`,
    });

  } else {
    // Rechazado por DIAN
    const errorDetail = [
      dianResult.statusDescription,
      dianResult.errors,
    ].filter(Boolean).join(' | ').slice(0, 500);

    await supabase.from('fe_documents').update({
      status: 'rejected',
      dian_track_id: dianResult.trackId,
      sent_at: new Date().toISOString(),
      last_error: errorDetail,
      attempt_count: newAttemptCount,
    }).eq('id', doc.id);

    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'rejected',
      detail: `Rechazado por DIAN. Codigo: ${dianResult.statusCode}`,
      payload: {
        statusCode: dianResult.statusCode,
        statusDescription: dianResult.statusDescription,
        errors: dianResult.errors,
        trackId: dianResult.trackId,
      },
    });

    return json(res, 200, {
      ok: false,
      document_id: doc.id,
      status: 'rejected',
      status_code: dianResult.statusCode,
      status_description: dianResult.statusDescription,
      error: errorDetail,
      invoice_number: `${doc.prefix}${doc.sequence_number}`,
    });
  }
}
