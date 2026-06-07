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

// ── Watermark live preview (brand settings page) ──────────────────────────────
(function () {
  const previewImg  = document.getElementById('wm-preview-img');
  const sizeInput   = document.getElementById('wm-size');
  const opacityInput = document.getElementById('wm-opacity');
  const posSelect   = document.getElementById('wm-position');
  if (!previewImg || !sizeInput || !opacityInput || !posSelect) return;

  const sizeLabel    = document.getElementById('wm-size-label');
  const opacityLabel = document.getElementById('wm-opacity-label');

  const POS = {
    'center':       { top: '50%', left: '50%', right: '', bottom: '', transform: 'translate(-50%,-50%)' },
    'top-left':     { top: '5%',  left: '5%',  right: '', bottom: '', transform: '' },
    'top-right':    { top: '5%',  right: '5%', left: '', bottom: '', transform: '' },
    'bottom-left':  { bottom: '5%', left: '5%', top: '', right: '', transform: '' },
    'bottom-right': { bottom: '5%', right: '5%', top: '', left: '', transform: '' }
  };

  function update() {
    var size    = sizeInput.value;
    var opacity = opacityInput.value / 100;
    var pos     = POS[posSelect.value] || POS['center'];

    previewImg.style.width     = size + '%';
    previewImg.style.opacity   = opacity;
    previewImg.style.top       = pos.top    || '';
    previewImg.style.left      = pos.left   || '';
    previewImg.style.right     = pos.right  || '';
    previewImg.style.bottom    = pos.bottom || '';
    previewImg.style.transform = pos.transform || '';

    if (sizeLabel) {
      sizeLabel.textContent = size + '% of width';
      var large = parseInt(size, 10) > 30;
      sizeLabel.className = sizeLabel.className
        .replace(/bg-\S+\s+text-\S+/, large ? 'bg-amber-100 text-amber-700' : 'bg-mint/10 text-mint');
      var warn = document.getElementById('wm-size-warning');
      if (warn) warn.classList.toggle('hidden', !large);
    }
    if (opacityLabel) opacityLabel.textContent = Math.round(opacity * 100) + '%';
  }

  sizeInput.addEventListener('input', update);
  opacityInput.addEventListener('input', update);
  posSelect.addEventListener('change', update);
  update();

  // Format toggle (16:9 / 1:1 / 9:16)
  var preview = document.getElementById('wm-preview');
  document.querySelectorAll('.wm-fmt-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.wm-fmt-btn').forEach(function (b) {
        b.className = b.className.replace('bg-ink text-white', 'bg-black/8 text-black/50 hover:bg-black/12');
      });
      btn.className = btn.className.replace('bg-black/8 text-black/50 hover:bg-black/12', 'bg-ink text-white');
      if (preview) preview.style.aspectRatio = btn.dataset.ratio;
      update(); // reapply position after resize
    });
  });
})();

