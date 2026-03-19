import {
  calculateFocusScore,
  calculateRemainingSeconds,
  deriveStatusLabel,
  addHistoryEntry,
  createBlock,
  createDefaultState,
  createTask,
  deriveAdaptivePlan,
  formatDuration,
  formatMinutes,
  formatRelativeTimestamp,
  normalizeHost,
  normalizeState,
  summarizeSession,
  todayStamp
} from "./shared.js";

const suggestions = [
  "codepen.io",
  "twitter.com",
  "youtube.com",
  "reddit.com",
  "linkedin.com",
  "amazon.com"
];

const state = {
  snapshot: null,
  saveTimer: null,
  paletteOpen: false
};

const extensionBridgeAvailable = Boolean(globalThis.chrome?.runtime?.sendMessage);
const localStateKey = "advanced-focus-mode.local-state";

const els = {
  sessionStatus: document.getElementById("session-status"),
  timerRing: document.getElementById("timer-ring"),
  timerDisplay: document.getElementById("timer-display"),
  timerDetail: document.getElementById("timer-detail"),
  objectivePreview: document.getElementById("objective-preview"),
  modePreview: document.getElementById("mode-preview"),
  breakPreview: document.getElementById("break-preview"),
  sessionMode: document.getElementById("session-mode"),
  focusMinutes: document.getElementById("focus-minutes"),
  breakMinutes: document.getElementById("break-minutes"),
  sessionObjective: document.getElementById("session-objective"),
  projectName: document.getElementById("project-name"),
  projectBranch: document.getElementById("project-branch"),
  projectTicket: document.getElementById("project-ticket"),
  notificationsEnabled: document.getElementById("notifications-enabled"),
  strictBlocking: document.getElementById("strict-blocking"),
  autoStartBreak: document.getElementById("auto-start-break"),
  taskForm: document.getElementById("task-form"),
  taskInput: document.getElementById("task-input"),
  taskList: document.getElementById("task-list"),
  shieldForm: document.getElementById("shield-form"),
  shieldInput: document.getElementById("shield-input"),
  shieldList: document.getElementById("shield-list"),
  shieldSuggestions: document.getElementById("shield-suggestions"),
  addSuggestedTask: document.getElementById("add-suggested-task"),
  notes: document.getElementById("session-notes"),
  activityList: document.getElementById("activity-list"),
  metricDeepWork: document.getElementById("metric-deep-work"),
  metricSessions: document.getElementById("metric-sessions"),
  metricShielded: document.getElementById("metric-shielded"),
  metricStreak: document.getElementById("metric-streak"),
  metricScore: document.getElementById("metric-score"),
  actionStatus: document.getElementById("action-status"),
  coachConfidence: document.getElementById("coach-confidence"),
  coachRationale: document.getElementById("coach-rationale"),
  coachFocus: document.getElementById("coach-focus"),
  coachBreak: document.getElementById("coach-break"),
  reviewGeneratedAt: document.getElementById("review-generated-at"),
  reviewTitle: document.getElementById("review-title"),
  reviewObjective: document.getElementById("review-objective"),
  reviewTopTasks: document.getElementById("review-top-tasks"),
  reviewNextAction: document.getElementById("review-next-action"),
  paletteBackdrop: document.getElementById("palette-backdrop"),
  paletteInput: document.getElementById("palette-input"),
  paletteList: document.getElementById("palette-list"),
  togglePause: document.querySelector('[data-action="toggle-pause"]'),
  completeSession: document.querySelector('[data-action="complete-session"]'),
  skipBreak: document.querySelector('[data-action="skip-break"]')
};

const paletteActions = [
  { title: "Start session", hint: "Launch the timer with the current project and objective.", action: "start-session" },
  { title: "Pause or resume", hint: "Toggle the current session state.", action: "toggle-pause" },
  { title: "Finish session", hint: "Close the active focus block.", action: "complete-session" },
  { title: "Skip break", hint: "End the active break and return to idle.", action: "skip-break" },
  { title: "Reset session", hint: "Clear the current timer and state.", action: "reset-session" },
  { title: "Open settings", hint: "Manage backups, shortcuts, and resets.", action: "open-options" },
  { title: "Export backup", hint: "Download the current focus state.", action: "export-state" },
  { title: "Open clean tab", hint: "Launch a blank tab for distraction-free work.", action: "open-clean-tab" }
];

await init();

