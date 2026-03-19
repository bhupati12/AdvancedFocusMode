import {
  STORAGE_KEY,
  TIMER_ALARM,
  addHistoryEntry,
  calculateRemainingSeconds,
  createBlock,
  createDefaultState,
  createTask,
  deriveAdaptivePlan,
  summarizeSession,
  normalizeHost,
  normalizeState,
  presetMap,
  todayStamp
} from "./shared.js";

let cachedState = normalizeState(createDefaultState());

void bootstrap().catch((error) => {
  console.error("Advanced Focus Mode bootstrap failed", error);
});

chrome.runtime.onInstalled.addListener(() => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIMER_ALARM) {
    void handleTimerAlarm();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  void updateBadge();
});

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html"), active: true });
});

chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );
  return true;
});

async function bootstrap() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  cachedState = normalizeState(stored[STORAGE_KEY] ?? createDefaultState());
  await syncDerivedRuntimeState(cachedState);
  await persistState(cachedState);
  await updateBadge();
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== "object") {
    throw new Error("Invalid message payload");
  }

  switch (message.type) {
    case "state:get":
      return getSnapshot();
    case "session:start":
      return startSession(message.payload);
    case "session:toggle-pause":
      return togglePause();
    case "session:complete":
      return completeSession("manual");
    case "session:reset":
      return resetSession();
    case "session:skip-break":
      return skipBreak();
    case "task:add":
      return addNewTask(message.payload?.title);
    case "task:toggle":
      return toggleTask(message.payload?.id);
    case "task:remove":
      return removeTask(message.payload?.id);
    case "block:add":
      return addBlock(message.payload?.host);
    case "block:remove":
      return removeBlock(message.payload?.id);
    case "block:toggle":
      return toggleBlock(message.payload?.id);
    case "notes:update":
      return updateNotes(message.payload?.notes ?? "");
    case "settings:update":
      return updateSettings(message.payload ?? {});
    case "project:update":
      return updateProject(message.payload ?? {});
    case "presets:apply":
      return applyPreset(message.payload?.presetId);
    case "tab:open-clean":
      return openCleanTab();
    case "state:export":
      return getSnapshot();
    case "state:import":
      return importState(message.payload?.state);
    case "state:reset":
      return resetAllState();
    default:
      throw new Error(`Unsupported command: ${message.type}`);
  }
}

async function handleCommand(command) {
  switch (command) {
    case "open-dashboard":
      await chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html"), active: true });
      break;
    case "toggle-session":
      await togglePauseOrOpen();
      break;
    case "finish-session":
      await completeSession("shortcut");
      break;
    case "skip-break":
      await skipBreak();
      break;
    case "reset-session":
      await resetSession();
      break;
    default:
      break;
  }
}

async function getSnapshot() {
  return buildSnapshot(cachedState);
}

async function startSession(payload) {
  const state = await loadState();
  const preset = presetMap()[payload?.presetId] ?? null;
  const mode = String(payload?.mode ?? preset?.mode ?? state.session.mode ?? "deep-work");
  const focusMinutes = clampNumber(payload?.focusMinutes ?? preset?.focusMinutes ?? state.session.focusMinutes ?? 50, 15, 240);
  const breakMinutes = clampNumber(payload?.breakMinutes ?? preset?.breakMinutes ?? state.session.breakMinutes ?? 10, 5, 60);
  const objective = String(payload?.objective ?? preset?.objective ?? state.session.objective ?? "").trim().slice(0, 180);
  const projectName = String(payload?.projectName ?? state.session.projectName ?? "").trim().slice(0, 80);
  const projectBranch = String(payload?.projectBranch ?? state.session.projectBranch ?? "").trim().slice(0, 80);
  const projectTicket = String(payload?.projectTicket ?? state.session.projectTicket ?? "").trim().slice(0, 80);

  if (state.session.active) {
    addHistoryEntry(state, {
      type: "session-aborted",
      title: "Previous session replaced",
      detail: `Restarted with ${focusMinutes}m focus.`,
      phase: state.session.phase
    });
  }

  state.session = {
    active: true,
    phase: "focus",
    pausedPhase: null,
    mode,
    projectName,
    projectBranch,
    projectTicket,
    objective,
    focusMinutes,
    breakMinutes,
    startedAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + focusMinutes * 60_000).toISOString(),
    pausedAt: null,
    remainingSeconds: focusMinutes * 60,
    pauseCount: 0
  };

  addHistoryEntry(state, {
    type: "session-started",
    title: "Focus session started",
    detail: `${mode} for ${focusMinutes}m. Break: ${breakMinutes}m.`,
    focusMinutes,
    breakMinutes,
    projectName,
    projectBranch,
    projectTicket
  });

  await saveAndApply(state);
  return buildSnapshot(state);
}

