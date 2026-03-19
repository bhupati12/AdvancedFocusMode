document.getElementById("back-button").addEventListener("click", () => {
  history.back();
});

document.getElementById("open-dashboard").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html"), active: true });
});

void chrome.runtime.sendMessage({
  type: "interruption:blocked-attempt",
  payload: {
    referrer: document.referrer || "",
    url: document.referrer || "",
    title: document.referrer || "Blocked site"
  }
});
