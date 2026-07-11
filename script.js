(() => {
  'use strict';

  // ---------- Element refs ----------
  const audio = document.getElementById('audioPlayer');
  const fileInput = document.getElementById('fileInput');
  const playlistItemsEl = document.getElementById('playlistItems');
  const emptyState = document.getElementById('emptyState');

  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const repeatBtn = document.getElementById('repeatBtn');

  const muteBtn = document.getElementById('muteBtn');
  const volIcon = document.getElementById('volIcon');
  const muteIcon = document.getElementById('muteIcon');
  const volumeSlider = document.getElementById('volumeSlider');

  const progressBar = document.getElementById('progressBar');
  const currentTimeEl = document.getElementById('currentTime');
  const durationTimeEl = document.getElementById('durationTime');

  const trackTitleEl = document.getElementById('trackTitle');
  const trackArtistEl = document.getElementById('trackArtist');
  const labelInitial = document.getElementById('labelInitial');
  const platter = document.getElementById('platter');
  const tonearm = document.getElementById('tonearm');
  const canvas = document.getElementById('visualizer');
  const canvasCtx = canvas.getContext('2d');

  // ---------- State ----------
  /** @type {{file: File, url: string, name: string, duration: number}[]} */
  let queue = [];
  let currentIndex = -1;
  let isShuffled = false;
  let isRepeating = false;
  let isSeeking = false;
  let lastVolume = 75;

  // Web Audio (for the visualizer only; playback still goes through <audio>)
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let rafId = null;

  // ---------- Helpers ----------
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function niceNameFromFile(file) {
    return file.name.replace(/\.[^/.]+$/, '');
  }

  function setSliderFill(slider) {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--fill', `${pct}%`);
  }

  // ---------- Playlist rendering ----------
  function renderPlaylist() {
    playlistItemsEl.querySelectorAll('.track-item').forEach(el => el.remove());
    emptyState.hidden = queue.length > 0;

    queue.forEach((track, i) => {
      const li = document.createElement('li');
      li.className = 'track-item' + (i === currentIndex ? ' active' : '');
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');

      li.innerHTML = `
        <span class="track-index">${(i + 1).toString().padStart(2, '0')}</span>
        <span class="track-meta">
          <span class="track-name">${escapeHtml(track.name)}</span>
        </span>
        <span class="track-len">${track.duration ? formatTime(track.duration) : ''}</span>
        <button class="remove-btn" aria-label="Remove ${escapeHtml(track.name)} from queue" data-index="${i}">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      `;

      li.addEventListener('click', (e) => {
        if (e.target.closest('.remove-btn')) return;
        loadTrack(i, true);
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          loadTrack(i, true);
        }
      });

      li.querySelector('.remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrack(i);
      });

      playlistItemsEl.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function removeTrack(index) {
    const wasCurrent = index === currentIndex;
    URL.revokeObjectURL(queue[index].url);
    queue.splice(index, 1);

    if (queue.length === 0) {
      currentIndex = -1;
      audio.removeAttribute('src');
      updateNowPlayingUI(null);
      setPlayingState(false);
    } else if (wasCurrent) {
      currentIndex = Math.min(index, queue.length - 1);
      loadTrack(currentIndex, !audio.paused);
    } else if (index < currentIndex) {
      currentIndex -= 1;
    }

    renderPlaylist();
  }

  // ---------- File loading ----------
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const startEmpty = queue.length === 0;

    files.forEach(file => {
      const url = URL.createObjectURL(file);
      const track = { file, url, name: niceNameFromFile(file), duration: 0 };
      queue.push(track);

      // Read duration in background without affecting the active player
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.src = url;
      probe.addEventListener('loadedmetadata', () => {
        track.duration = probe.duration;
        renderPlaylist();
      }, { once: true });
    });

    renderPlaylist();

    if (startEmpty) {
      loadTrack(0, false);
    }

    fileInput.value = '';
  });

  // ---------- Playback ----------
  function loadTrack(index, autoplay) {
    if (index < 0 || index >= queue.length) return;
    currentIndex = index;
    const track = queue[index];

    audio.src = track.url;
    updateNowPlayingUI(track);
    renderPlaylist();

    if (autoplay) {
      play();
    }
  }

  function updateNowPlayingUI(track) {
    if (!track) {
      trackTitleEl.textContent = 'No track loaded';
      trackArtistEl.textContent = 'Add music from your device to begin';
      labelInitial.textContent = 'S';
      return;
    }
    trackTitleEl.textContent = track.name;
    trackArtistEl.textContent = `Track ${currentIndex + 1} of ${queue.length}`;
    labelInitial.textContent = track.name.trim().charAt(0).toUpperCase() || '♪';
  }

  function ensureAudioGraph() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  function play() {
    if (queue.length === 0) return;
    if (currentIndex === -1) {
      loadTrack(0, true);
      return;
    }
    ensureAudioGraph();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    audio.play().then(() => setPlayingState(true)).catch(() => {
      // Autoplay may be blocked until a user gesture; ignore silently.
    });
  }

  function pause() {
    audio.pause();
    setPlayingState(false);
  }

  function setPlayingState(playing) {
    playIcon.hidden = playing;
    pauseIcon.hidden = !playing;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    platter.classList.toggle('spinning', playing);
    tonearm.classList.toggle('playing', playing);

    if (playing) {
      drawVisualizer();
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
      clearCanvas();
    }
  }

  playBtn.addEventListener('click', () => {
    if (audio.paused) play(); else pause();
  });

  function playNext(userTriggered) {
    if (queue.length === 0) return;
    let nextIndex;
    if (isShuffled && queue.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * queue.length);
      } while (nextIndex === currentIndex);
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        if (isRepeating) {
          nextIndex = 0;
        } else if (userTriggered) {
          nextIndex = 0; // manual "next" always wraps around
        } else {
          setPlayingState(false);
          return;
        }
      }
    }
    loadTrack(nextIndex, true);
  }

  function playPrev() {
    if (queue.length === 0) return;
    // Restart current track if more than 3s in, like most players
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = queue.length - 1;
    loadTrack(prevIndex, true);
  }

  nextBtn.addEventListener('click', () => playNext(true));
  prevBtn.addEventListener('click', playPrev);

  audio.addEventListener('ended', () => playNext(false));

  shuffleBtn.addEventListener('click', () => {
    isShuffled = !isShuffled;
    shuffleBtn.setAttribute('aria-pressed', String(isShuffled));
  });

  repeatBtn.addEventListener('click', () => {
    isRepeating = !isRepeating;
    repeatBtn.setAttribute('aria-pressed', String(isRepeating));
  });

  // ---------- Progress ----------
  audio.addEventListener('loadedmetadata', () => {
    durationTimeEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('timeupdate', () => {
    if (isSeeking) return;
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 1000 : 0;
    progressBar.value = pct;
    setSliderFill(progressBar);
    currentTimeEl.textContent = formatTime(audio.currentTime);
  });

  progressBar.addEventListener('input', () => {
    isSeeking = true;
    setSliderFill(progressBar);
    if (audio.duration) {
      currentTimeEl.textContent = formatTime((progressBar.value / 1000) * audio.duration);
    }
  });

  progressBar.addEventListener('change', () => {
    if (audio.duration) {
      audio.currentTime = (progressBar.value / 1000) * audio.duration;
    }
    isSeeking = false;
  });

  // ---------- Volume ----------
  function applyVolume(value) {
    audio.volume = value / 100;
    setSliderFill(volumeSlider);
    const muted = value == 0;
    volIcon.hidden = muted;
    muteIcon.hidden = !muted;
  }

  volumeSlider.addEventListener('input', () => {
    lastVolume = Number(volumeSlider.value) || lastVolume;
    applyVolume(volumeSlider.value);
  });

  muteBtn.addEventListener('click', () => {
    if (audio.volume > 0) {
      lastVolume = Number(volumeSlider.value);
      volumeSlider.value = 0;
      applyVolume(0);
    } else {
      volumeSlider.value = lastVolume || 75;
      applyVolume(volumeSlider.value);
    }
  });

  // ---------- Visualizer ----------
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function clearCanvas() {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawVisualizer() {
    if (!analyser) {
      rafId = requestAnimationFrame(drawVisualizer);
      return;
    }
    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(data);

    clearCanvas();

    const w = canvas.width;
    const h = canvas.height;
    const barCount = bufferLength;
    const gap = 3 * devicePixelRatio;
    const barWidth = (w - gap * (barCount - 1)) / barCount;

    for (let i = 0; i < barCount; i++) {
      const v = data[i] / 255;
      const barHeight = Math.max(2, v * h * 0.9);
      const x = i * (barWidth + gap);
      const y = h - barHeight;

      const gradient = canvasCtx.createLinearGradient(0, y, 0, h);
      gradient.addColorStop(0, 'rgba(232, 198, 116, 0.85)');
      gradient.addColorStop(1, 'rgba(201, 162, 74, 0.15)');
      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(x, y, barWidth, barHeight);
    }

    rafId = requestAnimationFrame(drawVisualizer);
  }

  // ---------- Keyboard shortcuts ----------
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input') return; // don't hijack slider arrow keys

    if (e.code === 'Space') {
      e.preventDefault();
      if (audio.paused) play(); else pause();
    } else if (e.code === 'ArrowRight') {
      playNext(true);
    } else if (e.code === 'ArrowLeft') {
      playPrev();
    }
  });

  // ---------- Init ----------
  setSliderFill(progressBar);
  applyVolume(volumeSlider.value);
})();
