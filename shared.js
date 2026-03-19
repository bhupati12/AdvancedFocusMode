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
      autoStartBreak: false
    },
    session: {
      active: false,
      phase: "idle",
      pausedPhase: null,
      mode: "deep-work",
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
      pauseCount: 0
    },
    tasks: DEFAULT_TASKS.map((title, index) => ({
      id: `task-${index + 1}`,
      title,
      done: false,
      createdAt: new Date().toISOString()
    })),
    blocks: DEFAULT_BLOCKS.map((host, index) => ({
      id: `block-${index + 1}`,
      host,
      enabled: true,
      createdAt: new Date().toISOString()
    })),
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
  state.session.projectName = sanitizeText(state.session.projectName, 80);
  state.session.projectBranch = sanitizeText(state.session.projectBranch, 80);
  state.session.projectTicket = sanitizeText(state.session.projectTicket, 80);
  state.session.objective = sanitizeText(state.session.objective, 180);
  state.tasks = Array.isArray(state.tasks) ? state.tasks : fallback.tasks;
  state.blocks = Array.isArray(state.blocks) ? state.blocks : fallback.blocks;
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
      createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString()
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

  state.history = state.history
    .filter((item) => item && typeof item.title === "string")
    .slice(0, 100);

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
    createdAt: new Date().toISOString()
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

export function deriveAdaptivePlan(state) {
  const completedSessions = Array.isArray(state?.history)
    ? state.history.filter((entry) => entry.type === "session-completed")
    : [];
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
      pauseCount > 2
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

function cryptoRandom() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0].toString(36);
}
