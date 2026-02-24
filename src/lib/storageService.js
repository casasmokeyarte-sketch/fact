import { supabase } from './supabaseClient'

// SUBIR ARCHIVO
export async function uploadFile(bucket, path, file) {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// DESCARGAR ARCHIVO
export async function downloadFile(bucket, path) {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path)
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// OBTENER URL PAsBLICA
export function getPublicUrl(bucket, path) {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)
  return data.publicUrl
}

// LISTAR ARCHIVOS
export async function listFiles(bucket, path) {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// ELIMINAR ARCHIVO
export async function deleteFile(bucket, path) {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path])
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error: error.message }
  }
}

// SUBIR MAsLTIPLES ARCHIVOS
export async function uploadMultipleFiles(bucket, files) {
  try {
    const uploadPromises = files.map(({ path, file }) =>
      supabase.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
    )
    const results = await Promise.all(uploadPromises)
    
    const errors = results.filter(r => r.error)
    if (errors.length > 0) {
      throw new Error(`${errors.length} archivo(s) fallaron al subir`)
    }

    return { data: results.map(r => r.data), error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}
