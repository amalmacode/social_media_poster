// ── Toast Notifications ────────────────────────────────────────────────────
(function () {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;max-width:360px;width:calc(100% - 2rem)';
  document.body.appendChild(container);

  const STYLES = {
    success: { border: '#86efac', bg: '#f0fdf4', text: '#166534', iconBg: '#16a34a', icon: '✓' },
    error:   { border: '#fca5a5', bg: '#fef2f2', text: '#991b1b', iconBg: '#dc2626', icon: '✕' },
    warning: { border: '#fde68a', bg: '#fffbeb', text: '#92400e', iconBg: '#d97706', icon: '⚠' },
    info:    { border: '#93c5fd', bg: '#eff6ff', text: '#1e40af', iconBg: '#2563eb', icon: 'ℹ' },
  };

  window.showToast = function (message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    const s = STYLES[type] || STYLES.info;

    const el = document.createElement('div');
    el.style.cssText = 'pointer-events:all;display:flex;align-items:flex-start;gap:0.75rem;border-radius:0.75rem;border:1px solid ' + s.border + ';background:' + s.bg + ';padding:0.75rem 1rem;box-shadow:0 4px 16px rgba(0,0,0,0.1);transform:translateX(calc(100% + 1.5rem));transition:transform 0.3s cubic-bezier(.22,.68,0,1.2),opacity 0.3s ease;opacity:0;position:relative;overflow:hidden';

    const iconEl = document.createElement('span');
    iconEl.style.cssText = 'flex-shrink:0;width:1.25rem;height:1.25rem;border-radius:50%;background:' + s.iconBg + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;margin-top:1px';
    iconEl.textContent = s.icon;

    const msgEl = document.createElement('span');
    msgEl.style.cssText = 'flex:1;font-size:0.875rem;line-height:1.45;color:' + s.text;
    msgEl.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'flex-shrink:0;background:none;border:none;cursor:pointer;color:' + s.text + ';opacity:0.45;font-size:1.1rem;line-height:1;padding:0;margin-top:-1px;transition:opacity 0.15s';
    closeBtn.addEventListener('mouseenter', function () { this.style.opacity = '0.9'; });
    closeBtn.addEventListener('mouseleave', function () { this.style.opacity = '0.45'; });
    closeBtn.addEventListener('click', dismiss);

    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;bottom:0;left:0;height:3px;background:' + s.iconBg + ';opacity:0.35;width:100%;transition:width linear ' + duration + 'ms';

    el.appendChild(iconEl);
    el.appendChild(msgEl);
    el.appendChild(closeBtn);
    el.appendChild(bar);
    container.appendChild(el);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
        bar.style.width = '0%';
      });
    });

    var timer = setTimeout(dismiss, duration);

    el.addEventListener('mouseenter', function () {
      clearTimeout(timer);
      bar.style.transition = 'none';
      bar.style.width = bar.style.width;
    });
    el.addEventListener('mouseleave', function () {
      var remaining = 1500;
      bar.style.transition = 'width linear ' + remaining + 'ms';
      bar.style.width = '0%';
      timer = setTimeout(dismiss, remaining);
    });

    function dismiss() {
      clearTimeout(timer);
      el.style.transform = 'translateX(calc(100% + 1.5rem))';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }
  };
})();

