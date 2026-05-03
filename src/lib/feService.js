/**
 * src/lib/feService.js
 * Servicio frontend para Facturacion Electronica DIAN (Software Propio).
 * Interactua con:
 *   - Supabase: fe_documents, fe_document_events, fe_dian_settings
 *   - API: POST /api/fe-generate
 */

import { supabase } from './supabaseClient';

// ---------- helpers -------------------------------------------------------

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

async function callApi(path, body) {
  const session = await getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sin sesion activa');

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ---------- Configuracion DIAN --------------------------------------------

/**
 * Obtiene la configuracion DIAN de la empresa actual.
 * @returns {{ data: object|null, error: string|null }}
 */
export async function getDianSettings() {
  try {
    const { data, error } = await supabase
      .from('fe_dian_settings')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Guarda o actualiza la configuracion DIAN de la empresa.
 * Resuelve company_id desde el perfil del usuario autenticado para
 * evitar que el DEFAULT lo intente resolver con service_role (NULL).
 * @param {object} settings - campos a guardar (sin company_id obligatorio)
 * @returns {{ data: object|null, error: string|null }}
 */
export async function saveDianSettings(settings) {
  try {
    // Resolver company_id del usuario actual antes del upsert
    let companyId = settings.company_id;
    if (!companyId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sin sesion activa');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();
      if (profileError || !profile?.company_id) throw new Error('No se encontro empresa del usuario');
      companyId = profile.company_id;
    }

    const { data, error } = await supabase
      .from('fe_dian_settings')
      .upsert({ ...settings, company_id: companyId }, { onConflict: 'company_id' })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ---------- Resoluciones de numeracion ------------------------------------

/**
 * Obtiene las resoluciones de facturacion de la empresa.
 * @returns {{ data: Array|null, error: string|null }}
 */
export async function getNumberingResolutions() {
  try {
    const { data, error } = await supabase
      .from('fe_numbering_resolutions')
      .select('*')
      .order('resolution_date', { ascending: false });
    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Crea o actualiza una resolucion de numeracion.
 * Resuelve company_id desde el perfil si no viene en el objeto.
 * @param {object} resolution
 */
export async function saveNumberingResolution(resolution) {
  try {
    let companyId = resolution.company_id;
    if (!companyId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sin sesion activa');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();
      if (profileError || !profile?.company_id) throw new Error('No se encontro empresa del usuario');
      companyId = profile.company_id;
    }

    const { data, error } = await supabase
      .from('fe_numbering_resolutions')
      .upsert(
        { ...resolution, company_id: companyId },
        { onConflict: 'company_id,doc_type,prefix,resolution_number' }
      )
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ---------- Documentos FE -------------------------------------------------

/**
 * Lista documentos FE de la empresa con filtros opcionales.
 * @param {{ status?: string, from?: string, to?: string, limit?: number }} options
 * @returns {{ data: Array|null, error: string|null }}
 */
export async function getFeDocuments({ status, from, to, limit = 50 } = {}) {
  try {
    let q = supabase
      .from('fe_documents')
      .select('id, invoice_id, doc_type, prefix, sequence_number, issue_date, cufe, qr_payload, dian_track_id, status, attempt_count, last_error, sent_at, validated_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) q = q.eq('status', status);
    if (from) q = q.gte('issue_date', from);
    if (to) q = q.lte('issue_date', to);

    const { data, error } = await q;
    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Obtiene un documento FE por su ID.
 * @param {string} documentId
 */
export async function getFeDocument(documentId) {
  try {
    const { data, error } = await supabase
      .from('fe_documents')
      .select('*')
      .eq('id', documentId)
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Carga datos necesarios para la representacion grafica FE (Fase 5).
 * @param {string} documentId
 * @returns {{ data: { document: object, invoice: object|null, settings: object|null }|null, error: string|null }}
 */
export async function getFeRepresentationBundle(documentId) {
  try {
    const { data: document, error: docError } = await supabase
      .from('fe_documents')
      .select('*')
      .eq('id', documentId)
      .single();
    if (docError) throw docError;

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, client_name, client_doc, total, date, payment_mode')
      .eq('id', document.invoice_id)
      .maybeSingle();

    const { data: settings } = await supabase
      .from('fe_dian_settings')
      .select('issuer_legal_name, issuer_nit, environment')
      .eq('company_id', document.company_id)
      .maybeSingle();

    return {
      data: { document, invoice: invoice ?? null, settings: settings ?? null },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * Abre ventana de impresion con la representacion grafica FE + QR.
 * @param {string} documentId
 * @returns {{ ok: boolean, error?: string }}
 */
export async function printFeRepresentation(documentId) {
  try {
    const { data, error } = await getFeRepresentationBundle(documentId);
    if (error || !data) throw new Error(error || 'No se pudo cargar la representacion FE');

    const { openFeRepresentationPrint } = await import('./feRepresentation');
    openFeRepresentationPrint(data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Obtiene el documento FE de una factura especifica.
 * @param {string} invoiceId
 */
export async function getFeDocumentByInvoice(invoiceId) {
  try {
    const { data, error } = await supabase
      .from('fe_documents')
      .select('id, status, cufe, qr_payload, prefix, sequence_number, validated_at')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ---------- Eventos de documento ------------------------------------------

/**
 * Obtiene el historial de eventos de un documento FE.
 * @param {string} documentId
 */
export async function getFeDocumentEvents(documentId) {
  try {
    const { data, error } = await supabase
      .from('fe_document_events')
      .select('id, event_type, detail, payload, created_at')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

// ---------- Generacion de documento (llama al API backend) ----------------

/**
 * Genera el XML UBL + CUFE para una factura y lo guarda en fe_documents.
 * Requiere que el API /api/fe-generate este disponible.
 *
 * @param {string} invoiceId - UUID de la factura en invoices
 * @param {{ product_id: string, tax_rate: number }[]} itemsTax - IVA por item (opcional)
 * @returns {{ ok: boolean, document_id?: string, status?: string, cufe?: string, invoice_number?: string, qr_payload?: string, error?: string }}
 */
export async function generateFeDocument(invoiceId, itemsTax = []) {
  try {
    const result = await callApi('/api/fe-generate', {
      invoice_id: invoiceId,
      items_tax: itemsTax,
    });
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------- Firma del documento (llama al API backend) --------------------

/**
 * Firma el XML de un documento FE con XAdES-BES.
 * Requiere que el documento este en status 'pending' o 'error'.
 * El certificado se lee desde las variables de entorno del servidor.
 *
 * @param {string} documentId - UUID del documento en fe_documents
 * @returns {{ ok: boolean, document_id?: string, status?: string, invoice_number?: string, error?: string }}
 */
export async function signFeDocument(documentId) {
  try {
    const result = await callApi('/api/fe-sign', { document_id: documentId });
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------- Envio a DIAN (llama al API backend) ---------------------------

/**
 * Empaqueta el XML firmado en ZIP y lo envia a DIAN via SOAP SendBillSync.
 * Requiere que el documento este en status 'signed'.
 *
 * @param {string} documentId - UUID del documento en fe_documents
 * @returns {{ ok: boolean, document_id?: string, status?: string, dian_track_id?: string, status_code?: string, status_description?: string, invoice_number?: string, error?: string }}
 */
export async function sendFeDocument(documentId) {
  try {
    const result = await callApi('/api/fe-send', { document_id: documentId });
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------- Consulta de estado DIAN --------------------------------------

/**
 * Consulta el estado de validacion de un documento en DIAN via GetStatusZip.
 * Requiere que el documento este en status 'sent' o 'rejected' (con track_id).
 *
 * @param {string} documentId - UUID del documento en fe_documents
 * @returns {{ ok: boolean, document_id?: string, status?: string, pending?: boolean, status_code?: string, status_description?: string, invoice_number?: string, error?: string }}
 */
export async function checkFeStatus(documentId) {
  try {
    const result = await callApi('/api/fe-status', { document_id: documentId });
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------- Helpers de UI -------------------------------------------------

export const FE_STATUS_LABELS = {
  pending: 'Pendiente',
  signed: 'Firmado',
  sent: 'Enviado a DIAN',
  validated: 'Validado DIAN',
  rejected: 'Rechazado DIAN',
  error: 'Error',
};

export const FE_STATUS_COLORS = {
  pending: '#f59e0b',
  signed: '#3b82f6',
  sent: '#8b5cf6',
  validated: '#10b981',
  rejected: '#ef4444',
  error: '#6b7280',
};

/**
 * Retorna etiqueta legible de estado FE.
 * @param {string} status
 */
export function feStatusLabel(status) {
  return FE_STATUS_LABELS[status] ?? status ?? '-';
}

/**
 * Retorna color de estado FE.
 * @param {string} status
 */
export function feStatusColor(status) {
  return FE_STATUS_COLORS[status] ?? '#6b7280';
}

/**
 * Retorna true si el documento ya fue validado por DIAN.
 * @param {string} status
 */
export function isFeValidated(status) {
  return status === 'validated';
}

/**
 * Retorna true si el documento se puede reintentar.
 * @param {string} status
 */
export function isFeRetryable(status) {
  return status === 'error' || status === 'rejected';
}
