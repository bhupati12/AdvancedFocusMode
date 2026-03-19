import { createDefaultState, formatMinutes, formatRelativeTimestamp } from "./shared.js";

const els = {
  importFile: document.getElementById("import-file"),
  exportState: document.getElementById("export-state"),
  resetState: document.getElementById("reset-state"),
  openDashboard: document.getElementById("open-dashboard"),
  openClean: document.getElementById("open-clean"),
  summary: document.getElementById("state-summary"),
  status: document.getElementById("status")
};

await refreshSummary();
wireEvents();

function wireEvents() {
  els.importFile.addEventListener("change", handleImport);
  els.exportState.addEventListener("click", exportBackup);
  els.resetState.addEventListener("click", resetState);
  els.openDashboard.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html"), active: true }));
  els.openClean.addEventListener("click", () => chrome.tabs.create({ url: "about:blank", active: true }));
}

async function refreshSummary() {
  const result = await send("state:get");
  const snapshot = result ?? createDefaultState();
  const tasksDone = snapshot.tasks.filter((task) => task.done).length;
  const blocksEnabled = snapshot.blocks.filter((block) => block.enabled !== false).length;
  const lastActivity = snapshot.history[0];

  els.summary.innerHTML = [
    row("Sessions", String(snapshot.stats.completedSessions)),
    row("Deep work", formatMinutes(snapshot.stats.deepWorkMinutes)),
    row("Tasks complete", `${tasksDone}/${snapshot.tasks.length}`),
    row("Shielded sites", String(blocksEnabled)),
    row("Last activity", lastActivity ? `${lastActivity.title} · ${formatRelativeTimestamp(lastActivity.createdAt)}` : "None")
  ].join("");
}

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const result = await send("state:import", { state: parsed });
    setStatus("Backup imported.");
    await refreshSummaryFrom(result);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Import failed");
  } finally {
    event.target.value = "";
  }
}

async function exportBackup() {
  const result = await send("state:get");
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `advanced-focus-mode-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Backup exported.");
}

async function resetState() {
  if (!confirm("Reset all saved focus data?")) {
    return;
  }
  const result = await send("state:reset");
  setStatus("All focus data was reset.");
  await refreshSummaryFrom(result);
}

async function refreshSummaryFrom(snapshot) {
  const value = snapshot ?? createDefaultState();
  const tasksDone = value.tasks.filter((task) => task.done).length;
  const blocksEnabled = value.blocks.filter((block) => block.enabled !== false).length;
  const lastActivity = value.history[0];

  els.summary.innerHTML = [
    row("Sessions", String(value.stats.completedSessions)),
    row("Deep work", formatMinutes(value.stats.deepWorkMinutes)),
    row("Tasks complete", `${tasksDone}/${value.tasks.length}`),
    row("Shielded sites", String(blocksEnabled)),
    row("Last activity", lastActivity ? `${lastActivity.title} · ${formatRelativeTimestamp(lastActivity.createdAt)}` : "None")
  ].join("");
}

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) {
    throw new Error(response?.error || "Command failed");
  }
  return response.result;
}

function row(label, value) {
  return `<div class="summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function setStatus(message) {
  els.status.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