// Auto-reload when any media item is still being processed (crop in progress)
if (document.querySelector('[data-media-processing]')) {
  setTimeout(() => location.reload(), 4000);
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

  // Show watermark toggle if any selected brand has a watermark
  const wmRow = document.getElementById('watermark-toggle-row');
  if (wmRow) {
    const anyWatermark = Array.from(document.querySelectorAll('input[name="brandAccountIds"]:checked'))
      .some((i) => i.dataset.hasWatermark === '1');
    wmRow.classList.toggle('hidden', !anyWatermark);
  }
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

// ── Image Crop modal ──────────────────────────────────────────────────────────
(function () {
  const modal  = document.getElementById('img-crop-modal');
  if (!modal) return;
  const wrap   = document.getElementById('img-crop-wrap');
  const img    = document.getElementById('img-crop-img');
  const box    = document.getElementById('img-crop-box');
  const form   = document.getElementById('img-crop-form');
  const infoEl = document.getElementById('img-crop-info');
  const xIn    = document.getElementById('img-crop-x');
  const yIn    = document.getElementById('img-crop-y');
  const wIn    = document.getElementById('img-crop-w');
  const hIn    = document.getElementById('img-crop-h');

  let ratio = null;
  let dragging = false, resizing = false, activeHandle = null;
  let startMX, startMY, startL, startT, startW, startH;
  let naturalW = 0, naturalH = 0;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function applyBox(l, t, w, h) {
    const cw = wrap.offsetWidth, ch = wrap.offsetHeight;
    w = clamp(w, 20, cw); h = clamp(h, 20, ch);
    l = clamp(l, 0, cw - w); t = clamp(t, 0, ch - h);
    box.style.left = l + 'px'; box.style.top  = t + 'px';
    box.style.width = w + 'px'; box.style.height = h + 'px';
    xIn.value = (l / cw * 100).toFixed(4);
    yIn.value = (t / ch * 100).toFixed(4);
    wIn.value = (w / cw * 100).toFixed(4);
    hIn.value = (h / ch * 100).toFixed(4);
    if (naturalW && naturalH) {
      infoEl.textContent = Math.round(w / cw * naturalW) + ' × ' + Math.round(h / ch * naturalH) + ' px';
    } else {
      infoEl.textContent = Math.round(w / cw * 100) + '% × ' + Math.round(h / ch * 100) + '%';
    }
  }

  function initBox() {
    const cw = wrap.offsetWidth, ch = wrap.offsetHeight;
    if (!cw || !ch) return;
    var w, h;
    if (ratio) {
      w = cw * 0.9; h = w / ratio;
      if (h > ch * 0.9) { h = ch * 0.9; w = h * ratio; }
    } else { w = cw * 0.9; h = ch * 0.9; }
    applyBox((cw - w) / 2, (ch - h) / 2, w, h);
  }

  function openModal(btn) {
    form.action = '/posts/media/' + btn.dataset.cropImage + '/crop-image';
    naturalW = parseInt(btn.dataset.imgW, 10) || 0;
    naturalH = parseInt(btn.dataset.imgH, 10) || 0;
    ratio = null;
    document.querySelectorAll('.img-crop-ratio-btn').forEach(function (b) { b.classList.remove('ring-2', 'ring-mint'); });
    img.src = btn.dataset.cropSrc;
    box.style.display = 'none';
    modal.style.display = 'flex';

    function onLoad() {
      wrap.style.width  = img.offsetWidth  + 'px';
      wrap.style.height = img.offsetHeight + 'px';
      box.style.display = 'block';
      initBox();
    }
    if (img.complete && img.naturalWidth) { onLoad(); }
    else { img.onload = onLoad; }
  }

  document.querySelectorAll('[data-crop-image]').forEach(function (btn) {
    btn.addEventListener('click', function () { openModal(btn); });
  });

  document.getElementById('img-crop-cancel-btn').addEventListener('click', function () {
    modal.style.display = 'none'; img.src = '';
  });

  document.querySelectorAll('.img-crop-ratio-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.img-crop-ratio-btn').forEach(function (b) { b.classList.remove('ring-2', 'ring-mint'); });
      btn.classList.add('ring-2', 'ring-mint');
      var r = btn.dataset.imgRatio;
      if (r === 'free') { ratio = null; }
      else { var parts = r.split('/').map(Number); ratio = parts[0] / parts[1]; }
      initBox();
    });
  });

  box.addEventListener('mousedown', function (e) {
    if (e.target.classList.contains('img-crop-handle')) return;
    dragging = true;
    startMX = e.clientX; startMY = e.clientY;
    startL = parseFloat(box.style.left); startT = parseFloat(box.style.top);
    e.preventDefault();
  });

  box.querySelectorAll('.img-crop-handle').forEach(function (h) {
    h.addEventListener('mousedown', function (e) {
      resizing = true; activeHandle = e.currentTarget.dataset.h;
      startMX = e.clientX; startMY = e.clientY;
      startL = parseFloat(box.style.left);  startT = parseFloat(box.style.top);
      startW = parseFloat(box.style.width); startH = parseFloat(box.style.height);
      e.preventDefault(); e.stopPropagation();
    });
  });

  document.addEventListener('mousemove', function (e) {
    if (modal.style.display === 'none') return;
    if (!dragging && !resizing) return;
    var dx = e.clientX - startMX, dy = e.clientY - startMY;
    if (dragging) { applyBox(startL + dx, startT + dy, parseFloat(box.style.width), parseFloat(box.style.height)); return; }
    var l = startL, t = startT, w = startW, h = startH;
    if (activeHandle.includes('e')) w = startW + dx;
    if (activeHandle.includes('s')) h = startH + dy;
    if (activeHandle.includes('w')) { w = startW - dx; l = startL + dx; }
    if (activeHandle.includes('n')) { h = startH - dy; t = startT + dy; }
    if (ratio) {
      if (activeHandle.includes('e') || activeHandle.includes('w')) {
        var newH = w / ratio;
        if (activeHandle.includes('n')) t = startT + startH - newH;
        h = newH;
      } else {
        var newW = h * ratio;
        if (activeHandle.includes('w')) l = startL + startW - newW;
        w = newW;
      }
    }
    applyBox(l, t, w, h);
  });

  document.addEventListener('mouseup', function () { dragging = false; resizing = false; });
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