// ── Confirm Modal ─────────────────────────────────────────────────────────
window.showConfirm = function (message, okLabel) {
  okLabel = okLabel || 'Confirm';
  return new Promise(function (resolve) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:1rem;opacity:0;transition:opacity 0.2s ease';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:0.875rem;padding:1.5rem 1.75rem;max-width:400px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.25);transform:scale(0.92) translateY(8px);opacity:0;transition:transform 0.22s cubic-bezier(.22,.68,0,1.2),opacity 0.22s ease';

    var titleEl = document.createElement('p');
    titleEl.style.cssText = 'margin:0 0 0.4rem;font-size:1rem;font-weight:700;color:#16201c';
    titleEl.textContent = 'Are you sure?';

    var msgEl = document.createElement('p');
    msgEl.style.cssText = 'margin:0 0 1.4rem;font-size:0.875rem;color:#555;line-height:1.5';
    msgEl.textContent = message;

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.5rem 1.1rem;border-radius:0.5rem;border:1px solid #d1d5db;background:#fff;font-size:0.875rem;font-weight:500;cursor:pointer;color:#374151;transition:background 0.15s';
    cancelBtn.addEventListener('mouseenter', function () { this.style.background = '#f3f4f6'; });
    cancelBtn.addEventListener('mouseleave', function () { this.style.background = '#fff'; });
    cancelBtn.addEventListener('click', function () { close(false); });

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = okLabel;
    confirmBtn.style.cssText = 'padding:0.5rem 1.1rem;border-radius:0.5rem;border:none;background:#dc2626;color:#fff;font-size:0.875rem;font-weight:600;cursor:pointer;transition:background 0.15s';
    confirmBtn.addEventListener('mouseenter', function () { this.style.background = '#b91c1c'; });
    confirmBtn.addEventListener('mouseleave', function () { this.style.background = '#dc2626'; });
    confirmBtn.addEventListener('click', function () { close(true); });

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    card.appendChild(titleEl);
    card.appendChild(msgEl);
    card.appendChild(btns);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
        card.style.transform = 'scale(1) translateY(0)';
        card.style.opacity = '1';
      });
    });

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });

    function close(result) {
      card.style.transform = 'scale(0.92) translateY(8px)';
      card.style.opacity = '0';
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.remove(); resolve(result); }, 220);
    }
  });
};

// ── Media carousel selection (posts/new)
const mediaGrid = document.getElementById('media-grid');
if (mediaGrid) {
  let order = [];

  function syncSelection() {
    document.querySelectorAll('#post-form input[name="mediaIds"]').forEach((el) => el.remove());
    const form = document.getElementById('post-form');
    order.forEach((id) => {
      const el = document.createElement('input');
      el.type = 'hidden';
      el.name = 'mediaIds';
      el.value = id;
      form.appendChild(el);
    });
    mediaGrid.querySelectorAll('[data-media-card]').forEach((card) => {
      const idx = order.indexOf(card.dataset.id);
      const badge = card.querySelector('[data-order-badge]');
      const label = card.querySelector('[data-media-label]');
      badge.textContent = idx + 1;
      badge.classList.toggle('hidden', idx < 0);
      badge.classList.toggle('flex', idx >= 0);
      label.classList.toggle('border-mint', idx >= 0);
      label.classList.toggle('ring-2', idx >= 0);
      label.classList.toggle('ring-mint/30', idx >= 0);
      label.classList.toggle('border-black/10', idx < 0);
    });
    document.getElementById('sel-count').textContent = order.length;
    document.getElementById('carousel-tag').classList.toggle('hidden', order.length < 2);
  }

  mediaGrid.querySelectorAll('[data-media-cb]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (order.length >= 10) { cb.checked = false; return; }
        order.push(cb.value);
      } else {
        order = order.filter((id) => id !== cb.value);
      }
      syncSelection();
    });
  });

  document.getElementById('post-form')?.addEventListener('submit', (e) => {
    if (order.length === 0) {
      e.preventDefault();
      showToast('Please select at least one media item.', 'error');
    }
  });
}

// Flash messages from server — processed after showToast is defined
const flashScript = document.getElementById('flash-data');
if (flashScript) {
  try {
    JSON.parse(flashScript.textContent).forEach(function (f) { showToast(f.message, f.type); });
  } catch (e) { /* ignore */ }
}

const caption = document.querySelector('[data-caption]');
const count = document.querySelector('[data-caption-count]');
if (caption && count) {
  caption.addEventListener('input', () => {
    count.textContent = caption.value.length;
    count.classList.toggle('text-red-600', caption.value.length > 2200);
  });
}

// Toggle visibility: data-toggle="elementId" toggles, data-hide="elementId" always hides
console.log('[app.js] loaded, wiring data-toggle buttons:', document.querySelectorAll('[data-toggle]').length);
document.querySelectorAll('[data-toggle]').forEach((btn) => {
  console.log('[app.js] wiring toggle button ->', btn.dataset.toggle, '| target el:', document.getElementById(btn.dataset.toggle));
  btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.toggle);
    console.log('[app.js] toggle clicked, target:', btn.dataset.toggle, '| el found:', !!el, '| current classes:', el?.className);
    el?.classList.toggle('hidden');
    console.log('[app.js] after toggle, classes:', el?.className);
  });
});
document.querySelectorAll('[data-hide]').forEach((btn) => {
  btn.addEventListener('click', () => document.getElementById(btn.dataset.hide)?.classList.add('hidden'));
});

