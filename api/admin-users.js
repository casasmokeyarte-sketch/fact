import { createClient } from '@supabase/supabase-js';

const PROFILE_SELECT = 'user_id,email,display_name,role,company_id,permissions,active,created_at,updated_at';
const LEGACY_PROFILE_SELECT = 'user_id,email,display_name,role,company_id,permissions,created_at,updated_at';
const USER_HISTORY_REFERENCES = [
  { table: 'shift_history', column: 'user_id', label: 'cierres de jornada' },
  { table: 'invoices', column: 'user_id', label: 'facturas' },
  { table: 'expenses', column: 'user_id', label: 'gastos' },
  { table: 'purchases', column: 'user_id', label: 'compras' },
  { table: 'audit_logs', column: 'user_id', label: 'bitacora' },
  { table: 'trades', column: 'user_id', label: 'trueques' },
  { table: 'external_cash_receipts', column: 'user_id', label: 'recibos de caja' },
  { table: 'commercial_notes', column: 'user_id', label: 'notas comerciales' },
  { table: 'user_cash_balances', column: 'user_id', label: 'saldos de caja' },
  { table: 'inventory_transfer_requests', column: 'created_by', label: 'traslados de inventario' },
  { table: 'inventory_transfer_requests', column: 'target_user_id', label: 'traslados recibidos' },
  { table: 'inventory_transfer_requests', column: 'resolved_by', label: 'traslados resueltos' },
];

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

function normalizeEmailCandidate(rawEmail, username, domain) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (email) return email;
  return buildEmailFromUsername(username, domain);
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
    return { ok: false, status: 500, message: 'No se encontro company_id para el administrador autenticado.' };
  }

  return { ok: true, supabase, user, companyId: profile.company_id };
}

function toUiUser(profileRow) {
  const email = String(profileRow?.email || '');
  const username = email.includes('@') ? email.split('@')[0] : email;
  const permissions = profileRow?.permissions && typeof profileRow.permissions === 'object'
    ? profileRow.permissions
    : null;
  return {
    id: profileRow?.user_id,
    user_id: profileRow?.user_id,
    email: profileRow?.email || null,
    username: username || null,
    name: profileRow?.display_name || username || profileRow?.email || 'Usuario',
    display_name: profileRow?.display_name || null,
    role: normalizeRole(profileRow?.role),
    company_id: profileRow?.company_id || null,
    permissions,
    active: profileRow?.active !== false,
    authorization_key: permissions?.authorizationKey || '',
    created_at: profileRow?.created_at || null,
    updated_at: profileRow?.updated_at || null,
  };
}

function isMissingAuthUserError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('user not found') ||
    message.includes('not found') ||
    message.includes('no rows') ||
    message.includes('does not exist')
  );
}

function isMissingSchemaObjectError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code) ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('could not find the') && message.includes('column')
  );
}

async function selectProfiles(supabase, configureQuery) {
  const run = (columns) => configureQuery(supabase.from('profiles').select(columns));
  let result = await run(PROFILE_SELECT);
  if (result.error && isMissingSchemaObjectError(result.error)) {
    result = await run(LEGACY_PROFILE_SELECT);
  }
  return result;
}

async function findUserHistory(supabase, userId) {
  const found = [];

  for (const reference of USER_HISTORY_REFERENCES) {
    const { count, error } = await supabase
      .from(reference.table)
      .select('*', { count: 'exact', head: true })
      .eq(reference.column, userId);

    if (error) {
      if (isMissingSchemaObjectError(error)) continue;
      throw error;
    }
    if (Number(count || 0) > 0) found.push(reference.label);
  }

  return Array.from(new Set(found));
}

async function listAllAuthUserIds(supabase) {
  const ids = new Set();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = Array.isArray(data?.users) ? data.users : [];
    users.forEach((u) => {
      if (u?.id) ids.add(String(u.id));
    });
    if (users.length < perPage) break;
    page += 1;
  }

  return ids;
}

function getRowTimestamp(row) {
  const updated = Date.parse(String(row?.updated_at || ''));
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(String(row?.created_at || ''));
  if (Number.isFinite(created)) return created;
  return 0;
}

function pickMostRecentProfile(a, b) {
  return getRowTimestamp(b) > getRowTimestamp(a) ? b : a;
}