const uploadForm = document.querySelector('form[action*="/posts/media"]');
if (uploadForm) {
  const dropzone = uploadForm.querySelector('[data-dropzone]');
  const input = uploadForm.querySelector('input[type="file"]');
  const fileName = uploadForm.querySelector('[data-file-name]');
  const btn = uploadForm.querySelector('button[type="submit"], button:not([type])');

  const MAX_FILE_BYTES = 250 * 1024 * 1024;  // 250 MB — matches server limit
  const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB total batch limit

  // Inject error banner and progress bar after the form
  const errorBanner = document.createElement('div');
  errorBanner.className = 'mt-2 hidden rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700';
  uploadForm.insertAdjacentElement('afterend', errorBanner);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'mt-2 hidden';
  progressWrap.innerHTML =
    '<div class="mb-1 flex items-center justify-between text-xs text-black/50">' +
      '<span data-upload-label>Uploading…</span><span data-upload-pct>0%</span>' +
    '</div>' +
    '<div class="h-1.5 w-full overflow-hidden rounded-full bg-black/10">' +
      '<div class="h-1.5 rounded-full bg-mint transition-all duration-300" style="width:0%" data-upload-bar></div>' +
    '</div>';
  errorBanner.insertAdjacentElement('afterend', progressWrap);

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
    progressWrap.classList.add('hidden');
    btn.disabled = false;
    btn.textContent = 'Upload';
  }

  function setProgress(pct, label) {
    progressWrap.classList.remove('hidden');
    errorBanner.classList.add('hidden');
    progressWrap.querySelector('[data-upload-pct]').textContent = pct + '%';
    progressWrap.querySelector('[data-upload-bar]').style.width = pct + '%';
    if (label) progressWrap.querySelector('[data-upload-label]').textContent = label;
  }

  const updateFileLabel = () => {
    if (!fileName) return;
    const count = input.files ? input.files.length : 0;
    fileName.textContent = count === 0 ? 'No file selected' : count === 1 ? input.files[0].name : count + ' files selected';
    fileName.classList.toggle('text-mint', count > 0);
    errorBanner.classList.add('hidden');
  };

  input.addEventListener('change', updateFileLabel);

  if (dropzone) {
    ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('border-mint', 'bg-emerald-50');
    }));
    ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint', 'bg-emerald-50');
    }));
    dropzone.addEventListener('drop', (e) => {
      input.files = e.dataTransfer.files;
      updateFileLabel();
    });
  }

  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    errorBanner.classList.add('hidden');

    const files = Array.from(input.files || []);
    if (!files.length) return showError('Please select at least one file.');

    // Per-file size check
    const oversized = files.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) return showError('"' + oversized.name + '" is too large — maximum 250 MB per file.');

    // Total batch size check
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      const mb = Math.round(totalBytes / 1024 / 1024);
      return showError('Total upload size (' + mb + ' MB) exceeds the 500 MB batch limit. Upload fewer files at a time.');
    }

    btn.disabled = true;
    btn.textContent = 'Uploading…';
    setProgress(0, 'Uploading…');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadForm.getAttribute('action'));
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.timeout = 600000; // 10 min ceiling — very large files still get time

    xhr.upload.addEventListener('progress', (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      setProgress(pct, pct < 100 ? 'Uploading…' : 'Processing…');
    });

    xhr.addEventListener('load', () => {
      progressWrap.classList.add('hidden');
      btn.disabled = false;
      btn.textContent = 'Upload';

      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (_) { /* non-JSON response */ }

      if (xhr.status >= 200 && xhr.status < 300 && data !== null && !data.error) {
        // Reload to display the newly uploaded media; flash messages come via session
        window.location.href = '/posts/new';
      } else {
        const msg = data && data.error
          ? data.error
          : 'Upload failed (HTTP ' + xhr.status + '). The files may be too large or the request timed out. Try uploading fewer files at once.';
        showError(msg);
      }
    });

    xhr.addEventListener('error', () => {
      progressWrap.classList.add('hidden');
      showError('Upload failed — connection lost or the files exceeded the server’s size limit. Try uploading fewer or smaller files.');
    });

    xhr.addEventListener('timeout', () => {
      progressWrap.classList.add('hidden');
      showError('Upload timed out. Your videos may be too large — try uploading one at a time.');
    });

    xhr.send(new FormData(uploadForm));
  });
}

