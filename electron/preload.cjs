const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companyAI', {
  ask: async (question, context) => ipcRenderer.invoke('company-ai:ask', { question, context }),
});
