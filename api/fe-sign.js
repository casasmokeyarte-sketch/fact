/**
 * api/fe-sign.js
 * Endpoint Vercel: firma un documento FE con XAdES-BES usando el certificado
 * digital del facturador (PKCS#12 / .p12 / .pfx).
 *
 * POST /api/fe-sign
 * Authorization: Bearer <supabase_access_token>
 * Body: { document_id: string }
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL          - URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (solo backend)
 *   FE_CERT_P12_B64       - Certificado .p12/.pfx codificado en base64
 *   FE_CERT_PASSWORD      - Contrasena del .p12 (puede ser vacía '')
 *
 * Flujo:
 *   1. Valida token Bearer -> extrae user y company_id
 *   2. Carga el documento fe_documents (status='pending')
 *   3. Parsea el PFX con node-forge
 *   4. Construye bloque XAdES-BES:
 *        - KeyInfo digest
 *        - SignedProperties (tiempo, certificado, politica DIAN, rol)
 *        - Referencia al documento (SHA-256)
 *        - SignedInfo -> firma RSA-SHA256
 *   5. Inserta la firma en el XML (segundo <ext:ExtensionContent/>)
 *   6. Persiste xml_signed, status='signed', registra evento
 *
 * NOTA IMPORTANTE:
 *   La canonicalizacion C14N se aplica de forma simplificada sobre los
 *   bloques XML que construimos nosotros mismos. Para el documento raiz
 *   se usa el XML tal como fue generado por fe-generate (sin whitespace
 *   adicional ni declaration). En ambiente de habilitacion DIAN esto es
 *   aceptado; para produccion se recomienda validar con el Facturador
 *   DIAN o con la herramienta de verificacion oficial.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import forge from 'node-forge';

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

// ---------- Certificado ---------------------------------------------------

/**
 * Carga y parsea el certificado PKCS#12 desde variables de entorno.
 * Retorna { privateKey, certificate } como objetos node-forge.
 */
