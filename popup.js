// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('list');

  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function render(prompts) {
    listEl.innerHTML = '';
    if (!prompts || prompts.length === 0) {
      listEl.innerHTML = '<div class="small">No prompts saved yet.</div>';
      return;
    }
    prompts.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'item';

      const textWrap = document.createElement('div');
      textWrap.style.flex = '1';
      const txt = document.createElement('div');
      txt.className = 'text';
      txt.textContent = p.text;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${p.site || 'local'} — ${fmtTime(p.ts)}`;

      textWrap.appendChild(txt);
      textWrap.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'actions';
      // Insert button
      const insertBtn = document.createElement('button');
      insertBtn.className = 'action';
      insertBtn.textContent = 'Insert';
      insertBtn.title = 'Insert into the active chat input';
      insertBtn.addEventListener('click', () => insertIntoActiveTab(p.text));

      // Copy button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'ghost';
      copyBtn.textContent = 'Copy';
      copyBtn.title = 'Copy to clipboard';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(p.text);
          copyBtn.textContent = 'Copied';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 900);
        } catch (err) {
          console.error('Clipboard failed', err);
          alert('Copy failed. Try selecting text manually.');
        }
      });

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'ghost';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        deletePrompt(idx);
      });

      actions.appendChild(insertBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(textWrap);
      item.appendChild(actions);
      listEl.appendChild(item);
    });
  }

  function loadPrompts() {
    chrome.storage.local.get({ prompts: [] }, (data) => {
        const container = document.getElementById("prompts");
        container.innerHTML = "";

        if (data.prompts.length === 0) {
            container.innerHTML = "<p>No prompts saved yet.</p>";
            return;
        }

        data.prompts.forEach((p, i) => {
            const div = document.createElement("div");
            div.className = "prompt";
            div.textContent = p.text;
            
            // Add timestamp if available
            if (p.timestamp) {
                const meta = document.createElement("div");
                meta.className = "meta";
                meta.textContent = new Date(p.timestamp).toLocaleString();
                div.appendChild(meta);
            }

            // Add click handlers
            div.addEventListener("click", () => {
                navigator.clipboard.writeText(p.text);
                alert("Prompt copied!");
            });
            
            container.appendChild(div);
        });
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

  document.getElementById("clear").addEventListener("click", () => {
    chrome.storage.local.set({ prompts: [] }, loadPrompts);
  });

  document.getElementById("search").addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    chrome.storage.local.get({ prompts: [] }, (data) => {
      const container = document.getElementById("prompts");
      container.innerHTML = "";
      data.prompts
          .filter((p) => p.text.toLowerCase().includes(term))
          .forEach((p) => {
              const div = document.createElement("div");
              div.className = "prompt";
              div.textContent = p.text;
              container.appendChild(div);
          });
    });
  });

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

  // initial load
  loadPrompts();

  // refresh when storage changes (sync across other extension pages)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.prompts) loadPrompts();
  });
});
