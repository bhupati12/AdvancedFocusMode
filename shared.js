export const STORAGE_KEY = "advancedFocusModeState";
export const TIMER_ALARM = "advanced-focus-timer";
export const BADGE_LIMIT = 99;

const DEFAULT_TASKS = [
  "Define the exact exit criteria",
  "Implement the smallest safe slice",
  "Run a targeted verification pass"
];

const DEFAULT_BLOCKS = [
  "youtube.com",
  "x.com",
  "reddit.com",
  "news.ycombinator.com",
  "instagram.com",
  "facebook.com"
];

const PROJECT_MODE_CATALOG = [
  {
    id: "code-sprint",
    label: "Code sprint",
    objective: "Ship the smallest valuable slice.",
    focusMinutes: 50,
    breakMinutes: 10,
    strictness: "balanced",
    ritual: "Implementation-first. Keep the change narrow and verified."
  },
  {
    id: "debug-bash",
    label: "Debug bash",
    objective: "Reproduce the issue and prove the fix.",
    focusMinutes: 25,
    breakMinutes: 5,
    strictness: "strict",
    ritual: "Logs first. Change one variable at a time."
  },
  {
    id: "review-block",
    label: "Review block",
    objective: "Read the diff, call out risks, and decide.",
    focusMinutes: 40,
    breakMinutes: 10,
    strictness: "balanced",
    ritual: "Scan for behavior changes, regressions, and missing tests."
  },
  {
    id: "architecture",
    label: "Architecture block",
    objective: "Write the design, tradeoffs, and rollout path.",
    focusMinutes: 90,
    breakMinutes: 15,
    strictness: "light",
    ritual: "Sketch the shape, pressure-test the edges, and name the risks."
  },
  {
    id: "writing",
    label: "Writing block",
    objective: "Draft the outline and keep the narrative clean.",
    focusMinutes: 45,
    breakMinutes: 10,
    strictness: "light",
    ritual: "Outline first, then tighten the first pass."
  },
  {
    id: "planning",
    label: "Planning block",
    objective: "Reduce the problem to a sequence of safe slices.",
    focusMinutes: 60,
    breakMinutes: 10,
    strictness: "balanced",
    ritual: "Capture unknowns, assumptions, and rollout gates."
  }
];

const DEFAULT_ACTIVITY = [
  {
    type: "boot",
    title: "Workspace initialized",
    detail: "Focus Mode loaded with developer presets and shielded defaults.",
    createdAt: new Date().toISOString()
  }
];

export function createDefaultState() {
  return {
    version: 1,
    settings: {
      notificationsEnabled: true,
      strictBlocking: true,
      autoStartBreak: false,
      autopilotEnabled: true
    },
    session: {
      active: false,
      phase: "idle",
      pausedPhase: null,
      mode: "deep-work",
      modeId: "code-sprint",
      modeLabel: "Code sprint",
      projectName: "",
      projectBranch: "",
      projectTicket: "",
      objective: "",
      focusMinutes: 50,
      breakMinutes: 10,
      startedAt: null,
      endsAt: null,
      pausedAt: null,
      remainingSeconds: 0,
      pauseCount: 0,
      recovery: createRecoverySnapshot(),
      lastObservedTab: null
    },
    tasks: DEFAULT_TASKS.map((title, index) => ({
      id: `task-${index + 1}`,
      title,
      done: false,
      createdAt: new Date().toISOString(),
      contextLinks: []
    })),
    blocks: DEFAULT_BLOCKS.map((host, index) => ({
      id: `block-${index + 1}`,
      host,
      enabled: true,
      createdAt: new Date().toISOString()
    })),
    parkingLot: [],
    budgets: [],
    forensics: {
      blockedAttempts: 0,
      tabSwitches: 0,
      focusEscapes: 0,
      topBlockedHosts: []
    },
    history: DEFAULT_ACTIVITY.slice(),
    notes: "",
    stats: {
      completedSessions: 0,
      deepWorkMinutes: 0,
      blockedAttempts: 0,
      streakDays: 0,
      lastCompletionDate: null
    }
  };
}

