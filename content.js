// content.js
(() => {
  const MAX_PROMPTS = 1000;

  function isVisible(el) {
    if (!el) return false;
    const rects = el.getClientRects();
    return rects.length > 0 && window.getComputedStyle(el).visibility !== 'hidden' && window.getComputedStyle(el).display !== 'none';
  }

  function findEditableInput() {
    // First look for focused element if it's an input/textarea/contenteditable
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text') || active.isContentEditable)) {
      if (isVisible(active)) return active;
    }
    // Otherwise heuristics: textarea, text input, then contenteditable
    const textarea = Array.from(document.querySelectorAll('textarea')).find(isVisible);
    if (textarea) return textarea;
    const textInput = Array.from(document.querySelectorAll('input[type="text"]')).find(isVisible);
    if (textInput) return textInput;
    const contentEdit = Array.from(document.querySelectorAll('[contenteditable="true"]')).find(isVisible);
    if (contentEdit) return contentEdit;
    return null;
  }

  function getInputText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text')) return el.value || '';
    if (el.isContentEditable) return el.innerText || el.textContent || '';
    return '';
  }

// Remove duplicate event listeners and combine into one save function
function savePrompt(promptText) {
    if (!promptText.trim()) return;
    
    chrome.storage.local.get({ prompts: [] }, (data) => {
        const prompts = data.prompts;
        // Avoid duplicates
        if (prompts.some(p => p.text === promptText)) return;
        
        prompts.unshift({
            text: promptText,
            timestamp: new Date().toISOString(),
            site: window.location.hostname
        });
        
        // Maintain size limit
        if (prompts.length > MAX_PROMPTS) {
            prompts.length = MAX_PROMPTS;
        }
        
        chrome.storage.local.set({ prompts });
    });
}

// Detect send button click
document.addEventListener("click", (e) => {
    const sendButton = e.target.closest("button");
    if (sendButton && sendButton.querySelector("svg")) {
        const textarea = document.querySelector("textarea");
        if (textarea && textarea.value.trim()) {
            savePrompt(textarea.value.trim());
        }
    }
});

// Detect Enter key
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        const textarea = document.querySelector("textarea");
        if (textarea && textarea.value.trim()) {
            savePrompt(textarea.value.trim());
        }
    }
});


  // Keydown handler for input elements
  function onKeydownCapture(e) {
    // If Enter without Shift/Ctrl/Meta -> consider submit
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = e.target;
      // capture the current value before chat UI clears it
      const text = getInputText(el).trim();
      if (text) savePrompt(text);
      // allow original event to continue
    }
  }

  // Generic click listener - if clicking a "send" button, capture nearby input
  function onDocumentClick(e) {
    const el = e.target;
    // if a button-like element
    const btn = el.closest('button, [role="button"], input[type="submit"]');
    if (!btn) return;
    // heuristics: button text often 'Send', 'Submit', or has aria-label
    const label = (btn.innerText || btn.getAttribute('aria-label') || '').toLowerCase();
    if (/send|submit|enter|reply|chat|generate|ask|send message/.test(label)) {
      // find nearby input
      const candidate = findEditableInput();
      const text = getInputText(candidate).trim();
      if (text) savePrompt(text);
    }
  }

  // Attach to all candidate inputs
  function attachToInputs() {
    const inputs = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]'));
    inputs.forEach((inp) => {
      if (!isVisible(inp)) return;
      if (inp._promptSaverAttached) return;
      inp.addEventListener('keydown', onKeydownCapture, true);
      inp._promptSaverAttached = true;
    });
  }

  // Use MutationObserver to attach to dynamically added inputs
  const mo = new MutationObserver((mutations) => {
    attachToInputs();
  });

  // initial attach
  attachToInputs();
  document.addEventListener('click', onDocumentClick, true);

  // start observing body for new inputs
  mo.observe(document.body, { childList: true, subtree: true });

  // Optional: expose manual save via DOM event (for remote messaging)
  window.addEventListener('promptSaverSave', (e) => {
    const text = (e.detail && e.detail.text) || '';
    savePrompt(text);
  });

  // Clean up on unload (best-effort)
  window.addEventListener('unload', () => {
    try {
      document.removeEventListener('click', onDocumentClick, true);
      mo.disconnect();
    } catch (e) {}
  });

  // debugging helper (uncomment to debug from devtools)
  // console.log('Prompt Saver content script loaded on', location.hostname);
})();