async function init() {
  wireEvents();
  await refresh();
  chrome.storage?.onChanged?.addListener?.(handleStorageChange);
  window.setInterval(() => {
    renderTimer();
    updateDocumentTitle();
  }, 1000);
}

function wireEvents() {
  on(els.taskForm, "submit", onTaskSubmit);
  on(els.shieldForm, "submit", onShieldSubmit);
  on(els.addSuggestedTask, "click", addSuggestedTask);
  on(els.notes, "input", queueNoteSave);
  on(els.notificationsEnabled, "change", syncSettings);
  on(els.strictBlocking, "change", syncSettings);
  on(els.autoStartBreak, "change", syncSettings);
  on(els.sessionMode, "change", renderSessionPreview);
  on(els.focusMinutes, "input", renderSessionPreview);
  on(els.breakMinutes, "input", renderSessionPreview);
  on(els.projectName, "input", queueProjectSave);
  on(els.projectBranch, "input", queueProjectSave);
  on(els.projectTicket, "input", queueProjectSave);
  on(els.paletteBackdrop, "click", handlePaletteBackdropClick);
  on(els.paletteInput, "input", handlePaletteInput);
  on(els.paletteInput, "keydown", handlePaletteKeydown);

  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeyboard);
}

async function handleClick(event) {
  try {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      await handleAction(actionButton.dataset.action);
      return;
    }

    const taskButton = event.target.closest("[data-task-action]");
    if (taskButton) {
      await handleTaskAction(taskButton.dataset.taskAction, taskButton.dataset.taskId);
      return;
    }

    const blockButton = event.target.closest("[data-block-action]");
    if (blockButton) {
      await handleBlockAction(blockButton.dataset.blockAction, blockButton.dataset.blockId);
      return;
    }

    const suggestion = event.target.closest("[data-suggested-host]");
    if (suggestion) {
      await command("block:add", { host: suggestion.dataset.suggestedHost });
    }
  } catch (error) {
    setActionStatus(error instanceof Error ? error.message : "Action failed");
  }
}

async function handleAction(action) {
  switch (action) {
    case "start-session":
      await withStatus("Starting session...", () => command("session:start", sessionPayload()));
      break;
    case "toggle-pause":
      await withStatus("Updating session...", () => command("session:toggle-pause"));
      break;
    case "complete-session":
      await withStatus("Completing session...", () => command("session:complete"));
      break;
    case "skip-break":
      await withStatus("Skipping break...", () => command("session:skip-break"));
      break;
    case "reset-session":
      await withStatus("Resetting session...", () => command("session:reset"));
      break;
    case "copy-summary":
      await withStatus("Summary copied to clipboard.", () => copySummary());
      break;
    case "export-state":
      await withStatus("Exported backup.", () => exportState());
      break;
    case "open-clean-tab":
      await withStatus("Opening clean tab...", () => command("tab:open-clean"));
      break;
    case "open-options":
      await withStatus("Opening settings...", () => chrome.runtime.openOptionsPage());
      break;
    case "open-palette":
      openPalette();
      break;
    case "close-palette":
      closePalette();
      break;
    default:
      break;
  }
}

async function handleKeyboard(event) {
  if (event.target.matches("input, textarea, select")) {
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    await command("session:toggle-pause");
  }

  if (event.key === "Enter") {
    event.preventDefault();
    await command("session:start", sessionPayload());
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openPalette();
    return;
  }

  if (event.key === "Escape" && state.paletteOpen) {
    closePalette();
  }
}

async function onTaskSubmit(event) {
  event.preventDefault();
  const title = els.taskInput.value.trim();
  if (!title) return;
  await command("task:add", { title });
  els.taskInput.value = "";
}

async function onShieldSubmit(event) {
  event.preventDefault();
  const host = els.shieldInput.value.trim();
  if (!host) return;
  await command("block:add", { host });
  els.shieldInput.value = "";
}

function addSuggestedTask() {
  const candidate = [
    "Write the next narrow test",
    "Trim the scope to one deliverable",
    "Capture the unknowns in the note",
    "Verify the edge case before shipping"
  ].find((item) => !state.snapshot?.tasks?.some((task) => task.title === item));

  if (candidate) {
    void command("task:add", { title: candidate });
  }
}

async function syncSettings() {
  await command("settings:update", {
    notificationsEnabled: els.notificationsEnabled.checked,
    strictBlocking: els.strictBlocking.checked,
    autoStartBreak: els.autoStartBreak.checked
  });
}

