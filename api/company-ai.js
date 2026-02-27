const SCOPE_KEYWORDS = [
  'sistema', 'modulo', 'facturacion', 'factura', 'inventario', 'stock', 'compras', 'clientes',
  'cartera', 'caja', 'reportes', 'bitacora', 'notas', 'historial', 'cierres', 'permiso', 'permisos',
  'rol', 'usuario', 'jornada', 'consulta rapida', 'codigo', 'barra', 'empresa', 'casa smoke',
  'nit', 'direccion', 'telefono', 'correo', 'supabase', 'fact pro',
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isScopeAllowed(question) {
  const q = normalizeText(question);
  if (!q || q.length < 3) return false;
  return SCOPE_KEYWORDS.some((keyword) => q.includes(keyword));
}

function buildSystemPrompt() {
  return [
    'Eres el asistente interno de CASA SMOKE Y ARTE OT SSOT SAS.',
    'Reglas:',
    '1) Solo responde temas del sistema de facturacion y de la empresa.',
    '2) Si la pregunta no es de ese alcance, responde: "Con gusto te ayudo, pero solo con temas del sistema y de la empresa."',
    '3) Responde en espanol con tono amable, breve y accionable.',
    '4) No inventes datos; si falta informacion, dilo claramente.',
  ].join('\n');
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, answer: 'Metodo no permitido.' });
  }

  const body = await readBody(req);
  const question = String(body?.question || '').trim();
  const context = String(body?.context || '').trim();

  if (!question) {
    return json(res, 400, { ok: false, answer: 'Escribe una pregunta.' });
  }

  if (!isScopeAllowed(question)) {
    return json(res, 200, { ok: true, answer: 'Con gusto te ayudo, pero solo con temas del sistema y de la empresa.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(res, 500, { ok: false, answer: 'Falta OPENAI_API_KEY en Vercel.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        temperature: 0.2,
        input: [
          { role: 'system', content: buildSystemPrompt() },
          {
            role: 'user',
            content: `Contexto interno:\n${context || 'Sin contexto adicional.'}\n\nPregunta:\n${question}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[api/company-ai] OpenAI error:', response.status, errText);
      return json(res, 502, { ok: false, answer: 'No se pudo consultar el asistente en este momento.' });
    }

    const data = await response.json();
    const answer = String(data?.output_text || '').trim() || 'No tengo una respuesta valida en este momento.';
    return json(res, 200, { ok: true, answer });
  } catch (error) {
    console.error('[api/company-ai] error:', error);
    return json(res, 500, { ok: false, answer: 'Error interno consultando el asistente.' });
  }
}
