/**
 * FIFA ALL-IN-ONE - Content Script
 * Auto-fills forms automatically when page loads
 * Also handles ticket selection with Ctrl+Shift+S
 */

(function() {
  'use strict';

  // ========== DEFAULT CONFIG (used if account doesn't have matches) ==========
  const DEFAULT_MATCH_CONFIG = [
    { matchNumber: 3, category: 1, quantity: 4 },
    { matchNumber: 7, category: 1, quantity: 4 },
    { matchNumber: 11, category: 1, quantity: 4 },
    { matchNumber: 17, category: 1, quantity: 4 },
    { matchNumber: 23, category: 1, quantity: 4 },
    { matchNumber: 27, category: 1, quantity: 4 },
    { matchNumber: 32, category: 1, quantity: 4 },
    { matchNumber: 33, category: 1, quantity: 4 },
    { matchNumber: 43, category: 1, quantity: 4 },
    { matchNumber: 47, category: 1, quantity: 4 },
  ];
  const ACTION_DELAY = 50;
  // ========== END CONFIG ==========

  // Parse matches string from CSV to config array
  // Format: "M5,M11,M18,M24" or "5,11,18,24"
  function parseMatchesFromAccount(account) {
    if (!account.matches) return null;

    const matchesStr = account.matches.trim();
    if (!matchesStr) return null;

    const category = parseInt(account.category) || 1;
    const quantity = parseInt(account.quantity) || 4;

    // Split by comma, handle M5 or 5 format
    const matchNumbers = matchesStr.split(',').map(m => {
      const cleaned = m.trim().toUpperCase().replace('M', '');
      return parseInt(cleaned);
    }).filter(n => !isNaN(n) && n > 0);

    if (matchNumbers.length === 0) return null;

    return matchNumbers.map(matchNumber => ({
      matchNumber,
      category,
      quantity
    }));
  }

  let currentAccount = null;
  let autoFillAttempted = false;

  // Load account from storage (with iframe fallback via message passing)
  async function loadAccount() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        try {
          chrome.storage.local.get(['accounts', 'selectedRow'], (result) => {
            if (chrome.runtime.lastError) {
              console.log('[FIFA] Storage access error (likely iframe), requesting from background');
              // In iframe - request account from background script
              chrome.runtime.sendMessage({ action: 'getAccount' }, (response) => {
                resolve(response?.account || null);
              });
            } else {
              const accounts = result.accounts || [];
              const selectedRow = result.selectedRow || 0;
              resolve(accounts[selectedRow] || null);
            }
          });
        } catch (e) {
          console.log('[FIFA] Storage error:', e);
          // Fallback - request from background
          chrome.runtime.sendMessage({ action: 'getAccount' }, (response) => {
            resolve(response?.account || null);
          });
        }
      } else {
        resolve(null);
      }
    });
  }

  // Set value for input elements (React-compatible)
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

  // Main autofill function
  async function runAutofill(account) {
    if (!account) {
      console.log('[FIFA] No account loaded');
      return 0;
    }

    console.log('[FIFA] Running autofill for:', account.email);
    let filled = 0;

    // Fill text inputs
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
    console.log('[FIFA] Found', inputs.length, 'inputs');

    for (const input of inputs) {
      const ph = (input.placeholder || '').toLowerCase();
      const nm = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const tp = (input.type || '').toLowerCase();

      // Get nearby text for context
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
      const selId = (sel.id || '').toLowerCase();
      const selName = (sel.name || '').toLowerCase();

      let labelText = '';
      let parent = sel.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        labelText += ' ' + (parent.textContent || '').toLowerCase();
        parent = parent.parentElement;
      }

      // Month dropdown (for card expiry)
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

      // Year dropdown (for card expiry)
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

      // Country dropdown
      if ((selId.includes('country') || selName.includes('country') || labelText.includes('country')) && account.country) {
        for (const opt of opts) {
          if (opt.value.toLowerCase().includes(account.country.toLowerCase()) ||
              opt.textContent.toLowerCase().includes(account.country.toLowerCase())) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
            break;
          }
        }
        continue;
      }

      // State/Province dropdown
      if ((selId.includes('state') || selId.includes('province') || selName.includes('state') || selName.includes('province') || labelText.includes('state') || labelText.includes('province')) && account.province) {
        for (const opt of opts) {
          if (opt.value.toLowerCase().includes(account.province.toLowerCase()) ||
              opt.textContent.toLowerCase().includes(account.province.toLowerCase())) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
            break;
          }
        }
        continue;
      }
    }

    return filled;
  }

  // Show notification
  function showNotification(message, isSuccess = true) {
    const existing = document.getElementById('fifa-notification');
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.id = 'fifa-notification';
    notif.style.cssText = 'position:fixed;top:20px;right:20px;background:' + (isSuccess ? '#1a472a' : '#8b0000') + ';color:white;padding:16px 24px;border-radius:8px;z-index:999999;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 4000);
  }

  // Auto-fill when page loads or changes
  async function autoFillPage() {
    // Don't run multiple times on same page
    if (autoFillAttempted) return;
    autoFillAttempted = true;

    // Load account
    currentAccount = await loadAccount();
    if (!currentAccount) {
      console.log('[FIFA] No account in storage, skipping auto-fill');
      return;
    }

    // Wait a bit for page to fully render
    await new Promise(r => setTimeout(r, 500));

    // Check if there are fillable fields on this page
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
    const selects = document.querySelectorAll('select');

    if (inputs.length === 0 && selects.length === 0) {
      console.log('[FIFA] No form fields found on page');
      return;
    }

    // Run autofill
    const filled = await runAutofill(currentAccount);

    if (filled > 0) {
      console.log('[FIFA] Auto-filled', filled, 'fields');
      showNotification(`Auto-filled ${filled} fields!`);
    }
  }

  // Watch for dynamic content changes (SPA navigation)
  function setupMutationObserver() {
    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      // Check if new form elements were added
      let hasNewForms = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              if (node.tagName === 'INPUT' || node.tagName === 'SELECT' ||
                  node.querySelector?.('input, select')) {
                hasNewForms = true;
                break;
              }
            }
          }
        }
        if (hasNewForms) break;
      }

      if (hasNewForms) {
        // Reset flag and debounce
        autoFillAttempted = false;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(autoFillPage, 800);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ========== TICKET SELECTOR FUNCTIONS ==========
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function findMatchContainer(matchNumber) {
    const matchTitleSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'p'];
    for (const selector of matchTitleSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent.trim())
          .join('');
        const fullText = el.textContent?.trim();
        const exactMatch = `Match ${matchNumber}`;

        if (directText === exactMatch || fullText === exactMatch) {
          let container = el;
          for (let i = 0; i < 20; i++) {
            if (container.parentElement) {
              container = container.parentElement;
              const hasShowMore = container.textContent?.includes('Show more') || container.textContent?.includes('Show less');
              const hasCategories = container.querySelector('[class*="seatCategory"]') ||
                                   container.querySelector('[id*="seatCategory"]') ||
                                   container.textContent?.includes('Category 1');
              if (hasShowMore || hasCategories) {
                return container;
              }
            }
          }
          return el.parentElement?.parentElement?.parentElement || el;
        }
      }
    }
    return null;
  }

  async function expandMatch(container) {
    const buttonLabels = container.querySelectorAll('span.p-button-label, span[class*="button-label"]');
    for (const label of buttonLabels) {
      if (label.textContent?.trim()?.toLowerCase() === 'show more') {
        const btn = label.closest('button') || label.parentElement;
        if (btn) {
          btn.click();
          await delay(ACTION_DELAY);
          return true;
        }
      }
    }
    return false;
  }

  async function selectAllMatches() {
    console.log('[FIFA] Starting ticket selection...');

    // Load current account to get matches
    const account = await loadAccount();

    // Get match config from account or use default
    let matchConfig = DEFAULT_MATCH_CONFIG;
    if (account) {
      const accountMatches = parseMatchesFromAccount(account);
      if (accountMatches) {
        matchConfig = accountMatches;
        console.log('[FIFA] Using account-specific matches:', matchConfig);
      } else {
        console.log('[FIFA] No matches in account, using default config');
      }
    }

    let successCount = 0;
    let failCount = 0;

    for (const config of matchConfig) {
      const { matchNumber, category, quantity } = config;
      try {
        const container = findMatchContainer(matchNumber);
        if (!container) {
          failCount++;
          continue;
        }

        container.scrollIntoView({ behavior: 'instant', block: 'center' });
        await delay(200);
        await expandMatch(container);
        await delay(ACTION_DELAY);

        const expandedContainer = findMatchContainer(matchNumber) || container;
        let categoryFound = false;
        let categoryEl = null;

        for (let attempt = 0; attempt < 5; attempt++) {
          let categoryElements = expandedContainer.querySelectorAll('[id*="stx-lt-seatCategory-name"]');
          if (categoryElements.length === 0) {
            categoryElements = document.querySelectorAll('[id*="stx-lt-seatCategory-name"]');
          }

          for (const el of categoryElements) {
            const text = el.textContent?.trim() || '';
            if (text === `Category ${category}`) {
              const isInContainer = expandedContainer.contains(el);
              let parentCheck = el.parentElement;
              let matchTextNearby = false;
              for (let i = 0; i < 20 && parentCheck; i++) {
                if (parentCheck.textContent?.includes(`Match ${matchNumber}`)) {
                  matchTextNearby = true;
                  break;
                }
                parentCheck = parentCheck.parentElement;
              }

              if (isInContainer || matchTextNearby) {
                let clickable = el.closest('[role="button"]') ||
                                el.closest('[aria-controls]') ||
                                el.closest('[aria-expanded]');
                if (clickable) {
                  clickable.scrollIntoView({ behavior: 'instant', block: 'center' });
                  await delay(200);
                  clickable.click();
                  await delay(ACTION_DELAY);
                  categoryEl = clickable;
                  categoryFound = true;
                  break;
                }
              }
            }
          }
          if (categoryFound) break;
          await delay(1000);
        }

        if (!categoryFound) {
          failCount++;
          continue;
        }

        await delay(ACTION_DELAY);

        // Find + button
        let qtyOk = false;
        const increaseButtons = document.querySelectorAll('button[aria-label*="Increase quantity"]');
        for (const btn of increaseButtons) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const ariaLabel = btn.getAttribute('aria-label') || '';
            if (ariaLabel.includes(`Category ${category}`)) {
              btn.scrollIntoView({ behavior: 'instant', block: 'center' });
              await delay(200);
              for (let i = 0; i < quantity; i++) {
                btn.click();
                await delay(500);
              }
              qtyOk = true;
              break;
            }
          }
        }

        if (!qtyOk) {
          for (const btn of increaseButtons) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              btn.scrollIntoView({ behavior: 'instant', block: 'center' });
              await delay(200);
              for (let i = 0; i < quantity; i++) {
                btn.click();
                await delay(500);
              }
              qtyOk = true;
              break;
            }
          }
        }

        if (qtyOk) {
          successCount++;
        } else {
          failCount++;
        }

        // Collapse
        if (categoryEl) {
          categoryEl.click();
          await delay(500);
        }

      } catch (error) {
        console.error(`[FIFA] Error on Match ${matchNumber}:`, error);
        failCount++;
      }
    }

    showNotification(`Done! ${successCount} matches selected, ${failCount} failed.`);
  }

  // ========== INITIALIZATION ==========

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+S for ticket selection
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      selectAllMatches();
    }
    // Alt+A for manual autofill trigger
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      autoFillAttempted = false;
      autoFillPage();
    }
  });

  // Listen for messages from popup/background
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'autofill') {
        autoFillAttempted = false;
        autoFillPage();
        sendResponse({ status: 'started' });
      } else if (message.action === 'selectMatches') {
        selectAllMatches();
        sendResponse({ status: 'started' });
      }
      return true;
    });
  }

  // Start auto-fill on page load
  console.log('[FIFA] All-in-One extension loaded');
  autoFillPage();
  setupMutationObserver();

})();