function queueProjectSave() {
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    void command("project:update", {
      projectName: els.projectName.value,
      projectBranch: els.projectBranch.value,
      projectTicket: els.projectTicket.value
    });
  }, 250);
}

function queueNoteSave() {
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    void command("notes:update", { notes: els.notes.value });
  }, 250);
}

async function handleStorageChange(changes, areaName) {
  if (areaName !== "local") return;
  if (!changes.advancedFocusModeState) return;
  await refresh();
}

async function refresh() {
  const result = await command("state:get");
  state.snapshot = result;
  render();
  setActionStatus("");
}

async function command(type, payload = {}) {
  if (extensionBridgeAvailable) {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response?.ok) {
      throw new Error(response?.error || "Command failed");
    }
    if (response.result) {
      state.snapshot = response.result;
      render();
    }
    return response.result;
  }

  const result = await localCommand(type, payload);
  state.snapshot = result;
  persistLocalState(result);
  render();
  return result;
}

async function withStatus(message, run) {
  try {
    setActionStatus(message);
    await run();
    if (message.includes("Starting session")) {
      setActionStatus("Session started.");
    } else if (message.includes("Updating session")) {
      setActionStatus("Session updated.");
    } else if (message.includes("Completing session")) {
      setActionStatus("Session completed.");
    }
  } catch (error) {
    setActionStatus(error instanceof Error ? error.message : "Action failed");
    throw error;
  }
}

function render() {
  if (!state.snapshot) return;

  const snapshot = state.snapshot;
  const session = snapshot.session;

  els.notificationsEnabled.checked = Boolean(snapshot.settings.notificationsEnabled);
  els.strictBlocking.checked = Boolean(snapshot.settings.strictBlocking);
  els.autoStartBreak.checked = Boolean(snapshot.settings.autoStartBreak);
  els.sessionMode.value = session.mode || "deep-work";
  els.focusMinutes.value = session.focusMinutes || 50;
  els.breakMinutes.value = session.breakMinutes || 10;
  els.sessionObjective.value = session.objective || "";
  els.projectName.value = session.projectName || "";
  els.projectBranch.value = session.projectBranch || "";
  els.projectTicket.value = session.projectTicket || "";
  els.notes.value = snapshot.notes || "";

  renderMetrics(snapshot);
  renderSession(snapshot);
  renderCoach(snapshot);
  renderReview(snapshot);
  renderTasks(snapshot.tasks || []);
  renderBlocks(snapshot.blocks || []);
  renderActivity(snapshot.history || []);
  renderSuggestedBlocks();
  renderSessionPreview();
  renderTimer();
  renderPalette();
  updateDocumentTitle();
}

function renderMetrics(snapshot) {
  const today = todayStamp();
  const completedToday = (snapshot.history || []).filter(
    (entry) => entry.type === "session-completed" && todayStamp(new Date(entry.createdAt)) === today
  );
  const deepWorkToday = completedToday.reduce((total, entry) => total + Number(entry.minutes || 0), 0);
  const sessionsToday = completedToday.length;
  const enabledBlocks = (snapshot.blocks || []).filter((block) => block.enabled !== false).length;

  els.metricDeepWork.textContent = formatMinutes(deepWorkToday);
  els.metricSessions.textContent = String(sessionsToday);
  els.metricShielded.textContent = String(enabledBlocks);
  els.metricStreak.textContent = String(snapshot.stats?.streakDays || 0);
  els.metricScore.textContent = String(calculateFocusScore(snapshot));
}

function renderSession(snapshot) {
  const session = snapshot.session;
  els.sessionStatus.textContent = deriveStatusLabel(session);
  els.objectivePreview.textContent = session.objective?.trim() ? session.objective.trim() : "Nothing set yet";
  els.modePreview.textContent = prettyMode(session.mode || "deep-work");
  els.breakPreview.textContent = `${formatMinutes(session.breakMinutes || 10)} break`;
  els.togglePause.textContent = session.phase === "paused" ? "Resume" : "Pause";
  els.completeSession.textContent = session.phase === "break" ? "End break" : "Finish round";
  els.skipBreak.hidden = session.phase !== "break";

  if (session.phase === "break") {
    els.timerDetail.textContent = "Break interval is active. Return when the rest interval is done.";
  } else if (session.phase === "paused") {
    els.timerDetail.textContent = "The session is paused. Resume when you are ready.";
  } else if (session.active) {
    els.timerDetail.textContent = "Deep work is running. Keep the stack narrow.";
  } else {
    els.timerDetail.textContent = "Set the mission, start the timer, and protect the session.";
  }
}

