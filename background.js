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

// Log when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('[FIFA] All-in-One extension installed/updated');
});
