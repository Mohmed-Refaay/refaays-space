const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('refaay', {
  chooseVideo: () => ipcRenderer.invoke('video:choose'),
  droppedFilePath: (file) => webUtils.getPathForFile(file),
  chooseOutput: () => ipcRenderer.invoke('output:choose'),
  inspectVideo: (path) => ipcRenderer.invoke('video:inspect', path),
  checkSystem: () => ipcRenderer.invoke('system:check'),
  startRemoval: (options) => ipcRenderer.invoke('removal:start', options),
  cancelRemoval: () => ipcRenderer.invoke('removal:cancel'),
  revealFile: (path) => ipcRenderer.invoke('file:reveal', path),
  onProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('removal:progress', handler);
    return () => ipcRenderer.removeListener('removal:progress', handler);
  }
});