export function normalizeState(value) {
  const fallback = createDefaultState();
  const state = clone(value ?? fallback);
  state.version = 1;
  state.settings = {
    ...fallback.settings,
    ...(state.settings ?? {})
  };
  state.session = {
    ...fallback.session,
    ...(state.session ?? {})
  };
  state.session.recovery = normalizeRecoverySnapshot(state.session.recovery);
  state.session.modeId = sanitizeText(state.session.modeId, 80) || fallback.session.modeId;
  state.session.modeLabel = sanitizeText(state.session.modeLabel, 80) || fallback.session.modeLabel;
  state.session.lastObservedTab = normalizeObservedTab(state.session.lastObservedTab);
  state.session.projectName = sanitizeText(state.session.projectName, 80);
  state.session.projectBranch = sanitizeText(state.session.projectBranch, 80);
  state.session.projectTicket = sanitizeText(state.session.projectTicket, 80);
  state.session.objective = sanitizeText(state.session.objective, 180);
  state.tasks = Array.isArray(state.tasks) ? state.tasks : fallback.tasks;
  state.blocks = Array.isArray(state.blocks) ? state.blocks : fallback.blocks;
  state.parkingLot = Array.isArray(state.parkingLot) ? state.parkingLot : [];
  state.budgets = Array.isArray(state.budgets) ? state.budgets : [];
  state.forensics = {
    ...fallback.forensics,
    ...(state.forensics ?? {})
  };
  state.history = Array.isArray(state.history) ? state.history : fallback.history;
  state.notes = typeof state.notes === "string" ? state.notes : "";
  state.stats = {
    ...fallback.stats,
    ...(state.stats ?? {})
  };

  state.tasks = state.tasks
    .filter((task) => task && typeof task.title === "string")
    .map((task, index) => ({
      id: typeof task.id === "string" && task.id.trim() ? task.id : `task-${index + 1}`,
      title: task.title.trim().slice(0, 120),
      done: Boolean(task.done),
      createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
      contextLinks: normalizeContextLinks(task.contextLinks)
    }));

  state.blocks = state.blocks
    .filter((block) => block && typeof block.host === "string")
    .map((block, index) => ({
      id: typeof block.id === "string" && block.id.trim() ? block.id : `block-${index + 1}`,
      host: normalizeHost(block.host),
      enabled: block.enabled !== false,
      createdAt: typeof block.createdAt === "string" ? block.createdAt : new Date().toISOString()
    }))
    .filter((block) => block.host.length > 0);

  state.parkingLot = state.parkingLot
    .filter((item) => item && typeof item.title === "string")
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `parking-${index + 1}`,
      title: sanitizeText(item.title, 140),
      url: sanitizeRestorableUrl(item.url),
      note: sanitizeText(item.note, 240),
      kind: item.kind === "tab" ? "tab" : "thought",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
    }));

  state.history = state.history
    .filter((item) => item && typeof item.title === "string")
    .slice(0, 100);

  state.budgets = state.budgets
    .filter((budget) => budget && typeof budget.host === "string")
    .map((budget, index) => ({
      id: typeof budget.id === "string" && budget.id.trim() ? budget.id : `budget-${index + 1}`,
      label: sanitizeText(budget.label, 80) || sanitizeText(budget.host, 80),
      host: normalizeHost(budget.host),
      dailyLimit: clamp(Number(budget.dailyLimit ?? 5), 1, 50),
      used: clamp(Number(budget.used ?? 0), 0, 50),
      lastResetDate: isIsoDateStamp(budget.lastResetDate) ? budget.lastResetDate : todayStamp(),
      enabled: budget.enabled !== false
    }))
    .filter((budget) => budget.host.length > 0);

  state.forensics.blockedAttempts = clamp(Number(state.forensics.blockedAttempts ?? 0), 0, 1000);
  state.forensics.tabSwitches = clamp(Number(state.forensics.tabSwitches ?? 0), 0, 1000);
  state.forensics.focusEscapes = clamp(Number(state.forensics.focusEscapes ?? 0), 0, 1000);
  state.forensics.topBlockedHosts = Array.isArray(state.forensics.topBlockedHosts)
    ? state.forensics.topBlockedHosts
        .filter((host) => typeof host === "string")
        .map((host) => normalizeHost(host))
        .filter((host) => host.length > 0)
    : [];

  return state;
}

