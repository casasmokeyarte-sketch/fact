
export const DEFAULT_PERMISSIONS = {
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
  recibosCajaExternos: true,
  notas: true,
  historial: true,
  cierres: true
};

export const normalizeRole = (role) => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return 'Administrador';
  if (normalized === 'administrador' || normalized === 'admin') return 'Administrador';
  if (normalized.includes('supervisor')) return 'Supervisor';
  if (normalized.includes('cajer')) return 'Cajero';
  return String(role).trim();
};

const parsePermissionString = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'si') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'null' || normalized === 'undefined') return false;

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const normalizePermissionValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const parsed = parsePermissionString(value);
    if (typeof parsed === 'boolean') return parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return normalizePermissionValue(parsed);
    return undefined;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const normalizedObject = {};
    Object.entries(value).forEach(([key, nestedValue]) => {
      const normalizedNested = normalizePermissionValue(nestedValue);
      normalizedObject[key] = normalizedNested === undefined ? nestedValue : normalizedNested;
    });
    return normalizedObject;
  }

  return undefined;
};

export const normalizePermissions = (permissions) => {
  let source = permissions;

  if (typeof source === 'string') {
    const parsed = parsePermissionString(source);
    source = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { ...DEFAULT_PERMISSIONS };
  }

  const candidate = source.modules && typeof source.modules === 'object' && !Array.isArray(source.modules)
    ? source.modules
    : source;

  const normalized = { ...DEFAULT_PERMISSIONS };
  Object.keys(DEFAULT_PERMISSIONS).forEach((key) => {
    const normalizedValue = normalizePermissionValue(candidate[key]);
    if (normalizedValue !== undefined) {
      normalized[key] = normalizedValue;
    }
  });

  return normalized;
};

export const normalizePermissionsForRole = (role, permissions) => {
  const normalizedRole = normalizeRole(role);
  const base = normalizePermissions(permissions);

  if (normalizedRole === 'Cajero') {
    return {
      ...base,
      inventario: true,
      codigos: true,
      compras: false
    };
  }

  if (normalizedRole === 'Supervisor') {
    return {
      ...base,
      inventario: true,
      codigos: true,
      reportes: true,
      bitacora: true,
      facturacion: true,
      clientes: true,
      cartera: true,
      caja: true,
      compras: true,
      historial: true,
      gastos: true,
      recibosCajaExternos: true,
      notas: true,
      config: false
    };
  }

  return base;
};

export const normalizeAppUser = (user) => {
  if (!user || typeof user !== 'object') return null;

  const hasExplicitRole = String(user?.role || '').trim().length > 0;
  const normalizedRole = hasExplicitRole ? normalizeRole(user?.role) : null;
  const name = String(
    user?.name ||
    user?.display_name ||
    user?.username ||
    user?.email ||
    ''
  ).trim();

  const id = String(user?.id || user?.user_id || '').trim();
  const username = String(
    user?.username ||
    (String(user?.email || '').includes('@') ? String(user.email).split('@')[0] : '')
  ).trim();
  const email = String(user?.email || '').trim();

  const normalized = {
    ...user,
    id: id || null,
    name: name || email || username || 'Usuario',
    username: username || (email ? email.split('@')[0] : ''),
    email: email || null,
    role: normalizedRole,
    permissions: hasExplicitRole
      ? normalizePermissionsForRole(normalizedRole, user?.permissions)
      : (user?.permissions ?? null),
    authorization_key: String(
      user?.authorization_key ||
      user?.authorizationKey ||
      user?.permissions?.authorizationKey ||
      ''
    ).trim(),
  };

  return normalized;
};

export const mergeUsersByIdentity = (...groups) => {
  const result = [];
  const flat = groups.flat().filter(Boolean);
  let changed = false;

  flat.forEach((user) => {
    const normalized = normalizeAppUser(user);
    if (!normalized) return;

    const existingIndex = result.findIndex((u) => {
      if (normalized.id && u.id && String(normalized.id) === String(u.id)) return true;
      if (normalized.email && u.email && String(normalized.email).toLowerCase() === String(u.email).toLowerCase()) return true;
      if (normalized.username && u.username && String(normalized.username).toLowerCase() === String(u.username).toLowerCase()) return true;
      if (normalized.name && u.name && String(normalized.name).toLowerCase() === String(u.name).toLowerCase()) return true;
      return false;
    });

    if (existingIndex >= 0) {
      const existing = result[existingIndex];
      const merged = {
        ...existing,
        ...normalized,
        id: normalized.id || existing.id,
        role: normalized.role || existing.role,
        permissions: normalized.permissions || existing.permissions,
        authorization_key: normalized.authorization_key || existing.authorization_key
      };

      if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        result[existingIndex] = merged;
        changed = true;
      }
    } else {
      result.push(normalized);
      changed = true;
    }
  });

  // If the input was just one group and it matches the result, we might still want to return original.
  // But usually groups.flat() creates a new array anyway. 
  // The most important thing is avoiding setUsers() triggering if nothing changed.
  return changed ? result : (groups.length === 1 && Array.isArray(groups[0]) ? groups[0] : result);
};
