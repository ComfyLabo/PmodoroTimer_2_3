const STATE_KEY = 'pomodoro_state';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const timeDisplay = $('#timeDisplay');
const statusText = $('#statusText');
const progressBar = $('#progressBar');
const taskInput = $('#taskInput');
const startBtn = $('#startBtn');
const pauseBtn = $('#pauseBtn');
const stopBtn = $('#stopBtn');
const resetBtn = $('#resetBtn');
const durButtons = $$('.dur-btn');
const historyList = $('#historyList');
const historyEmpty = $('#historyEmpty');
const clearHistoryBtn = $('#clearHistoryBtn');

let ui = {
  selectedMin: 25,
  tickInterval: null,
  lastState: null,
  history: [],
  editingEntry: null,
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

  if (startBtn) startBtn.textContent = 'Start';

  if (state.isRunning) {
    const labelTask = state.task ? `: ${state.task}` : '';
    statusText.textContent = state.paused ? `一時停止中${labelTask}` : `集中中${labelTask}`;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
  } else {
    statusText.textContent = '待機中';
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
  }
  if (stopBtn) {
    stopBtn.disabled = !state.isRunning;
    stopBtn.textContent = 'Stop';
  }
  if (resetBtn) resetBtn.textContent = 'Reset';
}

function formatHistoryTimestamp(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return null;
  const d = new Date(value);
  const MM = (d.getMonth() + 1).toString().padStart(2, '0');
  const DD = d.getDate().toString().padStart(2, '0');
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return {
    date: `${MM}/${DD}`,
    time: `${hh}:${mm}`,
  };
}

function formatHistoryTimeLabel(entry) {
  const startParts = formatHistoryTimestamp(entry?.startedAt);
  const endParts = formatHistoryTimestamp(entry?.endedAt);

  if (!startParts && !endParts) {
    return '--/-- --:--';
  }

  if (startParts && endParts) {
    const sameDay = startParts.date === endParts.date;
    if (sameDay) {
      return `${startParts.date} ${startParts.time} - ${endParts.time}`;
    }
    return `${startParts.date} ${startParts.time} - ${endParts.date} ${endParts.time}`;
  }

  const solo = startParts || endParts;
  return `${solo.date} ${solo.time}`;
}

function resolveDurationMin(entry) {
  if (typeof entry?.durationMin === 'number') return entry.durationMin;
  if (entry?.startedAt && entry?.endedAt) {
    const mins = Math.round((entry.endedAt - entry.startedAt) / 60000);
    return Math.max(1, mins);
  }
  return null;
}

function renderHistory(history) {
  if (!historyList || !historyEmpty) return;
  ui.history = Array.isArray(history) ? history : [];

  if (ui.history.length === 0) {
    ui.editingEntry = null;
  }

  if (ui.editingEntry) {
    const key = ui.editingEntry.key;
    if (key != null) {
      const found = ui.history.findIndex((entry) => (entry?.startedAt ?? entry?.endedAt) === key);
      if (found === -1) {
        ui.editingEntry = null;
      } else {
        ui.editingEntry.index = found;
      }
    } else if (ui.editingEntry.index >= ui.history.length) {
      ui.editingEntry = null;
    }
  }

  historyList.innerHTML = '';
  if (clearHistoryBtn) clearHistoryBtn.disabled = ui.history.length === 0;
  if (ui.history.length === 0) {
    historyEmpty.style.display = 'block';
    historyList.style.display = 'none';
    return;
  }
  historyEmpty.style.display = 'none';
  historyList.style.display = 'block';

  ui.history.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.dataset.index = String(index);
    const task = (entry?.task || '').trim();
    const duration = resolveDurationMin(entry);
    const timeLabel = formatHistoryTimeLabel(entry);
    const isEditing = ui.editingEntry?.index === index;
    const editingDurationRaw = ui.editingEntry?.durationMin;
    const editingDuration = Number(editingDurationRaw);
    const displayDuration = isEditing && Number.isFinite(editingDuration) && editingDuration > 0 ? editingDuration : duration;
    const durationLabel = displayDuration ? `${displayDuration}分` : '';
    const taskLabel = task || 'タスクなし';

    if (isEditing) {
      li.classList.add('editing');

      const metaEl = document.createElement('div');
      metaEl.className = 'history-meta';
      metaEl.textContent = durationLabel ? `${timeLabel} ・ ${durationLabel}` : timeLabel;

      const editWrap = document.createElement('div');
      editWrap.className = 'history-edit';

      const taskInput = document.createElement('input');
      taskInput.type = 'text';
      taskInput.className = 'history-edit-input';
      taskInput.value = ui.editingEntry?.task ?? task;
      taskInput.placeholder = 'タスク名';
      taskInput.dataset.role = 'edit-task';
      taskInput.maxLength = 120;

      const durationRow = document.createElement('div');
      durationRow.className = 'history-edit-row';
      const durationLabelEl = document.createElement('span');
      durationLabelEl.textContent = '所要時間 (分)';
      const durationInput = document.createElement('input');
      durationInput.type = 'number';
      durationInput.min = '1';
      durationInput.max = '600';
      durationInput.step = '1';
      durationInput.className = 'history-edit-duration';
      const durationValue = ui.editingEntry?.durationMin ?? (duration ?? '');
      durationInput.value = durationValue === null ? '' : String(durationValue);
      durationInput.dataset.role = 'edit-duration';
      durationRow.append(durationLabelEl, durationInput);

      const controls = document.createElement('div');
      controls.className = 'history-edit-controls';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'link-btn';
      saveBtn.textContent = '保存';
      saveBtn.dataset.action = 'save';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'link-btn';
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.dataset.action = 'cancel';
      controls.append(saveBtn, cancelBtn);

      editWrap.append(taskInput, durationRow, controls);
      li.append(metaEl, editWrap);
    } else {
      const rowEl = document.createElement('div');
      rowEl.className = 'history-row';

      const textWrap = document.createElement('div');
      const taskEl = document.createElement('div');
      taskEl.className = 'history-task';
      taskEl.textContent = taskLabel;
      const metaEl = document.createElement('div');
      metaEl.className = 'history-meta';
      metaEl.textContent = durationLabel ? `${timeLabel} ・ ${durationLabel}` : timeLabel;
      textWrap.append(taskEl, metaEl);

      const actions = document.createElement('div');
      actions.className = 'history-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'link-btn';
      editBtn.textContent = '編集';
      editBtn.dataset.action = 'edit';
      actions.appendChild(editBtn);

      rowEl.append(textWrap, actions);
      li.appendChild(rowEl);
    }

    historyList.appendChild(li);
  });
}

