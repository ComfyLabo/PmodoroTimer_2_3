// Background service worker for Pomodoro timer (MV3)

const STATE_KEY = 'pomodoro_state';
const HISTORY_KEY = 'pomodoro_history';
const HISTORY_LIMIT = 30;
const BADGE_ALARM = 'pomodoro_badge_tick';
const END_ALARM = 'pomodoro_end';

// Default state
const defaultState = {
  isRunning: false,
  paused: false,
  startTime: null, // ms epoch
  endTime: null,   // ms epoch
  durationMin: null,
  task: '',
  pausedRemainingMs: null,
};

async function getState() {
  const data = await chrome.storage.local.get(STATE_KEY);
  return { ...defaultState, ...(data[STATE_KEY] || {}) };
}

async function setState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
  return state;
}

async function getHistory() {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return data[HISTORY_KEY] || [];
}

async function saveHistory(history) {
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return history;
}

async function addHistoryEntry(entry) {
  const history = await getHistory();
  const updated = [entry, ...history].slice(0, HISTORY_LIMIT);
  await saveHistory(updated);
  return updated;
}

function minutesLeft(msRemaining) {
  return Math.max(0, Math.ceil(msRemaining / 60000));
}

async function updateBadge() {
  const state = await getState();
  if (!state.isRunning) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  if (state.paused) {
    await chrome.action.setBadgeText({ text: '⏸' });
    await chrome.action.setBadgeBackgroundColor({ color: '#777' });
    return;
  }
  const now = Date.now();
  const remaining = Math.max(0, (state.endTime || now) - now);
  const mins = minutesLeft(remaining).toString();
  await chrome.action.setBadgeText({ text: mins });
  await chrome.action.setBadgeBackgroundColor({ color: '#d9534f' });
}

async function clearAlarms() {
  await chrome.alarms.clear(END_ALARM);
  await chrome.alarms.clear(BADGE_ALARM);
}

async function scheduleAlarms(endTimeMs) {
  // Alarm to end the session
  await chrome.alarms.create(END_ALARM, { when: endTimeMs });
  // Repeating alarm to update badge every minute
  await chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });
}

async function startTimer(durationMin, task) {
  const now = Date.now();
  const endTime = now + durationMin * 60 * 1000;
  const newState = {
    isRunning: true,
    paused: false,
    startTime: now,
    endTime,
    durationMin,
    task: task || '',
    pausedRemainingMs: null,
  };
  await setState(newState);
  await clearAlarms();
  await scheduleAlarms(endTime);
  await updateBadge();
  return newState;
}

async function pauseTimer() {
  const state = await getState();
  if (!state.isRunning || state.paused) return state;
  const now = Date.now();
  const remaining = Math.max(0, (state.endTime || now) - now);
  const newState = { ...state, paused: true, pausedRemainingMs: remaining };
  await setState(newState);
  await clearAlarms();
  await updateBadge();
  return newState;
}

async function resumeTimer() {
  const state = await getState();
  if (!state.isRunning || !state.paused) return state;
  const now = Date.now();
  const endTime = now + (state.pausedRemainingMs || 0);
  const newState = {
    ...state,
    paused: false,
    endTime,
    startTime: state.startTime || now,
    pausedRemainingMs: null,
  };
  await setState(newState);
  await scheduleAlarms(endTime);
  await updateBadge();
  return newState;
}

async function resetTimer() {
  const newState = { ...defaultState };
  await setState(newState);
  await clearAlarms();
  await updateBadge();
  return newState;
}

