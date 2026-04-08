(function () {
  'use strict';

  const script = document.currentScript;
  const config = {
    projectId: script.getAttribute('data-project'),
    color: script.getAttribute('data-color') || '#6366f1',
    position: script.getAttribute('data-position') || 'bottom-right',
    style: script.getAttribute('data-style') || 'pill',
    text: script.getAttribute('data-text') || 'Feedback',
    tags: (script.getAttribute('data-tags') || 'bug,feature,improvement,question').split(',').map(t => t.trim()),
    voice: script.getAttribute('data-voice') === 'true',
    api: script.getAttribute('data-api') || '',
  };

  if (!config.projectId) {
    console.error('[SelfImprove] Missing data-project attribute');
    return;
  }

  const isLeft = config.position === 'bottom-left';
  const supportsVoice = config.voice && typeof MediaRecorder !== 'undefined';

  const host = document.createElement('div');
  host.id = 'selfimprove-widget';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // --- CSS ---
  const styles = document.createElement('style');
  styles.textContent = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

    .si-trigger{
      position:fixed;bottom:20px;${isLeft ? 'left' : 'right'}:20px;
      z-index:2147483646;display:flex;align-items:center;gap:8px;
      background:${config.color};color:#fff;border:none;cursor:pointer;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      font-size:14px;font-weight:600;line-height:1;
      box-shadow:0 4px 12px rgba(0,0,0,.15);
      transition:transform .2s,opacity .2s;
    }
    .si-trigger:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.2);}

    /* pill */
    .si-trigger--pill{border-radius:50px;padding:12px 20px;}

    /* button */
    .si-trigger--button{border-radius:10px;padding:10px 18px;}

    /* tab */
    .si-trigger--tab{
      border-radius:${isLeft ? '0 8px 8px 0' : '8px 0 0 8px'};
      padding:14px 10px;writing-mode:vertical-rl;text-orientation:mixed;
      bottom:auto;top:50%;transform:translateY(-50%);
      ${isLeft ? 'left:0' : 'right:0'};
    }
    .si-trigger--tab:hover{transform:translateY(-50%) ${isLeft ? 'translateX(2px)' : 'translateX(-2px)'};}

    .si-trigger.si-hidden{pointer-events:none;opacity:0;transform:scale(.9);}

    /* panel */
    .si-panel{
      position:fixed;bottom:80px;${isLeft ? 'left' : 'right'}:20px;
      z-index:2147483647;width:340px;max-height:400px;
      background:#fff;border-radius:16px;
      box-shadow:0 12px 40px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.05);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      display:flex;flex-direction:column;overflow:hidden;
      transform:translateY(16px);opacity:0;pointer-events:none;
      transition:transform .25s ease,opacity .25s ease;
    }
    .si-panel.si-open{transform:translateY(0);opacity:1;pointer-events:auto;}

    .si-panel__header{
      display:flex;align-items:center;justify-content:space-between;
      padding:16px;border-bottom:1px solid #f0f0f0;
    }
    .si-panel__title{font-size:15px;font-weight:700;color:#111;}
    .si-panel__close{
      background:none;border:none;cursor:pointer;color:#999;font-size:20px;
      width:28px;height:28px;display:flex;align-items:center;justify-content:center;
      border-radius:8px;transition:background .15s;
    }
    .si-panel__close:hover{background:#f5f5f5;color:#333;}

    .si-panel__body{padding:16px;overflow-y:auto;flex:1;}

    .si-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
    .si-tag{
      padding:6px 12px;border-radius:20px;border:1.5px solid #e0e0e0;
      background:#fff;cursor:pointer;font-size:12px;font-weight:500;color:#555;
      transition:all .15s;
    }
    .si-tag:hover{border-color:${config.color};color:${config.color};}
    .si-tag.si-active{
      background:${config.color};color:#fff;border-color:${config.color};
    }

    .si-textarea{
      width:100%;min-height:80px;border:1.5px solid #e0e0e0;border-radius:10px;
      padding:10px 12px;font-size:13px;font-family:inherit;resize:vertical;
      outline:none;transition:border-color .15s;color:#333;
    }
    .si-textarea::placeholder{color:#aaa;}
    .si-textarea:focus{border-color:${config.color};}

    .si-actions{display:flex;gap:8px;margin-top:12px;align-items:center;}

    .si-btn{
      flex:1;padding:10px 0;border:none;border-radius:10px;
      background:${config.color};color:#fff;font-size:13px;font-weight:600;
      cursor:pointer;transition:opacity .15s;font-family:inherit;
    }
    .si-btn:hover{opacity:.9;}
    .si-btn:disabled{opacity:.5;cursor:not-allowed;}

    .si-mic{
      width:38px;height:38px;border-radius:10px;border:1.5px solid #e0e0e0;
      background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
      transition:all .15s;flex-shrink:0;
    }
    .si-mic:hover{border-color:${config.color};}
    .si-mic.si-recording{
      background:#fee2e2;border-color:#ef4444;animation:si-pulse 1.2s infinite;
    }
    .si-mic svg{width:18px;height:18px;}

    @keyframes si-pulse{
      0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.3);}
      50%{box-shadow:0 0 0 6px rgba(239,68,68,0);}
    }

    .si-footer{
      padding:10px 16px;border-top:1px solid #f0f0f0;text-align:center;
    }
    .si-footer a{
      color:#bbb;font-size:11px;text-decoration:none;font-weight:500;
      transition:color .15s;
    }
    .si-footer a:hover{color:${config.color};}

    .si-status{
      text-align:center;padding:24px 16px;font-size:14px;color:#555;font-weight:500;
    }
    .si-status--success{color:#10b981;}

    /* tab-style panel positioning */
    .si-panel--tab{
      bottom:auto;top:50%;transform:translateY(-50%) translateX(${isLeft ? '-16px' : '16px'});
      ${isLeft ? 'left:50px' : 'right:50px'};
    }
    .si-panel--tab.si-open{transform:translateY(-50%) translateX(0);}

    /* mobile */
    @media(max-width:480px){
      .si-trigger--pill,.si-trigger--button{
        left:0;right:0;bottom:0;border-radius:0;
        justify-content:center;width:100%;
      }
      .si-trigger--tab{display:none;}
      .si-panel,.si-panel--tab{
        left:0;right:0;bottom:0;top:auto;
        width:100%;max-height:85vh;border-radius:16px 16px 0 0;
        transform:translateY(100%);
      }
      .si-panel.si-open,.si-panel--tab.si-open{transform:translateY(0);}
    }
  `;
  shadow.appendChild(styles);

  // --- Trigger button ---
  const trigger = document.createElement('button');
  trigger.className = `si-trigger si-trigger--${config.style}`;
  trigger.textContent = config.text;
  shadow.appendChild(trigger);

  // --- Panel ---
  const panel = document.createElement('div');
  panel.className = `si-panel${config.style === 'tab' ? ' si-panel--tab' : ''}`;
  panel.innerHTML = `
    <div class="si-panel__header">
      <span class="si-panel__title">${config.text}</span>
      <button class="si-panel__close" aria-label="Close">&times;</button>
    </div>
    <div class="si-panel__body">
      <div class="si-tags"></div>
      <textarea class="si-textarea" placeholder="What's on your mind?" rows="3"></textarea>
      <div class="si-actions">
        <button class="si-btn" disabled>Send</button>
      </div>
    </div>
    <div class="si-footer">
      <a href="https://selfimprove.dev" target="_blank" rel="noopener">Powered by SelfImprove</a>
    </div>
  `;
  shadow.appendChild(panel);

  // --- References ---
  const closeBtn = panel.querySelector('.si-panel__close');
  const tagsContainer = panel.querySelector('.si-tags');
  const textarea = panel.querySelector('.si-textarea');
  const sendBtn = panel.querySelector('.si-btn');
  const actionsRow = panel.querySelector('.si-actions');
  const body = panel.querySelector('.si-panel__body');

  // --- State ---
  let isOpen = false;
  let selectedTags = [];
  let recording = false;
  let mediaRecorder = null;

  // --- Tags ---
  config.tags.forEach(tag => {
    const el = document.createElement('button');
    el.className = 'si-tag';
    el.textContent = tag;
    el.addEventListener('click', () => {
      const idx = selectedTags.indexOf(tag);
      if (idx === -1) { selectedTags.push(tag); el.classList.add('si-active'); }
      else { selectedTags.splice(idx, 1); el.classList.remove('si-active'); }
      updateSendState();
    });
    tagsContainer.appendChild(el);
  });

  // --- Voice button ---
  let micBtn = null;
  if (supportsVoice) {
    micBtn = document.createElement('button');
    micBtn.className = 'si-mic';
    micBtn.title = 'Record voice feedback';
    micBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
    actionsRow.insertBefore(micBtn, sendBtn);
  }

  // --- Helpers ---
  function updateSendState() {
    sendBtn.disabled = !textarea.value.trim() && selectedTags.length === 0;
  }

  function toggle(forceOpen) {
    isOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;
    panel.classList.toggle('si-open', isOpen);
    if (config.style !== 'tab') {
      trigger.classList.toggle('si-hidden', isOpen);
    }
  }

  function resetForm() {
    textarea.value = '';
    selectedTags = [];
    tagsContainer.querySelectorAll('.si-tag').forEach(t => t.classList.remove('si-active'));
    updateSendState();
  }

  function showStatus(message, success) {
    body.innerHTML = `<div class="si-status${success ? ' si-status--success' : ''}">${message}</div>`;
    if (success) {
      setTimeout(() => {
        toggle(false);
        setTimeout(() => restoreForm(), 300);
      }, 2000);
    }
  }

  function restoreForm() {
    body.innerHTML = '';
    body.appendChild(tagsContainer);
    body.appendChild(textarea);
    body.appendChild(actionsRow);
    resetForm();
  }

  // --- Events ---
  trigger.addEventListener('click', () => toggle());
  closeBtn.addEventListener('click', () => toggle(false));
  textarea.addEventListener('input', updateSendState);

  // --- Send feedback ---
  sendBtn.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content && selectedTags.length === 0) return;

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const res = await fetch(`${config.api}/api/signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: config.projectId,
          type: 'feedback',
          content: content,
          metadata: {
            tags: selectedTags,
            page_url: window.location.href,
            user_agent: navigator.userAgent,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showStatus('Thanks! Your feedback was received.', true);
    } catch (err) {
      console.error('[SelfImprove]', err);
      showStatus('Something went wrong. Please try again.', false);
      setTimeout(() => restoreForm(), 2500);
    }
  });

  // --- Voice recording ---
  if (supportsVoice && micBtn) {
    micBtn.addEventListener('click', async () => {
      if (recording) {
        mediaRecorder.stop();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          recording = false;
          micBtn.classList.remove('si-recording');
          stream.getTracks().forEach(t => t.stop());

          if (chunks.length === 0) return;

          showStatus('Processing...', false);

          try {
            const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            const form = new FormData();
            form.append('audio', blob, 'feedback.webm');
            form.append('project_id', config.projectId);
            form.append('page_url', window.location.href);

            const res = await fetch(`${config.api}/api/voice`, {
              method: 'POST',
              body: form,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showStatus('Thanks! Voice feedback received.', true);
          } catch (err) {
            console.error('[SelfImprove]', err);
            showStatus('Failed to send recording. Please try again.', false);
            setTimeout(() => restoreForm(), 2500);
          }
        };

        mediaRecorder.start();
        recording = true;
        micBtn.classList.add('si-recording');
      } catch (err) {
        console.error('[SelfImprove] Microphone access denied:', err);
      }
    });
  }
})();
