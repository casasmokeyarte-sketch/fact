const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const ASK_CHANNEL = 'company-ai:ask';

const SCOPE_KEYWORDS = [
  'sistema', 'modulo', 'facturacion', 'factura', 'inventario', 'stock', 'compras', 'clientes',
  'cartera', 'caja', 'reportes', 'bitacora', 'notas', 'historial', 'cierres', 'permiso', 'permisos',
  'rol', 'usuario', 'jornada', 'consulta rapida', 'codigo', 'barra', 'empresa', 'casa smoke',
  'nit', 'direccion', 'telefono', 'correo', 'supabase', 'fact pro',
];

function readEnvFileValue(key) {
  const envCandidates = [
    path.join(__dirname, '../.env.local'),
    path.join(__dirname, '../.env'),
  ];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const k = trimmed.slice(0, eq).trim();
      if (k !== key) continue;
      return trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    }
  }

  return '';
}

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
    'Reglas estrictas:',
    '1) Solo responde temas del sistema de facturacion y de la empresa.',
    '2) Si la pregunta no es de ese alcance, responde de forma amable: "Con gusto te ayudo, pero solo con temas del sistema y de la empresa."',
    '3) Responde en espanol, tono amable, breve y accionable.',
    '4) Puedes saludar cuando corresponda.',
    '5) No inventes datos; si falta informacion del sistema, dilo.',
  ].join('\n');
}

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
});

function findFirstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function createWindow() {
  const iconCandidates = [
    path.join(__dirname, '../public/logo.png'),
    path.join(process.resourcesPath, 'app.asar', 'public/logo.png'),
    path.join(process.resourcesPath, 'public/logo.png'),
  ];

  const iconPath = findFirstExistingPath(iconCandidates);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    ...(iconPath ? { icon: iconPath } : {}),
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[renderer] did-fail-load:', { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] render-process-gone:', details);
  });

  const isDev = !app.isPackaged;
  const distCandidates = [
    path.join(__dirname, '../dist/index.html'),
    path.join(process.resourcesPath, 'app.asar', 'dist/index.html'),
    path.join(process.resourcesPath, 'dist/index.html'),
  ];

  const distIndex = findFirstExistingPath(distCandidates);

  if (isDev) {
    const devServerUrl = process.env.VITE_URL || 'http://localhost:5173';
    mainWindow.webContents.on('did-fail-load', (_event, errorCode) => {
      if ((errorCode === -102 || errorCode === -105) && distIndex) {
        mainWindow.loadFile(distIndex).catch((e) => {
          console.error('[main] fallback loadFile error:', e);
        });
      }
    });

    mainWindow.loadURL(devServerUrl).catch(() => {
      if (distIndex) {
        mainWindow.loadFile(distIndex).catch((e) => {
          console.error('[main] fallback loadFile error:', e);
        });
      }
    });
    return;
  }

  if (distIndex) {
    mainWindow.loadFile(distIndex).catch((e) => {
      console.error('[main] prod loadFile error:', e);
    });
    return;
  }

  const errorHtml = `
    <html><body style="font-family: sans-serif; padding: 20px;">
      <h2>No se encontro dist/index.html</h2>
      <p>Verifique el empaquetado de Electron.</p>
    </body></html>
  `;
  mainWindow.loadURL(`data:text/html,${encodeURIComponent(errorHtml)}`);
}

ipcMain.handle(ASK_CHANNEL, async (_event, payload) => {
  try {
    const question = String(payload?.question || '').trim();
    const context = String(payload?.context || '').trim();

    if (!question) {
      return { ok: false, answer: 'Escribe una pregunta.' };
    }

    if (!isScopeAllowed(question)) {
      return { ok: true, answer: 'Con gusto te ayudo, pero solo con temas del sistema y de la empresa.' };
    }

    const apiKey = process.env.OPENAI_API_KEY || readEnvFileValue('OPENAI_API_KEY');
    if (!apiKey) {
      return { ok: false, answer: 'Falta OPENAI_API_KEY en el entorno de Electron.' };
    }

    const input = [
      { role: 'system', content: buildSystemPrompt() },
      {
        role: 'user',
        content: `Contexto interno:\n${context || 'Sin contexto adicional.'}\n\nPregunta:\n${question}`,
      },
    ];

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || readEnvFileValue('OPENAI_MODEL') || 'gpt-4.1-mini',
        input,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[main] OpenAI error:', response.status, errText);
      return { ok: false, answer: 'No se pudo consultar el asistente en este momento.' };
    }

    const data = await response.json();
    const answer = String(data?.output_text || '').trim() || 'No tengo una respuesta valida en este momento.';

    return { ok: true, answer };
  } catch (error) {
    console.error('[main] ASK_CHANNEL error:', error);
    return { ok: false, answer: 'Error interno consultando el asistente.' };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
