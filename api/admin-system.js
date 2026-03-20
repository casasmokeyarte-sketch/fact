import { createClient } from '@supabase/supabase-js';

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
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'administrador' || r === 'admin') return 'Administrador';
  if (r === 'supervisor') return 'Supervisor';
  if (r === 'cajero') return 'Cajero';
  return role ? String(role) : 'Cajero';
}

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function requireAdmin(req) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, message: 'Falta Authorization: Bearer <token>.' };

  const supabase = getAdminSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, status: 401, message: 'Token invalido o expirado. Vuelve a iniciar sesion.' };
  }

  const user = userData.user;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 500, message: 'No se pudo validar permisos de administrador.' };
  }

  const role = normalizeRole(profile?.role);
  if (role !== 'Administrador') {
    return { ok: false, status: 403, message: 'No autorizado. Requiere rol Administrador.' };
  }

  if (!profile?.company_id) {
    return { ok: false, status: 500, message: 'No se encontro company_id para este usuario.' };
  }

  return { ok: true, supabase, user, companyId: profile.company_id };
}

async function deleteInvoiceItemsByCompany(supabase, companyId) {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .limit(5000);

  if (error) throw error;
  const ids = (invoices || []).map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return;

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error: delErr } = await supabase
      .from('invoice_items')
      .delete()
      .in('invoice_id', chunk);
    if (delErr) throw delErr;
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Metodo no permitido.' });
  }

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.message });

    const supabase = auth.supabase;
    const companyId = auth.companyId;
    const body = await readBody(req);
    const action = String(body?.action || '').trim().toLowerCase();

    if (action === 'export') {
      const tables = ['products', 'clients', 'invoices', 'expenses', 'purchases', 'audit_logs', 'shift_history', 'user_cash_balances', 'company_settings'];
      const payload = { exportedAt: new Date().toISOString(), companyId, tables: {} };

      for (const table of tables) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('company_id', companyId)
          .limit(20000);
        if (error) throw error;
        payload.tables[table] = data || [];
      }

      // invoice_items no tiene company_id: se exporta por invoice_id
      const { data: invoiceIds, error: invErr } = await supabase
        .from('invoices')
        .select('id')
        .eq('company_id', companyId)
        .limit(20000);
      if (invErr) throw invErr;
      const ids = (invoiceIds || []).map((r) => r.id).filter(Boolean);
      payload.tables.invoice_items = [];
      const chunkSize = 200;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('invoice_items')
          .select('*')
          .in('invoice_id', chunk)
          .limit(20000);
        if (error) throw error;
        payload.tables.invoice_items.push(...(data || []));
      }

      return json(res, 200, { ok: true, data: payload });
    }

    if (action === 'reset') {
      await deleteInvoiceItemsByCompany(supabase, companyId);

      const deleteByCompany = async (table) => {
        const { error } = await supabase.from(table).delete().eq('company_id', companyId);
        if (error) throw error;
      };

      // Orden: primero dependientes
      await deleteByCompany('invoices');
      await deleteByCompany('products');
      await deleteByCompany('clients');
      await deleteByCompany('expenses');
      await deleteByCompany('purchases');
      await deleteByCompany('shift_history');
      await deleteByCompany('audit_logs');
      await deleteByCompany('user_cash_balances');

      // Reset settings a defaults (no borra la fila)
      const defaults = {
        company_id: companyId,
        payment_methods: ['Efectivo', 'Credito', 'Transferencia', 'Tarjeta'],
        categories: ['General', 'Alimentos', 'Limpieza', 'Otros'],
        operational_days_offset: 0,
        operational_reason: null,
        operational_applied_by: null,
        operational_applied_at: null,
        updated_at: new Date().toISOString(),
      };

      await supabase.from('company_settings').upsert(defaults, { onConflict: 'company_id' });

      return json(res, 200, { ok: true });
    }

    return json(res, 400, { ok: false, error: 'Accion invalida. Use action=export o action=reset.' });
  } catch (err) {
    console.error('[api/admin-system] error:', err);
    const message = String(err?.message || 'Error interno');
    if (message.includes('Missing SUPABASE_URL')) {
      return json(res, 500, { ok: false, error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.' });
    }
    return json(res, 500, { ok: false, error: 'Error interno ejecutando accion del sistema.' });
  }
}

