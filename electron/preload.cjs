const { contextBridge, ipcRenderer } = require('electron');
const PROMPT_CHANNEL = 'system-prompt:ask';

contextBridge.exposeInMainWorld('companyAI', {
  ask: async (question, context) => ipcRenderer.invoke('company-ai:ask', { question, context }),
});

contextBridge.exposeInMainWorld('systemIntegrations', {
  listPrinters: async () => ipcRenderer.invoke('system-printers:list'),
  getNfcStatus: async () => ipcRenderer.invoke('system-nfc:status'),
});

try {
  window.prompt = (message, defaultValue = '') => ipcRenderer.sendSync(PROMPT_CHANNEL, { message, defaultValue });
} catch (error) {
  console.error('[preload] prompt override failed:', error);
}
