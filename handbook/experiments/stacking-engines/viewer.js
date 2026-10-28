/* Static matched-display viewer. No server, analytics, or secret blind key. */
(() => {
  'use strict';
  const root = document.getElementById('stack-viewer');
  if (!root) return;
  const data = JSON.parse(document.getElementById('stack-data').textContent).datasets;
  const names = ['Siril', 'WBPP', 'StackingWizard', 'SyQon'];
  const colors = ['#0072B2', '#D55E00', '#009E73', '#CC79A7'];
  const target = document.getElementById('stack-target');
  const view = document.getElementById('stack-view');
  const status = document.getElementById('stack-status');
  const panels = root.querySelector('.stack-panels');
  const tabs = document.getElementById('stack-tabs');
  const blindButton = document.getElementById('stack-blind');
  const panButton = document.getElementById('stack-pan');
  let blind = false, pan = false, zoom = 1, px = 0, py = 0, marker = null, focus = 0;
  let generation = 0;
  const orders = {};
  function orderFor(id) {
    if (orders[id]) return orders[id];
    const key = 'stack-order-v1-' + id;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key));
      if (Array.isArray(saved) && saved.length === 4 && new Set(saved).size === 4 && saved.every(n => Number.isInteger(n) && n >= 0 && n < 4)) return (orders[id] = saved);
    } catch (_) { /* Storage is optional. */ }
    const order = [0, 1, 2, 3];
    let seed = [...id].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) >>> 0;
    for (let i = 3; i > 0; i--) {
      let r;
      try { r = crypto.getRandomValues(new Uint32Array(1))[0]; }
      catch (_) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; r = seed; }
      const j = r % (i + 1); [order[i], order[j]] = [order[j], order[i]];
    }
    try { sessionStorage.setItem(key, JSON.stringify(order)); } catch (_) { /* Seeded fallback remains usable. */ }
    return (orders[id] = order);
  }
  function transforms() {
    const limit = (zoom - 1) / (2 * zoom);
    px = Math.max(-limit, Math.min(limit, px)); py = Math.max(-limit, Math.min(limit, py));
    panels.querySelectorAll('.stack-plane').forEach(el => {
      el.style.transform = `translate(${px * zoom * 100}%,${py * zoom * 100}%) scale(${zoom})`;
      const mark = el.querySelector('.stack-marker');
      mark.hidden = !marker;
      if (marker) { mark.style.left = `${marker.x * 100}%`; mark.style.top = `${marker.y * 100}%`; }
    });
    document.getElementById('stack-zoom').textContent = zoom + '×';
    document.getElementById('stack-in').disabled = zoom >= 4;
    document.getElementById('stack-out').disabled = zoom <= 1;
  }
  function setZoom(value) { zoom = Math.max(1, Math.min(4, value)); transforms(); }
  function selectPanel(index) {
    focus = (index + 4) % 4;
    [...panels.children].forEach((p, i) => p.classList.toggle('stack-active', i === focus));
    [...tabs.children].forEach((t, i) => t.setAttribute('aria-pressed', String(i === focus)));
  }
  function render() {
    const token = ++generation;
    const entry = data[target.value].views[view.value];
    root.classList.toggle('stack-detail', view.value !== 'full');
    panels.replaceChildren(); tabs.replaceChildren();
    const order = blind ? orderFor(target.value) : [0, 1, 2, 3];
    let loaded = 0, failed = false;
    status.textContent = `Loading four matched panels… ${entry.tiles[0].width} × ${entry.tiles[0].height} display pixels; maximum 4×.`;
    order.forEach((engine, index) => {
      const title = blind ? String.fromCharCode(65 + index) : names[engine];
      const tab = document.createElement('button'); tab.type = 'button'; tab.textContent = title;
      tab.addEventListener('click', () => selectPanel(index)); tabs.append(tab);
      const figure = document.createElement('figure');
      if (!blind) figure.style.setProperty('--engine', colors[engine]);
      const caption = document.createElement('figcaption'); caption.textContent = title;
      const surface = document.createElement('div'); surface.className = 'stack-surface';
      surface.tabIndex = 0; surface.setAttribute('role', 'group'); surface.setAttribute('aria-label', title + ' image; shared pan and zoom');
      surface.setAttribute('aria-describedby', 'stack-help');
      surface.style.aspectRatio = `${entry.tiles[engine].width} / ${entry.tiles[engine].height}`;
      const plane = document.createElement('div'); plane.className = 'stack-plane';
      const img = document.createElement('img'); img.alt = title + ' matched sky'; img.draggable = false;
      img.width = entry.tiles[engine].width; img.height = entry.tiles[engine].height;
      img.addEventListener('load', () => {
        if (token !== generation || failed) return;
        if (++loaded === 4) status.textContent = `${img.width} × ${img.height} display pixels; ${view.value === 'full' ? 'compressed common-footprint overview' : 'lossless native crop'}. Maximum 4×.`;
      });
      img.addEventListener('error', () => {
        if (token !== generation) return;
        failed = true; status.textContent = 'An image could not load. Change target or view to retry; original static figures remain below.';
      });
      img.src = root.dataset.base + entry.tiles[engine].src;
      const mark = document.createElement('span'); mark.className = 'stack-marker'; mark.hidden = true;
      mark.setAttribute('aria-hidden', 'true'); plane.append(img, mark); surface.append(plane); figure.append(caption, surface); panels.append(figure);
      let start = null;
      surface.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        start = {x: ev.clientX, y: ev.clientY, px, py};
        if (pan) surface.setPointerCapture(ev.pointerId);
      });
      surface.addEventListener('pointermove', ev => {
        if (!start && ev.pointerType === 'mouse') {
          const rect = plane.getBoundingClientRect();
          marker = {x: (ev.clientX - rect.left) / rect.width, y: (ev.clientY - rect.top) / rect.height}; transforms();
        }
        if (!pan || !start || !surface.hasPointerCapture(ev.pointerId)) return;
        const rect = surface.getBoundingClientRect();
        px = start.px + (ev.clientX - start.x) / rect.width / zoom;
        py = start.py + (ev.clientY - start.y) / rect.height / zoom; transforms();
      });
      surface.addEventListener('pointerup', ev => {
        if (!start) return;
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        if (Math.hypot(dx, dy) < 8) {
          const rect = plane.getBoundingClientRect();
          marker = {x: Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))}; transforms();
        } else if (!pan && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) selectPanel(focus + (dx < 0 ? 1 : -1));
        start = null;
      });
      surface.addEventListener('pointercancel', () => { start = null; });
      surface.addEventListener('keydown', ev => {
        const delta = {ArrowLeft: [.08, 0], ArrowRight: [-.08, 0], ArrowUp: [0, .08], ArrowDown: [0, -.08]}[ev.key];
        if (delta) { ev.preventDefault(); px += delta[0] / zoom; py += delta[1] / zoom; transforms(); }
        if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); setZoom(zoom + 1); }
        if (ev.key === '-') { ev.preventDefault(); setZoom(zoom - 1); }
        if (ev.key === 'Escape') { marker = null; transforms(); }
      });
    });
    selectPanel(focus); transforms();
  }
  function reset() { zoom = 1; px = py = 0; marker = null; }
  target.addEventListener('change', () => { reset(); render(); });
  view.addEventListener('change', () => { reset(); render(); });
  blindButton.addEventListener('click', () => {
    blind = !blind; blindButton.setAttribute('aria-pressed', String(blind));
    blindButton.textContent = blind ? 'Reveal engine names' : 'Hide engine names';
    document.getElementById('stack-blind-note').hidden = !blind; render();
  });
  panButton.addEventListener('click', () => {
    pan = !pan; root.classList.toggle('stack-pan-enabled', pan);
    panButton.setAttribute('aria-pressed', String(pan)); panButton.textContent = pan ? 'Disable pan mode' : 'Enable pan mode';
  });
  document.getElementById('stack-in').addEventListener('click', () => setZoom(zoom + 1));
  document.getElementById('stack-out').addEventListener('click', () => setZoom(zoom - 1));
  document.getElementById('stack-reset').addEventListener('click', () => { reset(); transforms(); });
  root.hidden = false;
  // Only the active view loads, when the viewer reaches the viewport. Browser HTTP cache handles revisits.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { render(); observer.disconnect(); }
    }); observer.observe(root);
  } else render();
})();
