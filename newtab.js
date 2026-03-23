import {
  buildSessionReplay,
  buildSessionReport,
  calculateFocusScore,
  calculateRemainingSeconds,
  deriveStatusLabel,
  addHistoryEntry,
  createBlock,
  createBudgetRule,
  createDefaultState,
  createParkingItem,
  createTask,
  deriveAutopilot,
  deriveAdaptivePlan,
  formatDuration,
  formatMinutes,
  formatRelativeTimestamp,
  getDisplayedSessionSeconds,
  projectModeCatalog,
  normalizeHost,
  deriveSmartBlockSuggestions,
  normalizeState,
  summarizeFocusBudgets,
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
  paletteOpen: false,
  presentationMode: false,
    presentationStep: 0,
    demoKitCollapsed: false
  };

const extensionBridgeAvailable = Boolean(globalThis.chrome?.runtime?.sendMessage);
const localStateKey = "advanced-focus-mode.local-state";
const presentationModeKey = "advanced-focus-mode.presentation-mode";
const presentationStepKey = "advanced-focus-mode.presentation-step";
const demoKitCollapsedKey = "advanced-focus-mode.demo-kit-collapsed";

const els = {
  sessionStatus: document.getElementById("session-status"),
  timerRing: document.getElementById("timer-ring"),
  timerDisplay: document.getElementById("timer-display"),
  timerDetail: document.getElementById("timer-detail"),
  objectivePreview: document.getElementById("objective-preview"),
  modePreview: document.getElementById("mode-preview"),
  breakPreview: document.getElementById("break-preview"),
  sessionMode: document.getElementById("session-mode"),
  modePicker: document.querySelector("[data-mode-picker]"),
  modePickerButton: document.getElementById("mode-picker-button"),
  modePickerMenu: document.getElementById("mode-picker-menu"),
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
  captureContext: document.getElementById("capture-context"),
  restoreContext: document.getElementById("restore-context"),
  recoveryStatus: document.getElementById("recovery-status"),
  recoveryList: document.getElementById("recovery-list"),
  autopilotLevel: document.getElementById("autopilot-level"),
  autopilotConfidence: document.getElementById("autopilot-confidence"),
  autopilotRationale: document.getElementById("autopilot-rationale"),
  autopilotMode: document.getElementById("autopilot-mode"),
  autopilotBlocking: document.getElementById("autopilot-blocking"),
  applyAutopilot: document.getElementById("apply-autopilot"),
  modeGrid: document.getElementById("mode-grid"),
  budgetStatus: document.getElementById("budget-status"),
  budgetForm: document.getElementById("budget-form"),
  budgetHost: document.getElementById("budget-host"),
  budgetLabel: document.getElementById("budget-label"),
  budgetLimit: document.getElementById("budget-limit"),
  budgetList: document.getElementById("budget-list"),
  resetBudgets: document.getElementById("reset-budgets"),
  clearForensics: document.getElementById("clear-forensics"),
  forensicsBlocked: document.getElementById("forensics-blocked"),
  forensicsSwitches: document.getElementById("forensics-switches"),
  forensicsEscapes: document.getElementById("forensics-escapes"),
  smartBlockCount: document.getElementById("smart-block-count"),
  replayList: document.getElementById("replay-list"),
  parkingForm: document.getElementById("parking-form"),
  parkingInput: document.getElementById("parking-input"),
  parkingList: document.getElementById("parking-list"),
  clearParking: document.getElementById("clear-parking"),
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
  copyReport: document.getElementById("copy-report"),
  downloadReport: document.getElementById("download-report"),
  loadDemoScenario: document.querySelector('[data-action="load-demo-scenario"]'),
  startPresentation: document.querySelector('[data-action="start-presentation"]'),
  copyDemoScript: document.querySelector('[data-action="copy-demo-script"]'),
  presentationPrev: document.querySelector('[data-action="presentation-prev"]'),
  presentationNext: document.querySelector('[data-action="presentation-next"]'),
  presentationHud: document.getElementById("presentation-hud"),
  presentationStepCount: document.getElementById("presentation-step-count"),
  presentationStepTitle: document.getElementById("presentation-step-title"),
    presentationStepCopy: document.getElementById("presentation-step-copy"),
    demoKitBody: document.getElementById("demo-kit-body"),
    demoKitSummary: document.getElementById("demo-kit-summary"),
    demoKitToggle: document.querySelector('[data-action="toggle-demo-kit"]'),
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
  { title: "Capture context", hint: "Save the current work tabs for exact restore.", action: "capture-context" },
  { title: "Restore context", hint: "Reopen saved tabs from the last snapshot.", action: "restore-context" },
  { title: "Apply autopilot", hint: "Let the extension pick the best mode.", action: "apply-autopilot" },
  { title: "Open settings", hint: "Manage backups, shortcuts, and resets.", action: "open-options" },
  { title: "Export backup", hint: "Download the current focus state.", action: "export-state" },
  { title: "Open clean tab", hint: "Launch a blank tab for distraction-free work.", action: "open-clean-tab" }
];

