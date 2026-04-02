const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companyAI', {
  ask: async (question, context) => ipcRenderer.invoke('company-ai:ask', { question, context }),
});

contextBridge.exposeInMainWorld('systemIntegrations', {
  listPrinters: async () => ipcRenderer.invoke('system-printers:list'),
  getNfcStatus: async () => ipcRenderer.invoke('system-nfc:status'),
});