function renderSessionPreview() {
  const mode = els.sessionMode.value || "deep-work";
  els.modePreview.textContent = prettyMode(mode);
  els.breakPreview.textContent = `${formatMinutes(Number(els.breakMinutes.value || 10))} break`;
}

function renderCoach(snapshot) {
  const insights = snapshot.insights ?? deriveAdaptivePlan(snapshot);
  els.coachConfidence.textContent = `${insights.confidence}% confidence`;
  els.coachRationale.textContent = insights.rationale;
  els.coachFocus.textContent = formatMinutes(insights.recommendedFocusMinutes);
  els.coachBreak.textContent = formatMinutes(insights.recommendedBreakMinutes);
}

function renderReview(snapshot) {
  const summary = snapshot.sessionSummary ?? summarizeSession(snapshot);
  els.reviewGeneratedAt.textContent = `Updated ${formatRelativeTimestamp(summary.generatedAt)}`;
  els.reviewTitle.textContent = summary.title || "Start a session to generate a review.";
  els.reviewObjective.textContent = summary.objective || "No objective captured";
  els.reviewTopTasks.textContent = summary.topTasks || "Nothing yet";
  els.reviewNextAction.textContent = summary.nextAction || "Pick the next smallest safe slice";
}

function renderTimer() {
  if (!state.snapshot) return;
  const session = state.snapshot.session;
  const isBreak = session.phase === "break";
  const totalSeconds = Math.max(1, Number((isBreak ? session.breakMinutes : session.focusMinutes) || 1) * 60);
  const remainingSeconds = calculateRemainingSeconds(session);
  const progress = session.active ? Math.max(0, Math.min(100, ((totalSeconds - remainingSeconds) / totalSeconds) * 100)) : 0;

  els.timerRing.style.setProperty("--progress", `${progress}%`);
  els.timerDisplay.textContent = formatDuration(Math.max(0, remainingSeconds));
  els.sessionStatus.textContent = deriveStatusLabel(session);
}