function dedupeProfiles(rows) {
  const byId = new Map();
  (rows || []).forEach((row) => {
    const key = String(row?.user_id || '').trim();
    if (!key) return;
    if (!byId.has(key)) {
      byId.set(key, row);
      return;
    }
    byId.set(key, pickMostRecentProfile(byId.get(key), row));
  });

  const byEmail = new Map();
  Array.from(byId.values()).forEach((row) => {
    const emailKey = String(row?.email || '').trim().toLowerCase();
    const key = emailKey || String(row?.user_id || '').trim();
    if (!key) return;
    if (!byEmail.has(key)) {
      byEmail.set(key, row);
      return;
    }
    byEmail.set(key, pickMostRecentProfile(byEmail.get(key), row));
  });

  return Array.from(byEmail.values());
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
    const companyId = auth.companyId;

    if (req.method === 'GET') {
      const { data, error } = await selectProfiles(
        supabase,
        (query) => query
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(200)
      );

      if (error) return json(res, 500, { ok: false, error: error.message || 'No se pudo listar usuarios.' });

      let authIds = null;
      try {
        authIds = await listAllAuthUserIds(supabase);
      } catch (listError) {
        console.error('[api/admin-users] listUsers failed, fallback sin filtro auth:', {
          message: listError?.message || null,
          status: listError?.status || null,
          code: listError?.code || null,
        });
      }

      const rows = Array.isArray(data) ? data : [];
      const syncedRows = authIds
        ? rows.filter((row) => authIds.has(String(row?.user_id || '')))
        : rows;
      const dedupedRows = dedupeProfiles(syncedRows)
        .sort((a, b) => getRowTimestamp(b) - getRowTimestamp(a))
        .slice(0, 200);

      return json(res, 200, { ok: true, users: dedupedRows.map(toUiUser) });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body?.name || '').trim();
      const username = String(body?.username || '').trim();
      const providedEmail = String(body?.email || '').trim();
      const password = String(body?.password || '').trim();
      const role = normalizeRole(body?.role || 'Cajero');
      const basePermissions = buildDefaultPermissionsForRole(role, body?.permissions);
      const authorizationKey = String(body?.authorization_key || body?.authorizationKey || '').trim();
      const permissions = {
        ...(basePermissions && typeof basePermissions === 'object' ? basePermissions : {}),
      };
      if (authorizationKey) {
        permissions.authorizationKey = authorizationKey;
      }

      const emailDomain = String(body?.emailDomain || process.env.USERNAME_EMAIL_DOMAIN || '@fact.local').trim();

      if (!name || name.length < 2) return json(res, 400, { ok: false, error: 'Nombre obligatorio (minimo 2 caracteres).' });
      if (!isValidUsername(username)) return json(res, 400, { ok: false, error: 'Usuario invalido. Use letras/numeros y . _ - (min 3).' });
      if (!password || password.length < 6) return json(res, 400, { ok: false, error: 'Contrasena invalida (minimo 6 caracteres).' });

      const email = normalizeEmailCandidate(providedEmail, username, emailDomain);

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', email)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingProfile?.user_id) {
        const { data: existingAuth, error: existingAuthError } = await supabase.auth.admin.getUserById(existingProfile.user_id);
        if (existingAuthError || !existingAuth?.user) {
          await supabase
            .from('profiles')
            .delete()
            .eq('user_id', existingProfile.user_id);
        } else {
          return json(res, 409, { ok: false, error: 'Ya existe un usuario con ese nombre.' });
        }
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
        company_id: companyId,
        permissions,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'user_id' });

      if (upsertError) {
        return json(res, 500, { ok: false, error: `Usuario creado, pero no se pudo actualizar perfil: ${upsertError.message}` });
      }

      const { data: freshProfile, error: freshError } = await selectProfiles(
        supabase,
        (query) => query.eq('user_id', userId).maybeSingle()
      );

      if (freshError) return json(res, 200, { ok: true, user: { id: userId, email, name, username, role, permissions } });
      return json(res, 200, { ok: true, user: toUiUser(freshProfile) });
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const userId = String(body?.user_id || body?.id || '').trim();
      const role = normalizeRole(body?.role || 'Cajero');
      const permissions = buildDefaultPermissionsForRole(role, body?.permissions);
      const displayName = String(body?.display_name || body?.name || '').trim();
      const nextEmail = String(body?.email || '').trim().toLowerCase();
      const nextAuthorizationKey = String(body?.authorization_key || body?.authorizationKey || '').trim();
      const nextPassword = String(body?.password || '').trim();
      const requestedActive = typeof body?.active === 'boolean' ? body.active : null;

      if (!userId) return json(res, 400, { ok: false, error: 'Falta user_id.' });
      if (requestedActive === false && String(userId) === String(auth.user?.id || '')) {
        return json(res, 400, { ok: false, error: 'No puedes desactivar tu propio usuario.' });
      }

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('profiles')
        .select(requestedActive === null ? 'company_id' : 'company_id,active')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingProfileError) {
        if (requestedActive !== null && isMissingSchemaObjectError(existingProfileError)) {
          return json(res, 409, {
            ok: false,
            error: 'Falta aplicar la migracion user_deactivation_and_inventory_access.sql en Supabase.'
          });
        }
        return json(res, 500, { ok: false, error: existingProfileError.message || 'No se pudo consultar el perfil actual.' });
      }
      if (!existingProfile || String(existingProfile.company_id || '') !== String(companyId || '')) {
        return json(res, 404, { ok: false, error: 'El usuario no pertenece a esta organizacion.' });
      }

      const mergedPermissions = {
        ...(permissions && typeof permissions === 'object' ? permissions : {}),
        authorizationKey: nextAuthorizationKey || undefined,
      };
      if (!nextAuthorizationKey) delete mergedPermissions.authorizationKey;

      const payload = {
        user_id: userId,
        role,
        company_id: existingProfile?.company_id || companyId,
        permissions: mergedPermissions,
        updated_at: new Date().toISOString(),
      };
      if (displayName) payload.display_name = displayName;
      if (requestedActive !== null) payload.active = requestedActive;

      if (requestedActive !== null) {
        const { error: activeAuthError } = await supabase.auth.admin.updateUserById(userId, {
          ban_duration: requestedActive ? 'none' : '876000h',
        });
        if (activeAuthError) {
          return json(res, 500, {
            ok: false,
            error: activeAuthError.message || 'No se pudo cambiar el acceso del usuario.'
          });
        }
      }

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
      if (error) {
        if (requestedActive !== null) {
          await supabase.auth.admin.updateUserById(userId, {
            ban_duration: requestedActive ? '876000h' : 'none',
          });
        }
        return json(res, 500, { ok: false, error: error.message || 'No se pudo actualizar usuario.' });
      }

      if (displayName || nextPassword) {
        const authPayload = {
          ...(displayName ? { user_metadata: { full_name: displayName } } : {}),
          ...(nextPassword ? { password: nextPassword } : {}),
        };
        const { error: authError } = await supabase.auth.admin.updateUserById(userId, authPayload);
        if (authError) {
          return json(res, 500, { ok: false, error: authError.message || 'No se pudo actualizar credenciales del usuario.' });
        }
      }

      if (nextEmail) {
        const { error: authEmailError } = await supabase.auth.admin.updateUserById(userId, {
          email: nextEmail,
          email_confirm: true,
        });
        if (authEmailError) {
          return json(res, 500, { ok: false, error: authEmailError.message || 'No se pudo actualizar el correo del usuario.' });
        }

        const { error: profileEmailError } = await supabase
          .from('profiles')
          .update({ email: nextEmail, updated_at: new Date().toISOString() })
          .eq('user_id', userId);

        if (profileEmailError) {
          return json(res, 500, { ok: false, error: profileEmailError.message || 'No se pudo actualizar el correo del perfil.' });
        }
      }

      const { data: freshProfile, error: freshError } = await selectProfiles(
        supabase,
        (query) => query.eq('user_id', userId).maybeSingle()
      );

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

      const { data: targetProfile, error: targetProfileError } = await supabase
        .from('profiles')
        .select('company_id,active')
        .eq('user_id', userId)
        .maybeSingle();
      if (targetProfileError) {
        if (isMissingSchemaObjectError(targetProfileError)) {
          return json(res, 409, {
            ok: false,
            error: 'Falta aplicar la migracion user_deactivation_and_inventory_access.sql en Supabase.'
          });
        }
        return json(res, 500, { ok: false, error: 'No se pudo validar el usuario antes de eliminarlo.' });
      }
      if (!targetProfile || String(targetProfile.company_id || '') !== String(companyId || '')) {
        return json(res, 404, { ok: false, error: 'El usuario no pertenece a esta organizacion.' });
      }
      if (targetProfile.active !== false) {
        return json(res, 409, {
          ok: false,
          error: 'Primero debe desactivar al usuario antes de solicitar su eliminacion permanente.'
        });
      }

      let historyLabels = [];
      try {
        historyLabels = await findUserHistory(supabase, userId);
      } catch (historyError) {
        console.error('[api/admin-users] history validation failed:', {
          userId,
          message: historyError?.message || null,
          code: historyError?.code || null,
        });
        return json(res, 500, {
          ok: false,
          error: 'No se pudo verificar de forma segura el historial del usuario.'
        });
      }
      if (historyLabels.length > 0) {
        return json(res, 409, {
          ok: false,
          error: `El usuario conserva ${historyLabels.join(', ')}. Desactivalo para bloquear su acceso sin borrar el historial.`
        });
      }

      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteAuthError && !isMissingAuthUserError(deleteAuthError)) {
        console.error('[api/admin-users] deleteUser failed:', {
          userId,
          message: deleteAuthError.message || null,
          status: deleteAuthError.status || null,
          code: deleteAuthError.code || null,
          name: deleteAuthError.name || null,
        });
        return json(res, 500, { ok: false, error: deleteAuthError.message || 'No se pudo eliminar el usuario.' });
      }

      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      if (deleteProfileError) {
        console.error('[api/admin-users] profile cleanup failed:', {
          userId,
          message: deleteProfileError.message || null,
          code: deleteProfileError.code || null,
          details: deleteProfileError.details || null,
          hint: deleteProfileError.hint || null,
        });
        return json(res, 500, { ok: false, error: deleteProfileError.message || 'No se pudo limpiar el perfil del usuario.' });
      }

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
