import { spawn } from 'node:child_process';

const DEFAULT_PORT = '5173';
const PORT = process.env.VITE_PORT || DEFAULT_PORT;
const VITE_URL = process.env.VITE_URL || `http://127.0.0.1:${PORT}`;
const WAIT_TIMEOUT_MS = 25000;
const RETRY_MS = 500;
const SHELL_CMD = process.platform === 'win32' ? 'cmd.exe' : 'sh';

let viteProcess;
let electronProcess;
let shuttingDown = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnCommand(command, envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  if (process.platform === 'win32') {
    return spawn(SHELL_CMD, ['/d', '/s', '/c', command], { stdio: 'inherit', env });
  }
  return spawn(SHELL_CMD, ['-lc', command], { stdio: 'inherit', env });
}

async function waitForVite(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await sleep(RETRY_MS);
  }
  throw new Error(`Vite no respondio en ${timeoutMs}ms (${url})`);
}

function killProcess(proc) {
  if (proc && !proc.killed) {
    proc.kill();
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  killProcess(electronProcess);
  killProcess(viteProcess);
  process.exit(code);
}

async function main() {
  console.log('[dev-all] Iniciando Vite...');
  viteProcess = spawnCommand(
    `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`
  );

  viteProcess.on('error', (error) => {
    console.error(`[dev-all] Error iniciando Vite: ${error.message}`);
    shutdown(1);
  });

  viteProcess.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[dev-all] Vite termino con codigo ${code}`);
      shutdown(code || 1);
    }
  });

  await waitForVite(VITE_URL, WAIT_TIMEOUT_MS);
  console.log('[dev-all] Vite listo. Iniciando Electron...');

  electronProcess = spawnCommand('npm run electron:dev', {
    VITE_URL,
    VITE_PORT: PORT,
  });

  electronProcess.on('error', (error) => {
    console.error(`[dev-all] Error iniciando Electron: ${error.message}`);
    shutdown(1);
  });

  electronProcess.on('exit', (code) => shutdown(code || 0));

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

main().catch((error) => {
  console.error(`[dev-all] ${error.message}`);
  shutdown(1);
});