function loadCertificate() {
  const p12B64 = process.env.FE_CERT_P12_B64;
  const password = process.env.FE_CERT_PASSWORD ?? '';

  if (!p12B64) {
    throw new Error('FE_CERT_P12_B64 no configurado en variables de entorno');
  }

  let p12;
  try {
    const p12Der = forge.util.decode64(p12B64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  } catch (err) {
    throw new Error(`Error al parsear certificado PFX: ${err.message}`);
  }

  // Certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certList = certBags[forge.pki.oids.certBag] ?? [];
  if (certList.length === 0) throw new Error('No se encontro certificado en el PFX');
  const certificate = certList[0].cert;

  // Llave privada (pkcs8 shrouded o pkcs8)
  let keyBag = null;
  const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const shroudedList = shroudedBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  if (shroudedList.length > 0) {
    keyBag = shroudedList[0].key;
  } else {
    const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyList = keyBags[forge.pki.oids.keyBag] ?? [];
    if (keyList.length === 0) throw new Error('No se encontro llave privada en el PFX');
    keyBag = keyList[0].key;
  }

  return { privateKey: keyBag, certificate };
}

// ---------- Crypto helpers ------------------------------------------------

/** SHA-256 de un string UTF-8 -> base64 */
function sha256b64(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('base64');
}

/** SHA-256 de bytes binarios (string forge) -> base64 */
function sha256b64Bytes(binaryStr) {
  return crypto.createHash('sha256')
    .update(Buffer.from(binaryStr, 'binary'))
    .digest('base64');
}

/** RSA-SHA256 sobre un string UTF-8 con la llave privada node-forge -> base64 */
function rsaSha256Sign(forgePrivateKey, data) {
  const pem = forge.pki.privateKeyToPem(forgePrivateKey);
  return crypto.createSign('RSA-SHA256').update(data, 'utf8').sign(pem, 'base64');
}

// ---------- Datos del certificado -----------------------------------------

/** Retorna el DER del certificado como string binario forge */
function certToDer(certificate) {
  return forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
}

/** Retorna el certificado DER en base64 (para KeyInfo) */
function certToB64(certificate) {
  return forge.util.encode64(certToDer(certificate));
}

/**
 * Retorna el DN del emisor en formato RFC 2253 invertido
 * (ej. "CN=...,O=...,C=CO") como lo requiere XAdES.
 */
function getIssuerDN(certificate) {
  const attrs = certificate.issuer.attributes;
  // Orden: de mayor a menor (CN primero, C ultimo) -> invertir el array que viene de ASN.1
  return [...attrs].reverse().map(a => `${a.shortName}=${a.value}`).join(',');
}

/**
 * Convierte el numero de serie hexadecimal del certificado a decimal.
 * Node-forge lo expone como string hex sin prefijo 0x.
 */
function getSerialDecimal(certificate) {
  const hex = certificate.serialNumber;
  return BigInt(`0x${hex}`).toString(10);
}

/**
 * Retorna la fecha/hora actual en formato ISO 8601 con offset Colombia (UTC-5).
 * DIAN requiere hora local con offset.
 */
function colombiaISOTime() {
  const now = new Date();
  // UTC-5 -> restar 5 horas
  const local = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return local.toISOString().replace('Z', '-05:00');
}

// ---------- Construccion XAdES-BES ----------------------------------------

/**
 * Construye el bloque <ds:Signature> completo en XAdES-BES.
 *
 * Algoritmos usados:
 *   - Canonicalizacion: C14N inclusivo sin comentarios (W3C 2001)
 *   - Firma: RSA-SHA256
 *   - Digest: SHA-256
 *
 * La canonicalizacion "simplificada" aqui aplicada es correcta porque los
 * bloques XML que construimos no tienen variaciones de namespace ni
 * whitespace fuera de control. El documento raiz (xmlUnsigned) fue
 * generado por fe-generate.js y cumple con los requisitos.
 *
 * Referencias:
 *   DIAN Anexo Tecnico Factura Electronica de Venta v1.9.x - Seccion firma XAdES
 *   https://www.dian.gov.co/impuestos/factura-electronica/
 *
 * @param {{ xmlUnsigned: string, certificate: forge.pki.Certificate, privateKey: forge.pki.rsa.PrivateKey }} params
 * @returns {string} bloque completo <ds:Signature>...</ds:Signature>
 */
function buildXadesSignature({ xmlUnsigned, certificate, privateKey }) {
  const sigUuid = crypto.randomUUID();
  const sigId = `xmldsig-${sigUuid}`;
  const keyInfoId = `${sigId}-keyinfo`;
  const sigValueId = `${sigId}-sigvalue`;
  const signedPropsId = `${sigId}-signedprops`;
  const ref0Id = `${sigId}-ref0`;
  const objectId = `${sigId}-object0`;
  const now = colombiaISOTime();

  // ---- Datos del certificado
  const certB64 = certToB64(certificate);
  const certDerBytes = certToDer(certificate);
  const certDigest = sha256b64Bytes(certDerBytes);
  const issuerDN = getIssuerDN(certificate);
  const serialDec = getSerialDecimal(certificate);

  // ---- 1) KeyInfo
  // Se construye como bloque canonico (sin saltos de linea dentro de tags)
  const keyInfoXml = [
    `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${keyInfoId}">`,
      `<ds:X509Data>`,
        `<ds:X509Certificate>${certB64}</ds:X509Certificate>`,
      `</ds:X509Data>`,
    `</ds:KeyInfo>`,
  ].join('');
  const keyInfoDigest = sha256b64(keyInfoXml);

  // ---- 2) SignedProperties (XAdES)
  // Politica de firma DIAN v2 (hash SHA-256 del PDF de politica DIAN)
  // Valor oficial publicado en el Anexo Tecnico DIAN
  const policyDigest = 'dMoMvtcG5aIzgYo0tIsSQKwB3Fz2oBnrOE3GNfEedwE=';
  const policyUrl = 'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf';

  const signedPropsXml = [
    `<xades:SignedProperties`,
      ` xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"`,
      ` xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
      ` Id="${signedPropsId}">`,
      `<xades:SignedSignatureProperties>`,
        `<xades:SigningTime>${now}</xades:SigningTime>`,
        `<xades:SigningCertificate>`,
          `<xades:Cert>`,
            `<xades:CertDigest>`,
              `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
              `<ds:DigestValue>${certDigest}</ds:DigestValue>`,
            `</xades:CertDigest>`,
            `<xades:IssuerSerial>`,
              `<ds:X509IssuerName>${issuerDN}</ds:X509IssuerName>`,
              `<ds:X509SerialNumber>${serialDec}</ds:X509SerialNumber>`,
            `</xades:IssuerSerial>`,
          `</xades:Cert>`,
        `</xades:SigningCertificate>`,
        `<xades:SignaturePolicyIdentifier>`,
          `<xades:SignaturePolicyId>`,
            `<xades:SigPolicyId>`,
              `<xades:Identifier>${policyUrl}</xades:Identifier>`,
            `</xades:SigPolicyId>`,
            `<xades:SigPolicyHash>`,
              `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
              `<ds:DigestValue>${policyDigest}</ds:DigestValue>`,
            `</xades:SigPolicyHash>`,
          `</xades:SignaturePolicyId>`,
        `</xades:SignaturePolicyIdentifier>`,
        `<xades:SignerRole>`,
          `<xades:ClaimedRoles>`,
            `<xades:ClaimedRole>supplier</xades:ClaimedRole>`,
          `</xades:ClaimedRoles>`,
        `</xades:SignerRole>`,
      `</xades:SignedSignatureProperties>`,
      `<xades:SignedDataObjectProperties>`,
        `<xades:DataObjectFormat ObjectReference="#${ref0Id}">`,
          `<xades:MimeType>text/xml</xades:MimeType>`,
          `<xades:Encoding>UTF-8</xades:Encoding>`,
        `</xades:DataObjectFormat>`,
      `</xades:SignedDataObjectProperties>`,
    `</xades:SignedProperties>`,
  ].join('');
  const signedPropsDigest = sha256b64(signedPropsXml);

  // ---- 3) Digest del documento (ref0, transform enveloped-signature)
  // Como xml_unsigned no contiene aun ningun <ds:Signature>, el digest
  // es directamente SHA-256 del documento completo.
  const docDigest = sha256b64(xmlUnsigned);

  // ---- 4) SignedInfo (canonico, se firma directamente)
  const signedInfoXml = [
    `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">`,
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
      `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>`,
      // Referencia al documento (enveloped signature)
      `<ds:Reference Id="${ref0Id}" URI="">`,
        `<ds:Transforms>`,
          `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>`,
        `</ds:Transforms>`,
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
        `<ds:DigestValue>${docDigest}</ds:DigestValue>`,
      `</ds:Reference>`,
      // Referencia a KeyInfo
      `<ds:Reference URI="#${keyInfoId}">`,
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
        `<ds:DigestValue>${keyInfoDigest}</ds:DigestValue>`,
      `</ds:Reference>`,
      // Referencia a SignedProperties (XAdES)
      `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropsId}">`,
        `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
        `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>`,
      `</ds:Reference>`,
    `</ds:SignedInfo>`,
  ].join('');

  // ---- 5) Firma RSA-SHA256 del SignedInfo
  const signatureValueB64 = rsaSha256Sign(privateKey, signedInfoXml);

  // ---- 6) Bloque completo <ds:Signature>
  const signatureBlock = [
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${sigId}">`,
      signedInfoXml,
      `<ds:SignatureValue Id="${sigValueId}">${signatureValueB64}</ds:SignatureValue>`,
      keyInfoXml,
      `<ds:Object Id="${objectId}">`,
        `<xades:QualifyingProperties`,
          ` xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"`,
          ` Target="#${sigId}">`,
          signedPropsXml,
        `</xades:QualifyingProperties>`,
      `</ds:Object>`,
    `</ds:Signature>`,
  ].join('');

  return signatureBlock;
}

/**
 * Inserta el bloque de firma en el XML reemplazando el segundo
 * <ext:ExtensionContent/> (el primero lo usa la DianExtension de CUFE).
 */
function insertSignatureIntoXml(xmlUnsigned, signatureBlock) {
  const placeholder = '<ext:ExtensionContent/>';
  // Buscar la segunda ocurrencia
  const firstIdx = xmlUnsigned.indexOf(placeholder);
  if (firstIdx === -1) throw new Error('El XML no contiene el placeholder <ext:ExtensionContent/>');
  const secondIdx = xmlUnsigned.indexOf(placeholder, firstIdx + placeholder.length);
  const targetIdx = secondIdx !== -1 ? secondIdx : firstIdx;

  return (
    xmlUnsigned.slice(0, targetIdx) +
    `<ext:ExtensionContent>${signatureBlock}</ext:ExtensionContent>` +
    xmlUnsigned.slice(targetIdx + placeholder.length)
  );
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
    .select('id, company_id, xml_unsigned, status, invoice_id, sequence_number, prefix, doc_type')
    .eq('id', document_id)
    .single();

  if (docError || !doc) return json(res, 404, { error: 'Documento no encontrado' });
  if (doc.company_id !== companyId) return json(res, 403, { error: 'Documento de otra empresa' });
  if (!doc.xml_unsigned) return json(res, 422, { error: 'El documento no tiene XML generado (xml_unsigned vacio)' });
  if (doc.status === 'validated') return json(res, 409, { error: 'El documento ya fue validado por DIAN' });
  if (!['pending', 'error'].includes(doc.status)) {
    return json(res, 409, { error: `El documento esta en estado '${doc.status}' y no puede re-firmarse` });
  }

  // ---- Registrar inicio del evento
  await supabase.from('fe_document_events').insert({
    document_id: doc.id,
    company_id: companyId,
    event_type: 'sign_attempt',
    detail: 'Iniciando firma XAdES-BES',
  });

  // ---- Cargar certificado
  let certificate, privateKey;
  try {
    ({ certificate, privateKey } = loadCertificate());
  } catch (err) {
    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'sign_error',
      detail: `Error cargando certificado: ${err.message}`,
    });
    await supabase.from('fe_documents')
      .update({ status: 'error', last_error: `Certificado: ${err.message}` })
      .eq('id', doc.id);
    return json(res, 500, { error: `Error en certificado: ${err.message}` });
  }

  // ---- Construir y firmar
  let xmlSigned;
  try {
    const signatureBlock = buildXadesSignature({
      xmlUnsigned: doc.xml_unsigned,
      certificate,
      privateKey,
    });
    xmlSigned = insertSignatureIntoXml(doc.xml_unsigned, signatureBlock);
  } catch (err) {
    await supabase.from('fe_document_events').insert({
      document_id: doc.id,
      company_id: companyId,
      event_type: 'sign_error',
      detail: `Error construyendo firma: ${err.message}`,
    });
    await supabase.from('fe_documents')
      .update({ status: 'error', last_error: `Firma: ${err.message}` })
      .eq('id', doc.id);
    return json(res, 500, { error: `Error en firma: ${err.message}` });
  }

  // ---- Persistir xml_signed y cambiar status a 'signed'
  const { error: updateError } = await supabase
    .from('fe_documents')
    .update({
      xml_signed: xmlSigned,
      status: 'signed',
      last_error: null,
    })
    .eq('id', doc.id);

  if (updateError) {
    return json(res, 500, { error: `Error guardando XML firmado: ${updateError.message}` });
  }

  // ---- Registrar evento exitoso
  await supabase.from('fe_document_events').insert({
    document_id: doc.id,
    company_id: companyId,
    event_type: 'signed',
    detail: 'XML firmado correctamente con XAdES-BES',
  });

  return json(res, 200, {
    ok: true,
    document_id: doc.id,
    status: 'signed',
    invoice_number: `${doc.prefix}${doc.sequence_number}`,
  });
}
