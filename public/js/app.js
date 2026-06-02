// Media carousel selection (posts/new)
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
      alert('Please select at least one media item.');
    }
  });
}

const toastBox = document.querySelector('[data-toasts]');
if (toastBox) setTimeout(() => toastBox.remove(), 5000);

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
  form.addEventListener('submit', (e) => { if (!confirm(form.dataset.confirm)) e.preventDefault(); });
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