// ── Media folder library ────────────────────────────────────────────────────

(function () {
  const folderTabs = document.getElementById('folder-tabs');
  if (!folderTabs) return;

  const mediaGrid    = document.getElementById('media-grid');
  const folderSelect = document.getElementById('upload-folder-select');
  const STORAGE_KEY  = 'mediaLib_activeFolderId';

  function csrf() { return window.__csrfToken || ''; }
  function getFolders() { return window.__folders || []; }
  function activeFolderId() { return sessionStorage.getItem(STORAGE_KEY) || diversFolderId(); }
  function diversFolderId() { const d = getFolders().find((f) => f.type === 'divers'); return d ? d.id : ''; }
  function getTab(folderId) { return folderTabs.querySelector('[data-folder-tab][data-folder-id="' + folderId + '"]'); }

  function filterGrid(folderId) {
    sessionStorage.setItem(STORAGE_KEY, folderId);
    document.querySelectorAll('[data-media-card]').forEach((card) => {
      card.classList.toggle('hidden', card.dataset.folderId !== folderId);
    });
    if (folderSelect) folderSelect.value = folderId;
  }

  function activateTab(folderId) {
    folderTabs.querySelectorAll('[data-folder-tab]').forEach((t) => {
      const active = t.dataset.folderId === folderId;
      t.classList.toggle('border-mint',    active);
      t.classList.toggle('text-mint',      active);
      t.classList.toggle('border-black/10', !active);
      t.classList.toggle('text-black/60',   !active);
    });
    filterGrid(folderId);
  }

  function bumpCount(folderId, delta) {
    const tab = getTab(folderId);
    if (!tab) return;
    const badge = tab.querySelector('[data-folder-count]');
    if (badge) badge.textContent = Math.max(0, (parseInt(badge.textContent) || 0) + delta);
  }

  function buildMoveMenu(menu, currentFolderId, mediaId) {
    menu.innerHTML = '';
    getFolders().forEach((f) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'block w-full px-3 py-1.5 text-left text-xs hover:bg-black/5' +
        (f.id === currentFolderId ? ' font-semibold text-mint' : ' text-black/70');
      btn.textContent = f.name;
      if (f.id === currentFolderId) btn.disabled = true;
      btn.addEventListener('click', () => moveMedia(mediaId, f.id, menu));
      menu.appendChild(btn);
    });
  }

  function moveMedia(mediaId, targetFolderId, menu) {
    menu.classList.add('hidden');
    fetch('/posts/media/' + mediaId + '/folder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf(), 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ folderId: targetFolderId })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        const card = document.querySelector('[data-media-card][data-id="' + mediaId + '"]');
        if (!card) return;
        const prevFolder = card.dataset.folderId;
        card.dataset.folderId = targetFolderId;
        bumpCount(prevFolder, -1);
        bumpCount(targetFolderId, +1);
        if (activeFolderId() !== targetFolderId) card.classList.add('hidden');
      })
      .catch(() => {});
  }

  // ── folder tab clicks ────────────────────────────────────────────────────

  folderTabs.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-delete-folder]');
    if (delBtn) {
      e.stopPropagation();
      const tab = delBtn.closest('[data-folder-tab]');
      if (!tab) return;
      const folderId = tab.dataset.folderId;
      const name = decodeURIComponent(tab.dataset.folderName || '');
      if (!confirm('Delete folder "' + name + '"? Its media will move to DIVERS.')) return;
      fetch('/posts/folders/' + folderId, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrf(), 'X-Requested-With': 'XMLHttpRequest' }
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { alert(data.error); return; }
          const divers = diversFolderId();
          const count = parseInt(tab.querySelector('[data-folder-count]') && tab.querySelector('[data-folder-count]').textContent) || 0;
          document.querySelectorAll('[data-media-card][data-folder-id="' + folderId + '"]').forEach((c) => {
            c.dataset.folderId = divers;
          });
          bumpCount(divers, count);
          window.__folders = getFolders().filter((f) => f.id !== folderId);
          tab.remove();
          if (folderSelect) { const opt = folderSelect.querySelector('option[value="' + folderId + '"]'); if (opt) opt.remove(); }
          activateTab(divers);
        })
        .catch(() => {});
      return;
    }
    const tab = e.target.closest('[data-folder-tab]');
    if (tab) activateTab(tab.dataset.folderId);
  });

  // ── new folder form ──────────────────────────────────────────────────────

  const newFolderBtn    = document.getElementById('new-folder-btn');
  const newFolderForm   = document.getElementById('new-folder-form');
  const newFolderInput  = document.getElementById('new-folder-input');
  const newFolderSubmit = document.getElementById('new-folder-submit');
  const newFolderCancel = document.getElementById('new-folder-cancel');

  if (newFolderBtn) {
    newFolderBtn.addEventListener('click', () => {
      newFolderBtn.classList.add('hidden');
      newFolderForm.classList.remove('hidden');
      newFolderInput.value = '';
      newFolderInput.focus();
    });
    newFolderCancel.addEventListener('click', () => {
      newFolderForm.classList.add('hidden');
      newFolderBtn.classList.remove('hidden');
    });
    newFolderInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') newFolderSubmit.click();
      if (e.key === 'Escape') newFolderCancel.click();
    });
    newFolderSubmit.addEventListener('click', () => {
      const name = newFolderInput.value.trim();
      if (!name) return;
      newFolderSubmit.disabled = true;
      fetch('/posts/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf(), 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name })
      })
        .then((r) => r.json())
        .then((data) => {
          newFolderSubmit.disabled = false;
          if (data.error) { newFolderInput.classList.add('border-red-400'); newFolderInput.title = data.error; return; }
          const folder = data.folder;
          window.__folders = [...getFolders(), folder];
          const tab = document.createElement('button');
          tab.type = 'button';
          tab.className = 'group flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black/60 transition-colors hover:border-black/25 hover:text-black';
          tab.dataset.folderTab  = '';
          tab.dataset.folderId   = folder.id;
          tab.dataset.folderType = 'custom';
          tab.dataset.folderName = encodeURIComponent(folder.name);
          tab.innerHTML = '🗂 ' + folder.name +
            ' <span class="rounded-full bg-black/8 px-1.5 py-0 leading-4" data-folder-count>0</span>' +
            ' <span class="ml-0.5 hidden text-black/30 hover:text-red-500 group-hover:inline" data-delete-folder title="Delete folder">&times;</span>';
          newFolderBtn.insertAdjacentElement('beforebegin', tab);
          if (folderSelect) { const opt = document.createElement('option'); opt.value = folder.id; opt.textContent = folder.name; folderSelect.appendChild(opt); }
          newFolderForm.classList.add('hidden');
          newFolderBtn.classList.remove('hidden');
          newFolderInput.classList.remove('border-red-400');
          activateTab(folder.id);
        })
        .catch(() => { newFolderSubmit.disabled = false; });
    });
  }

  // ── move buttons on media cards ──────────────────────────────────────────

  mediaGrid && mediaGrid.addEventListener('click', (e) => {
    const moveBtn = e.target.closest('[data-move-btn]');
    if (!moveBtn) return;
    e.stopPropagation();
    const wrap  = moveBtn.closest('[data-move-wrap]');
    const card  = moveBtn.closest('[data-media-card]');
    const menu  = wrap.querySelector('[data-move-menu]');
    const mediaId = card.dataset.id;
    const currentFolderId = card.dataset.folderId;
    document.querySelectorAll('[data-move-menu]').forEach((m) => { if (m !== menu) m.classList.add('hidden'); });
    if (menu.classList.contains('hidden')) {
      buildMoveMenu(menu, currentFolderId, mediaId);
      menu.classList.remove('hidden');
    } else {
      menu.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-move-wrap]')) {
      document.querySelectorAll('[data-move-menu]').forEach((m) => m.classList.add('hidden'));
    }
  });

  // ── init ─────────────────────────────────────────────────────────────────

  const saved = sessionStorage.getItem(STORAGE_KEY);
  const valid = getFolders().find((f) => f.id === saved);
  activateTab(valid ? saved : diversFolderId());
})();
