import {
  STORAGE_KEY,
  TIMER_ALARM,
  addHistoryEntry,
  buildSessionReplay,
  calculateRemainingSeconds,
  createBlock,
  createDefaultState,
  createParkingItem,
  createBudgetRule,
  createTask,
  deriveAutopilot,
  deriveAdaptivePlan,
  getProjectMode,
  normalizeHost,
  summarizeSession,
  normalizeState,
  projectModeCatalog,
  deriveSmartBlockSuggestions,
  summarizeFocusBudgets,
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

chrome.tabs.onActivated.addListener((activeInfo) => {
  void recordActiveTabChange(activeInfo.tabId, activeInfo.windowId);
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
    case "session:capture-context":
      return captureSessionContext(message.payload?.source ?? "manual");
    case "session:restore-context":
      return restoreSessionContext();
    case "session:apply-mode":
      return applyProjectMode(message.payload?.modeId);
    case "session:autopilot-apply":
      return applyAutopilotSuggestion();
    case "presets:apply":
      return applyPreset(message.payload?.presetId);
    case "tab:open-clean":
      return openCleanTab();
    case "task:link-context":
      return linkContextToTask(message.payload?.taskId, message.payload ?? {});
    case "task:unlink-context":
      return unlinkContextFromTask(message.payload?.taskId, message.payload?.url);
    case "task:open-context":
      return openTaskContext(message.payload?.taskId);
    case "parking:add":
      return addParkingItem(message.payload ?? {});
    case "parking:add-current-tab":
      return parkCurrentTab(message.payload ?? {});
    case "parking:remove":
      return removeParkingItem(message.payload?.id);
    case "parking:clear":
      return clearParkingLot();
    case "budget:add":
      return addBudgetRule(message.payload ?? {});
    case "budget:update":
      return updateBudgetRule(message.payload?.id, message.payload ?? {});
    case "budget:remove":
      return removeBudgetRule(message.payload?.id);
    case "budget:reset":
      return resetBudgets();
    case "forensics:clear":
      return clearForensics();
    case "interruption:blocked-attempt":
      return recordBlockedAttempt(message.payload ?? {});
    case "interruption:tab-switch":
      return recordManualTabSwitch(message.payload ?? {});
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
  const modeProfile = getProjectMode(payload?.modeId ?? state.session.modeId ?? "code-sprint");
  const mode = String(payload?.mode ?? preset?.mode ?? state.session.mode ?? modeProfile.id ?? "deep-work");
  const focusMinutes = clampNumber(payload?.focusMinutes ?? preset?.focusMinutes ?? modeProfile.focusMinutes ?? state.session.focusMinutes ?? 50, 15, 240);
  const breakMinutes = clampNumber(payload?.breakMinutes ?? preset?.breakMinutes ?? modeProfile.breakMinutes ?? state.session.breakMinutes ?? 10, 5, 60);
  const objective = String(payload?.objective ?? preset?.objective ?? modeProfile.objective ?? state.session.objective ?? "").trim().slice(0, 180);
  const projectName = String(payload?.projectName ?? state.session.projectName ?? "").trim().slice(0, 80);
  const projectBranch = String(payload?.projectBranch ?? state.session.projectBranch ?? "").trim().slice(0, 80);
  const projectTicket = String(payload?.projectTicket ?? state.session.projectTicket ?? "").trim().slice(0, 80);
  const recovery = await captureCurrentContext("session-start");

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
    modeId: modeProfile.id,
    modeLabel: modeProfile.label,
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
    pauseCount: 0,
    recovery
  };

  addHistoryEntry(state, {
    type: "session-started",
    title: "Focus session started",
    detail: `${modeProfile.label} for ${focusMinutes}m. Break: ${breakMinutes}m.`,
    focusMinutes,
    breakMinutes,
    projectName,
    projectBranch,
    projectTicket
  });
  if (recovery.tabs.length > 0) {
    addHistoryEntry(state, {
      type: "context-captured",
      title: "Focus context captured",
      detail: `${recovery.tabs.length} tab(s) saved for restore.`,
      phase: "focus"
    });
  }

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

async function captureSessionContext(source = "manual") {
  const state = await loadState();
  const recovery = await captureCurrentContext(source);
  state.session.recovery = recovery;
  addHistoryEntry(state, {
    type: "context-captured",
    title: "Focus context captured",
    detail: recovery.tabs.length > 0 ? `${recovery.tabs.length} tab(s) saved for restore.` : "No eligible tabs found to save.",
    phase: state.session.phase
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function applyProjectMode(modeId) {
  const state = await loadState();
  const mode = getProjectMode(modeId);
  state.session.modeId = mode.id;
  state.session.modeLabel = mode.label;
  state.session.mode = mode.id;
  state.session.focusMinutes = mode.focusMinutes;
  state.session.breakMinutes = mode.breakMinutes;
  state.session.objective = mode.objective;
  addHistoryEntry(state, {
    type: "mode-applied",
    title: "Project mode applied",
    detail: `${mode.label} configured the next session.`,
    phase: state.session.phase
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function applyAutopilotSuggestion() {
  const state = await loadState();
  const autopilot = deriveAutopilot(state);
  return applyProjectMode(autopilot.recommendedModeId);
}

async function restoreSessionContext() {
  const state = await loadState();
  const tabs = Array.isArray(state.session.recovery?.tabs) ? state.session.recovery.tabs : [];
  if (!tabs.length) {
    throw new Error("No saved context to restore");
  }

  const windowTabs = tabs.filter((tab) => isRestorableUrl(tab.url)).slice(0, 10);
  if (!windowTabs.length) {
    throw new Error("Saved context does not contain restorable URLs");
  }

  let created = 0;
  for (const [index, tab] of windowTabs.entries()) {
    await chrome.tabs.create({
      url: tab.url,
      active: index === 0
    });
    created += 1;
  }

  addHistoryEntry(state, {
    type: "context-restored",
    title: "Focus context restored",
    detail: `${created} tab(s) reopened from the saved snapshot.`,
    phase: state.session.phase
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function linkContextToTask(taskId, payload) {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  const tab = await resolveActiveRestorableTab();
  const sourceUrl = normalizeHost(payload?.url ?? tab?.url ?? "");
  const linkUrl = String(payload?.url ?? tab?.url ?? "").trim();
  if (!linkUrl) {
    throw new Error("A context URL is required");
  }

  task.contextLinks = Array.isArray(task.contextLinks) ? task.contextLinks : [];
  if (!task.contextLinks.some((link) => link.url === linkUrl)) {
    task.contextLinks.unshift({
      title: String(payload?.title ?? tab?.title ?? linkUrl).trim().slice(0, 140),
      url: linkUrl.slice(0, 500),
      createdAt: new Date().toISOString()
    });
  }

  addHistoryEntry(state, {
    type: "task-context-linked",
    title: "Task context linked",
    detail: `${task.title} now includes ${sourceUrl || "a saved tab"}.`
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function unlinkContextFromTask(taskId, url) {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Task not found");
  }
  task.contextLinks = Array.isArray(task.contextLinks) ? task.contextLinks.filter((link) => link.url !== url) : [];
  addHistoryEntry(state, {
    type: "task-context-unlinked",
    title: "Task context removed",
    detail: task.title
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function openTaskContext(taskId) {
  const state = await loadState();
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    throw new Error("Task not found");
  }
  const link = Array.isArray(task.contextLinks) ? task.contextLinks[0] : null;
  if (!link?.url) {
    throw new Error("Task has no linked context");
  }
  await chrome.tabs.create({ url: link.url, active: true });
  addHistoryEntry(state, {
    type: "task-context-opened",
    title: "Task context opened",
    detail: task.title
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function addParkingItem(payload) {
  const state = await loadState();
  const title = String(payload?.title ?? payload?.note ?? "").trim();
  const url = String(payload?.url ?? "").trim();
  const note = String(payload?.note ?? "").trim();

  if (!title && !url && !note) {
    throw new Error("Parking item text is required");
  }

  state.parkingLot.unshift(
    createParkingItem({
      title: title || url || note || "Parked distraction",
      url,
      note,
      kind: url ? "tab" : "thought"
    })
  );

  addHistoryEntry(state, {
    type: "parking-item-added",
    title: "Distraction parked",
    detail: title || note || url || "Captured a side thought."
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function parkCurrentTab(payload = {}) {
  const state = await loadState();
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const tab = tabs.find((candidate) => candidate.active && isRestorableUrl(candidate.url)) ?? tabs.find((candidate) => isRestorableUrl(candidate.url));
  if (!tab || !isRestorableUrl(tab.url)) {
    throw new Error("No restorable active tab found");
  }

  const item = createParkingItem({
    title: String(payload.title ?? tab.title ?? tab.url ?? "Parked tab").trim().slice(0, 140),
    url: tab.url ?? "",
    note: String(payload.note ?? "").trim(),
    kind: "tab"
  });

  state.parkingLot.unshift(item);
  addHistoryEntry(state, {
    type: "parking-tab-added",
    title: "Tab parked",
    detail: tab.title || tab.url || item.title
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function removeParkingItem(id) {
  const state = await loadState();
  const before = state.parkingLot.length;
  state.parkingLot = state.parkingLot.filter((item) => item.id !== id);
  if (before === state.parkingLot.length) {
    throw new Error("Parking item not found");
  }
  addHistoryEntry(state, {
    type: "parking-item-removed",
    title: "Distraction removed",
    detail: id
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function clearParkingLot() {
  const state = await loadState();
  state.parkingLot = [];
  addHistoryEntry(state, {
    type: "parking-cleared",
    title: "Parking lot cleared",
    detail: "All parked distractions were removed."
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function addBudgetRule(payload) {
  const state = await loadState();
  const host = normalizeHost(payload?.host);
  if (!host) {
    throw new Error("Budget host is required");
  }

  state.budgets.unshift(
    createBudgetRule(host, payload?.label ?? host, payload?.dailyLimit ?? 5)
  );

  addHistoryEntry(state, {
    type: "budget-added",
    title: "Focus budget created",
    detail: `${host} limited to ${payload?.dailyLimit ?? 5} check(s) per day.`
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function updateBudgetRule(id, payload) {
  const state = await loadState();
  const budget = state.budgets.find((item) => item.id === id);
  if (!budget) {
    throw new Error("Budget not found");
  }

  budget.label = String(payload?.label ?? budget.label).trim().slice(0, 80);
  budget.host = normalizeHost(payload?.host ?? budget.host);
  budget.dailyLimit = clampNumber(payload?.dailyLimit ?? budget.dailyLimit, 1, 50);
  budget.enabled = payload?.enabled ?? budget.enabled;

  addHistoryEntry(state, {
    type: "budget-updated",
    title: "Focus budget updated",
    detail: budget.label
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function removeBudgetRule(id) {
  const state = await loadState();
  const before = state.budgets.length;
  state.budgets = state.budgets.filter((item) => item.id !== id);
  if (before === state.budgets.length) {
    throw new Error("Budget not found");
  }
  addHistoryEntry(state, {
    type: "budget-removed",
    title: "Focus budget removed",
    detail: id
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function resetBudgets() {
  const state = await loadState();
  state.budgets = state.budgets.map((budget) => ({
    ...budget,
    used: 0,
    lastResetDate: todayStamp()
  }));
  addHistoryEntry(state, {
    type: "budget-reset",
    title: "Budgets reset",
    detail: "Usage counters cleared for the day."
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function clearForensics() {
  const state = await loadState();
  state.forensics = {
    blockedAttempts: 0,
    tabSwitches: 0,
    focusEscapes: 0,
    topBlockedHosts: []
  };
  addHistoryEntry(state, {
    type: "forensics-cleared",
    title: "Forensics cleared",
    detail: "Interruption history counters were reset."
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function recordBlockedAttempt(payload) {
  const state = await loadState();
  const host = normalizeHost(payload?.host ?? payload?.url ?? payload?.referrer ?? "");
  state.forensics.blockedAttempts += 1;
  if (host) {
    state.forensics.topBlockedHosts = [host, ...state.forensics.topBlockedHosts.filter((item) => item !== host)].slice(0, 6);
  }
  addHistoryEntry(state, {
    type: "blocked-attempt",
    title: "Blocked attempt recorded",
    detail: host || String(payload?.url ?? "Unknown site").slice(0, 120),
    host
  });
  await saveAndApply(state);
  return buildSnapshot(state);
}

async function recordManualTabSwitch(payload) {
  const state = await loadState();
  const url = String(payload?.url ?? "").trim();
  const title = String(payload?.title ?? url).trim().slice(0, 140);
  state.session.lastObservedTab = {
    url: url.slice(0, 500),
    title,
    observedAt: new Date().toISOString()
  };
  addHistoryEntry(state, {
    type: "tab-switched",
    title: "Tab switch recorded",
    detail: title || url || "Unknown tab"
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
  const modeProfile = getProjectMode(presetId);
  state.session.mode = preset.mode;
  state.session.modeId = presetId;
  state.session.modeLabel = modeProfile.label;
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
  const autopilot = deriveAutopilot(state);
  const shouldBlock =
    state.session.active &&
    (state.settings.strictBlocking || (state.settings.autopilotEnabled && autopilot.suggestedStrictBlocking));

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
  currentSession.autopilot = deriveAutopilot(currentSession);
  currentSession.projectModes = projectModeCatalog();
  currentSession.replay = buildSessionReplay(currentSession);
  currentSession.smartBlockSuggestions = deriveSmartBlockSuggestions(currentSession);
  currentSession.budgetSummary = summarizeFocusBudgets(currentSession);
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

async function recordActiveTabChange(tabId, windowId) {
  const state = await loadState();
  if (!state.session.active || state.session.phase === "paused") {
    return;
  }

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !isRestorableUrl(tab.url)) {
    return;
  }

  const observedUrl = String(tab.url ?? "").trim();
  const previousUrl = String(state.session.lastObservedTab?.url ?? "").trim();
  if (observedUrl && observedUrl === previousUrl) {
    return;
  }

  state.session.lastObservedTab = {
    url: observedUrl.slice(0, 500),
    title: String(tab.title ?? observedUrl).trim().slice(0, 140),
    observedAt: new Date().toISOString()
  };
  state.forensics.tabSwitches += 1;
  state.forensics.focusEscapes += 1;
  addHistoryEntry(state, {
    type: "tab-switched",
    title: "Focus changed tabs",
    detail: tab.title || observedUrl,
    phase: state.session.phase
  });

  await consumeBudgetForUrl(state, observedUrl, tab.title ?? observedUrl);
  await saveAndApply(state);
}

async function recordBlockedAttemptFromPage(tab) {
  if (tab?.url) {
    await recordBlockedAttempt({ url: tab.url, title: tab.title, source: "blocked-page" });
  }
}

async function consumeBudgetForUrl(state, url, title) {
  const host = normalizeHost(url);
  if (!host) {
    return;
  }

  const today = todayStamp();
  let changed = false;
  for (const budget of state.budgets) {
    if (!budget.enabled || budget.host !== host) {
      continue;
    }
    if (budget.lastResetDate !== today) {
      budget.lastResetDate = today;
      budget.used = 0;
    }

    budget.used += 1;
    changed = true;
    addHistoryEntry(state, {
      type: budget.used > budget.dailyLimit ? "budget-overrun" : "budget-warning",
      title: budget.used > budget.dailyLimit ? "Focus budget exceeded" : "Focus budget consumed",
      detail: `${budget.label} ${budget.used}/${budget.dailyLimit}`,
      host
    });
  }

  if (changed) {
    state.forensics.topBlockedHosts = [host, ...state.forensics.topBlockedHosts.filter((item) => item !== host)].slice(0, 6);
  }
}

async function resolveActiveRestorableTab() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.find((tab) => tab.active && isRestorableUrl(tab.url)) ?? tabs.find((tab) => isRestorableUrl(tab.url)) ?? null;
}

async function captureCurrentContext(source) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const safeTabs = tabs
    .filter((tab) => isRestorableUrl(tab.url))
    .map((tab) => ({
      title: String(tab.title ?? tab.url ?? "Untitled tab").trim().slice(0, 140),
      url: String(tab.url ?? "").trim().slice(0, 500),
      pinned: Boolean(tab.pinned),
      active: Boolean(tab.active)
    }))
    .slice(0, 10);

  return {
    capturedAt: new Date().toISOString(),
    source: String(source ?? "manual").trim().slice(0, 80),
    tabs: safeTabs
  };
}

function isRestorableUrl(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}
