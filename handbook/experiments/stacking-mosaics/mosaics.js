/* Progressive enhancement scoped to the mosaic experiment. No motion/timers. */
(() => {
  'use strict';
  const root = document.querySelector('[data-mosaic-page]');
  if (!root) return;
  const data = JSON.parse(root.querySelector('#mosaic-data').textContent);
  const base = 'handbook/experiments/stacking-mosaics/';
  const load = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = base + src;
  });
  const whenVisible = (element, start) => {
    if (!('IntersectionObserver' in window)) { start(); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
    }, {rootMargin: '300px'});
    observer.observe(element);
  };
  const coverage = root.querySelector('.mosaic-coverage');
  whenVisible(coverage, () => Promise.all([...coverage.querySelectorAll('[data-layer]')].map(img =>
    load(img.getAttribute('src').split('/').pop())
  )).then(() => {
    coverage.querySelectorAll('[data-engine]').forEach(input => {
      input.disabled = false;
      input.addEventListener('change', () => {
        coverage.querySelector(`[data-layer="${input.dataset.engine}"]`).hidden = !input.checked;
      });
    });
  }).catch(() => { /* The labelled initial static figure remains. */ }));

  root.querySelectorAll('[data-comparison]').forEach(figure => {
    const fallback = figure.querySelector('.mosaic-static');
    const enhanced = figure.querySelector('.mosaic-enhanced');
    const wipe = figure.querySelector('.mosaic-wipe');
    const slider = figure.querySelector('input[type="range"]');
    const before = figure.querySelector('.mosaic-before');
    const after = figure.querySelector('.mosaic-after');
    const status = figure.querySelector('.mosaic-error');
    const metric = figure.querySelector('.mosaic-metric');
    let version = 0;
    const divide = () => {
      after.style.clipPath = `inset(0 0 0 ${slider.value}%)`;
      wipe.style.setProperty('--divider', `${slider.value}%`);
      slider.setAttribute('aria-valuetext', `${slider.value}% from left`);
    };
    slider.addEventListener('input', divide);
    // Native range supplies Arrow/Home/End support and touch dragging. The
    // image itself never intercepts gestures, preserving normal page scrolling.
    const update = async () => {
      const request = ++version;
      let a, b, labels, value = '';
      if (figure.dataset.comparison === 'blend') {
        const night = data.nights.find(n => n.id === figure.querySelector('[data-night]').value);
        const rejected = figure.querySelector('[data-rejected]').checked;
        a = `blend-${night.id}-100-matched.webp`;
        b = `blend-${night.id}-25-${rejected ? 'unmatched' : 'matched'}.webp`;
        labels = [`${night.name}: 100 px, overlap normalisation on`,
          `25 px, overlap normalisation ${rejected ? 'off (rejected; C14)' : 'on'}`];
        if (!rejected) value = `${night.feather_2_4_pct}% in 2–4 px noise (C11), same frames.`;
      } else {
        const zoom = figure.querySelector('[data-zoom]').checked ? 'zoom-' : '';
        a = `pelican-${zoom}with.webp`;
        b = `pelican-${zoom}without.webp`;
        labels = ['With the Pelican night (run 304)', 'Without the Pelican night (run 305)'];
      }
      // Hide the old pair and its numbers immediately; selection and labels
      // become visible together only after both new images have loaded.
      enhanced.querySelector('.mosaic-pair-labels').textContent = '';
      metric.textContent = '';
      wipe.hidden = true;
      slider.disabled = true;
      status.textContent = 'Loading comparison…';
      try {
        const [left, right] = await Promise.all([load(a), load(b)]);
        if (request !== version) return;
        if (left.naturalWidth !== right.naturalWidth || left.naturalHeight !== right.naturalHeight) throw new Error('Unaligned pair');
        before.src = left.src; after.src = right.src;
        before.alt = labels[0]; after.alt = labels[1];
        before.width = after.width = left.naturalWidth;
        before.height = after.height = left.naturalHeight;
        enhanced.querySelector('.mosaic-pair-labels').textContent = labels.join(' / ');
        metric.textContent = value;
        divide();
        wipe.hidden = false; slider.disabled = false;
        fallback.hidden = true; enhanced.hidden = false;
        status.textContent = '';
      } catch (_) {
        if (request !== version) return;
        fallback.hidden = false;
        // Keep selectors available for recovery, but hide the unavailable pair.
        enhanced.hidden = false;
        status.textContent = 'Comparison could not load. The original labelled static pair is shown above the controls. Choose another setting to retry.';
      }
    };
    figure.querySelectorAll('select, input[type="checkbox"]').forEach(control => control.addEventListener('change', update));
    whenVisible(figure, update);
  });
})();