function startEditHistory(index) {
  const entry = ui.history?.[index];
  if (!entry) return;

  const task = (entry.task || '').trim();
  const duration = resolveDurationMin(entry);
  const key = entry?.startedAt ?? entry?.endedAt ?? index;
  ui.editingEntry = {
    index,
    key,
    task,
    durationMin: duration ? String(duration) : '',
  };
  renderHistory(ui.history);
  // Focus task input after rendering
  queueMicrotask(() => {
    const activeItem = historyList?.querySelector('.history-item.editing input[data-role="edit-task"]');
    activeItem?.focus();
    if (activeItem) {
      const value = activeItem.value;
      activeItem.setSelectionRange(value.length, value.length);
    }
  });
}

function cancelEditHistory() {
  ui.editingEntry = null;
  renderHistory(ui.history);
}

function updateEditingField(field, value) {
  if (!ui.editingEntry) return;
  if (field === 'task') {
    ui.editingEntry.task = value;
  } else if (field === 'durationMin') {
    ui.editingEntry.durationMin = value;
  }
}

async function saveHistoryEdit() {
  const editing = ui.editingEntry;
  if (!editing) return;

  const updates = { task: editing.task ?? '' };
  if (editing.durationMin !== '' && editing.durationMin != null) {
    const durationNumber = Number(editing.durationMin);
    if (Number.isFinite(durationNumber) && durationNumber > 0) {
      updates.durationMin = Math.round(durationNumber);
    }
  }

  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'update_history_entry',
      index: editing.index,
      updates,
    }, resolve);
  });

  const history = Array.isArray(response?.history) ? response.history : await fetchHistory();
  ui.editingEntry = null;
  renderHistory(history);
}

function onHistoryClick(event) {
  const actionBtn = event.target.closest('[data-action]');
  if (!actionBtn) return;
  const li = actionBtn.closest('.history-item');
  if (!li) return;
  const index = Number(li.dataset.index);
  if (!Number.isInteger(index)) return;

  const action = actionBtn.dataset.action;
  if (action === 'edit') {
    startEditHistory(index);
  } else if (action === 'cancel') {
    cancelEditHistory();
  } else if (action === 'save') {
    if (ui.editingEntry?.index === index) saveHistoryEdit();
  }
}

function onHistoryInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const li = target.closest('.history-item');
  if (!li) return;
  const index = Number(li.dataset.index);
  if (!Number.isInteger(index) || ui.editingEntry?.index !== index) return;

  const role = target.dataset.role;
  if (role === 'edit-task') {
    updateEditingField('task', target.value);
  } else if (role === 'edit-duration') {
    updateEditingField('durationMin', target.value);
  }
}

function onHistoryKeydown(event) {
  if (event.key !== 'Enter' && event.key !== 'Escape') return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const li = target.closest('.history-item');
  if (!li) return;
  const index = Number(li.dataset.index);
  if (!Number.isInteger(index) || ui.editingEntry?.index !== index) return;

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    saveHistoryEdit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelEditHistory();
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

async function stopTimerManual() {
  const result = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'stop' }, resolve);
  });
  if (result?.state) {
    render(result.state);
  } else {
    const state = await getState();
    render(state);
  }
  if (Array.isArray(result?.history)) {
    renderHistory(result.history);
  } else {
    fetchHistory().then(renderHistory);
  }
  if (result?.entry && taskInput) {
    taskInput.value = '';
  }
  stopTick();
}

async function fetchHistory() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'get_history' }, resolve);
  });
}

async function clearHistory() {
  if (clearHistoryBtn?.disabled) return;
  const history = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'clear_history' }, resolve);
  });
  renderHistory(history);
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
  if (stopBtn) stopBtn.addEventListener('click', stopTimerManual);
  if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);
  if (historyList) {
    historyList.addEventListener('click', onHistoryClick);
    historyList.addEventListener('input', onHistoryInput);
    historyList.addEventListener('keydown', onHistoryKeydown);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'timer_ended') {
      // Play a short beep sequence if the popup is open
      try { beep(); } catch (_) {}
      // Also refresh state display
      getState().then(render);
      fetchHistory().then(renderHistory);
      if (msg.entry && taskInput) {
        taskInput.value = '';
      }
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
  const [state, history] = await Promise.all([getState(), fetchHistory()]);
  // If a duration exists in state, reflect it in UI
  if (state.durationMin) setActiveDuration(Number(state.durationMin));
  if (state.task) taskInput.value = state.task;
  render(state);
  renderHistory(history);
  if (state.isRunning) startTick();
}

document.addEventListener('DOMContentLoaded', main);