export function normalizeHost(input) {
  if (!input) return "";
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^\*+\./, "")
    .replace(/[^a-z0-9.-]/g, "");
}

export function createTask(title) {
  return {
    id: `task-${cryptoRandom()}`,
    title: String(title).trim().slice(0, 120),
    done: false,
    createdAt: new Date().toISOString(),
    contextLinks: []
  };
}

export function createBlock(host) {
  return {
    id: `block-${cryptoRandom()}`,
    host: normalizeHost(host),
    enabled: true,
    createdAt: new Date().toISOString()
  };
}

export function createParkingItem(value = {}) {
  const title = sanitizeText(value.title ?? value.url ?? "Parked distraction", 140);
  const url = sanitizeRestorableUrl(value.url);
  const note = sanitizeText(value.note ?? "", 240);
  const kind = value.kind === "tab" ? "tab" : "thought";

  return {
    id: `parking-${cryptoRandom()}`,
    title,
    url,
    note,
    kind,
    createdAt: new Date().toISOString()
  };
}

export function createRecoverySnapshot() {
  return {
    capturedAt: null,
    source: "",
    tabs: []
  };
}

export function addHistoryEntry(state, entry) {
  state.history.unshift({
    id: `history-${cryptoRandom()}`,
    createdAt: new Date().toISOString(),
    ...entry
  });
  state.history = state.history.slice(0, 50);
}

export function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  return `${value}m`;
}

export function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatRelativeTimestamp(iso) {
  if (!iso) return "Unknown";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

export function formatDateStamp(iso) {
  if (!iso) return "";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

export function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function calculateFocusScore(state) {
  const deepMinutes = Number(state?.stats?.deepWorkMinutes || 0);
  const sessions = Number(state?.stats?.completedSessions || 0);
  const tasksDone = Array.isArray(state?.tasks) ? state.tasks.filter((task) => task.done).length : 0;
  const streakDays = Number(state?.stats?.streakDays || 0);
  const blocked = Number(state?.stats?.blockedAttempts || 0);
  const pauses = Array.isArray(state?.history) ? state.history.filter((entry) => entry.type === "session-paused").length : 0;
  const score = Math.round(deepMinutes * 1.4 + sessions * 10 + tasksDone * 4 + streakDays * 6 - blocked * 2 - pauses);
  return Math.max(0, Math.min(100, score));
}

export function calculateRemainingSeconds(session) {
  if (!session.active || !session.startedAt || !session.endsAt) {
    return Number(session.remainingSeconds || 0);
  }
  const remaining = Math.ceil((new Date(session.endsAt).getTime() - Date.now()) / 1000);
  return Math.max(0, remaining);
}

export function getDisplayedSessionSeconds(session) {
  if (!session || typeof session !== "object") {
    return 0;
  }

  if (session.active || session.phase === "paused") {
    return calculateRemainingSeconds(session);
  }

  if (session.phase === "break") {
    return Math.max(0, Number(session.breakMinutes || 0) * 60);
  }

  return Math.max(0, Number(session.focusMinutes || 0) * 60);
}

export function deriveStatusLabel(session) {
  if (!session.active) return "Idle";
  if (session.phase === "break") return "On break";
  if (session.phase === "paused") return "Paused";
  return "Deep work";
}

export function presetMap() {
  return {
    "code-sprint": {
      mode: "deep-work",
      focusMinutes: 50,
      breakMinutes: 10,
      objective: "Ship the smallest valuable slice."
    },
    "debug-bash": {
      mode: "debug",
      focusMinutes: 25,
      breakMinutes: 5,
      objective: "Reproduce the issue and prove the fix."
    },
    "review-block": {
      mode: "review",
      focusMinutes: 40,
      breakMinutes: 10,
      objective: "Read the diff, call out risks, and decide."
    },
    "architecture": {
      mode: "plan",
      focusMinutes: 90,
      breakMinutes: 15,
      objective: "Write the design, tradeoffs, and rollout path."
    }
  };
}

export function projectModeCatalog() {
  return PROJECT_MODE_CATALOG.slice();
}

export function getProjectMode(modeId) {
  return PROJECT_MODE_CATALOG.find((mode) => mode.id === modeId) ?? PROJECT_MODE_CATALOG[0];
}

export function deriveAutopilot(state) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const pauses = history.filter((entry) => entry.type === "session-paused").length;
  const blocked = Number(state?.forensics?.blockedAttempts || 0);
  const tabSwitches = Number(state?.forensics?.tabSwitches || 0);
  const parkingItems = Array.isArray(state?.parkingLot) ? state.parkingLot.length : 0;
  const budgetPressure = Array.isArray(state?.budgets)
    ? state.budgets.reduce((sum, budget) => sum + Math.max(0, Number(budget.used || 0) - Number(budget.dailyLimit || 0)), 0)
    : 0;
  const riskScore = pauses * 6 + blocked * 3 + tabSwitches * 2 + parkingItems * 2 + budgetPressure * 4;
  const level = riskScore >= 24 ? "strict" : riskScore >= 10 ? "balanced" : "light";
  const recommendedMode = level === "strict" ? "debug-bash" : level === "balanced" ? "code-sprint" : "writing";
  const recommended = getProjectMode(recommendedMode);

  return {
    level,
    confidence: clamp(100 - Math.min(45, riskScore * 2), 40, 98),
    riskScore,
    recommendedModeId: recommended.id,
    recommendedModeLabel: recommended.label,
    recommendedFocusMinutes: recommended.focusMinutes,
    recommendedBreakMinutes: recommended.breakMinutes,
    suggestedStrictBlocking: level === "strict",
    rationale:
      level === "strict"
        ? "Interruptions are stacking up. Switch to strict mode and shorten the block."
        : level === "balanced"
          ? "You are slipping a little. Keep the block focused and remove extra tabs."
          : "Momentum looks healthy. Keep the current cadence and avoid over-tightening."
  };
}

export function buildSessionReplay(state) {
  const events = Array.isArray(state?.history) ? state.history : [];
  return events
    .filter((entry) =>
      [
        "session-started",
        "session-paused",
        "session-resumed",
        "session-completed",
        "break-started",
        "break-completed",
        "break-skipped",
        "context-captured",
        "context-restored",
        "parking-item-added",
        "parking-tab-added",
        "blocked-attempt",
        "tab-switched",
        "budget-warning",
        "budget-overrun",
        "mode-applied"
      ].includes(entry.type)
    )
    .slice(0, 20)
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      detail: entry.detail || "",
      createdAt: entry.createdAt
    }));
}

