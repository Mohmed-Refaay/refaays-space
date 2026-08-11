const state = { inputPath: null, outputDirectory: null, info: null, outputPath: null };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showPage(name) {
  $$('.page').forEach((page) => page.classList.remove('active'));
  $$('.nav-item[data-page]').forEach((item) => item.classList.toggle('active', item.dataset.page === name));
  $(`#${name}-page`).classList.add('active');
  $('#page-name').textContent = name === 'music-remover' ? 'Music Remover' : name[0].toUpperCase() + name.slice(1);
  if (name === 'settings') refreshSystemStatus();
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  return [hours, minutes, secs].filter((_, index) => index || hours).map((part) => String(part).padStart(2, '0')).join(':');
}

function formatBytes(bytes) {
  if (!bytes) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function setToolPanel(name) {
  ['drop-zone', 'file-panel', 'progress-panel', 'result-panel'].forEach((id) => $(`#${id}`).classList.toggle('hidden', id !== name));
}

async function loadVideo(filePath) {
  try {
    state.info = await window.refaay.inspectVideo(filePath);
    state.inputPath = filePath;
    state.outputDirectory = null;
    $('#file-name').textContent = state.info.name;
    $('#file-meta').textContent = `${formatDuration(state.info.duration)} · ${formatBytes(state.info.size)} · ${state.info.width} × ${state.info.height}`;
    $('#file-path').textContent = state.info.directory;
    $('#output-path').textContent = 'Same folder as the original';
    setToolPanel('file-panel');
  } catch (error) {
    alert(`This video could not be opened.\n\n${error.message}`);
  }
}

async function chooseVideo() {
  const filePath = await window.refaay.chooseVideo();
  if (filePath) loadVideo(filePath);
}

async function refreshSystemStatus() {
  $('#ffmpeg-status').textContent = 'Checking…';
  $('#demucs-status').textContent = 'Checking…';
  const system = await window.refaay.checkSystem();
  $('#ffmpeg-status').textContent = system.ffmpeg && system.ffprobe ? 'Ready' : 'Missing';
  $('#ffmpeg-status').className = system.ffmpeg && system.ffprobe ? 'ready' : 'missing';
  $('#demucs-status').textContent = system.python ? 'Ready' : 'Needs installation';
  $('#demucs-status').className = system.python ? 'ready' : 'missing';
  $('#install-help').classList.toggle('hidden', Boolean(system.python));
  return Boolean(system.python);
}

async function startRemoval() {
  const ready = await refreshSystemStatus();
  if (!ready) {
    showPage('settings');
    return;
  }
  setToolPanel('progress-panel');
  $('#progress-bar').style.width = '0%';
  try {
    const result = await window.refaay.startRemoval({
      inputPath: state.inputPath,
      outputDirectory: state.outputDirectory,
      chunkMinutes: 10
    });
    state.outputPath = result.outputPath;
    $('#result-path').textContent = result.outputPath;
    setToolPanel('result-panel');
  } catch (error) {
    if (!error.message.toLowerCase().includes('cancel')) alert(`Processing stopped.\n\n${error.message}`);
    setToolPanel('file-panel');
  }
}

window.refaay.onProgress(({ stage, progress, detail }) => {
  const names = { extracting: 'Preparing audio', separating: 'Removing music', joining: 'Joining clean audio', exporting: 'Creating video', complete: 'Complete' };
  $('#progress-title').textContent = names[stage] || 'Working on your video';
  $('#progress-detail').textContent = detail;
  $('#progress-stage').textContent = names[stage] || stage;
  $('#progress-percent').textContent = `${progress}%`;
  $('#progress-bar').style.width = `${progress}%`;
});

$$('[data-page]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
$$('[data-open-app]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.openApp)));
$('#browse-button').addEventListener('click', chooseVideo);
$('#drop-zone').addEventListener('click', (event) => { if (event.target === $('#drop-zone')) chooseVideo(); });
$('#drop-zone').addEventListener('dragover', (event) => { event.preventDefault(); $('#drop-zone').classList.add('dragging'); });
$('#drop-zone').addEventListener('dragleave', () => $('#drop-zone').classList.remove('dragging'));
$('#drop-zone').addEventListener('drop', (event) => {
  event.preventDefault();
  $('#drop-zone').classList.remove('dragging');
  const file = event.dataTransfer.files[0];
  if (file) loadVideo(window.refaay.droppedFilePath(file));
});
$('#remove-file').addEventListener('click', () => { state.inputPath = null; state.info = null; setToolPanel('drop-zone'); });
$('#choose-output').addEventListener('click', async () => {
  const directory = await window.refaay.chooseOutput();
  if (directory) { state.outputDirectory = directory; $('#output-path').textContent = directory; }
});
$('#start-button').addEventListener('click', startRemoval);
$('#cancel-button').addEventListener('click', async () => { $('#cancel-button').textContent = 'Stopping…'; await window.refaay.cancelRemoval(); $('#cancel-button').textContent = 'Cancel processing'; });
$('#reveal-button').addEventListener('click', () => window.refaay.revealFile(state.outputPath));
$('#another-button').addEventListener('click', () => { state.inputPath = null; state.info = null; state.outputPath = null; setToolPanel('drop-zone'); });
$('#recheck-button').addEventListener('click', refreshSystemStatus);

$('#today').textContent = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
