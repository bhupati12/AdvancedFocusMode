document.getElementById("back-button").addEventListener("click", () => {
  history.back();
});

document.getElementById("open-dashboard").addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html"), active: true });
});