function renderTasks(tasks) {
  if (!tasks.length) {
    els.taskList.innerHTML = emptyState("No tasks yet", "Add a single next step and keep the session narrow.");
    return;
  }

  els.taskList.innerHTML = tasks
    .map(
      (task) => `
        <article class="task-item ${task.done ? "done" : ""}">
          <div class="task-copy">
            <span class="task-title">${escapeHtml(task.title)}</span>
            <small>${task.done ? "Completed" : "Pending"} · ${formatRelativeTimestamp(task.createdAt)}</small>
          </div>
          <div class="task-actions">
            <button class="secondary-button" data-task-action="toggle" data-task-id="${task.id}" type="button">
              ${task.done ? "Reopen" : "Done"}
            </button>
            <button class="ghost-button" data-task-action="remove" data-task-id="${task.id}" type="button">Remove</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderBlocks(blocks) {
  if (!blocks.length) {
    els.shieldList.innerHTML = emptyState("No shielded sites", "Add distracting domains to harden the session.");
    return;
  }

  els.shieldList.innerHTML = blocks
    .map(
      (block) => `
        <article class="block-item ${block.enabled === false ? "disabled" : ""}">
          <div class="task-copy">
            <span class="block-host">${escapeHtml(block.host)}</span>
            <small>${block.enabled === false ? "Disabled" : "Active"} · ${formatRelativeTimestamp(block.createdAt)}</small>
          </div>
          <div class="block-actions">
            <button class="secondary-button" data-block-action="toggle" data-block-id="${block.id}" type="button">
              ${block.enabled === false ? "Enable" : "Disable"}
            </button>
            <button class="ghost-button" data-block-action="remove" data-block-id="${block.id}" type="button">Remove</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderSuggestedBlocks() {
  const current = new Set((state.snapshot?.blocks || []).map((block) => block.host));
  const items = suggestions.filter((item) => !current.has(normalizeHost(item)));
  els.shieldSuggestions.innerHTML = items
    .slice(0, 6)
    .map((host) => `<button class="chip" data-suggested-host="${host}" type="button">${escapeHtml(host)}</button>`)
    .join("");
}

function renderActivity(history) {
  const recent = history.slice(0, 8);
  if (!recent.length) {
    els.activityList.innerHTML = emptyState("No activity yet", "Your focus log will appear here.");
    return;
  }

  els.activityList.innerHTML = recent
    .map(
      (entry) => `
        <li class="activity-item">
          <div class="activity-item-head">
            <div>
              <strong>${escapeHtml(entry.title)}</strong>
              <small>${escapeHtml(entry.detail || "")}</small>
            </div>
            <small>${formatRelativeTimestamp(entry.createdAt)}</small>
          </div>
        </li>
      `
    )
    .join("");
}

async function handleTaskAction(action, taskId) {
  if (action === "toggle") {
    await command("task:toggle", { id: taskId });
  } else if (action === "remove") {
    await command("task:remove", { id: taskId });
  }
}

async function handleBlockAction(action, blockId) {
  if (action === "toggle") {
    await command("block:toggle", { id: blockId });
  } else if (action === "remove") {
    await command("block:remove", { id: blockId });
  }
}

function sessionPayload() {
  return {
    mode: els.sessionMode.value,
    focusMinutes: Number(els.focusMinutes.value),
    breakMinutes: Number(els.breakMinutes.value),
    objective: els.sessionObjective.value,
    projectName: els.projectName.value,
    projectBranch: els.projectBranch.value,
    projectTicket: els.projectTicket.value
  };
}

async function copySummary() {
  if (!state.snapshot) return;
  const session = state.snapshot.session;
  const summary = [
    "Advanced Focus Mode summary",
    `Mode: ${prettyMode(session.mode)}`,
    `Objective: ${session.objective || "None set"}`,
    `Status: ${deriveStatusLabel(session)}`,
    `Remaining: ${formatDuration(calculateRemainingSeconds(session) || 0)}`,
    `Tasks done: ${state.snapshot.tasks.filter((task) => task.done).length}/${state.snapshot.tasks.length}`,
    `Shielded sites: ${state.snapshot.blocks.filter((block) => block.enabled !== false).length}`,
    `Focus score: ${calculateFocusScore(state.snapshot)}`
  ].join("\n");

  await navigator.clipboard.writeText(summary);
}

async function exportState() {
  if (!state.snapshot) return;
  const payload = JSON.stringify(state.snapshot, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `advanced-focus-mode-${todayStamp()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function updateDocumentTitle() {
  if (!state.snapshot) return;
  const session = state.snapshot.session;
  document.title = session.active
    ? `${formatDuration(calculateRemainingSeconds(session) || 0)} · Advanced Focus`
    : "Advanced Focus Mode";
}

function setActionStatus(message) {
  els.actionStatus.textContent = message;
}

function openPalette() {
  state.paletteOpen = true;
  els.paletteBackdrop.hidden = false;
  els.paletteInput.value = "";
  renderPalette();
  window.setTimeout(() => els.paletteInput.focus(), 0);
}

function closePalette() {
  state.paletteOpen = false;
  els.paletteBackdrop.hidden = true;
}

function renderPalette(query = els.paletteInput.value) {
  if (!state.paletteOpen) return;
  const term = String(query || "").trim().toLowerCase();
  const items = paletteActions.filter((item) => {
    if (!term) return true;
    return `${item.title} ${item.hint}`.toLowerCase().includes(term);
  });

  els.paletteList.innerHTML = items
    .map(
      (item) => `
        <button class="palette-item" type="button" data-palette-action="${item.action}">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.hint)}</small>
          </div>
          <span class="meta-label">${escapeHtml(shortcutFor(item.action))}</span>
        </button>
      `
    )
    .join("");
}

function handlePaletteInput() {
  renderPalette();
}

async function handlePaletteKeydown(event) {
  if (event.key === "Enter") {
    const first = els.paletteList.querySelector("[data-palette-action]");
    if (first) {
      first.click();
    }
  }
}

async function handlePaletteBackdropClick(event) {
  if (event.target === els.paletteBackdrop) {
    closePalette();
    return;
  }

  const button = event.target.closest("[data-palette-action]");
  if (!button) return;
  closePalette();
  await handleAction(button.dataset.paletteAction);
}

function shortcutFor(action) {
  switch (action) {
    case "start-session":
      return "Enter";
    case "toggle-pause":
      return "Space";
    case "open-palette":
      return "Ctrl+K";
    default:
      return "";
  }
}

function on(element, eventName, handler) {
  if (element && typeof element.addEventListener === "function") {
    element.addEventListener(eventName, handler);
  }
}

async function localCommand(type, payload) {
  const snapshot = normalizeState(state.snapshot ?? loadLocalState() ?? createDefaultState());

  switch (type) {
    case "state:get":
      return snapshot;
    case "session:start":
      return localStartSession(snapshot, payload);
    case "session:toggle-pause":
      return localTogglePause(snapshot);
    case "session:complete":
      return localCompleteSession(snapshot);
    case "session:skip-break":
      return localSkipBreak(snapshot);
    case "session:reset":
      return localResetSession(snapshot);
    case "task:add":
      return localAddTask(snapshot, payload?.title);
    case "task:toggle":
      return localToggleTask(snapshot, payload?.id);
    case "task:remove":
      return localRemoveTask(snapshot, payload?.id);
    case "block:add":
      return localAddBlock(snapshot, payload?.host);
    case "block:toggle":
      return localToggleBlock(snapshot, payload?.id);
    case "block:remove":
      return localRemoveBlock(snapshot, payload?.id);
    case "notes:update":
      snapshot.notes = String(payload?.notes ?? "");
      return snapshot;
    case "settings:update":
      snapshot.settings = {
        ...snapshot.settings,
        ...payload
      };
      return snapshot;
    case "project:update":
      return localUpdateProject(snapshot, payload);
    case "tab:open-clean":
      window.open("about:blank", "_blank", "noopener,noreferrer");
      return snapshot;
    case "state:import":
      return normalizeState(payload?.state);
    case "state:reset":
      return createDefaultState();
    default:
      throw new Error(`Unsupported command: ${type}`);
  }
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(localStateKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistLocalState(snapshot) {
  try {
    localStorage.setItem(localStateKey, JSON.stringify(snapshot));
  } catch {
    // Ignore localStorage failures in test browsers.
  }
}

function localStartSession(snapshot, payload) {
  const mode = String(payload?.mode ?? snapshot.session.mode ?? "deep-work");
  const focusMinutes = clampNumber(payload?.focusMinutes ?? snapshot.session.focusMinutes ?? 50, 15, 240);
  const breakMinutes = clampNumber(payload?.breakMinutes ?? snapshot.session.breakMinutes ?? 10, 5, 60);
  const objective = String(payload?.objective ?? snapshot.session.objective ?? "").trim().slice(0, 180);
  const projectName = String(payload?.projectName ?? snapshot.session.projectName ?? "").trim().slice(0, 80);
  const projectBranch = String(payload?.projectBranch ?? snapshot.session.projectBranch ?? "").trim().slice(0, 80);
  const projectTicket = String(payload?.projectTicket ?? snapshot.session.projectTicket ?? "").trim().slice(0, 80);

  snapshot.session = {
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

  addHistoryEntry(snapshot, {
    type: "session-started",
    title: "Focus session started",
    detail: `${mode} for ${focusMinutes}m. Break: ${breakMinutes}m.`
  });

  return snapshot;
}

function localTogglePause(snapshot) {
  if (!snapshot.session.active) return snapshot;

  if (snapshot.session.phase === "paused") {
    snapshot.session.phase = snapshot.session.pausedPhase || "focus";
    snapshot.session.pausedPhase = null;
    snapshot.session.startedAt = new Date().toISOString();
    snapshot.session.endsAt = new Date(Date.now() + snapshot.session.remainingSeconds * 1000).toISOString();
    addHistoryEntry(snapshot, {
      type: "session-resumed",
      title: "Session resumed",
      detail: "Timer restored."
    });
  } else {
    snapshot.session.pausedPhase = snapshot.session.phase;
    snapshot.session.phase = "paused";
    snapshot.session.remainingSeconds = calculateRemainingSeconds(snapshot.session);
    snapshot.session.pausedAt = new Date().toISOString();
    snapshot.session.endsAt = null;
    addHistoryEntry(snapshot, {
      type: "session-paused",
      title: "Session paused",
      detail: "Timer parked."
    });
  }

  return snapshot;
}

function localCompleteSession(snapshot) {
  if (!snapshot.session.active) return snapshot;

  if (snapshot.session.phase === "break") {
    addHistoryEntry(snapshot, {
      type: "break-completed",
      title: "Break finished",
      detail: "Break ended."
    });
    snapshot.session = {
      ...snapshot.session,
      active: false,
      phase: "idle",
      startedAt: null,
      endsAt: null,
      pausedAt: null,
      pausedPhase: null,
      remainingSeconds: 0,
      pauseCount: 0
    };
    return snapshot;
  }

  const remainingSeconds = calculateRemainingSeconds(snapshot.session);
  const completedMinutes = Math.max(1, Math.round((snapshot.session.focusMinutes * 60 - remainingSeconds) / 60));
  snapshot.stats.completedSessions += 1;
  snapshot.stats.deepWorkMinutes += completedMinutes;

  addHistoryEntry(snapshot, {
    type: "session-completed",
    title: "Session completed",
    detail: `Recorded ${completedMinutes} minute(s).`,
    minutes: completedMinutes,
    projectName: snapshot.session.projectName,
    projectBranch: snapshot.session.projectBranch,
    projectTicket: snapshot.session.projectTicket,
    sessionSummary: summarizeSession(snapshot)
  });

  if (snapshot.session.breakMinutes > 0) {
    snapshot.session.phase = "break";
    snapshot.session.startedAt = new Date().toISOString();
    snapshot.session.endsAt = new Date(Date.now() + snapshot.session.breakMinutes * 60_000).toISOString();
    snapshot.session.remainingSeconds = snapshot.session.breakMinutes * 60;
    addHistoryEntry(snapshot, {
      type: "break-started",
      title: "Break started",
      detail: `Break for ${snapshot.session.breakMinutes} minute(s).`,
      sessionSummary: summarizeSession(snapshot)
    });
  } else {
    snapshot.session = {
      ...snapshot.session,
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

  return snapshot;
}

function localSkipBreak(snapshot) {
  if (snapshot.session.phase !== "break") return snapshot;
  addHistoryEntry(snapshot, {
    type: "break-skipped",
    title: "Break skipped",
    detail: "Returned to idle."
  });
  snapshot.session = createDefaultState().session;
  return snapshot;
}

function localResetSession(snapshot) {
  snapshot.session = createDefaultState().session;
  addHistoryEntry(snapshot, {
    type: "session-reset",
    title: "Session reset",
    detail: "Timer cleared."
  });
  return snapshot;
}

function localUpdateProject(snapshot, payload) {
  snapshot.session.projectName = String(payload?.projectName ?? snapshot.session.projectName ?? "").trim().slice(0, 80);
  snapshot.session.projectBranch = String(payload?.projectBranch ?? snapshot.session.projectBranch ?? "").trim().slice(0, 80);
  snapshot.session.projectTicket = String(payload?.projectTicket ?? snapshot.session.projectTicket ?? "").trim().slice(0, 80);
  addHistoryEntry(snapshot, {
    type: "project-updated",
    title: "Project context updated",
    detail: snapshot.session.projectName || snapshot.session.projectTicket || snapshot.session.projectBranch || "Project context cleared."
  });
  return snapshot;
}

function localAddTask(snapshot, title) {
  const value = String(title ?? "").trim();
  if (!value) throw new Error("Task title is required");
  snapshot.tasks.unshift(createTask(value));
  return snapshot;
}

function localToggleTask(snapshot, id) {
  const task = snapshot.tasks.find((item) => item.id === id);
  if (!task) throw new Error("Task not found");
  task.done = !task.done;
  return snapshot;
}

function localRemoveTask(snapshot, id) {
  snapshot.tasks = snapshot.tasks.filter((item) => item.id !== id);
  return snapshot;
}

function localAddBlock(snapshot, host) {
  const value = normalizeHost(host);
  if (!value) throw new Error("Host is required");
  if (!snapshot.blocks.some((block) => block.host === value)) {
    snapshot.blocks.unshift(createBlock(value));
  }
  return snapshot;
}

function localToggleBlock(snapshot, id) {
  const block = snapshot.blocks.find((item) => item.id === id);
  if (!block) throw new Error("Block not found");
  block.enabled = !block.enabled;
  return snapshot;
}

function localRemoveBlock(snapshot, id) {
  snapshot.blocks = snapshot.blocks.filter((item) => item.id !== id);
  return snapshot;
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function prettyMode(mode) {
  return String(mode || "deep-work")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function emptyState(title, description) {
  return `
    <div class="task-item">
      <div class="task-copy">
        <span class="task-title">${escapeHtml(title)}</span>
        <small>${escapeHtml(description)}</small>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
