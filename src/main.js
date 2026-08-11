const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { inspectVideo, checkSystem, MusicRemovalJob } = require('./music-remover');

let mainWindow;
let activeJob = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f4efe6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('video:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a video',
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'ts'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('output:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose an export folder',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('video:inspect', (_event, filePath) => inspectVideo(filePath));
ipcMain.handle('system:check', () => checkSystem());
ipcMain.handle('file:reveal', (_event, filePath) => shell.showItemInFolder(filePath));

ipcMain.handle('removal:start', async (_event, options) => {
  if (activeJob) throw new Error('A video is already being processed.');
  activeJob = new MusicRemovalJob(options, (update) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('removal:progress', update);
  });
  try {
    return await activeJob.run();
  } finally {
    activeJob = null;
  }
});

ipcMain.handle('removal:cancel', () => {
  if (!activeJob) return false;
  activeJob.cancel();
  return true;
});
