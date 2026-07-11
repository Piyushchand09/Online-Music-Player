# Spindle — Online Music Player

An interactive, vintage hi-fi–styled web music player built with **vanilla HTML, CSS, and JavaScript**. No frameworks, no build step — open `index.html` and go.

## Features
- Load any audio files from your own device (MP3, WAV, OGG, etc.)
- Play / pause, next / previous track
- Click-to-seek progress bar with live time readout
- Volume control with mute toggle
- Shuffle and repeat modes
- Live frequency visualizer (Web Audio API `AnalyserNode` + `<canvas>`)
- Spinning turntable platter + tonearm animation synced to playback state
- Fully keyboard accessible: `Space` play/pause, `←`/`→` prev/next track
- Responsive layout down to mobile

## How it works
- Playback uses the native `<audio>` element — reliable seeking, volume, and events.
- The visualizer taps into the same audio via `createMediaElementSource` + `AnalyserNode`, so the bars react to whatever is actually playing.
- Files are loaded locally via `<input type="file">` and turned into playable URLs with `URL.createObjectURL()` — nothing is uploaded anywhere.

## Run it
Just open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari). No server or build tools required.

> Tip: some browsers block audio autoplay until you interact with the page — click **Add music**, pick a file, then hit play.

## Project Structure
```
online-music-player/
 ├── index.html   Markup & structure
 ├── style.css    Vintage hi-fi console visual design
 └── script.js    Playback logic, playlist, visualizer, keyboard shortcuts
```

## Possible Extensions
- Drag-and-drop file loading
- Save/restore the last queue using the File System Access API
- Equalizer bands using additional `BiquadFilterNode`s
- Lyrics or waveform scrubbing preview
