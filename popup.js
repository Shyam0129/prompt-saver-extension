// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const promptsContainer = document.getElementById('prompts');

  function fmtTime(ts) {
    return new Date(ts || Date.now()).toLocaleString();
  }

  function render(prompts) {
    promptsContainer.innerHTML = '';
    if (!prompts || prompts.length === 0) {
      promptsContainer.innerHTML = '<div class="empty">No prompts saved yet.</div>';
      return;
    }

    prompts.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'item';

      const textWrap = document.createElement('div');
      textWrap.className = 'text-wrapper';
      textWrap.style.cursor = p.url ? 'pointer' : 'default';

      // Main text and metadata setup
      const txt = document.createElement('div');
      txt.className = 'text';
      txt.textContent = p.text;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `
        <span>${p.site || 'local'}</span>
        <span>•</span>
        <span>${fmtTime(p.timestamp || p.ts)}</span>
        ${p.url ? '<span class="link-icon" title="Click to open original chat">🔗</span>' : ''}
      `;

      // URL redirect handler
      if (p.url) {
        textWrap.addEventListener('click', (e) => {
          // Prevent redirect if clicking buttons
          if (!e.target.closest('button')) {
            chrome.tabs.create({ url: p.url });
          }
        });
        textWrap.title = 'Click to open original chat';
      }

      textWrap.appendChild(txt);
      textWrap.appendChild(meta);

      // Actions setup
      const actions = document.createElement('div');
      actions.className = 'actions';
      
      // Insert button
      const insertBtn = document.createElement('button');
      insertBtn.className = 'action';
      insertBtn.textContent = 'Insert';
      insertBtn.title = 'Insert into chat';
      insertBtn.addEventListener('click', () => insertIntoActiveTab(p.text));

      // Copy button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ghost';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(p.text);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'Copy', 1000);
        } catch (err) {
          console.error('Copy failed:', err);
        }
      });

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'ghost';
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = 'Delete prompt';
      deleteBtn.addEventListener('click', () => deletePrompt(idx));

      actions.appendChild(insertBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(textWrap);
      item.appendChild(actions);
      promptsContainer.appendChild(item);
    });
  }

  function loadPrompts(searchTerm = '') {
    chrome.storage.local.get({ prompts: [] }, (data) => {
      let prompts = data.prompts;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        prompts = prompts.filter(p => 
          p.text.toLowerCase().includes(term) || 
          (p.site || '').toLowerCase().includes(term)
        );
      }
      render(prompts);
    });
  }

  function deletePrompt(index) {
    chrome.storage.local.get({ prompts: [] }, (res) => {
      const prompts = res.prompts || [];
      if (index < 0 || index >= prompts.length) return;
      prompts.splice(index, 1);
      chrome.storage.local.set({ prompts }, () => loadPrompts());
    });
  }

  async function insertIntoActiveTab(text) {
    // find active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        alert('No active tab found.');
        return;
      }
      const tabId = tabs[0].id;
      // inject a small function that tries several strategies to insert text into visible input
      chrome.scripting.executeScript({
        target: { tabId },
        func: (promptText) => {
          function isVisible(el) {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
          }
          function setTo(el, text) {
            if (!el) return false;
            try {
              if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text')) {
                el.focus();
                el.value = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
              if (el.isContentEditable) {
                el.focus();
                // replace text content
                // use innerText to avoid HTML injection
                el.innerText = text;
                el.dispatchEvent(new InputEvent('input', { bubbles: true }));
                return true;
              }
            } catch (e) {
              // ignore
            }
            return false;
          }

          // 1) active element
          const active = document.activeElement;
          if (active && (active.tagName === 'TEXTAREA' || active.isContentEditable || (active.tagName === 'INPUT' && active.type === 'text')) && isVisible(active)) {
            if (setTo(active, promptText)) return;
          }

          // 2) common selectors
          const selectors = [
            'textarea',
            'input[type="text"]',
            '[contenteditable="true"]'
          ];
          for (const sel of selectors) {
            const node = Array.from(document.querySelectorAll(sel)).find(isVisible);
            if (node && setTo(node, promptText)) return;
          }

          // 3) fallback: dispatch a custom event so page-level code can handle it (extension authors can implement)
          const evt = new CustomEvent('promptSaverInsert', { detail: { text: promptText }, bubbles: true, cancelable: true });
          document.dispatchEvent(evt);
        },
        args: [text]
      }, () => {
        // optional callback
      });
    });
  }

  // Event Listeners
  document.getElementById('clear').addEventListener('click', () => {
    if (confirm('Delete all saved prompts?')) {
      chrome.storage.local.set({ prompts: [] }, () => loadPrompts());
    }
  });

  document.getElementById('search').addEventListener('input', (e) => {
    loadPrompts(e.target.value);
  });

  // Initial load
  loadPrompts();

  // Storage change listener
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.prompts) loadPrompts(document.getElementById('search').value);
  });
});