export function deriveSmartBlockSuggestions(state) {
  const hits = new Map();
  const history = Array.isArray(state?.history) ? state.history : [];
  for (const entry of history) {
    if (entry.type !== "blocked-attempt" || !entry.host) continue;
    const host = normalizeHost(entry.host);
    if (!host) continue;
    hits.set(host, (hits.get(host) || 0) + 1);
  }

  const sorted = [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([host]) => host);

  return sorted.length ? sorted : DEFAULT_BLOCKS.slice(0, 6);
}

export function summarizeFocusBudgets(state) {
  const budgets = Array.isArray(state?.budgets) ? state.budgets : [];
  return budgets.map((budget) => ({
    id: budget.id,
    label: budget.label,
    host: budget.host,
    dailyLimit: Number(budget.dailyLimit || 0),
    used: Number(budget.used || 0),
    remaining: Math.max(0, Number(budget.dailyLimit || 0) - Number(budget.used || 0)),
    enabled: budget.enabled !== false
  }));
}

export function createBudgetRule(host, label, dailyLimit) {
  return {
    id: `budget-${cryptoRandom()}`,
    label: sanitizeText(label ?? host, 80),
    host: normalizeHost(host),
    dailyLimit: clamp(Number(dailyLimit ?? 5), 1, 50),
    used: 0,
    lastResetDate: todayStamp(),
    enabled: true
  };
}