// Confirm dialogs: data-confirm="message" on forms
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await showConfirm(form.dataset.confirm, form.dataset.confirmOk || 'Delete');
    if (ok) form.submit();
  });
});

// Platform-specific fields: show when a matching platform account or brand account is selected
function updatePlatformFields() {
  const active = new Set();
  document.querySelectorAll('input[name="accounts"]:checked').forEach((i) => active.add(i.dataset.platform));
  document.querySelectorAll('input[name="brandAccountIds"]:checked').forEach((i) => {
    (i.dataset.platforms || '').split(',').filter(Boolean).forEach((p) => active.add(p));
  });
  document.querySelectorAll('[data-field]').forEach((field) => field.classList.toggle('hidden', !active.has(field.dataset.field)));
}
document.querySelectorAll('input[name="accounts"], input[name="brandAccountIds"]').forEach((input) => {
  input.addEventListener('change', updatePlatformFields);
});

document.querySelectorAll('input[name="publishMode"]').forEach((input) => {
  input.addEventListener('change', () => {
    const scheduleInput = document.querySelector('[data-schedule-input]');
    scheduleInput?.classList.toggle('hidden', input.value !== 'schedule' || !input.checked);
  });
});

// ── Crop modal ────────────────────────────────────────────────────────────
(function () {
  const modal = document.getElementById('crop-modal');
  if (!modal) return;

  const wrap    = document.getElementById('crop-wrap');
  const vid     = document.getElementById('crop-video');
  const box     = document.getElementById('crop-box');
  const form    = document.getElementById('crop-form');
  const infoEl  = document.getElementById('crop-info');
  const xIn     = document.getElementById('crop-x');
  const yIn     = document.getElementById('crop-y');
  const wIn     = document.getElementById('crop-w');
  const hIn     = document.getElementById('crop-h');

  let ratio = null;           // null = free, number = w/h
  let dragging = false, resizing = false, activeHandle = null;
  let startMX, startMY, startL, startT, startW, startH;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function applyBox(l, t, w, h) {
    const cw = wrap.offsetWidth, ch = wrap.offsetHeight;
    w = clamp(w, 20, cw);
    h = clamp(h, 20, ch);
    l = clamp(l, 0, cw - w);
    t = clamp(t, 0, ch - h);
    box.style.left   = l + 'px';
    box.style.top    = t + 'px';
    box.style.width  = w + 'px';
    box.style.height = h + 'px';
    syncInputs(l, t, w, h, cw, ch);
  }

  function syncInputs(l, t, w, h, cw, ch) {
    xIn.value = (l / cw * 100).toFixed(4);
    yIn.value = (t / ch * 100).toFixed(4);
    wIn.value = (w / cw * 100).toFixed(4);
    hIn.value = (h / ch * 100).toFixed(4);
    infoEl.textContent = `${Math.round(w / cw * 100)}% × ${Math.round(h / ch * 100)}%`;
  }

  function initBox() {
    const cw = wrap.offsetWidth, ch = wrap.offsetHeight;
    if (!cw || !ch) return;
    let w, h;
    if (ratio) {
      w = cw * 0.9; h = w / ratio;
      if (h > ch * 0.9) { h = ch * 0.9; w = h * ratio; }
    } else {
      w = cw * 0.9; h = ch * 0.9;
    }
    applyBox((cw - w) / 2, (ch - h) / 2, w, h);
  }

  // Open
  document.querySelectorAll('[data-crop]').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.action = '/posts/media/' + btn.dataset.crop + '/crop';
      vid.src = btn.dataset.cropSrc;
      vid.load();
      ratio = null;
      document.querySelectorAll('.crop-ratio-btn').forEach((b) => b.classList.remove('ring-2', 'ring-mint'));
      modal.style.display = 'flex';
      box.style.display = 'none';

      vid.addEventListener('loadeddata', () => {
        wrap.style.width  = vid.offsetWidth  + 'px';
        wrap.style.height = vid.offsetHeight + 'px';
        box.style.display = 'block';
        initBox();
      }, { once: true });
    });
  });

  // Close
  document.getElementById('crop-cancel-btn').addEventListener('click', () => {
    modal.style.display = 'none';
    vid.src = '';
  });

  // Aspect ratio presets
  document.querySelectorAll('.crop-ratio-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crop-ratio-btn').forEach((b) => b.classList.remove('ring-2', 'ring-mint'));
      btn.classList.add('ring-2', 'ring-mint');
      const r = btn.dataset.ratio;
      if (r === 'free') { ratio = null; }
      else { const [rw, rh] = r.split('/').map(Number); ratio = rw / rh; }
      initBox();
    });
  });

  // Drag — move the whole box
  box.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('crop-handle')) return;
    dragging = true;
    startMX = e.clientX; startMY = e.clientY;
    startL = parseFloat(box.style.left); startT = parseFloat(box.style.top);
    e.preventDefault();
  });

  // Resize — corner handles
  box.querySelectorAll('.crop-handle').forEach((h) => {
    h.addEventListener('mousedown', (e) => {
      resizing = true;
      activeHandle = e.currentTarget.dataset.h;
      startMX = e.clientX; startMY = e.clientY;
      startL = parseFloat(box.style.left);  startT = parseFloat(box.style.top);
      startW = parseFloat(box.style.width); startH = parseFloat(box.style.height);
      e.preventDefault(); e.stopPropagation();
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging && !resizing) return;
    const dx = e.clientX - startMX, dy = e.clientY - startMY;

    if (dragging) {
      applyBox(startL + dx, startT + dy,
               parseFloat(box.style.width), parseFloat(box.style.height));
      return;
    }

    // Resize
    let l = startL, t = startT, w = startW, h = startH;
    if (activeHandle.includes('e')) w = startW + dx;
    if (activeHandle.includes('s')) h = startH + dy;
    if (activeHandle.includes('w')) { w = startW - dx; l = startL + dx; }
    if (activeHandle.includes('n')) { h = startH - dy; t = startT + dy; }

    if (ratio) {
      if (activeHandle.includes('e') || activeHandle.includes('w')) {
        const newH = w / ratio;
        if (activeHandle.includes('n')) t = startT + startH - newH;
        h = newH;
      } else {
        const newW = h * ratio;
        if (activeHandle.includes('w')) l = startL + startW - newW;
        w = newW;
      }
    }
    applyBox(l, t, w, h);
  });

  document.addEventListener('mouseup', () => { dragging = false; resizing = false; });
})();

