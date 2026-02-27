// Set this to your Marks instance origin
const MARKS_ORIGIN = "https://marks-drab.vercel.app";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-marks",
    title: "Save to Marks",
    contexts: ["link"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "save-to-marks" && info.linkUrl) {
    const addUrl = `${MARKS_ORIGIN}/add?url=${encodeURIComponent(info.linkUrl)}`;
    chrome.tabs.create({ url: addUrl });
  }
});