export function deriveAdaptivePlan(state) {
  const completedSessions = Array.isArray(state?.history)
    ? state.history.filter((entry) => entry.type === "session-completed")
    : [];
  const parkingCount = Array.isArray(state?.parkingLot) ? state.parkingLot.length : 0;
  const recoveryTabs = Number(state?.session?.recovery?.tabs?.length || 0);
  const recentDurations = completedSessions
    .slice(0, 5)
    .map((entry) => Number(entry.minutes || state?.session?.focusMinutes || 50))
    .filter((value) => Number.isFinite(value) && value > 0);
  const averageFocus = recentDurations.length
    ? Math.round(recentDurations.reduce((sum, value) => sum + value, 0) / recentDurations.length)
    : Number(state?.session?.focusMinutes || 50);
  const pauseCount = Array.isArray(state?.history)
    ? state.history.filter((entry) => entry.type === "session-paused").length
    : 0;
  const recommendedFocus = clamp(Math.max(15, Math.min(120, averageFocus + (pauseCount <= 1 ? 5 : -5))), 15, 120);
  const recommendedBreak = clamp(Math.round(Math.max(5, Math.min(20, recommendedFocus * 0.2))), 5, 20);

  return {
    recommendedFocusMinutes: recommendedFocus,
    recommendedBreakMinutes: recommendedBreak,
    confidence: clamp(100 - Math.min(15, pauseCount * 2) - Math.max(0, 20 - completedSessions.length * 3), 35, 98),
    rationale:
      parkingCount > 0
        ? `You have ${parkingCount} parked distraction item(s); keep side quests there instead of opening new tabs.`
        : recoveryTabs > 0
          ? `Recovery can restore ${recoveryTabs} saved tab(s) when you need your exact context back.`
          : pauseCount > 2
            ? "You are pausing often. Shorter focus blocks will improve completion rate."
            : recentDurations.length > 0
              ? `Your recent average is ${averageFocus} minutes.`
              : "Use the default block and adjust after the first few sessions.",
    focusPattern: recentDurations.length ? averageFocus : null
  };
}

export function summarizeSession(state) {
  const session = state?.session ?? {};
  const project = session.projectName || "Unassigned";
  const ticket = session.projectTicket ? ` · ${session.projectTicket}` : "";
  const branch = session.projectBranch ? ` · ${session.projectBranch}` : "";
  const objective = session.objective || "No objective captured";
  const completedTasks = Array.isArray(state?.tasks) ? state.tasks.filter((task) => task.done).slice(0, 3) : [];
  const pendingTasks = Array.isArray(state?.tasks) ? state.tasks.filter((task) => !task.done).slice(0, 3) : [];
  const topTasks = completedTasks.length
    ? completedTasks.map((task) => task.title).join("; ")
    : "No completed tasks captured";
  const nextAction = pendingTasks.length ? pendingTasks[0].title : "Pick the next smallest safe slice";

  return {
    title: `${project}${ticket}${branch}`,
    objective,
    topTasks,
    nextAction,
    focusMinutes: Number(session.focusMinutes || 0),
    breakMinutes: Number(session.breakMinutes || 0),
    generatedAt: new Date().toISOString()
  };
}

