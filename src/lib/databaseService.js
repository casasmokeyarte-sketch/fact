import { supabase } from './supabaseClient'

// CLIENTES
export async function getClients(userId) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function createClient(clientData) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert([clientData])
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function updateClient(id, clientData) {
  try {
    const { data, error } = await supabase
      .from('clients')
      .update(clientData)
      .eq('id', id)
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function deleteClient(id) {
  try {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error: error.message }
  }
}

// FACTURAS/INVOICES
export async function getInvoices(userId) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function createInvoice(invoiceData) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .insert([invoiceData])
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function updateInvoice(id, invoiceData) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .update(invoiceData)
      .eq('id', id)
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// PRODUCTOS/INVENTARIO
export async function getProducts(userId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function createProduct(productData) {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert([productData])
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function updateProduct(id, productData) {
  try {
    const { data, error } = await supabase
      .from('products')
      .update(productData)
      .eq('id', id)
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// GASTOS
export async function getExpenses(userId) {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function createExpense(expenseData) {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .insert([expenseData])
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// TURNOS/SHIFTS
export async function getShifts(userId) {
  try {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function createShift(shiftData) {
  try {
    const { data, error } = await supabase
      .from('shifts')
      .insert([shiftData])
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function updateShift(id, shiftData) {
  try {
    const { data, error } = await supabase
      .from('shifts')
      .update(shiftData)
      .eq('id', id)
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// COMPRAS/PURCHASES
export async function getPurchases(userId) {
  try {
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function createPurchase(purchaseData) {
  try {
    const { data, error } = await supabase
      .from('purchases')
      .insert([purchaseData])
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function updatePurchase(id, purchaseData) {
  try {
    const { data, error } = await supabase
      .from('purchases')
      .update(purchaseData)
      .eq('id', id)
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// BITACORA DE AUDITORAA
export async function getAuditLogs(userId) {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function createAuditLog(logData) {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .insert([logData])
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// PERFIL DE USUARIO
export async function getProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function upsertProfile(profileData) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert([profileData], { onConflict: 'user_id' })
      .select()
    if (error) throw error
    return { data: data[0], error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}