const presentationSteps = [
  {
    title: "Load the demo scenario",
    copy: "Preload the scenario so every key feature has a realistic state to show.",
    target: '[data-presentation-target="demo"]'
  },
  {
    title: "Open the command palette",
    copy: "Use Ctrl+K to show the keyboard-first command surface.",
    target: '[data-presentation-target="session"]'
  },
  {
    title: "Show the task stack",
    copy: "Add tasks, complete one, and show how the stack stays focused.",
    target: '[data-presentation-target="tasks"]'
  },
  {
    title: "Show recovery and parking",
    copy: "Capture a context snapshot and park side thoughts instead of losing them.",
    target: '[data-presentation-target="recovery"]'
  },
  {
    title: "Show automation and budgets",
    copy: "Demonstrate adaptive suggestions, project modes, and distraction budgets.",
    target: '[data-presentation-target="autopilot"]'
  },
  {
    title: "Show the report",
    copy: "Copy the report so the audience sees the built-in wrap-up output.",
    target: '[data-presentation-target="review"]'
  },
  {
    title: "Export the state",
    copy: "Export the state so the audience sees the built-in backup path.",
    target: '[data-presentation-target="demo"]'
  }
];

await init();

async function init() {
  state.presentationMode = loadPresentationMode();
  state.presentationStep = loadPresentationStep();
  state.demoKitCollapsed = loadDemoKitCollapsed();
  syncPresentationMode();
  syncDemoKitCollapsed();
  wireEvents();
  await refresh();
  globalThis.chrome?.storage?.onChanged?.addListener?.(handleStorageChange);
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
  on(els.focusMinutes, "input", renderSessionPreview);
  on(els.breakMinutes, "input", renderSessionPreview);
  on(els.projectName, "input", queueProjectSave);
  on(els.projectBranch, "input", queueProjectSave);
  on(els.projectTicket, "input", queueProjectSave);
  on(els.copyReport, "click", copyReport);
  on(els.downloadReport, "click", downloadReport);
  on(els.captureContext, "click", captureContext);
  on(els.restoreContext, "click", restoreContext);
  on(els.applyAutopilot, "click", applyAutopilot);
  on(els.budgetForm, "submit", onBudgetSubmit);
  on(els.resetBudgets, "click", resetBudgets);
  on(els.clearForensics, "click", clearForensics);
  on(els.parkingForm, "submit", onParkingSubmit);
  on(els.clearParking, "click", clearParkingLot);
  on(els.modePickerButton, "click", toggleModePicker);
  on(els.modePickerMenu, "click", onModePickerMenuClick);
  on(els.paletteBackdrop, "click", handlePaletteBackdropClick);
  on(els.paletteInput, "input", handlePaletteInput);
  on(els.paletteInput, "keydown", handlePaletteKeydown);

  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeyboard);
  document.addEventListener("click", handleModePickerDismiss);
  document.addEventListener("keydown", handleModePickerKeys);
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

    const modeButton = event.target.closest("[data-mode-action]");
    if (modeButton) {
      await handleModeAction(modeButton.dataset.modeAction, modeButton.dataset.modeId);
      return;
    }

    const budgetButton = event.target.closest("[data-budget-action]");
    if (budgetButton) {
      await handleBudgetAction(budgetButton.dataset.budgetAction, budgetButton.dataset.budgetId);
      return;
    }

    const taskContextButton = event.target.closest("[data-task-context-action]");
    if (taskContextButton) {
      await handleTaskContextAction(
        taskContextButton.dataset.taskContextAction,
        taskContextButton.dataset.taskId,
        taskContextButton.dataset.contextUrl
      );
      return;
    }

    const parkingButton = event.target.closest("[data-parking-action]");
    if (parkingButton) {
      await handleParkingAction(parkingButton.dataset.parkingAction, parkingButton.dataset.parkingId, parkingButton.dataset.parkingUrl);
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
    case "capture-context":
      await withStatus("Capturing context...", () => command("session:capture-context"));
      break;
    case "restore-context":
      await withStatus("Restoring context...", () => command("session:restore-context"));
      break;
    case "apply-autopilot":
      await withStatus("Applying autopilot...", () => command("session:autopilot-apply"));
      break;
    case "copy-summary":
      await withStatus("Summary copied to clipboard.", () => copySummary());
      break;
    case "load-demo-scenario":
      await withStatus("Loading demo scenario...", () => loadDemoScenario());
      break;
    case "copy-demo-script":
      await withStatus("Demo script copied.", () => copyDemoScript());
      break;
    case "toggle-demo-kit":
      toggleDemoKit();
      break;
    case "start-presentation":
      await withStatus("Starting presentation mode...", () => startPresentation());
      break;
    case "toggle-presentation-mode":
      togglePresentationMode();
      break;
    case "presentation-prev":
      movePresentationStep(-1);
      break;
    case "presentation-next":
      movePresentationStep(1);
      break;
    case "copy-report":
      await withStatus("Report copied to clipboard.", () => copyReport());
      break;
    case "download-report":
      await withStatus("Report downloaded.", () => downloadReport());
      break;
    case "export-state":
      await withStatus("Exported backup.", () => exportState());
      break;
    case "open-clean-tab":
      await withStatus("Opening clean tab...", () => command("tab:open-clean"));
      break;
    case "open-options":
      if (extensionBridgeAvailable && globalThis.chrome?.runtime?.openOptionsPage) {
        await withStatus("Opening settings...", () => chrome.runtime.openOptionsPage());
      } else {
        setActionStatus("Settings are available in the extension.");
      }
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
  if (state.presentationMode) {
    if (event.key === "Escape") {
      event.preventDefault();
      togglePresentationMode(false);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === "ArrowDown") {
      event.preventDefault();
      movePresentationStep(1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp" || event.key === "ArrowUp") {
      event.preventDefault();
      movePresentationStep(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setPresentationStep(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setPresentationStep(presentationSteps.length - 1);
      return;
    }
  }

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

async function onParkingSubmit(event) {
  event.preventDefault();
  const note = els.parkingInput.value.trim();
  if (!note) return;
  await command("parking:add", { title: note, note });
  els.parkingInput.value = "";
}

async function onBudgetSubmit(event) {
  event.preventDefault();
  const host = els.budgetHost.value.trim();
  if (!host) return;
  await command("budget:add", {
    host,
    label: els.budgetLabel.value.trim() || host,
    dailyLimit: Number(els.budgetLimit.value || 5)
  });
  els.budgetHost.value = "";
  els.budgetLabel.value = "";
  els.budgetLimit.value = "5";
}

async function captureContext() {
  await command("session:capture-context", { source: "dashboard" });
}

async function restoreContext() {
  await command("session:restore-context");
}

async function applyAutopilot() {
  await command("session:autopilot-apply");
}

async function resetBudgets() {
  await command("budget:reset");
}

async function clearForensics() {
  await command("forensics:clear");
}

async function clearParkingLot() {
  await command("parking:clear");
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
  state.snapshot = decorateSnapshot(result);
  persistLocalState(state.snapshot);
  render();
  return state.snapshot;
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
  renderRecovery(snapshot);
  renderAutopilot(snapshot);
  renderModes(snapshot);
  renderBudgets(snapshot);
  renderCoach(snapshot);
  renderReview(snapshot);
  renderTasks(snapshot.tasks || []);
  renderBlocks(snapshot.blocks || []);
  renderParking(snapshot.parkingLot || []);
  renderReplay(snapshot);
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
  els.modePreview.textContent = session.modeLabel || prettyMode(session.mode || "deep-work");
  els.breakPreview.textContent = `${formatMinutes(session.breakMinutes || 10)} break`;
  setModePickerValue(session.mode || "deep-work", { renderPreview: false });
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

function renderRecovery(snapshot) {
  if (!els.recoveryStatus || !els.recoveryList) {
    return;
  }

  const recovery = snapshot.session?.recovery ?? {};
  const tabs = Array.isArray(recovery.tabs) ? recovery.tabs : [];
  els.recoveryStatus.textContent = tabs.length ? `${tabs.length} tab(s) saved` : "No context saved";
  els.recoveryList.innerHTML = tabs.length
    ? tabs
        .slice(0, 6)
        .map(
          (tab) => `
            <li class="activity-item">
              <div class="activity-item-head">
                <div>
                  <strong>${escapeHtml(tab.title || tab.url || "Untitled tab")}</strong>
                  <small>${escapeHtml(tab.url || "No URL captured")}</small>
                </div>
              </div>
            </li>
          `
        )
        .join("")
    : emptyState("Nothing captured yet", "Use Capture context while your work tabs are open.");

  const lastSaved = recovery.capturedAt ? formatRelativeTimestamp(recovery.capturedAt) : "Not yet captured";
  const source = recovery.source ? `Saved from ${recovery.source}` : "Capture a session context to enable one-click restore.";
  els.recoveryStatus.title = `${lastSaved}. ${source}`;
}

function renderAutopilot(snapshot) {
  if (!els.autopilotLevel) return;
  const autopilot = snapshot.autopilot ?? deriveAutopilot(snapshot);
  els.autopilotLevel.textContent = prettyLabel(autopilot.level || "balanced");
  if (els.autopilotConfidence) {
    els.autopilotConfidence.textContent = `${autopilot.confidence ?? 0}% confidence`;
  }
  if (els.autopilotRationale) {
    els.autopilotRationale.textContent = autopilot.rationale || "Autopilot will adapt once the session has enough signal.";
  }
  if (els.autopilotMode) {
    els.autopilotMode.textContent = snapshot.projectModes?.find((mode) => mode.id === autopilot.recommendedModeId)?.label || autopilot.recommendedModeLabel || "Balanced";
  }
  if (els.autopilotBlocking) {
    els.autopilotBlocking.textContent = autopilot.suggestedStrictBlocking ? "On" : "Off";
  }
}

function renderModes(snapshot) {
  if (!els.modeGrid) return;
  const modes = snapshot.projectModes || [];
  els.modeGrid.innerHTML = modes
    .map(
      (mode) => `
        <button class="preset-card ${snapshot.session?.modeId === mode.id ? "active" : ""}" data-mode-action="apply" data-mode-id="${mode.id}" type="button">
          <span>${escapeHtml(mode.label)}</span>
          <small>${escapeHtml(mode.focusMinutes)}m focus, ${escapeHtml(mode.breakMinutes)}m break. ${escapeHtml(mode.ritual)}</small>
        </button>
      `
    )
    .join("");
}

function renderBudgets(snapshot) {
  if (!els.budgetList) return;
  const budgets = snapshot.budgetSummary || summarizeFocusBudgets(snapshot);
  if (els.budgetStatus) {
    els.budgetStatus.textContent = budgets.length ? `${budgets.length} budget(s)` : "Ready";
  }
  els.budgetList.innerHTML = budgets.length
    ? budgets
        .map(
          (budget) => `
            <article class="block-item ${budget.remaining <= 0 ? "disabled" : ""}">
              <div class="task-copy">
                <span class="block-host">${escapeHtml(budget.label)}</span>
                <small>${escapeHtml(budget.host)} · ${budget.used}/${budget.dailyLimit} checks used</small>
              </div>
              <div class="block-actions">
                <button class="secondary-button" data-budget-action="remove" data-budget-id="${budget.id}" type="button">Remove</button>
              </div>
            </article>
          `
        )
        .join("")
    : emptyState("No focus budgets", "Add a host and a daily allowance to track distraction pressure.");
}

function renderReplay(snapshot) {
  if (!els.replayList) return;
  const replay = snapshot.replay || buildSessionReplay(snapshot);
  if (els.forensicsBlocked) els.forensicsBlocked.textContent = String(snapshot.forensics?.blockedAttempts ?? 0);
  if (els.forensicsSwitches) els.forensicsSwitches.textContent = String(snapshot.forensics?.tabSwitches ?? 0);
  if (els.forensicsEscapes) els.forensicsEscapes.textContent = String(snapshot.forensics?.focusEscapes ?? 0);
  if (els.smartBlockCount) els.smartBlockCount.textContent = String((snapshot.smartBlockSuggestions || []).length);

  els.replayList.innerHTML = replay.length
    ? replay
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
        .join("")
    : emptyState("No replay yet", "As the session runs, interruptions and recoveries will appear here.");
}

function renderParking(parkingLot) {
  if (!els.parkingList) {
    return;
  }

  if (!parkingLot.length) {
    els.parkingList.innerHTML = emptyState("Parking lot empty", "Capture side thoughts, links, and distractions here.");
    return;
  }

  els.parkingList.innerHTML = parkingLot
    .map(
      (item) => `
        <article class="task-item ${item.kind === "tab" ? "parked-tab" : ""}">
          <div class="task-copy">
            <span class="task-title">${escapeHtml(item.title)}</span>
            <small>${escapeHtml(item.note || item.url || "No extra note")} · ${formatRelativeTimestamp(item.createdAt)}</small>
          </div>
          <div class="task-actions">
            ${item.url ? `<button class="secondary-button" data-parking-action="open" data-parking-url="${escapeHtml(item.url)}" type="button">Open</button>` : ""}
            <button class="ghost-button" data-parking-action="remove" data-parking-id="${item.id}" type="button">Remove</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderSessionPreview() {
  const mode = els.sessionMode.value || "deep-work";
  els.modePreview.textContent = prettyMode(mode);
  els.breakPreview.textContent = `${formatMinutes(Number(els.breakMinutes.value || 10))} break`;
  syncModePickerMenu();
}

function setModePickerValue(mode, options = {}) {
  const value = String(mode || "deep-work");
  if (els.sessionMode) {
    els.sessionMode.value = value;
  }
  if (els.modePickerButton) {
    els.modePickerButton.textContent = prettyMode(value);
  }
  if (options.renderPreview !== false) {
    els.modePreview.textContent = prettyMode(value);
  }
  syncModePickerMenu();
}

function syncModePickerMenu() {
  if (!els.modePickerMenu) return;
  const current = String(els.sessionMode?.value || "deep-work");
  const options = Array.from(els.modePickerMenu.querySelectorAll("[data-mode-option]"));
  options.forEach((option) => {
    const selected = option.dataset.modeOption === current;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
  if (els.modePickerButton) {
    els.modePickerButton.setAttribute("aria-expanded", String(Boolean(els.modePicker && !els.modePickerMenu.hidden)));
  }
}

function toggleModePicker(forceOpen) {
  if (!els.modePicker || !els.modePickerMenu) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : els.modePickerMenu.hidden;
  els.modePickerMenu.hidden = !shouldOpen;
  els.modePicker.classList.toggle("is-open", shouldOpen);
  if (els.modePickerButton) {
    els.modePickerButton.setAttribute("aria-expanded", String(shouldOpen));
  }
}

function closeModePicker() {
  toggleModePicker(false);
}

function onModePickerMenuClick(event) {
  const option = event.target.closest("[data-mode-option]");
  if (!option) return;
  setModePickerValue(option.dataset.modeOption);
  closeModePicker();
  renderSessionPreview();
}

function handleModePickerDismiss(event) {
  if (!els.modePicker) return;
  if (event.target.closest?.("[data-mode-picker]")) return;
  closeModePicker();
}

function handleModePickerKeys(event) {
  if (event.key === "Escape") {
    closeModePicker();
  }
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
  const remainingSeconds = getDisplayedSessionSeconds(session);
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
            ${
              Array.isArray(task.contextLinks) && task.contextLinks.length
                ? `<div class="chip-row">${task.contextLinks
                    .map(
                      (link) =>
                        `<button class="chip" data-task-context-action="open" data-task-id="${task.id}" data-context-url="${escapeHtml(link.url)}" type="button">${escapeHtml(link.title)}</button>`
                    )
                    .join("")}</div>`
                : ""
            }
          </div>
          <div class="task-actions">
            <button class="secondary-button" data-task-context-action="link-current" data-task-id="${task.id}" type="button">
              Link tab
            </button>
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
  const smart = state.snapshot?.smartBlockSuggestions || [];
  const items = [...new Set([...smart, ...suggestions])].filter((item) => !current.has(normalizeHost(item)));
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

async function handleParkingAction(action, parkingId, parkingUrl) {
  if (action === "remove") {
    await command("parking:remove", { id: parkingId });
  } else if (action === "open" && parkingUrl) {
    if (extensionBridgeAvailable && globalThis.chrome?.tabs?.create) {
      await chrome.tabs.create({ url: parkingUrl, active: true });
    } else {
      window.open(parkingUrl, "_blank", "noopener,noreferrer");
    }
  }
}

async function handleModeAction(action, modeId) {
  if (action === "apply" && modeId) {
    await command("session:apply-mode", { modeId });
  }
}

async function handleBudgetAction(action, budgetId) {
  if (action === "remove") {
    await command("budget:remove", { id: budgetId });
  }
}

async function handleTaskContextAction(action, taskId, contextUrl) {
  if (action === "link-current") {
    await command("task:link-context", { taskId });
  } else if (action === "open" && contextUrl) {
    if (extensionBridgeAvailable && globalThis.chrome?.tabs?.create) {
      await chrome.tabs.create({ url: contextUrl, active: true });
    } else {
      window.open(contextUrl, "_blank", "noopener,noreferrer");
    }
  } else if (action === "unlink" && contextUrl) {
    await command("task:unlink-context", { taskId, url: contextUrl });
  }
}

function sessionPayload() {
  return {
    mode: els.sessionMode.value,
    modeId: modeIdForSessionMode(els.sessionMode.value),
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
    `Remaining: ${formatDuration(getDisplayedSessionSeconds(session) || 0)}`,
    `Tasks done: ${state.snapshot.tasks.filter((task) => task.done).length}/${state.snapshot.tasks.length}`,
    `Shielded sites: ${state.snapshot.blocks.filter((block) => block.enabled !== false).length}`,
    `Focus score: ${calculateFocusScore(state.snapshot)}`
  ].join("\n");

  await navigator.clipboard.writeText(summary);
}

async function copyReport() {
  if (!state.snapshot) return;
  const report = buildSessionReport(state.snapshot);
  await navigator.clipboard.writeText(report.markdown);
}

async function downloadReport() {
  if (!state.snapshot || !extensionBridgeAvailable) return;
  const report = buildSessionReport(state.snapshot);
  const blob = new Blob([report.markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = report.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadDemoScenario() {
  const demoState = buildDemoState();
  await command("state:import", { state: demoState });
}

async function startPresentation() {
  await loadDemoScenario();
  setPresentationStep(0);
  togglePresentationMode(true);
}

async function copyDemoScript() {
  const script = [
    "Advanced Focus Mode demo script",
    "",
    "1. Click Load demo scenario.",
    "2. Start presentation mode and use Next/Previous or the arrow keys.",
    "3. Open the command palette with Ctrl+K.",
    "4. Show Start session, Pause or resume, and Finish round.",
    "5. Point out project context, the coach, and the review card.",
    "6. Click Capture context and then Restore context.",
    "7. Copy the report and export the state to show the final handoff.",
    "",
    "Tip: end by exporting the state so the audience sees backup support."
  ].join("\n");

  await navigator.clipboard.writeText(script);
}

function togglePresentationMode(forceValue) {
  state.presentationMode = typeof forceValue === "boolean" ? forceValue : !state.presentationMode;
  try {
    localStorage.setItem(presentationModeKey, JSON.stringify(state.presentationMode));
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
  if (state.presentationMode) {
    state.presentationStep = clampNumber(state.presentationStep, 0, presentationSteps.length - 1);
    try {
      localStorage.setItem(presentationStepKey, String(state.presentationStep));
    } catch {
      // Ignore storage failures in constrained browser contexts.
    }
  }
  syncPresentationMode();
  setActionStatus(state.presentationMode ? "Presentation mode on." : "Presentation mode off.");
}

function loadPresentationMode() {
  try {
    const raw = localStorage.getItem(presentationModeKey);
    return raw ? JSON.parse(raw) === true : false;
  } catch {
    return false;
  }
}

function loadPresentationStep() {
  try {
    const raw = localStorage.getItem(presentationStepKey);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(presentationSteps.length - 1, Math.round(value)));
  } catch {
    return 0;
  }
}

function syncPresentationMode() {
  document.body.classList.toggle("presentation-mode", state.presentationMode);
  if (els.presentationHud) {
    els.presentationHud.hidden = !state.presentationMode;
  }
  renderPresentationMode();
}

function renderPresentationMode() {
  const activeStep = presentationSteps[state.presentationStep] ?? presentationSteps[0];
  const panels = Array.from(document.querySelectorAll("[data-presentation-target]"));
  panels.forEach((panel) => {
    panel.classList.remove("presentation-focus");
  });

  if (state.presentationMode) {
    const target = document.querySelector(activeStep.target);
    if (target) {
      target.classList.add("presentation-focus");
      target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
  }

  if (els.presentationStepCount) {
    els.presentationStepCount.textContent = `Step ${state.presentationStep + 1} of ${presentationSteps.length}`;
  }
  if (els.presentationStepTitle) {
    els.presentationStepTitle.textContent = activeStep.title;
  }
  if (els.presentationStepCopy) {
    els.presentationStepCopy.textContent = activeStep.copy;
  }
  if (els.presentationPrev) {
    els.presentationPrev.disabled = state.presentationStep <= 0;
  }
  if (els.presentationNext) {
    els.presentationNext.disabled = state.presentationStep >= presentationSteps.length - 1;
  }
}

function toggleDemoKit(forceValue) {
  state.demoKitCollapsed = typeof forceValue === "boolean" ? forceValue : !state.demoKitCollapsed;
  try {
    localStorage.setItem(demoKitCollapsedKey, JSON.stringify(state.demoKitCollapsed));
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
  syncDemoKitCollapsed();
}

function loadDemoKitCollapsed() {
  try {
    const raw = localStorage.getItem(demoKitCollapsedKey);
    return raw ? JSON.parse(raw) === true : false;
  } catch {
    return false;
  }
}

function syncDemoKitCollapsed() {
  if (els.demoKitBody) {
    els.demoKitBody.hidden = state.demoKitCollapsed;
  }
  if (els.demoKitSummary) {
    els.demoKitSummary.hidden = !state.demoKitCollapsed;
  }
  if (els.demoKitToggle) {
    els.demoKitToggle.textContent = state.demoKitCollapsed ? "Expand" : "Collapse";
    els.demoKitToggle.setAttribute("aria-expanded", String(!state.demoKitCollapsed));
  }
  document.querySelector(".demo-panel")?.classList.toggle("is-collapsed", state.demoKitCollapsed);
}

function setPresentationStep(index) {
  const value = Math.max(0, Math.min(presentationSteps.length - 1, Math.round(index)));
  state.presentationStep = value;
  try {
    localStorage.setItem(presentationStepKey, String(value));
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
  renderPresentationMode();
}

function movePresentationStep(delta) {
  setPresentationStep(state.presentationStep + delta);
}

function buildDemoState() {
  const snapshot = createDefaultState();
  const now = new Date();
  const focusMinutes = 45;
  const breakMinutes = 10;

  snapshot.settings = {
    ...snapshot.settings,
    notificationsEnabled: true,
    strictBlocking: true,
    autoStartBreak: false,
    autopilotEnabled: true
  };

  snapshot.session = {
    ...snapshot.session,
    active: true,
    phase: "focus",
    pausedPhase: null,
    mode: "plan",
    modeId: "architecture",
    modeLabel: "Architecture block",
    projectName: "Advanced Focus Mode",
    projectBranch: "feature/demo-tour",
    projectTicket: "AFM-DEMO",
    objective: "Show the extension workflow, recovery, and report flow.",
    focusMinutes,
    breakMinutes,
    startedAt: new Date(now.getTime() - 12 * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + 33 * 60_000).toISOString(),
    pausedAt: null,
    remainingSeconds: 33 * 60,
    pauseCount: 0,
    recovery: {
      capturedAt: new Date(now.getTime() - 2 * 60_000).toISOString(),
      source: "demo-kit",
      tabs: [
        { title: "Repo architecture notes", url: "https://developer.chrome.com/docs/extensions/", pinned: false, active: false },
        { title: "Implementation checklist", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript", pinned: false, active: false }
      ]
    },
    lastObservedTab: {
      url: "https://developer.chrome.com/docs/extensions/",
      title: "Repo architecture notes",
      observedAt: new Date(now.getTime() - 90 * 1000).toISOString()
    }
  };

  snapshot.tasks = [
    createTask("Show the command palette"),
    createTask("Capture and restore the context"),
    createTask("Copy the session report"),
    createTask("Export the backup")
  ];
  snapshot.tasks[0].done = true;

  snapshot.blocks = [
    createBlock("youtube.com"),
    createBlock("reddit.com"),
    createBlock("x.com")
  ];

  snapshot.budgets = [
    createBudgetRule("youtube.com", "Video budget", 2),
    createBudgetRule("reddit.com", "Forum budget", 3)
  ];
  snapshot.budgets[0].used = 1;
  snapshot.budgets[1].used = 2;

  snapshot.parkingLot = [
    createParkingItem({
      title: "Follow-up note",
      note: "Use this to show how stray thoughts stay captured instead of pulling focus."
    }),
    createParkingItem({
      title: "Open question",
      url: "https://developer.chrome.com/docs/extensions/mv3/",
      kind: "tab",
      note: "Demo parked link"
    })
  ];

  snapshot.notes = "Demo note: explain the timer, the shield, the coach, and the report.";
  snapshot.stats = {
    ...snapshot.stats,
    completedSessions: 18,
    deepWorkMinutes: 870,
    blockedAttempts: 6,
    streakDays: 5,
    lastCompletionDate: todayStamp(now)
  };

  addHistoryEntry(snapshot, {
    type: "demo-loaded",
    title: "Demo scenario loaded",
    detail: "Preloaded state for a guided walkthrough."
  });
  addHistoryEntry(snapshot, {
    type: "session-started",
    title: "Focus session started",
    detail: "Architecture block for the demo walkthrough.",
    minutes: focusMinutes,
    breakMinutes
  });
  addHistoryEntry(snapshot, {
    type: "context-captured",
    title: "Focus context captured",
    detail: "Two demo tabs saved for restore."
  });
  addHistoryEntry(snapshot, {
    type: "budget-added",
    title: "Focus budget created",
    detail: "Demo budgets applied to distraction-heavy sites."
  });
  addHistoryEntry(snapshot, {
    type: "mode-applied",
    title: "Project mode applied",
    detail: "Architecture block tuned for the demo presentation."
  });
  addHistoryEntry(snapshot, {
    type: "task-linked",
    title: "Task linked to context",
    detail: "Current demo task connected to the architecture notes."
  });
  addHistoryEntry(snapshot, {
    type: "command-palette-opened",
    title: "Command palette opened",
    detail: "Keyboard-first command entry shown during the walkthrough."
  });
  addHistoryEntry(snapshot, {
    type: "session-paused",
    title: "Session paused",
    detail: "Paused briefly to demonstrate recovery and resume."
  });
  addHistoryEntry(snapshot, {
    type: "session-resumed",
    title: "Session resumed",
    detail: "Focus flow restored after the interruption."
  });

  return decorateSnapshot(snapshot);
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
    case "session:apply-mode":
      return localApplyMode(snapshot, payload?.modeId);
    case "session:autopilot-apply":
      return localApplyMode(snapshot, autopilotModeId(snapshot));
    case "task:add":
      return localAddTask(snapshot, payload?.title);
    case "task:toggle":
      return localToggleTask(snapshot, payload?.id);
    case "task:remove":
      return localRemoveTask(snapshot, payload?.id);
    case "task:link-context":
      return localLinkTaskContext(snapshot, payload?.taskId, payload);
    case "task:unlink-context":
      return localUnlinkTaskContext(snapshot, payload?.taskId, payload?.url);
    case "task:open-context":
      return snapshot;
    case "block:add":
      return localAddBlock(snapshot, payload?.host);
    case "block:toggle":
      return localToggleBlock(snapshot, payload?.id);
    case "block:remove":
      return localRemoveBlock(snapshot, payload?.id);
    case "budget:add":
      return localAddBudget(snapshot, payload);
    case "budget:update":
      return localUpdateBudget(snapshot, payload?.id, payload);
    case "budget:remove":
      return localRemoveBudget(snapshot, payload?.id);
    case "budget:reset":
      return localResetBudgets(snapshot);
    case "forensics:clear":
      return localClearForensics(snapshot);
    case "session:capture-context":
      snapshot.session.recovery = localCaptureContext(payload?.source);
      return snapshot;
    case "session:restore-context":
      return snapshot;
    case "parking:add":
      snapshot.parkingLot.unshift(createParkingItem(payload));
      return snapshot;
    case "parking:remove":
      snapshot.parkingLot = snapshot.parkingLot.filter((item) => item.id !== payload?.id);
      return snapshot;
    case "parking:clear":
      snapshot.parkingLot = [];
      return snapshot;
    case "interruption:blocked-attempt":
      return localRecordBlockedAttempt(snapshot, payload);
    case "interruption:tab-switch":
      return localRecordTabSwitch(snapshot, payload);
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

function decorateSnapshot(snapshot) {
  const value = normalizeState(snapshot ?? createDefaultState());
  value.insights = deriveAdaptivePlan(value);
  value.autopilot = deriveAutopilot(value);
  value.projectModes = value.projectModes && value.projectModes.length ? value.projectModes : projectModeCatalog();
  value.replay = buildSessionReplay(value);
  value.smartBlockSuggestions = deriveSmartBlockSuggestions(value);
  value.budgetSummary = summarizeFocusBudgets(value);
  value.sessionSummary = summarizeSession(value);
  return value;
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
  const modeId = String(payload?.modeId ?? modeIdForSessionMode(mode));
  const modeLabel = prettyLabel(modeId);
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
    modeId,
    modeLabel,
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
    recovery: snapshot.session.recovery,
    lastObservedTab: snapshot.session.lastObservedTab
  };

  addHistoryEntry(snapshot, {
    type: "session-started",
    title: "Focus session started",
    detail: `${modeLabel} for ${focusMinutes}m. Break: ${breakMinutes}m.`
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

function localApplyMode(snapshot, modeId) {
  const value = String(modeId || "code-sprint");
  snapshot.session.modeId = value;
  snapshot.session.modeLabel = prettyLabel(value);
  switch (value) {
    case "debug-bash":
      snapshot.session.mode = "debug";
      snapshot.session.focusMinutes = 25;
      snapshot.session.breakMinutes = 5;
      snapshot.session.objective = "Reproduce the issue and prove the fix.";
      break;
    case "review-block":
      snapshot.session.mode = "review";
      snapshot.session.focusMinutes = 40;
      snapshot.session.breakMinutes = 10;
      snapshot.session.objective = "Read the diff, call out risks, and decide.";
      break;
    case "architecture":
      snapshot.session.mode = "plan";
      snapshot.session.focusMinutes = 90;
      snapshot.session.breakMinutes = 15;
      snapshot.session.objective = "Write the design, tradeoffs, and rollout path.";
      break;
    case "writing":
      snapshot.session.mode = "learn";
      snapshot.session.focusMinutes = 45;
      snapshot.session.breakMinutes = 10;
      snapshot.session.objective = "Draft the outline and keep the narrative clean.";
      break;
    case "planning":
      snapshot.session.mode = "plan";
      snapshot.session.focusMinutes = 60;
      snapshot.session.breakMinutes = 10;
      snapshot.session.objective = "Reduce the problem to a sequence of safe slices.";
      break;
    default:
      snapshot.session.mode = "deep-work";
      snapshot.session.focusMinutes = 50;
      snapshot.session.breakMinutes = 10;
      snapshot.session.objective = "Ship the smallest valuable slice.";
      break;
  }
  addHistoryEntry(snapshot, {
    type: "mode-applied",
    title: "Project mode applied",
    detail: snapshot.session.modeLabel || value
  });
  return snapshot;
}

function autopilotModeId(snapshot) {
  const autopilot = deriveAutopilot(snapshot);
  return autopilot.recommendedModeId;
}

function localAddBudget(snapshot, payload) {
  const host = normalizeHost(payload?.host);
  if (!host) throw new Error("Budget host is required");
  snapshot.budgets.unshift(createBudgetRule(host, payload?.label ?? host, payload?.dailyLimit ?? 5));
  return snapshot;
}

function localUpdateBudget(snapshot, id, payload) {
  const budget = snapshot.budgets.find((item) => item.id === id);
  if (!budget) throw new Error("Budget not found");
  budget.label = String(payload?.label ?? budget.label).trim().slice(0, 80);
  budget.host = normalizeHost(payload?.host ?? budget.host);
  budget.dailyLimit = clampNumber(payload?.dailyLimit ?? budget.dailyLimit, 1, 50);
  budget.enabled = payload?.enabled ?? budget.enabled;
  return snapshot;
}

function localRemoveBudget(snapshot, id) {
  snapshot.budgets = snapshot.budgets.filter((item) => item.id !== id);
  return snapshot;
}

function localResetBudgets(snapshot) {
  snapshot.budgets = snapshot.budgets.map((budget) => ({
    ...budget,
    used: 0,
    lastResetDate: todayStamp()
  }));
  return snapshot;
}

function localClearForensics(snapshot) {
  snapshot.forensics = {
    blockedAttempts: 0,
    tabSwitches: 0,
    focusEscapes: 0,
    topBlockedHosts: []
  };
  return snapshot;
}

function localRecordBlockedAttempt(snapshot, payload) {
  const host = normalizeHost(payload?.host ?? payload?.url ?? payload?.referrer ?? "");
  snapshot.forensics.blockedAttempts += 1;
  if (host) {
    snapshot.forensics.topBlockedHosts = [host, ...snapshot.forensics.topBlockedHosts.filter((item) => item !== host)].slice(0, 6);
  }
  return snapshot;
}

function localRecordTabSwitch(snapshot, payload) {
  snapshot.forensics.tabSwitches += 1;
  snapshot.forensics.focusEscapes += 1;
  snapshot.session.lastObservedTab = {
    url: String(payload?.url ?? "").trim().slice(0, 500),
    title: String(payload?.title ?? payload?.url ?? "Tab").trim().slice(0, 140),
    observedAt: new Date().toISOString()
  };
  return snapshot;
}

function localLinkTaskContext(snapshot, taskId, payload) {
  const task = snapshot.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("Task not found");
  const url = String(payload?.url ?? snapshot.session.lastObservedTab?.url ?? "").trim();
  if (!url) throw new Error("A context URL is required");
  task.contextLinks = Array.isArray(task.contextLinks) ? task.contextLinks : [];
  if (!task.contextLinks.some((link) => link.url === url)) {
    task.contextLinks.unshift({
      title: String(payload?.title ?? snapshot.session.lastObservedTab?.title ?? url).trim().slice(0, 140),
      url,
      createdAt: new Date().toISOString()
    });
  }
  return snapshot;
}

function localUnlinkTaskContext(snapshot, taskId, url) {
  const task = snapshot.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("Task not found");
  task.contextLinks = Array.isArray(task.contextLinks) ? task.contextLinks.filter((link) => link.url !== url) : [];
  return snapshot;
}

function localCaptureContext(source) {
  return {
    capturedAt: new Date().toISOString(),
    source: String(source ?? "manual").trim(),
    tabs: []
  };
}

function prettyLabel(value) {
  return String(value || "balanced")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function prettyMode(mode) {
  switch (String(mode || "deep-work")) {
    case "deep-work":
      return "Deep work";
    case "debug":
      return "Debug sprint";
    case "review":
      return "Review block";
    case "plan":
      return "Planning";
    case "learn":
      return "Learning";
    default:
      return String(mode || "deep-work")
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function modeIdForSessionMode(mode) {
  switch (String(mode || "deep-work")) {
    case "debug":
      return "debug-bash";
    case "review":
      return "review-block";
    case "plan":
      return "architecture";
    case "learn":
      return "writing";
    default:
      return "code-sprint";
  }
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