export function buildSessionReport(state) {
  const summary = summarizeSession(state);
  const session = state?.session ?? {};
  const autopilot = deriveAutopilot(state);
  const replay = buildSessionReplay(state);
  const budgets = summarizeFocusBudgets(state);
  const suggestions = deriveSmartBlockSuggestions(state);
  const parking = Array.isArray(state?.parkingLot) ? state.parkingLot.slice(0, 5) : [];
  const completedTasks = Array.isArray(state?.tasks) ? state.tasks.filter((task) => task.done) : [];
  const linkedTasks = Array.isArray(state?.tasks)
    ? state.tasks.filter((task) => Array.isArray(task.contextLinks) && task.contextLinks.length > 0)
    : [];

  const lines = [];
  lines.push(`# Focus Session Report`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Project: ${summary.title || "Unassigned"}`);
  lines.push(`Objective: ${summary.objective || "No objective captured"}`);
  lines.push(`Mode: ${session.modeLabel || prettyLabel(session.modeId || session.mode || "code-sprint")}`);
  lines.push(`Status: ${deriveStatusLabel(session)}`);
  lines.push(`Remaining: ${formatDuration(getDisplayedSessionSeconds(session) || 0)}`);
  lines.push(``);
  lines.push(`## Autopilot`);
  lines.push(`- Level: ${autopilot.level}`);
  lines.push(`- Confidence: ${autopilot.confidence}%`);
  lines.push(`- Recommendation: ${autopilot.recommendedModeLabel}`);
  lines.push(`- Rationale: ${autopilot.rationale}`);
  lines.push(``);
  lines.push(`## Replay`);
  if (replay.length) {
    for (const entry of replay.slice(0, 10)) {
      lines.push(`- ${formatRelativeTimestamp(entry.createdAt)}: ${entry.title}${entry.detail ? ` — ${entry.detail}` : ""}`);
    }
  } else {
    lines.push(`- No replay data yet.`);
  }
  lines.push(``);
  lines.push(`## Task Context`);
  if (linkedTasks.length) {
    for (const task of linkedTasks.slice(0, 8)) {
      lines.push(`- ${task.title}: ${task.contextLinks.length} linked context item(s)`);
    }
  } else {
    lines.push(`- No task context links yet.`);
  }
  lines.push(``);
  lines.push(`## Tasks Completed`);
  if (completedTasks.length) {
    for (const task of completedTasks.slice(0, 8)) {
      lines.push(`- ${task.title}`);
    }
  } else {
    lines.push(`- No completed tasks recorded.`);
  }
  lines.push(``);
  lines.push(`## Focus Budgets`);
  if (budgets.length) {
    for (const budget of budgets) {
      lines.push(`- ${budget.label} (${budget.host}): ${budget.used}/${budget.dailyLimit} used, ${budget.remaining} remaining`);
    }
  } else {
    lines.push(`- No budgets configured.`);
  }
  lines.push(``);
  lines.push(`## Parking Lot`);
  if (parking.length) {
    for (const item of parking) {
      lines.push(`- ${item.title}${item.url ? ` (${item.url})` : ""}`);
    }
  } else {
    lines.push(`- Empty.`);
  }
  lines.push(``);
  lines.push(`## Smart Block Suggestions`);
  if (suggestions.length) {
    for (const host of suggestions.slice(0, 8)) {
      lines.push(`- ${host}`);
    }
  } else {
    lines.push(`- None yet.`);
  }
  lines.push(``);
  lines.push(`## Next Action`);
  lines.push(`- ${summary.nextAction || "Pick the next smallest safe slice"}`);

  return {
    title: `Focus Session Report - ${summary.title || "Unassigned"}`,
    filename: `advanced-focus-report-${todayStamp()}.md`,
    markdown: lines.join("\n")
  };
}

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function prettyLabel(value) {
  return String(value || "balanced")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitizeRestorableUrl(value) {
  const url = sanitizeText(value ?? "", 500);
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url) ? url : "";
}

function normalizeContextLinks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item.url === "string")
    .map((item) => ({
      title: sanitizeText(item.title ?? "Linked context", 140),
      url: sanitizeRestorableUrl(item.url),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
    }))
    .filter((item) => item.url.length > 0);
}

function normalizeRecoverySnapshot(value) {
  const fallback = createRecoverySnapshot();
  const recovery = clone(value ?? fallback);
  return {
    capturedAt: typeof recovery.capturedAt === "string" ? recovery.capturedAt : null,
    source: sanitizeText(recovery.source, 80),
    tabs: Array.isArray(recovery.tabs)
      ? recovery.tabs
          .filter((tab) => tab && typeof tab.title === "string")
          .map((tab) => ({
            title: sanitizeText(tab.title, 140),
            url: sanitizeRestorableUrl(tab.url),
            pinned: Boolean(tab.pinned),
            active: Boolean(tab.active)
          }))
          .filter((tab) => tab.url || tab.title)
      : fallback.tabs
  };
}

function normalizeObservedTab(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const url = sanitizeRestorableUrl(value.url);
  const title = sanitizeText(value.title, 140);
  if (!url && !title) {
    return null;
  }

  return {
    url,
    title,
    observedAt: typeof value.observedAt === "string" ? value.observedAt : new Date().toISOString()
  };
}

function isIsoDateStamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cryptoRandom() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0].toString(36);
}