// ── Emoji Picker ──────────────────────────────────────────────────────────────
(function () {
  const toggle = document.getElementById('emoji-toggle');
  const picker = document.getElementById('emoji-picker');
  const textarea = document.querySelector('[data-caption]');
  if (!toggle || !picker || !textarea) return;

  const CATS = [
    { icon: '😊', label: 'Smileys', e: ['😀','😂','🤣','😊','😍','🥰','😘','😎','🤩','😁','😉','😋','🤗','🥳','😜','😆','🙃','🤭','😅','😭','😢','😤','😡','🤔','😮','😱','🤯','🥴','😴','🤑','🙄','😬','😏','🤫','🤐','😐','😑','🫠','🥹','😇','🫡','🤠'] },
    { icon: '❤️', label: 'Hearts', e: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💞','💓','💗','💖','💝','💘','💌','😻','🫶','💑','💏','💟','💔','❣️','💋','🥰','😍'] },
    { icon: '👍', label: 'Hands', e: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤙','👋','🙌','🤝','🙏','💪','🤲','👏','✊','👊','🤛','🤜','🫵','🤘','🤟','☝️','👆','👇','👉','👈','🫱','🫲','🖐️','✋','🤚'] },
    { icon: '🌸', label: 'Nature', e: ['🌸','🌺','🌻','🌹','🌷','🌱','🌿','🍀','🌴','🌊','🔥','🌙','⭐','🌟','✨','☀️','🌈','❄️','🌪️','🌩️','⛅','🦋','🐝','🐶','🐱','🐰','🐻','🦊','🐼','🦁','🐯','🦄','🌍','🌎','🌏','🏔️','🌋','🦅','🦉','🦋','🐬','🦈'] },
    { icon: '🍕', label: 'Food', e: ['🍕','🍔','🌮','🌯','🍜','🍣','🍱','🥗','🍖','🍗','🥩','🍞','🥐','🧀','🥚','🍳','🥞','🍰','🎂','🧁','🍩','🍪','🍫','🍦','🍺','🥂','🍷','☕','🧋','🥤','🧃','🍎','🍊','🍋','🍇','🍓','🥝','🍑','🥭','🍒','🥑','🌽','🍄','🫐'] },
    { icon: '⚽', label: 'Activities', e: ['⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🥊','🎮','🎵','🎶','🎸','🎹','🎺','🥁','🎤','🎭','🎬','📸','✍️','📚','🏋️','🧘','🏄','🏊','🚴','🎯','🎲','🏆','🥇','🎗️','🎪','🎠','🎡','🎢','🧗','🤸','⛷️','🏂'] },
    { icon: '✈️', label: 'Travel', e: ['✈️','🚀','🚗','🚕','🚌','🚂','⛵','🚁','🏠','🏡','🏖️','🏝️','🏔️','🗺️','🌅','🌄','🌃','🌆','🌉','🗼','🗽','🗿','🏯','🏰','⛩️','🕌','🎡','🎢','🛕','🏟️','🌁'] },
    { icon: '💡', label: 'Objects', e: ['💡','🎉','🎊','🎁','🔑','💎','💰','💳','📱','💻','📷','📹','🎥','📺','🔔','📢','📣','💬','💭','📝','📌','📎','🔗','✂️','🔧','🔨','⚙️','🧲','💊','🔭','🔬','🧪','📊','📈','📉','🏮','🪔','🧨','🪄','🎭'] },
    { icon: '✅', label: 'Symbols', e: ['✅','❌','❓','❗','⚠️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⬜','💯','🆕','🆙','🆒','🆓','✨','🌟','💫','⭐','🎆','🎇','🏅','🎖️','🎀','♻️','☑️','🔰','➕','➖','➗','✖️','🔁','🔂','▶️','⏭️','🔝','🔛','🔜','🔚'] },
  ];

  // Build picker DOM
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col';

  // Category tabs
  const tabs = document.createElement('div');
  tabs.className = 'flex border-b border-black/10 overflow-x-auto';
  tabs.style.flexShrink = '0';
  CATS.forEach((cat, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = cat.label;
    btn.textContent = cat.icon;
    btn.className = 'cat-tab flex-shrink-0 px-2.5 py-2 text-base hover:bg-black/5 transition-colors' + (i === 0 ? ' border-b-2 border-mint' : '');
    btn.dataset.cat = i;
    tabs.appendChild(btn);
  });
  wrap.appendChild(tabs);

  // Emoji grid
  const grid = document.createElement('div');
  grid.className = 'overflow-y-auto p-1.5 flex flex-wrap gap-0.5';
  grid.style.cssText = 'flex:1;min-height:0;max-height:228px;overflow-y:auto';
  wrap.appendChild(grid);

  picker.appendChild(wrap);

  let activeCat = 0;

  function renderCat(idx) {
    activeCat = idx;
    tabs.querySelectorAll('.cat-tab').forEach((t, i) => {
      t.classList.toggle('border-b-2', i === idx);
      t.classList.toggle('border-mint', i === idx);
    });
    grid.innerHTML = CATS[idx].e.map((em) =>
      `<button type="button" class="emoji-btn w-8 h-8 text-lg flex items-center justify-center rounded hover:bg-black/5 cursor-pointer" data-em="${em}">${em}</button>`
    ).join('');
  }

  renderCat(0);

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-tab');
    if (btn) renderCat(Number(btn.dataset.cat));
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-btn');
    if (!btn) return;
    const em = btn.dataset.em;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + em + textarea.value.substring(end);
    const pos = start + em.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.dispatchEvent(new Event('input'));
    textarea.focus();
  });

  function openPicker() { picker.classList.remove('hidden'); }
  function closePicker() { picker.classList.add('hidden'); }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    picker.classList.contains('hidden') ? openPicker() : closePicker();
  });

  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
      closePicker();
    }
  });
})();

const dropzone = document.querySelector('[data-dropzone]');
if (dropzone) {
  const input = dropzone.querySelector('input[type="file"]');
  const fileName = dropzone.querySelector('[data-file-name]');
  const showSelectedFile = () => {
    if (!fileName) return;
    const count = input.files?.length || 0;
    fileName.textContent = count === 0 ? 'No file selected' : count === 1 ? input.files[0].name : `${count} files selected`;
    fileName.classList.toggle('text-mint', count > 0);
  };

  input.addEventListener('change', showSelectedFile);
  ['dragenter', 'dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('border-mint', 'bg-emerald-50');
  }));
  ['dragleave', 'drop'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('border-mint', 'bg-emerald-50');
  }));
  dropzone.addEventListener('drop', (event) => {
    input.files = event.dataTransfer.files;
    showSelectedFile();
  });
}
