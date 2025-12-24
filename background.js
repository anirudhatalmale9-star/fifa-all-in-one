/**
 * FIFA ALL-IN-ONE - Background Service Worker
 * Handles auto-injection into all frames including payment iframes
 */

// Autofill function to inject into pages
function getAutofillFunction() {
  return function(account) {
    if (!account) return 0;

    console.log('[FIFA] Running autofill in frame for:', account.email);

    function setValue(element, value) {
      if (!element || !value) return false;
      element.focus();
      element.click();

      if (element.tagName === 'SELECT') {
        for (const opt of element.options) {
          if (opt.value.toLowerCase().includes(value.toLowerCase()) ||
              opt.textContent.toLowerCase().includes(value.toLowerCase())) {
            element.value = opt.value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }

      element.value = '';
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    let filled = 0;
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');

    for (const input of inputs) {
      const ph = (input.placeholder || '').toLowerCase();
      const nm = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const tp = (input.type || '').toLowerCase();

      let context = '';
      let parent = input.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        context += ' ' + (parent.textContent || '').toLowerCase();
        parent = parent.parentElement;
      }

      // Card Number
      if ((ph.includes('1234') || context.includes('card number')) && account.card_number) {
        if (setValue(input, account.card_number)) filled++;
        continue;
      }
      // Card Holder
      if ((ph.includes('enter your name') || ph.includes('your name') || context.includes('card holder')) && (account.card_name || account.full_name)) {
        if (setValue(input, account.card_name || account.full_name)) filled++;
        continue;
      }
      // CVV
      if ((ph === 'cvv' || ph.includes('cvv') || context.includes('security code') || context.includes('cvv')) && account.cvc) {
        if (setValue(input, account.cvc)) filled++;
        continue;
      }
      // Email
      if ((tp === 'email' || nm.includes('email')) && account.email) {
        if (setValue(input, account.email)) filled++;
        continue;
      }
      // Password
      if (tp === 'password' && account.password) {
        if (setValue(input, account.password)) filled++;
        continue;
      }
      // Phone
      if ((tp === 'tel' || nm.includes('phone')) && account.phone) {
        if (setValue(input, account.phone)) filled++;
        continue;
      }
      // First name
      if ((nm.includes('firstname') || nm.includes('first_name')) && account.first_name) {
        if (setValue(input, account.first_name)) filled++;
        continue;
      }
      // Last name
      if ((nm.includes('lastname') || nm.includes('last_name')) && account.last_name) {
        if (setValue(input, account.last_name)) filled++;
        continue;
      }
      // Address
      if ((nm.includes('address') || ph.includes('address')) && account.address) {
        if (setValue(input, account.address)) filled++;
        continue;
      }
      // City
      if ((nm.includes('city') || ph.includes('city')) && account.city) {
        if (setValue(input, account.city)) filled++;
        continue;
      }
      // Zip
      if ((nm.includes('zip') || nm.includes('postal')) && account.zip_code) {
        if (setValue(input, account.zip_code)) filled++;
        continue;
      }
    }

    // Handle select dropdowns
    const selects = document.querySelectorAll('select');
    for (const sel of selects) {
      const opts = Array.from(sel.options);
      const optTexts = opts.map(o => o.textContent.toLowerCase());

      // Month dropdown
      if (account.card_expiry && (optTexts.some(t => t.includes('month')) || opts.some(o => o.value === '01' || o.value === '1'))) {
        const parts = account.card_expiry.split('/');
        if (parts.length === 2) {
          const month = parts[0].trim().padStart(2, '0');
          for (const opt of opts) {
            if (opt.value === month || opt.value === parseInt(month).toString()) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              filled++;
              break;
            }
          }
        }
        continue;
      }

      // Year dropdown
      if (account.card_expiry && (optTexts.some(t => t.includes('year')) || opts.some(o => /^20\d{2}$/.test(o.value)))) {
        const parts = account.card_expiry.split('/');
        if (parts.length === 2) {
          let year = parts[1].trim();
          if (year.length === 2) year = '20' + year;
          const shortYear = year.slice(-2);
          for (const opt of opts) {
            if (opt.value === year || opt.value === shortYear || opt.textContent.includes(year)) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              filled++;
              break;
            }
          }
        }
        continue;
      }
    }

    // Show notification if we filled anything
    if (filled > 0) {
      const notif = document.createElement('div');
      notif.style.cssText = 'position:fixed;top:20px;right:20px;background:#1a472a;color:white;padding:16px 24px;border-radius:8px;z-index:999999;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      notif.textContent = `Auto-filled ${filled} fields!`;
      document.body.appendChild(notif);
      setTimeout(() => notif.remove(), 4000);
    }

    return filled;
  };
}

// Inject autofill into all frames of a tab
async function injectAutofillIntoAllFrames(tabId) {
  try {
    // Get account from storage
    const result = await chrome.storage.local.get(['accounts', 'selectedRow']);
    const accounts = result.accounts || [];
    const selectedRow = result.selectedRow || 0;
    const account = accounts[selectedRow];

    if (!account) {
      console.log('[FIFA] No account in storage');
      return;
    }

    // Inject into all frames
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      func: getAutofillFunction(),
      args: [account]
    });

    console.log('[FIFA] Injection results:', results);
  } catch (err) {
    console.error('[FIFA] Injection error:', err);
  }
}

// Listen for tab updates - auto-inject when FIFA pages load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('fifa.com')) {
    // Wait a bit for dynamic content to load
    setTimeout(() => {
      injectAutofillIntoAllFrames(tabId);
    }, 1500);
  }
});

// Listen for keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) return;

  if (command === 'autofill') {
    injectAutofillIntoAllFrames(tab.id);
  } else if (command === 'select-matches') {
    chrome.tabs.sendMessage(tab.id, { action: 'selectMatches' });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'triggerAutofill') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        await injectAutofillIntoAllFrames(tabs[0].id);
        sendResponse({ status: 'done' });
      }
    });
    return true;
  }

  if (message.action === 'getAccount') {
    chrome.storage.local.get(['accounts', 'selectedRow'], (result) => {
      const accounts = result.accounts || [];
      const selectedRow = result.selectedRow || 0;
      sendResponse({ account: accounts[selectedRow] || null });
    });
    return true;
  }
});

// Log when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('[FIFA] All-in-One extension installed/updated v2.0.2');
});
