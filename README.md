# Refaay's Space

A private desktop home for personal mini apps. The first app, **Music Remover**, separates dialogue/vocals from background music and creates a new video without re-encoding the picture.

## Run it

Requirements:

- macOS, Windows, or Linux
- Node.js 20+
- Python 3.9–3.12 with Demucs

```bash
nvm use
python3 -m pip install -U demucs
npm install --registry=https://registry.npmjs.org
npm start
```

The first removal downloads the Demucs `htdemucs` model. After that, processing is local and works offline.

## Long videos

Audio is extracted into 10-minute WAV chunks, processed one at a time, joined, and remuxed with the original video stream. This keeps memory use bounded for multi-hour videos and avoids a quality-losing video re-encode. The output is saved beside the source unless another folder is selected.

## Package for macOS

```bash
npm run dist:mac
```

The packaged application still expects a compatible Python installation with Demucs. Fully bundling the AI runtime can be added later when distributing the app to other people.
