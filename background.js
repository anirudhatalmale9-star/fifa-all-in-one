/**
 * FIFA ALL-IN-ONE - Background Service Worker
 */

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes('fifa.com')) {
    console.log('[FIFA] Not on a FIFA page');
    return;
  }

  if (command === 'autofill') {
    chrome.tabs.sendMessage(tab.id, { action: 'autofill' });
  } else if (command === 'select-matches') {
    chrome.tabs.sendMessage(tab.id, { action: 'selectMatches' });
  }
});

// Handle messages from content scripts (especially iframes that can't access storage directly)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getAccount') {
    // Get account from storage and send back to content script
    chrome.storage.local.get(['accounts', 'selectedRow'], (result) => {
      const accounts = result.accounts || [];
      const selectedRow = result.selectedRow || 0;
      const account = accounts[selectedRow] || null;
      sendResponse({ account });
    });
    return true; // Keep channel open for async response
  }
});

// Log when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('[FIFA] All-in-One extension installed/updated');
});
