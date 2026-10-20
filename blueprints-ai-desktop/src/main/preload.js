'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('api', {
  isDesktop: true,
  listProjects: inv('projects:list'), saveProject: inv('projects:save'), deleteProject: inv('projects:delete'),
  getSettings: inv('settings:get'), setSettings: inv('settings:set'),
  saveAttachment: inv('attach:save'), chat: inv('ai:chat'),
  exportPdf: inv('export:pdf'), exportText: inv('export:text'), exportFiles: inv('export:files'), importJson: inv('import:json'), reveal: inv('app:reveal'),
});
