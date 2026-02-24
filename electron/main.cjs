const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

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
