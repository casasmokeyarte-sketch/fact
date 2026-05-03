/**
 * api/fe-status.js
 * Endpoint Vercel: consulta el estado de validacion de un documento FE
 * en DIAN mediante GetStatusZip y actualiza fe_documents.
 *
 * POST /api/fe-status
 * Authorization: Bearer <supabase_access_token>
 * Body: { document_id: string }
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL              - URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (solo backend)
 *
 * Flujo:
 *   1. Valida token Bearer -> extrae user y company_id
 *   2. Carga el documento (debe estar en status 'sent' o 'rejected')
 *   3. Llama a DIAN GetStatusZip con el dian_track_id
 *   4. Actualiza status en fe_documents segun la respuesta:
 *      IsValid=true  → 'validated'
 *      IsValid=false, codigo procesando → mantiene 'sent'
 *      IsValid=false, codigo error     → 'rejected'
 *   5. Registra evento en fe_document_events
 *
 * Referencia DIAN:
 *   Anexo Tecnico FEV v1.9.x - Consulta GetStatusZip
 *   StatusCode '00' = en proceso / aceptado
 *   StatusCode '66' = documento en proceso DIAN (reintentar)
 *   StatusCode '99' = validado exitosamente
 */

import { createClient } from '@supabase/supabase-js';

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

// ---------- URL DIAN ------------------------------------------------------

function getDianSoapUrl(environment) {
  if (environment === 'produccion') {
    return 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc';
  }
  return 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc';
}

// ---------- SOAP GetStatusZip ---------------------------------------------

/**
 * Construye el envelope SOAP para GetStatusZip.
 * @param {string} trackId - XmlDocumentKey retornado por DIAN al enviar
 */
function buildGetStatusZipEnvelope(trackId) {
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<soapenv:Envelope`,
    `  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"`,
    `  xmlns:wcf="http://wcf.dian.colombia">`,
    `  <soapenv:Header/>`,
    `  <soapenv:Body>`,
    `    <wcf:GetStatusZip>`,
    `      <wcf:trackId>${trackId}</wcf:trackId>`,
    `    </wcf:GetStatusZip>`,
    `  </soapenv:Body>`,
    `</soapenv:Envelope>`,
  ].join('\n');
}

/**
 * Llama al endpoint SOAP de DIAN y retorna el texto de respuesta.
 * @param {{ soapUrl: string, envelope: string, soapAction: string, timeoutMs?: number }} params
 */
async function callDianSoap({ soapUrl, envelope, soapAction, timeoutMs = 30000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(soapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': soapAction,
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

function extractTag(xml, tagLocalName) {
  const re = new RegExp(`<[^>]*:?${tagLocalName}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tagLocalName}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseDianResponse(soapResponse) {
  const isValidStr = extractTag(soapResponse, 'IsValid') ?? 'false';
  const isValid = isValidStr.toLowerCase() === 'true';
  const statusCode = extractTag(soapResponse, 'StatusCode') ?? '';
  const statusDescription = extractTag(soapResponse, 'StatusDescription') ?? '';
  const trackId = extractTag(soapResponse, 'XmlDocumentKey');
  const errors = extractTag(soapResponse, 'ErrorMessage')
    ?? extractTag(soapResponse, 'Errors')
    ?? '';
  return { isValid, statusCode, statusDescription, trackId, errors };
}

// Codigos DIAN que indican "en proceso, reintentar mas tarde"
const DIAN_PENDING_CODES = new Set(['00', '66', '100', '']);

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
    .select('id, company_id, status, dian_track_id, prefix, sequence_number, attempt_count')
    .eq('id', document_id)
    .single();

  if (docError || !doc) return json(res, 404, { error: 'Documento no encontrado' });
  if (doc.company_id !== companyId) return json(res, 403, { error: 'Documento de otra empresa' });

  // Si ya esta validado, retornar sin llamar a DIAN
  if (doc.status === 'validated') {
    return json(res, 200, {
      ok: true,
      document_id: doc.id,
      status: 'validated',
      invoice_number: `${doc.prefix}${doc.sequence_number}`,
      message: 'El documento ya estaba validado',
    });
  }

  if (!doc.dian_track_id) {
    return json(res, 422, { error: 'El documento no tiene dian_track_id. Debe enviarse primero con /api/fe-send' });
  }

  if (!['sent', 'rejected'].includes(doc.status)) {
    return json(res, 409, {
      error: `El documento esta en estado '${doc.status}'. Solo se puede consultar si esta en 'sent' o 'rejected'`,
    });
  }

  // ---- Cargar configuracion DIAN de la empresa
  const { data: settings } = await supabase
    .from('fe_dian_settings')
    .select('environment')
    .eq('company_id', companyId)
    .single();

  const environment = settings?.environment ?? 'habilitacion';
  const soapUrl = getDianSoapUrl(environment);

  // ---- Llamar GetStatusZip
  const envelope = buildGetStatusZipEnvelope(doc.dian_track_id);
  let soapResponseText;
  try {
    soapResponseText = await callDianSoap({
      soapUrl,
      envelope,
      soapAction: 'http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatusZip',
    });
  } catch (err) {
    const errMsg = err.name === 'AbortError'
      ? 'Timeout al consultar DIAN (30s)'
      : `Error de red DIAN: ${err.message}`;
    return json(res, 502, { error: errMsg });
  }

  // ---- Parsear y actualizar
  const dianResult = parseDianResponse(soapResponseText);

  if (dianResult.isValid) {
    await supabase.from('fe_documents').update({
      status: 'validated',
      validated_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', doc.id);

    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'validated',
      detail: `Validado por DIAN (consulta estado). Codigo: ${dianResult.statusCode}`,
      payload: {
        statusCode: dianResult.statusCode,
        statusDescription: dianResult.statusDescription,
        trackId: dianResult.trackId ?? doc.dian_track_id,
      },
    });

    return json(res, 200, {
      ok: true,
      document_id: doc.id,
      status: 'validated',
      status_code: dianResult.statusCode,
      status_description: dianResult.statusDescription,
      invoice_number: `${doc.prefix}${doc.sequence_number}`,
    });

  } else if (DIAN_PENDING_CODES.has(dianResult.statusCode)) {
    // Aun en proceso en DIAN — no cambiar status, solo registrar consulta
    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'status_check',
      detail: `DIAN: en proceso (${dianResult.statusCode}). Reintentar mas tarde.`,
    });

    return json(res, 200, {
      ok: true,
      document_id: doc.id,
      status: doc.status, // sin cambio
      status_code: dianResult.statusCode,
      status_description: dianResult.statusDescription || 'En proceso DIAN',
      pending: true,
      invoice_number: `${doc.prefix}${doc.sequence_number}`,
    });

  } else {
    // Rechazado
    const errorDetail = [
      dianResult.statusDescription,
      dianResult.errors,
    ].filter(Boolean).join(' | ').slice(0, 500);

    await supabase.from('fe_documents').update({
      status: 'rejected',
      last_error: errorDetail,
    }).eq('id', doc.id);

    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'rejected',
      detail: `Rechazado por DIAN (consulta estado). Codigo: ${dianResult.statusCode}`,
      payload: {
        statusCode: dianResult.statusCode,
        statusDescription: dianResult.statusDescription,
        errors: dianResult.errors,
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
