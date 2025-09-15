const STATE_KEY = 'pomodoro_state';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const timeDisplay = $('#timeDisplay');
const statusText = $('#statusText');
const progressBar = $('#progressBar');
const taskInput = $('#taskInput');
const startBtn = $('#startBtn');
const pauseBtn = $('#pauseBtn');
const resetBtn = $('#resetBtn');
const durButtons = $$('.dur-btn');

let ui = {
  selectedMin: 25,
  tickInterval: null,
  lastState: null,
};

function msToClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function setActiveDuration(min) {
  ui.selectedMin = min;
  for (const b of durButtons) {
    b.classList.toggle('active', Number(b.dataset.min) === min);
  }
}

function render(state) {
  ui.lastState = state;
  const now = Date.now();
  let total = (state.durationMin || ui.selectedMin) * 60 * 1000;
  let remaining = total;

  if (state.isRunning) {
    if (state.paused) {
      remaining = state.pausedRemainingMs ?? remaining;
    } else {
      remaining = Math.max(0, (state.endTime || now) - now);
    }
  }

  timeDisplay.textContent = msToClock(remaining);
  const done = Math.min(1, Math.max(0, 1 - remaining / total));
  progressBar.style.width = `${done * 100}%`;

  if (state.isRunning) {
    const labelTask = state.task ? `: ${state.task}` : '';
    statusText.textContent = state.paused ? `一時停止中${labelTask}` : `集中中${labelTask}`;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = state.paused ? '再開' : '一時停止';
  } else {
    statusText.textContent = '待機中';
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = '一時停止';
  }
}

async function getState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'get_state' }, resolve);
  });
}

async function startTimer() {
  const durationMin = ui.selectedMin;
  const task = taskInput.value.trim();
  const state = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'start', durationMin, task }, resolve);
  });
  render(state);
  startTick();
}

async function pauseResume() {
  const s = ui.lastState || (await getState());
  const type = s.paused ? 'resume' : 'pause';
  const state = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type }, resolve);
  });
  render(state);
}

async function reset() {
  const state = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'reset' }, resolve);
  });
  render(state);
  stopTick();
}

function stopTick() {
  if (ui.tickInterval) {
    clearInterval(ui.tickInterval);
    ui.tickInterval = null;
  }
}

function startTick() {
  stopTick();
  ui.tickInterval = setInterval(async () => {
    const state = await getState();
    render(state);
    if (!state.isRunning) stopTick();
  }, 1000);
}

function initDurations() {
  durButtons.forEach((btn) => {
    btn.addEventListener('click', () => setActiveDuration(Number(btn.dataset.min)));
  });
  setActiveDuration(25);
}

function setupEvents() {
  startBtn.addEventListener('click', startTimer);
  pauseBtn.addEventListener('click', pauseResume);
  resetBtn.addEventListener('click', reset);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'timer_ended') {
      // Play a short beep sequence if the popup is open
      try { beep(); } catch (_) {}
      // Also refresh state display
      getState().then(render);
    }
  });
}

function beep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const sequence = [500, 0, 600, 0, 700];
  let t = ctx.currentTime;
  for (const f of sequence) {
    if (f === 0) { t += 0.06; continue; }
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.16);
    t += 0.18;
  }
}

async function main() {
  initDurations();
  setupEvents();
  const state = await getState();
  // If a duration exists in state, reflect it in UI
  if (state.durationMin) setActiveDuration(Number(state.durationMin));
  if (state.task) taskInput.value = state.task;
  render(state);
  if (state.isRunning) startTick();
}

document.addEventListener('DOMContentLoaded', main);

