const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

function executablePath(binaryPath) {
  return binaryPath.replace('app.asar', 'app.asar.unpacked');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { windowsHide: true, ...options });
    child.stdout?.on('data', (data) => { stdout += data.toString(); options.onStdout?.(data.toString()); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); options.onStderr?.(data.toString()); });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(signal ? `Process stopped (${signal}).` : (stderr.trim().split('\n').pop() || `Process exited with code ${code}.`)));
    });
    options.onSpawn?.(child);
  });
}

async function inspectVideo(filePath) {
  const { stdout } = await run(executablePath(ffprobePath), [
    '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,width,height', '-of', 'json', filePath
  ]);
  const data = JSON.parse(stdout);
  const video = data.streams?.find((stream) => stream.codec_type === 'video');
  return {
    duration: Number(data.format?.duration || 0),
    size: Number(data.format?.size || 0),
    width: video?.width || 0,
    height: video?.height || 0,
    name: path.basename(filePath),
    directory: path.dirname(filePath)
  };
}

async function findPythonWithDemucs() {
  const candidates = process.platform === 'win32'
    ? ['python', 'py']
    : [
        '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12',
        '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11',
        '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3.10',
        '/opt/homebrew/bin/python3.12', '/opt/homebrew/bin/python3.11', '/opt/homebrew/bin/python3.10',
        'python3.12', 'python3.11', 'python3.10', 'python3', 'python'
      ];
  for (const candidate of candidates) {
    try {
      await run(candidate, ['-c', 'import demucs, torch, numpy'], {});
      return candidate;
    } catch (_) { /* try the next interpreter */ }
  }
  return null;
}

async function checkSystem() {
  return {
    ffmpeg: Boolean(ffmpegPath && fs.existsSync(executablePath(ffmpegPath))),
    ffprobe: Boolean(ffprobePath && fs.existsSync(executablePath(ffprobePath))),
    python: await findPythonWithDemucs()
  };
}

class MusicRemovalJob {
  constructor(options, emit) {
    this.inputPath = options.inputPath;
    this.outputDirectory = options.outputDirectory || path.dirname(options.inputPath);
    this.chunkMinutes = Number(options.chunkMinutes || 10);
    this.emit = emit;
    this.child = null;
    this.cancelled = false;
    this.tempDirectory = null;
  }

  update(stage, progress, detail) {
    this.emit({ stage, progress: Math.max(0, Math.min(100, Math.round(progress))), detail });
  }

  cancel() {
    this.cancelled = true;
    if (this.child && !this.child.killed) this.child.kill('SIGTERM');
  }

  assertActive() {
    if (this.cancelled) throw new Error('Processing was cancelled.');
  }

  async command(command, args, callbacks = {}) {
    this.assertActive();
    return run(command, args, {
      ...callbacks,
      onSpawn: (child) => { this.child = child; callbacks.onSpawn?.(child); }
    }).finally(() => { this.child = null; });
  }

  async run() {
    const python = await findPythonWithDemucs();
    if (!python) throw new Error('AI engine missing. Install it with: python3 -m pip install -U demucs');

    const info = await inspectVideo(this.inputPath);
    if (!info.duration) throw new Error('This video has no readable duration.');
    await fsp.mkdir(this.outputDirectory, { recursive: true });
    this.tempDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'refaays-space-'));
    const chunksDirectory = path.join(this.tempDirectory, 'chunks');
    const separatedDirectory = path.join(this.tempDirectory, 'separated');
    await fsp.mkdir(chunksDirectory);

    const base = path.basename(this.inputPath, path.extname(this.inputPath));
    const outputPath = await this.uniqueOutputPath(path.join(this.outputDirectory, `${base} — music free.mp4`));

    try {
      this.update('extracting', 2, 'Preparing audio in memory-safe chunks');
      await this.extractChunks(info.duration, chunksDirectory);
      const chunks = (await fsp.readdir(chunksDirectory)).filter((name) => name.endsWith('.wav')).sort();
      if (!chunks.length) throw new Error('No audio track was found in this video.');

      for (let index = 0; index < chunks.length; index += 1) {
        this.assertActive();
        this.update('separating', 15 + (index / chunks.length) * 70, `Cleaning part ${index + 1} of ${chunks.length}`);
        await this.command(python, [
          '-m', 'demucs', '--two-stems=vocals', '-n', 'htdemucs',
          '--out', separatedDirectory, path.join(chunksDirectory, chunks[index])
        ]);
      }

      this.update('joining', 87, 'Joining the cleaned audio');
      const vocals = chunks.map((name) => path.join(separatedDirectory, 'htdemucs', path.parse(name).name, 'vocals.wav'));
      const listPath = path.join(this.tempDirectory, 'vocals.txt');
      await fsp.writeFile(listPath, vocals.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'));
      const cleanAudio = path.join(this.tempDirectory, 'cleaned.wav');
      await this.command(executablePath(ffmpegPath), ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', cleanAudio]);

      this.update('exporting', 92, 'Creating your music-free video');
      await this.command(executablePath(ffmpegPath), [
        '-y', '-i', this.inputPath, '-i', cleanAudio,
        '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outputPath
      ]);
      this.update('complete', 100, 'Your video is ready');
      return { outputPath };
    } finally {
      if (this.tempDirectory) await fsp.rm(this.tempDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }

  async extractChunks(duration, directory) {
    let progressText = '';
    await this.command(executablePath(ffmpegPath), [
      '-y', '-i', this.inputPath, '-vn', '-ac', '2', '-ar', '44100',
      '-c:a', 'pcm_s16le', '-f', 'segment', '-segment_time', String(this.chunkMinutes * 60),
      '-reset_timestamps', '1', '-progress', 'pipe:1', path.join(directory, 'part-%05d.wav')
    ], {
      onStdout: (text) => {
        progressText += text;
        const matches = [...progressText.matchAll(/out_time_ms=(\d+)/g)];
        if (matches.length) {
          const seconds = Number(matches.at(-1)[1]) / 1_000_000;
          this.update('extracting', 2 + Math.min(12, (seconds / duration) * 12), 'Preparing audio in memory-safe chunks');
        }
        progressText = progressText.slice(-2000);
      }
    });
  }

  async uniqueOutputPath(candidate) {
    if (!fs.existsSync(candidate)) return candidate;
    const parsed = path.parse(candidate);
    for (let number = 2; ; number += 1) {
      const next = path.join(parsed.dir, `${parsed.name} ${number}${parsed.ext}`);
      if (!fs.existsSync(next)) return next;
    }
  }
}

module.exports = { inspectVideo, checkSystem, MusicRemovalJob };