async function stopTimer() {
  const state = await getState();
  if (!state.isRunning) {
    return { state };
  }

  const now = Date.now();
  const startedAt = state.startTime ?? now;
  const endedAt = now;

  const isDurationValid = Number.isFinite(state.durationMin) && state.durationMin > 0;
  const plannedMs = isDurationValid ? state.durationMin * 60000 : Math.max(0, endedAt - startedAt);

  let remainingMs = 0;
  if (state.paused) {
    const pausedRemaining = Number(state.pausedRemainingMs);
    remainingMs = Number.isFinite(pausedRemaining) ? Math.max(0, Math.min(plannedMs, pausedRemaining)) : 0;
  } else {
    const referenceEnd = state.endTime ?? endedAt;
    remainingMs = Math.max(0, referenceEnd - endedAt);
    if (!isDurationValid) {
      remainingMs = Math.min(remainingMs, Math.max(0, referenceEnd - startedAt));
    }
  }

  const elapsedMs = Math.max(0, plannedMs - remainingMs);
  const usedMs = elapsedMs > 0 ? elapsedMs : Math.max(0, endedAt - startedAt);
  const durationMin = Math.max(1, Math.round(usedMs / 60000));

  const entry = {
    task: state.task || '',
    durationMin,
    startedAt,
    endedAt,
  };

  const history = await addHistoryEntry(entry);
  const clearedState = await resetTimer();
  return { state: clearedState, history, entry };
}

async function updateHistoryEntry(index, updates) {
  const history = await getHistory();
  if (!Number.isInteger(index) || index < 0 || index >= history.length) {
    return history;
  }

  const entry = history[index] || {};
  const next = { ...entry };

  if (typeof updates?.task === 'string') {
    next.task = updates.task.trim();
  }

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'durationMin')) {
    const durationNumber = Number(updates.durationMin);
    if (Number.isFinite(durationNumber) && durationNumber > 0) {
      next.durationMin = Math.round(durationNumber);
    }
  }

  const updatedHistory = [...history];
  updatedHistory[index] = next;
  await saveHistory(updatedHistory);
  return updatedHistory;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await setState({ ...defaultState });
  const installReason = chrome.runtime.OnInstalledReason?.INSTALL || 'install';
  if (details?.reason === installReason) {
    await saveHistory([]);
  }
  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#d9534f' });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === END_ALARM) {
    const state = await getState();
    // End timer
    await resetTimer();
    if (state.isRunning) {
      const finishedAt = Date.now();
      const totalMs = (state.endTime ?? finishedAt) - (state.startTime ?? finishedAt);
      const fallbackMin = Math.max(1, Math.round(totalMs / 60000));
      const durationMin = Number.isFinite(state.durationMin) && state.durationMin > 0
        ? state.durationMin
        : fallbackMin;
      const entry = {
        task: state.task || '',
        durationMin,
        startedAt: state.startTime,
        endedAt: finishedAt,
      };
      await addHistoryEntry(entry);
    }
    // Notify user
    try {
      await chrome.notifications.create({
        type: 'basic',
        title: 'ポモドーロ完了！',
        message: state.task ? `「${state.task}」おつかれさま！` : 'おつかれさま！',
        iconUrl: 'icon.png' // optional; Chrome will use default if missing
      });
    } catch (_) {
      // Notifications may be disabled; ignore
    }
    // Inform any open popups to play a sound/update UI
    chrome.runtime.sendMessage({ type: 'timer_ended' }).catch(() => {});
  } else if (alarm.name === BADGE_ALARM) {
    await updateBadge();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'get_state': {
        sendResponse(await getState());
        break;
      }
      case 'start': {
        const { durationMin, task } = message;
        sendResponse(await startTimer(durationMin, task));
        break;
      }
      case 'pause': {
        sendResponse(await pauseTimer());
        break;
      }
      case 'resume': {
        sendResponse(await resumeTimer());
        break;
      }
      case 'reset': {
        sendResponse(await resetTimer());
        break;
      }
      case 'stop': {
        sendResponse(await stopTimer());
        break;
      }
      case 'get_history': {
        sendResponse(await getHistory());
        break;
      }
      case 'clear_history': {
        await saveHistory([]);
        sendResponse([]);
        break;
      }
      case 'update_history_entry': {
        const { index, updates } = message || {};
        const history = await updateHistoryEntry(index, updates);
        sendResponse({ history });
        break;
      }
      default:
        sendResponse({ error: 'unknown_message' });
    }
  })();
  return true; // keep channel open for async
});
