(() => {
  const STORAGE_KEY = 'refaay.intervalTimer';
  const COLORS = ['#b85f3d', '#d9a441', '#3f7a5c', '#5f86a3', '#8b6aa8'];
  const DIAL_LENGTH = 2 * Math.PI * 90;
  const DEFAULTS = {
    rounds: 8,
    infinite: false,
    lead: 5,
    sound: true,
    slices: [
      { name: 'Hard', seconds: 20, color: COLORS[0] },
      { name: 'Mid', seconds: 30, color: COLORS[1] },
      { name: 'Rest', seconds: 20, color: COLORS[2] }
    ]
  };

  let config = loadConfig();
  let run = null;
  let ticker = null;
  let audio = null;

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.slices) && saved.slices.length) return { ...structuredClone(DEFAULTS), ...saved };
    } catch {}
    return structuredClone(DEFAULTS);
  }

  function saveConfig() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
  }

  function formatClock(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, '0');
    return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  }

  const sliceName = (index) => config.slices[index].name.trim() || `Slice ${index + 1}`;
  const roundSeconds = () => config.slices.reduce((sum, slice) => sum + slice.seconds, 0);

  // ── Setup ────────────────────────────────────────────────────────────

  function renderSetup() {
    const list = $('#slice-list');
    list.innerHTML = '';
    config.slices.forEach((slice, index) => {
      const row = document.createElement('div');
      row.className = 'slice-row';
      row.dataset.index = index;
      row.innerHTML = `
        <button class="slice-color" data-action="color" title="Change colour" aria-label="Change colour"></button>
        <input class="slice-name" data-field="name" placeholder="Slice ${index + 1}" maxlength="24">
        <div class="slice-time">
          <input type="number" data-field="minutes" min="0" max="99" aria-label="Minutes"><span>min</span>
          <input type="number" data-field="seconds" min="0" max="59" aria-label="Seconds"><span>sec</span>
        </div>
        <div class="slice-actions">
          <button class="icon-button" data-action="up" aria-label="Move up">↑</button>
          <button class="icon-button" data-action="down" aria-label="Move down">↓</button>
          <button class="icon-button" data-action="remove" aria-label="Remove slice">×</button>
        </div>`;
      row.querySelector('.slice-color').style.background = slice.color;
      row.querySelector('[data-field="name"]').value = slice.name;
      row.querySelector('[data-field="minutes"]').value = Math.floor(slice.seconds / 60);
      row.querySelector('[data-field="seconds"]').value = slice.seconds % 60;
      row.querySelector('[data-action="up"]').disabled = index === 0;
      row.querySelector('[data-action="down"]').disabled = index === config.slices.length - 1;
      row.querySelector('[data-action="remove"]').disabled = config.slices.length === 1;
      list.append(row);
    });
    $('#rounds-input').value = config.rounds;
    $('#rounds-input').disabled = config.infinite;
    $('#infinite-input').checked = config.infinite;
    $('#lead-input').value = config.lead;
    $('#sound-input').checked = config.sound;
    renderSummary();
  }

  function renderSummary() {
    const perRound = roundSeconds();
    $('#round-length').textContent = `${config.slices.length} ${config.slices.length === 1 ? 'slice' : 'slices'} · ${formatClock(perRound)} per round`;
    $('#total-length').textContent = config.infinite ? 'Repeats until you stop' : `${formatClock(perRound * config.rounds)} total`;
  }

  function readSliceTime(row) {
    const minutes = Math.max(0, Math.min(99, parseInt(row.querySelector('[data-field="minutes"]').value, 10) || 0));
    const seconds = Math.max(0, Math.min(59, parseInt(row.querySelector('[data-field="seconds"]').value, 10) || 0));
    return minutes * 60 + seconds;
  }

  $('#slice-list').addEventListener('input', (event) => {
    const row = event.target.closest('.slice-row');
    const slice = config.slices[row.dataset.index];
    if (event.target.dataset.field === 'name') slice.name = event.target.value;
    else slice.seconds = readSliceTime(row);
    saveConfig();
    renderSummary();
  });

  // Normalise the time fields once editing is done (e.g. 90 sec → 1 min 30 sec, never 0).
  $('#slice-list').addEventListener('change', (event) => {
    if (event.target.dataset.field === 'name') return;
    const slice = config.slices[event.target.closest('.slice-row').dataset.index];
    slice.seconds = Math.max(1, slice.seconds);
    saveConfig();
    renderSetup();
  });

  $('#slice-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const index = Number(button.closest('.slice-row').dataset.index);
    const { slices } = config;
    if (button.dataset.action === 'color') slices[index].color = COLORS[(COLORS.indexOf(slices[index].color) + 1) % COLORS.length];
    if (button.dataset.action === 'remove') slices.splice(index, 1);
    if (button.dataset.action === 'up') [slices[index - 1], slices[index]] = [slices[index], slices[index - 1]];
    if (button.dataset.action === 'down') [slices[index + 1], slices[index]] = [slices[index], slices[index + 1]];
    saveConfig();
    renderSetup();
  });

  $('#add-slice').addEventListener('click', () => {
    config.slices.push({ name: '', seconds: 30, color: COLORS[config.slices.length % COLORS.length] });
    saveConfig();
    renderSetup();
    $('#slice-list .slice-row:last-child .slice-name').focus();
  });

  $('#rounds-input').addEventListener('change', (event) => {
    config.rounds = Math.max(1, Math.min(999, parseInt(event.target.value, 10) || 1));
    saveConfig();
    renderSetup();
  });

  $('#infinite-input').addEventListener('change', (event) => {
    config.infinite = event.target.checked;
    saveConfig();
    renderSetup();
  });

  $('#lead-input').addEventListener('change', (event) => {
    config.lead = Math.max(0, Math.min(60, parseInt(event.target.value, 10) || 0));
    saveConfig();
    renderSetup();
  });

  $('#sound-input').addEventListener('change', (event) => {
    config.sound = event.target.checked;
    saveConfig();
  });

  // ── Sound ────────────────────────────────────────────────────────────

  function beep(frequency, duration, volume = 0.25) {
    if (!config.sound) return;
    audio ||= new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  }

  // ── Running ──────────────────────────────────────────────────────────
  // Each phase has an absolute end time; the next phase starts exactly where the
  // previous one ended, so the timer never drifts no matter how late a tick fires.

  function enterPhase(phase, sliceIndex, startAt) {
    run.phase = phase;
    run.sliceIndex = sliceIndex;
    run.duration = (phase === 'lead' ? config.lead : config.slices[sliceIndex].seconds) * 1000;
    run.endsAt = startAt + run.duration;
    run.lastCue = null;
    if (phase === 'slice') {
      beep(sliceIndex === 0 ? 1046 : 880, 0.35);
      if (sliceIndex === 0) renderTimeline();
    }
  }

  function advance(startAt) {
    if (run.phase === 'lead') return enterPhase('slice', 0, startAt);
    let next = run.sliceIndex + 1;
    if (next >= config.slices.length) {
      if (!config.infinite && run.round >= config.rounds) return finish();
      run.round += 1;
      next = 0;
    }
    enterPhase('slice', next, startAt);
  }

  function start() {
    config.slices.forEach((slice) => { slice.seconds = Math.max(1, slice.seconds); });
    audio?.resume();
    run = { round: 1, paused: false, startedAt: performance.now() };
    if (config.lead > 0) enterPhase('lead', 0, run.startedAt);
    else enterPhase('slice', 0, run.startedAt);
    if (run.phase === 'lead') renderTimeline();
    clearInterval(ticker);
    ticker = setInterval(tick, 50);
    $('#timer-setup').classList.add('hidden');
    $('#timer-run').classList.remove('hidden');
    $('#timer-run').classList.remove('done');
    $('#timer-pause').textContent = 'Pause';
    $('#timer-stop').textContent = 'Stop';
    tick();
  }

  function tick() {
    if (!run || run.paused || run.phase === 'done') return;
    const now = performance.now();
    while (run.phase !== 'done' && now >= run.endsAt) advance(run.endsAt);
    if (run.phase === 'done') return;
    const remaining = run.endsAt - now;
    const secondsLeft = Math.ceil(remaining / 1000);
    if (secondsLeft <= 3 && secondsLeft < run.duration / 1000 && run.lastCue !== secondsLeft) {
      run.lastCue = secondsLeft;
      beep(660, 0.12, 0.18);
    }
    renderRun(remaining);
  }

  function togglePause() {
    if (!run) return;
    if (run.phase === 'done') return start();
    const now = performance.now();
    if (run.paused) {
      run.endsAt = now + run.remaining;
      run.paused = false;
      audio?.resume();
    } else {
      run.remaining = run.endsAt - now;
      run.paused = true;
    }
    $('#timer-pause').textContent = run.paused ? 'Resume' : 'Pause';
    $('#timer-run').classList.toggle('paused', run.paused);
  }

  function skip() {
    if (!run || run.phase === 'done') return;
    const now = performance.now();
    advance(now);
    if (run.paused && run.phase !== 'done') run.remaining = run.duration;
    if (run.paused) renderRun(run.remaining);
    else tick();
  }

  function stop() {
    clearInterval(ticker);
    run = null;
    $('#timer-run').classList.add('hidden');
    $('#timer-run').classList.remove('paused', 'done');
    $('#timer-setup').classList.remove('hidden');
    renderSetup();
  }

  function finish() {
    clearInterval(ticker);
    run.phase = 'done';
    run.paused = false;
    beep(1046, 0.25);
    setTimeout(() => beep(1318, 0.6), 220);
    $('#timer-run').classList.remove('paused');
    $('#timer-run').classList.add('done');
    $('#run-label').textContent = 'Workout complete';
    $('#run-time').textContent = '✓';
    $('#run-next').textContent = `${config.rounds} ${config.rounds === 1 ? 'round' : 'rounds'} · ${formatClock(roundSeconds() * config.rounds)}`;
    $('#run-round').textContent = 'Nice work';
    $('#dial-progress').style.strokeDashoffset = 0;
    $('#dial-progress').style.stroke = 'var(--green)';
    $('#timer-run').style.setProperty('--slice-color', 'var(--green)');
    $$('#run-timeline .timeline-segment').forEach((segment) => {
      segment.classList.remove('current');
      segment.querySelector('.timeline-fill').style.width = '100%';
    });
    $('#timer-pause').textContent = 'Start again';
    $('#timer-stop').textContent = 'Done';
  }

  function renderTimeline() {
    const timeline = $('#run-timeline');
    timeline.innerHTML = '';
    config.slices.forEach((slice, index) => {
      const segment = document.createElement('div');
      segment.className = 'timeline-segment';
      segment.style.flexGrow = slice.seconds;
      segment.style.setProperty('--slice-color', slice.color);
      segment.innerHTML = '<div class="timeline-fill"></div><span></span>';
      segment.querySelector('span').textContent = sliceName(index);
      timeline.append(segment);
    });
  }

  function renderRun(remaining) {
    const isLead = run.phase === 'lead';
    const color = isLead ? '#8d918a' : config.slices[run.sliceIndex].color;
    const elapsedRatio = 1 - remaining / run.duration;
    $('#timer-run').style.setProperty('--slice-color', color);
    $('#run-label').textContent = isLead ? 'Get ready' : sliceName(run.sliceIndex);
    $('#run-time').textContent = formatClock(Math.ceil(remaining / 1000));
    $('#run-round').textContent = config.infinite ? `Round ${run.round}` : `Round ${run.round} of ${config.rounds}`;
    $('#dial-progress').style.stroke = color;
    $('#dial-progress').style.strokeDashoffset = DIAL_LENGTH * elapsedRatio;

    const nextIndex = isLead ? 0 : (run.sliceIndex + 1) % config.slices.length;
    const isLastSlice = !isLead && !config.infinite && run.round >= config.rounds && run.sliceIndex === config.slices.length - 1;
    $('#run-next').textContent = isLastSlice ? 'Final slice' : `Next · ${sliceName(nextIndex)} ${formatClock(config.slices[nextIndex].seconds)}`;

    $$('#run-timeline .timeline-segment').forEach((segment, index) => {
      const progress = isLead || index > run.sliceIndex ? 0 : index < run.sliceIndex ? 1 : elapsedRatio;
      segment.querySelector('.timeline-fill').style.width = `${progress * 100}%`;
      segment.classList.toggle('current', !isLead && index === run.sliceIndex);
    });
  }

  $('#dial-progress').style.strokeDasharray = DIAL_LENGTH;
  $('#timer-start').addEventListener('click', start);
  $('#timer-pause').addEventListener('click', togglePause);
  $('#timer-skip').addEventListener('click', skip);
  $('#timer-stop').addEventListener('click', stop);

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || !run || !$('#interval-timer-page').classList.contains('active')) return;
    if (event.target.closest('input, button')) return;
    event.preventDefault();
    togglePause();
  });

  renderSetup();
})();
