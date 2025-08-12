// background.js
// Log when service worker starts
console.log('Service worker initialized');

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  
  try {
    chrome.contextMenus.create({
      id: 'save-prompt-selection',
      title: 'Save selected text as Prompt',
      contexts: ['selection']
    });
  } catch (err) {
    console.error('Error creating context menu:', err);
  }
});

// Add listener to ensure service worker stays active
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);
  return true; // Will respond asynchronously
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-prompt-selection' && info.selectionText) {
    const text = info.selectionText.trim();
    if (!text) return;
    chrome.storage.local.get({ prompts: [] }, (res) => {
      const prompts = res.prompts || [];
      prompts.unshift({ text, ts: Date.now(), site: tab?.url ? (new URL(tab.url)).hostname : '' });
      // keep size small
      if (prompts.length > 1000) prompts.length = 1000;
      chrome.storage.local.set({ prompts });
    });
  }
});
