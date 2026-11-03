/* Progressive enhancement only. The source lists and chart remain useful without JS. */
(() => {
  const root = document.querySelector('.public-images');
  if (!root) return;
  const plate = root.querySelector('.public-plate');
  const tiles = plate ? [...plate.querySelectorAll('[data-catalogue]')] : [];
  function pack() {
    if (!plate) return;
    const width = plate.clientWidth;
    const cols = width >= 1450 ? 16 : width >= 1100 ? 12 : width >= 850 ? 8 : width >= 560 ? 6 : 4;
    plate.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
    for (const fact of plate.querySelectorAll('.plate-fact')) fact.remove();
    const occupied = new Set();
    let cursor = 0;
    for (const tile of tiles) {
      const span = Number(tile.dataset.span);
      let cell = cursor;
      const free = i => {
        const x = i % cols, y = Math.floor(i / cols);
        if (x + span > cols) return false;
        for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) {
          if (occupied.has((y + dy) * cols + x + dx)) return false;
        }
        return true;
      };
      while (!free(cell)) cell++;
      const x = cell % cols, y = Math.floor(cell / cols);
      tile.style.gridColumn = `${x + 1} / span ${span}`;
      tile.style.gridRow = `${y + 1} / span ${span}`;
      for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) occupied.add((y + dy) * cols + x + dx);
      cursor = cell + 1;
    }
    const facts = ['76′ × 43′|One S50 frame', '110 objects|Messier catalogue', 'M1 → M110|Catalogue order',
      '19 showpieces|Double squares', 'Published images|Capture status may differ'];
    let note = 0;
    const last = Math.max(...occupied);
    for (let cell = 0; cell < last; cell++) if (!occupied.has(cell)) {
      const fact = document.createElement('li'); fact.className = 'plate-fact';
      fact.setAttribute('aria-hidden', 'true');
      const [value, label] = facts[note++ % facts.length].split('|');
      const strong = document.createElement('strong'); strong.textContent = value;
      const small = document.createElement('small'); small.textContent = label;
      fact.append(strong, small);
      fact.style.gridColumn = `${cell % cols + 1}`;
      fact.style.gridRow = `${Math.floor(cell / cols) + 1}`;
      plate.append(fact);
    }
  }
  if (plate) {
    pack();
    new ResizeObserver(pack).observe(plate);
  }
  const filters = root.querySelector('.atlas-filters');
  if (filters) {
    filters.hidden = false;
    filters.addEventListener('change', () => {
      const status = filters.querySelector('[data-filter-status]').value;
      const type = filters.querySelector('[data-filter-type]').value;
      for (const item of root.querySelectorAll('[data-status][data-type]')) item.classList.toggle('dim',
        (status !== 'all' && item.dataset.status !== status) || (type !== 'all' && item.dataset.type !== type));
    });
  }
  const sky = root.querySelector('.sky-chart svg');
  if (sky) {
    const sizePoints = () => {
      const factor = 1200 / sky.clientWidth;
      for (const point of sky.querySelectorAll('a')) {
        const circle = point.querySelector('circle'), image = point.querySelector('image');
        const x = Number(circle.getAttribute('cx')), y = Number(circle.getAttribute('cy'));
        const size = 32 * factor;
        image.setAttribute('x', x - size / 2); image.setAttribute('y', y - size / 2);
        image.setAttribute('width', size); image.setAttribute('height', size);
        circle.setAttribute('r', 22 * factor);
      }
    };
    sizePoints(); new ResizeObserver(sizePoints).observe(sky);
  }
  const panel = root.querySelector('dialog');
  if (!panel || typeof panel.showModal !== 'function') return;
  let opener;
  root.addEventListener('click', event => {
    const link = event.target.closest('[data-open]');
    if (!link) return;
    const detail = [...root.querySelectorAll('[data-detail]')].find(d => d.dataset.detail === link.dataset.open);
    if (!detail) return;
    event.preventDefault();
    opener = link;
    const body = panel.querySelector('[data-panel-body]');
    body.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = detail.querySelector('summary').textContent;
    body.append(title);
    for (const node of detail.children) if (node.tagName !== 'SUMMARY') body.append(node.cloneNode(true));
    panel.showModal();
    panel.querySelector('[data-close]').focus();
  });
  panel.querySelector('[data-close]').addEventListener('click', () => panel.close());
  panel.addEventListener('click', event => { if (event.target === panel) {
    const b = panel.getBoundingClientRect();
    if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) panel.close();
  }});
  panel.addEventListener('close', () => { if (opener) opener.focus(); });
})();