async function togglePause() {
  const state = await loadState();
  if (!state.session.active) {
    return buildSnapshot(state);
  }

  if (state.session.phase === "paused") {
    state.session.phase = state.session.remainingSeconds > 0 && state.session.active ? state.session.pausedPhase || "focus" : "idle";
    state.session.pausedPhase = null;
    const resumedMinutes = Math.max(1, Math.ceil(state.session.remainingSeconds / 60));
    state.session.startedAt = new Date().toISOString();
    state.session.endsAt = new Date(Date.now() + state.session.remainingSeconds * 1000).toISOString();
    addHistoryEntry(state, {
      type: "session-resumed",
      title: "Session resumed",
      detail: `Timer restored with about ${resumedMinutes} minute(s) left.`
    });
  } else {
    state.session.pausedPhase = state.session.phase;
    state.session.phase = "paused";
    state.session.remainingSeconds = calculateRemainingSeconds(state.session);
    state.session.pausedAt = new Date().toISOString();
    state.session.endsAt = null;
    state.session.pauseCount += 1;
    addHistoryEntry(state, {
      type: "session-paused",
      title: "Session paused",
      detail: `Timer parked with ${state.session.remainingSeconds} second(s) remaining.`
    });
  }

  await syncTimerAlarm(state);
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function completeSession(source) {
  const state = await loadState();
  if (!state.session.active) {
    return buildSnapshot(state);
  }

  let completedMinutes = 0;
  const wasBreak = state.session.phase === "break";

  if (wasBreak) {
    addHistoryEntry(state, {
      type: "break-completed",
      title: "Break finished",
      detail: source === "timer" ? "Break finished on schedule." : "Break ended manually.",
      phase: "break"
    });
    state.session = {
      ...state.session,
      active: false,
      phase: "idle",
      startedAt: null,
      endsAt: null,
      pausedAt: null,
      pausedPhase: null,
      remainingSeconds: 0,
      pauseCount: 0
    };
  } else {
    const remainingSeconds = calculateRemainingSeconds(state.session);
    const elapsedSeconds = Math.max(0, state.session.focusMinutes * 60 - remainingSeconds);
    completedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

    state.stats.completedSessions += 1;
    state.stats.deepWorkMinutes += completedMinutes;
    state.stats.lastCompletionDate = todayStamp();
    state.stats.streakDays = calculateStreak(state.history, state.stats.lastCompletionDate);

    addHistoryEntry(state, {
      type: "session-completed",
      title: "Session completed",
      detail: `Recorded ${completedMinutes} focus minute(s) via ${source}.`,
      minutes: completedMinutes,
      phase: "focus",
      projectName: state.session.projectName,
      projectBranch: state.session.projectBranch,
      projectTicket: state.session.projectTicket,
      sessionSummary: summarizeSession(state)
    });

    if (state.session.breakMinutes > 0 && source !== "timer-stop") {
      state.session.active = true;
      state.session.phase = "break";
      state.session.startedAt = new Date().toISOString();
      state.session.endsAt = new Date(Date.now() + state.session.breakMinutes * 60_000).toISOString();
      state.session.remainingSeconds = state.session.breakMinutes * 60;
      state.session.pausedAt = null;
      addHistoryEntry(state, {
        type: "break-started",
        title: "Break started",
        detail: `Reset the mind for ${state.session.breakMinutes} minute(s).`,
        minutes: state.session.breakMinutes,
        phase: "break",
        sessionSummary: summarizeSession(state)
      });
    } else {
      state.session = {
        ...state.session,
        active: false,
        phase: "idle",
        startedAt: null,
        endsAt: null,
        pausedAt: null,
        pausedPhase: null,
        remainingSeconds: 0,
        pauseCount: 0
      };
    }
  }

  await syncTimerAlarm(state);
  await saveAndApply(state);
  if (completedMinutes > 0) {
    await maybeNotify("Focus session completed", `Captured ${completedMinutes} minute(s) of deep work.`);
  } else if (wasBreak) {
    await maybeNotify("Break completed", "The break interval finished.");
  }
  return buildSnapshot(state);
}

async function skipBreak() {
  const state = await loadState();
  if (!state.session.active || state.session.phase !== "break") {
    return buildSnapshot(state);
  }

  addHistoryEntry(state, {
    type: "break-skipped",
    title: "Break skipped",
    detail: "Returned to an idle state early."
  });

  state.session = {
    ...state.session,
    active: false,
    phase: "idle",
    startedAt: null,
    endsAt: null,
    pausedAt: null,
    pausedPhase: null,
    remainingSeconds: 0,
    pauseCount: 0
  };

  await syncTimerAlarm(state);
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function resetSession() {
  const state = await loadState();
  state.session = createDefaultState().session;
  addHistoryEntry(state, {
    type: "session-reset",
    title: "Session reset",
    detail: "Timer, pause state, and phase cleared."
  });
  await syncTimerAlarm(state);
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function addNewTask(title) {
  const state = await loadState();
  const value = String(title ?? "").trim();
  if (!value) {
    throw new Error("Task title is required");
  }
  state.tasks.unshift(createTask(value));
  addHistoryEntry(state, {
    type: "task-added",
    title: "Task added",
    detail: value.slice(0, 120)
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function toggleTask(id) {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === id);
  if (!task) {
    throw new Error("Task not found");
  }
  task.done = !task.done;
  addHistoryEntry(state, {
    type: task.done ? "task-completed" : "task-reopened",
    title: task.done ? "Task completed" : "Task reopened",
    detail: task.title
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function removeTask(id) {
  const state = await loadState();
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((item) => item.id !== id);
  if (state.tasks.length === before) {
    throw new Error("Task not found");
  }
  addHistoryEntry(state, {
    type: "task-removed",
    title: "Task removed",
    detail: id
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function addBlock(host) {
  const state = await loadState();
  const value = normalizeHost(host);
  if (!value) {
    throw new Error("Host is required");
  }
  if (state.blocks.some((entry) => entry.host === value)) {
    return buildSnapshot(state);
  }
  state.blocks.unshift(createBlock(value));
  addHistoryEntry(state, {
    type: "block-added",
    title: "Site shielded",
    detail: value
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function removeBlock(id) {
  const state = await loadState();
  const before = state.blocks.length;
  state.blocks = state.blocks.filter((item) => item.id !== id);
  if (before === state.blocks.length) {
    throw new Error("Block not found");
  }
  addHistoryEntry(state, {
    type: "block-removed",
    title: "Site unshielded",
    detail: id
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function toggleBlock(id) {
  const state = await loadState();
  const block = state.blocks.find((item) => item.id === id);
  if (!block) {
    throw new Error("Block not found");
  }
  block.enabled = !block.enabled;
  addHistoryEntry(state, {
    type: block.enabled ? "block-enabled" : "block-disabled",
    title: block.enabled ? "Shield enabled" : "Shield disabled",
    detail: block.host
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function updateNotes(notes) {
  const state = await loadState();
  state.notes = String(notes ?? "").slice(0, 5000);
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function updateSettings(settings) {
  const state = await loadState();
  state.settings = {
    ...state.settings,
    notificationsEnabled: Boolean(settings.notificationsEnabled ?? state.settings.notificationsEnabled),
    strictBlocking: Boolean(settings.strictBlocking ?? state.settings.strictBlocking),
    autoStartBreak: Boolean(settings.autoStartBreak ?? state.settings.autoStartBreak)
  };
  addHistoryEntry(state, {
    type: "settings-updated",
    title: "Settings updated",
    detail: "Focus Mode preferences saved."
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function updateProject(payload) {
  const state = await loadState();
  state.session.projectName = String(payload?.projectName ?? state.session.projectName ?? "").trim().slice(0, 80);
  state.session.projectBranch = String(payload?.projectBranch ?? state.session.projectBranch ?? "").trim().slice(0, 80);
  state.session.projectTicket = String(payload?.projectTicket ?? state.session.projectTicket ?? "").trim().slice(0, 80);
  addHistoryEntry(state, {
    type: "project-updated",
    title: "Project context updated",
    detail: state.session.projectName || state.session.projectTicket || state.session.projectBranch || "Project context cleared."
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function applyPreset(presetId) {
  const state = await loadState();
  const preset = presetMap()[presetId];
  if (!preset) {
    throw new Error("Preset not found");
  }
  state.session.mode = preset.mode;
  state.session.focusMinutes = preset.focusMinutes;
  state.session.breakMinutes = preset.breakMinutes;
  state.session.objective = preset.objective;
  addHistoryEntry(state, {
    type: "preset-applied",
    title: "Preset applied",
    detail: `${presetId} configured the next session.`
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function openCleanTab() {
  await chrome.tabs.create({ url: "about:blank", active: true });
  return { opened: true };
}

async function togglePauseOrOpen() {
  const state = await loadState();
  if (state.session.active) {
    return togglePause();
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html"), active: true });
  return buildSnapshot(state);
}

async function importState(nextState) {
  if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
    throw new Error("Invalid state payload");
  }

  const state = normalizeState(nextState);

  addHistoryEntry(state, {
    type: "state-imported",
    title: "State restored",
    detail: "Imported focus data was loaded successfully."
  });

  await saveAndApply(state);
  return buildSnapshot(state);
}

async function resetAllState() {
  const state = createDefaultState();
  addHistoryEntry(state, {
    type: "state-reset",
    title: "State reset",
    detail: "All sessions, tasks, blocks, notes, and stats were cleared."
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function handleTimerAlarm() {
  const state = await loadState();
  if (!state.session.active || state.session.phase === "paused") {
    return;
  }
  if (state.session.phase === "break") {
    await completeSession("timer-stop");
    return;
  }
  await completeSession("timer");
}

async function syncDerivedRuntimeState(state) {
  await syncTimerAlarm(state);
  await syncBlockingRules(state);
}

async function syncTimerAlarm(state) {
  await chrome.alarms.clear(TIMER_ALARM);
  if (!state.session.active || state.session.phase === "paused" || !state.session.endsAt) {
    return;
  }
  const when = new Date(state.session.endsAt).getTime();
  if (Number.isNaN(when) || when <= Date.now()) {
    await chrome.alarms.create(TIMER_ALARM, { when: Date.now() + 1000 });
    return;
  }
  await chrome.alarms.create(TIMER_ALARM, { when });
}

async function syncBlockingRules(state) {
  const enabledBlocks = state.blocks.filter((item) => item.enabled && item.host);
  const shouldBlock = state.settings.strictBlocking && state.session.active;

  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = currentRules.map((rule) => rule.id);
  const addRules = shouldBlock
    ? enabledBlocks.map((block, index) => ({
        id: 1000 + index + 1,
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            extensionPath: "/blocked.html"
          }
        },
        condition: {
          urlFilter: `||${block.host}^`,
          resourceTypes: ["main_frame", "sub_frame"]
        }
      }))
    : [];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

async function saveAndApply(state) {
  cachedState = normalizeState(state);
  await persistState(cachedState);
  await syncDerivedRuntimeState(cachedState);
  await updateBadge();
}

async function persistState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  cachedState = normalizeState(stored[STORAGE_KEY] ?? cachedState ?? createDefaultState());
  return cachedState;
}

function buildSnapshot(state) {
  const currentSession = normalizeState(state);
  currentSession.session.remainingSeconds = calculateRemainingSeconds(currentSession.session);
  currentSession.insights = deriveAdaptivePlan(currentSession);
  currentSession.sessionSummary = summarizeSession(currentSession);
  return currentSession;
}

async function updateBadge() {
  const state = await loadState();
  if (!state.session.active) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  const remaining = Math.ceil(calculateRemainingSeconds(state.session) / 60);
  const label = state.session.phase === "break" ? "B" : String(Math.max(1, Math.min(remaining, 99)));
  await chrome.action.setBadgeBackgroundColor({
    color: state.session.phase === "break" ? "#0ea5e9" : "#f97316"
  });
  await chrome.action.setBadgeText({ text: label });
}

async function maybeNotify(title, message) {
  const state = await loadState();
  if (!state.settings.notificationsEnabled) {
    return;
  }
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.svg"),
      title,
      message
    });
  } catch {
    // Notifications are best-effort in extension contexts.
  }
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function calculateStreak(history, lastCompletionDate) {
  const completionDays = new Set(
    history
      .filter((item) => item.type === "session-completed" && item.createdAt)
      .map((item) => todayStamp(new Date(item.createdAt)))
  );
  if (lastCompletionDate) {
    completionDays.add(lastCompletionDate);
  }
  let streak = 0;
  const cursor = new Date();
  while (completionDays.has(todayStamp(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
