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

function isValidUsername(username) {
  const u = String(username || '').trim();
  if (!u || u.length < 3) return false;
  return /^[a-zA-Z0-9._-]+$/.test(u);
}

function buildEmailFromUsername(username, domain) {
  const u = String(username || '').trim().toLowerCase();
  const d = String(domain || '').trim().toLowerCase();
  const safeDomain = d.startsWith('@') ? d : `@${d || 'fact.local'}`;
  return `${u}${safeDomain}`;
}

function buildDefaultPermissionsForRole(role, providedPermissions) {
  if (providedPermissions && typeof providedPermissions === 'object') return providedPermissions;

  const normalized = normalizeRole(role);
  if (normalized === 'Administrador') {
    return {
      facturacion: true,
      cartera: true,
      compras: true,
      clientes: true,
      caja: true,
      inventario: true,
      codigos: true,
      reportes: true,
      bitacora: true,
      config: true,
      trueque: true,
      gastos: true,
      notas: true,
      historial: true,
      cierres: true,
    };
  }

  if (normalized === 'Supervisor') {
    return {
      facturacion: true,
      cartera: true,
      compras: true,
      clientes: true,
      caja: true,
      inventario: true,
      codigos: true,
      reportes: true,
      bitacora: true,
      config: false,
      trueque: true,
      gastos: true,
      notas: true,
      historial: true,
      cierres: true,
    };
  }

  return {
    facturacion: true,
    cartera: false,
    compras: false,
    clientes: false,
    caja: false,
    inventario: false,
    codigos: false,
    reportes: false,
    bitacora: false,
    config: false,
    trueque: false,
    gastos: false,
    notas: false,
    historial: false,
    cierres: false,
  };
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
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 500, message: 'No se pudo validar permisos de administrador.' };
  }

  const role = normalizeRole(profile?.role);
  if (role !== 'Administrador') {
    return { ok: false, status: 403, message: 'No autorizado. Requiere rol Administrador.' };
  }

  return { ok: true, supabase, user };
}

function toUiUser(profileRow) {
  const email = String(profileRow?.email || '');
  const username = email.includes('@') ? email.split('@')[0] : email;
  return {
    id: profileRow?.user_id,
    user_id: profileRow?.user_id,
    email: profileRow?.email || null,
    username: username || null,
    name: profileRow?.display_name || username || profileRow?.email || 'Usuario',
    display_name: profileRow?.display_name || null,
    role: normalizeRole(profileRow?.role),
    permissions: profileRow?.permissions || null,
    created_at: profileRow?.created_at || null,
    updated_at: profileRow?.updated_at || null,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.end();
  }

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.message });
    const supabase = auth.supabase;

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id,email,display_name,role,permissions,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) return json(res, 500, { ok: false, error: error.message || 'No se pudo listar usuarios.' });
      return json(res, 200, { ok: true, users: (data || []).map(toUiUser) });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body?.name || '').trim();
      const username = String(body?.username || '').trim();
      const password = String(body?.password || '').trim();
      const role = normalizeRole(body?.role || 'Cajero');
      const permissions = buildDefaultPermissionsForRole(role, body?.permissions);

      const emailDomain = String(body?.emailDomain || process.env.USERNAME_EMAIL_DOMAIN || '@fact.local').trim();

      if (!name || name.length < 2) return json(res, 400, { ok: false, error: 'Nombre obligatorio (minimo 2 caracteres).' });
      if (!isValidUsername(username)) return json(res, 400, { ok: false, error: 'Usuario invalido. Use letras/numeros y . _ - (min 3).' });
      if (!password || password.length < 6) return json(res, 400, { ok: false, error: 'Contrasena invalida (minimo 6 caracteres).' });

      const email = buildEmailFromUsername(username, emailDomain);

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();

      if (existingProfile?.user_id) {
        return json(res, 409, { ok: false, error: 'Ya existe un usuario con ese nombre.' });
      }

      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          username,
        },
      });

      if (createError) {
        const msg = String(createError?.message || 'No se pudo crear el usuario.');
        const isConflict = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists');
        return json(res, isConflict ? 409 : 500, { ok: false, error: msg });
      }

      const userId = created?.user?.id;
      if (!userId) return json(res, 500, { ok: false, error: 'Usuario creado pero no se obtuvo el id.' });

      const profilePayload = {
        user_id: userId,
        email,
        display_name: name,
        role,
        permissions,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'user_id' });

      if (upsertError) {
        return json(res, 500, { ok: false, error: `Usuario creado, pero no se pudo actualizar perfil: ${upsertError.message}` });
      }

      const { data: freshProfile, error: freshError } = await supabase
        .from('profiles')
        .select('user_id,email,display_name,role,permissions,created_at,updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (freshError) return json(res, 200, { ok: true, user: { id: userId, email, name, username, role, permissions } });
      return json(res, 200, { ok: true, user: toUiUser(freshProfile) });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const userId = String(body?.user_id || body?.id || '').trim();
      const role = normalizeRole(body?.role || 'Cajero');
      const permissions = buildDefaultPermissionsForRole(role, body?.permissions);
      const displayName = String(body?.display_name || body?.name || '').trim();

      if (!userId) return json(res, 400, { ok: false, error: 'Falta user_id.' });

      const payload = {
        user_id: userId,
        role,
        permissions,
        updated_at: new Date().toISOString(),
      };
      if (displayName) payload.display_name = displayName;

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
      if (error) return json(res, 500, { ok: false, error: error.message || 'No se pudo actualizar usuario.' });

      const { data: freshProfile, error: freshError } = await supabase
        .from('profiles')
        .select('user_id,email,display_name,role,permissions,created_at,updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (freshError) return json(res, 200, { ok: true });
      return json(res, 200, { ok: true, user: toUiUser(freshProfile) });
    }

    if (req.method === 'DELETE') {
      const body = await readBody(req);
      const userId = String(body?.user_id || body?.id || '').trim();
      if (!userId) return json(res, 400, { ok: false, error: 'Falta user_id.' });
      if (String(userId) === String(auth.user?.id || '')) {
        return json(res, 400, { ok: false, error: 'No puedes eliminar tu propio usuario.' });
      }

      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) return json(res, 500, { ok: false, error: error.message || 'No se pudo eliminar el usuario.' });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: 'Metodo no permitido.' });
  } catch (err) {
    console.error('[api/admin-users] error:', err);
    const message = String(err?.message || 'Error interno');
    if (message.includes('Missing SUPABASE_URL')) {
      return json(res, 500, { ok: false, error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel.' });
    }
    return json(res, 500, { ok: false, error: 'Error interno creando/gestionando usuarios.' });
  }
}

