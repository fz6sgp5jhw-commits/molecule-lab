// Mechanism viewer: draws a template (mech-templates.js) on the substrate's own 2D coordinates.
// Atoms never move between frames; only bonds, charges, clouds, arrows and the pull line change.
// Every visual cue is qualitative and comes from the template (rule-based), not from a calculation.
//
// openMechanism(host, opts) → { next, back, close }
//   opts: { OCL, mol (prepared substrate, same indices as the analyser's), site, nu: { atom, rest, text },
//           template, texts (data/mech-text.json), vars { Nu, LG, class, stereo }, productName (Promise<string>),
//           resultCard () → Element, onClose }

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function fill(t, vars){ return t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)); }

// "[[term|label]]" → a tappable glossary button; everything else escaped
function richText(t, glossary){
  return esc(t).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, term, label) =>
    glossary[term] ? `<button type="button" class="term" data-term="${esc(term)}">${label || term}</button>` : (label || term));
}

// ---------- geometry ----------
function layout(OCL, mol, site){
  const m = mol;
  let xs = [], ys = [];
  for (let a = 0; a < m.getAtoms(); a++){ xs.push(m.getAtomX(a)); ys.push(m.getAtomY(a)); }
  if (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) < 0.01){
    m.inventCoordinates();
    xs = []; ys = [];
    for (let a = 0; a < m.getAtoms(); a++){ xs.push(m.getAtomX(a)); ys.push(m.getAtomY(a)); }
  }
  const bl = m.getAverageBondLength() || 1;
  const k = 42 / bl;
  const P = xs.map((x, i) => ({ x: x * k, y: ys[i] * k }));
  const ca = P[site.ca], lg = P[site.lgAtom];
  const dx = ca.x - lg.x, dy = ca.y - lg.y, d = Math.hypot(dx, dy) || 1;
  const nu = { x: ca.x + dx / d * 42 * 1.45, y: ca.y + dy / d * 42 * 1.45 };
  return { P, nu, dir: { x: dx / d, y: dy / d } };
}

function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------- the molecule frame ----------
function drawFrame(svg, ctx, f){
  const { OCL, mol: m, site, geo, nu } = ctx;
  svg.replaceChildren();
  const pos = { ca: geo.P[site.ca], lg: geo.P[site.lgAtom], nu: geo.nu };
  const defs = el('defs', {}, svg);
  const grad = (id, c, a) => { const g = el('radialGradient', { id }, defs); el('stop', { offset: '0', 'stop-color': c, 'stop-opacity': a }, g); el('stop', { offset: '1', 'stop-color': c, 'stop-opacity': 0 }, g); };
  grad('mvRich', '#ff2a2a', 0.85); grad('mvSome', '#ff5a5a', 0.55); grad('mvPoor', '#a8d0ff', 0.6);
  const mk = el('marker', { id: 'mvHead', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#c00000' }, mk);

  // electron density clouds
  const cloudR = { rich: 34, some: 27, poor: 24 };
  const cloudG = { rich: 'url(#mvRich)', some: 'url(#mvSome)', poor: 'url(#mvPoor)' };
  for (const [role, lvl] of Object.entries(f.clouds || {})){
    const p = pos[role]; if (!p) continue;
    el('circle', { cx: p.x, cy: p.y, r: cloudR[lvl], fill: cloudG[lvl], class: `mv-cloud mv-${lvl}`, 'data-role': role }, svg);
  }

  // pull line (Nu lone pair → Cα), tightening over the frames
  if (f.pull < 1){
    const t = f.pull;
    el('line', { x1: pos.nu.x, y1: pos.nu.y, x2: pos.ca.x, y2: pos.ca.y, class: 'mv-pull',
      stroke: `rgb(${Math.round(150 + 90 * t)},${Math.round(150 - 130 * t)},${Math.round(150 - 130 * t)})`,
      'stroke-width': (1 + 2.2 * t).toFixed(2), 'stroke-dasharray': `${(2 + 8 * (1 - t)).toFixed(1)} ${(3 + 7 * (1 - t)).toFixed(1)}` }, svg);
  }

  // bonds
  const label = (a) => { const z = m.getAtomicNo(a); return z === 6 ? '' : m.getAtomLabel(a); };
  const short = (p, q, a, b) => { // shorten a bond end that meets a label
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
    const s1 = label(a) ? 9 : 0, s2 = label(b) ? 9 : 0;
    return [p.x + dx / d * s1, p.y + dy / d * s1, q.x - dx / d * s2, q.y - dy / d * s2, -dy / d, dx / d];
  };
  const near = new Set([site.ca, site.lgAtom, ...site.beta.map((b) => b.atom)]);
  for (let b = 0; b < m.getBonds(); b++){
    const a1 = m.getBondAtom(0, b), a2 = m.getBondAtom(1, b);
    const isLG = (a1 === site.ca && a2 === site.lgAtom) || (a2 === site.ca && a1 === site.lgAtom);
    const state = isLG ? f.bonds['ca-lg'] : 'solid';
    if (state === 'none') continue;
    const [x1, y1, x2, y2, nx, ny] = short(geo.P[a1], geo.P[a2], a1, a2);
    const cls = 'mv-bond' + (near.has(a1) && near.has(a2) ? ' mv-centre' : '') + (state === 'partial' ? ' mv-partial' : '');
    const order = m.getBondOrder(b);
    const offs = order === 2 ? [-2.5, 2.5] : order === 3 ? [-4, 0, 4] : [0];
    for (const o of offs) el('line', { x1: x1 + nx * o, y1: y1 + ny * o, x2: x2 + nx * o, y2: y2 + ny * o, class: cls, 'data-bond': isLG ? 'ca-lg' : null }, svg);
  }
  // the new Nu–Cα bond
  if (f.bonds['nu-ca'] !== 'none'){
    const dx = pos.ca.x - pos.nu.x, dy = pos.ca.y - pos.nu.y, d = Math.hypot(dx, dy);
    el('line', { x1: pos.nu.x + dx / d * 9, y1: pos.nu.y + dy / d * 9, x2: pos.ca.x, y2: pos.ca.y,
      class: 'mv-bond mv-centre mv-new' + (f.bonds['nu-ca'] === 'partial' ? ' mv-partial' : ''), 'data-bond': 'nu-ca' }, svg);
  }

  // atom labels (heteroatoms only, like a skeletal drawing)
  for (let a = 0; a < m.getAtoms(); a++){
    const t = label(a); if (!t) continue;
    const p = geo.P[a];
    el('text', { x: p.x, y: p.y, class: 'mv-atom' + (near.has(a) ? ' mv-centre' : ''), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'data-atom': a === site.lgAtom ? 'lg' : null }, svg).textContent = t;
  }
  // the nucleophile
  el('text', { x: pos.nu.x, y: pos.nu.y, class: 'mv-atom mv-nu', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'data-atom': 'nu' }, svg).textContent = nu.atom;
  if (nu.rest){
    const side = geo.dir.x >= 0 ? 1 : -1;
    el('text', { x: pos.nu.x + side * 9, y: pos.nu.y + 13, class: 'mv-rest', 'text-anchor': side > 0 ? 'start' : 'end' }, svg).textContent = nu.rest;
  }

  // lone pair (two dots, on the side facing away from the bond partner)
  if (f.lonePair && pos[f.lonePair]){
    const p = pos[f.lonePair];
    // geo.dir points from Cα to Nu, so −dir is Nu's side facing Cα and LG's side facing away from it
    const toward = { x: -geo.dir.x, y: -geo.dir.y };
    const cx = p.x + toward.x * 13, cy = p.y + toward.y * 13;
    for (const o of [-3, 3]) el('circle', { cx: cx - toward.y * o, cy: cy + toward.x * o, r: 1.8, class: 'mv-lp' }, svg);
  }

  // formal charges and δ labels
  // labels sit beside the atom, off the Nu···Cα···LG axis (perpendicular to it) so lines don't cross them
  const perp = { x: -geo.dir.y, y: geo.dir.x };
  const tag = (role, txt, cls) => {
    const p = pos[role]; if (!p) return;
    const k = role === 'ca' ? 20 : 15;
    el('text', { x: p.x + perp.x * k, y: p.y + perp.y * k, class: cls, 'data-role': role, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg).textContent = txt;
  };
  for (const [role, c] of Object.entries(f.charges || {})) if (role !== 'nu' || nu.charged) tag(role, c, 'mv-charge');
  for (const [role, d] of Object.entries(f.deltas || {})) if (!(f.charges || {})[role]) tag(role, d, 'mv-delta ' + (d.includes('+') ? 'mv-dplus' : 'mv-dminus'));

  // curved arrows that draw themselves
  const anchor = (r) => {
    if (r === 'nu') return { x: pos.nu.x - geo.dir.x * 13, y: pos.nu.y - geo.dir.y * 13 };
    if (r === 'ca-lg') return { x: (pos.ca.x + pos.lg.x) / 2, y: (pos.ca.y + pos.lg.y) / 2 };
    return pos[r];
  };
  (f.arrows || []).forEach(([from, to], i) => {
    const a = anchor(from), b0 = anchor(to);
    const dx = b0.x - a.x, dy = b0.y - a.y, d = Math.hypot(dx, dy) || 1;
    const b = { x: b0.x - dx / d * 10, y: b0.y - dy / d * 10 };
    const bend = (i % 2 ? -1 : 1) * Math.max(18, d * 0.45);
    const c = { x: (a.x + b.x) / 2 - dy / d * bend, y: (a.y + b.y) / 2 + dx / d * bend };
    el('path', { d: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`, class: 'mv-arrow', 'marker-end': 'url(#mvHead)', pathLength: 100, style: `animation-delay:${i * 0.5}s` }, svg);
  });

  // transition state brackets
  const xsAll = [...geo.P.map((p) => p.x), pos.nu.x], ysAll = [...geo.P.map((p) => p.y), pos.nu.y];
  let minX = Math.min(...xsAll) - 34, maxX = Math.max(...xsAll) + 34, minY = Math.min(...ysAll) - 34, maxY = Math.max(...ysAll) + 34;
  if (f.ts){
    const L = minX + 8, R = maxX - 8, T = minY + 6, B = maxY - 6;
    el('path', { d: `M${L + 7},${T} H${L} V${B} H${L + 7} M${R - 7},${T} H${R} V${B} H${R - 7}`, class: 'mv-bracket' }, svg);
    el('text', { x: R + 3, y: T + 6, class: 'mv-dagger' }, svg).textContent = '‡';
    maxX += 8;
  }
  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
}

// ---------- hill + ball, stability meter ----------
function hillPath(humps){
  return humps === 2
    ? 'M8,74 C30,74 40,18 60,18 C78,18 84,46 100,46 C116,46 122,22 140,22 C160,22 170,78 192,78'
    : 'M8,74 C55,74 70,16 100,16 C130,16 145,74 192,74';
}
function buildSide(side, texts, humps){
  side.innerHTML = `
    <div class="mv-gauge"><div class="mv-cap">${esc(texts.ui.hillCaption)}</div>
      <svg class="mv-hill" viewBox="0 0 200 86" aria-hidden="true"><path class="mv-hillpath" d="${hillPath(humps)}"/><text x="100" y="11" class="mv-hilltop" text-anchor="middle">‡</text><circle class="mv-ball" r="6" cx="0" cy="0"/></svg></div>
    <div class="mv-gauge"><div class="mv-cap">${esc(texts.ui.meterCaption)}</div>
      <div class="mv-meter" role="meter" aria-valuemin="0" aria-valuemax="4">${'<i></i>'.repeat(4)}</div></div>`;
}
function setGauges(side, f){
  const path = side.querySelector('.mv-hillpath'), ball = side.querySelector('.mv-ball');
  if (path && ball && path.getTotalLength){
    const L = path.getTotalLength(), p = path.getPointAtLength(L * f.hill);
    ball.style.transform = `translate(${p.x}px, ${p.y - 6}px)`;
  }
  const meter = side.querySelector('.mv-meter');
  meter.setAttribute('aria-valuenow', f.meter);
  meter.dataset.level = f.meter;
  [...meter.children].forEach((x, i) => x.classList.toggle('on', i < f.meter));
}

// ---------- dialog box with typewriter text ----------
function typewriter(box){
  let timer = 0, nodes = [], full = [];
  const done = () => !timer;
  function finish(){
    clearInterval(timer); timer = 0;
    nodes.forEach((n, i) => { n.nodeValue = full[i]; });
    box.classList.add('mv-done');
  }
  function start(html){
    clearInterval(timer);
    box.querySelector('.mv-text').innerHTML = html;
    box.classList.remove('mv-done');
    const walker = document.createTreeWalker(box.querySelector('.mv-text'), NodeFilter.SHOW_TEXT);
    nodes = []; full = [];
    while (walker.nextNode()){ nodes.push(walker.currentNode); full.push(walker.currentNode.nodeValue); walker.currentNode.nodeValue = ''; }
    if (reduceMotion()){ timer = 1; finish(); return; }
    let ni = 0, ci = 0;
    timer = setInterval(() => {
      for (let k = 0; k < 2 && ni < nodes.length; k++){
        ci++;
        nodes[ni].nodeValue = full[ni].slice(0, ci);
        if (ci >= full[ni].length){ ni++; ci = 0; }
      }
      if (ni >= nodes.length) finish();
    }, 22);
  }
  return { start, finish, done };
}

export function openMechanism(host, opts){
  const { template, texts } = opts;
  const vars = { ...opts.vars, product: '…' };
  const frames = template.frames;
  const st = { frame: 0, pages: [], page: 0, whyShown: false };
  host.hidden = false;
  host.innerHTML = `
    <div class="mv-grid">
      <div class="mv-stage"><svg class="mv-svg" role="img" aria-label="Mechanism drawing"></svg><div class="mv-result"></div></div>
      <div class="mv-sidecol">
        <div class="mv-side"></div>
        <div class="mv-dialog" id="mechDialog" role="button" tabindex="0" aria-live="polite">
          <div class="mv-speaker">${esc(texts.speaker)}</div>
          <div class="mv-text"></div><span class="mv-more" aria-hidden="true">▼</span>
          <div class="mv-gloss" hidden></div>
        </div>
        <div class="mv-controls">
          <button type="button" class="mv-back" aria-label="Previous">◀</button>
          <span class="mv-step"></span>
          <button type="button" class="mv-why">WHY?</button>
          <button type="button" class="mv-next primary" aria-label="Next">▶</button>
        </div>
      </div>
    </div>`;
  const svg = host.querySelector('.mv-svg'), side = host.querySelector('.mv-side'), dialog = host.querySelector('.mv-dialog');
  const gloss = host.querySelector('.mv-gloss'), result = host.querySelector('.mv-result');
  buildSide(side, texts, template.humps);
  const tw = typewriter(dialog);
  const geo = layout(opts.OCL, opts.mol, opts.site);
  const ctx = { ...opts, geo };
  let nameReady = false;
  Promise.resolve(opts.productName).then((n) => { vars.product = n || vars.product; nameReady = true; if (frames[st.frame].result && st.page === 0) showPage(); });

  function frameText(){ return texts.frames[frames[st.frame].text]; }
  function showPage(){
    const f = frames[st.frame];
    const t = st.pages[st.page];
    tw.start(richText(fill(t, vars), texts.glossary));
    gloss.hidden = true;
    const why = st.page > 0;
    dialog.classList.toggle('mv-whypage', why);
    host.querySelector('.mv-step').textContent = `Step ${st.frame + 1}/${frames.length}` + (why ? ` · WHY ${st.page}/${st.pages.length - 1}` : '');
    host.querySelector('.mv-why').disabled = st.whyShown || !(frameText().why || []).length;
    host.querySelector('.mv-back').disabled = st.frame === 0 && st.page === 0;
    host.querySelector('.mv-next').disabled = st.frame === frames.length - 1 && st.page === st.pages.length - 1;
    result.replaceChildren();
    if (f.result && opts.resultCard) result.appendChild(opts.resultCard());
  }
  function showFrame(i){
    st.frame = i; st.pages = [frameText().text]; st.page = 0; st.whyShown = false;
    drawFrame(svg, ctx, frames[i]);
    setGauges(side, frames[i]);
    showPage();
  }
  function next(){
    if (!tw.done()){ tw.finish(); return; }
    if (st.page < st.pages.length - 1){ st.page++; showPage(); }
    else if (st.frame < frames.length - 1) showFrame(st.frame + 1);
  }
  function back(){
    if (st.page > 0){ st.page--; showPage(); }
    else if (st.frame > 0) showFrame(st.frame - 1);
  }
  function why(){
    if (st.whyShown) return;
    tw.finish();
    st.pages.splice(st.page + 1, 0, ...(frameText().why || []));
    st.whyShown = true;
    st.page++;
    showPage();
  }
  dialog.addEventListener('click', (e) => {
    const term = e.target.closest('.term');
    if (term){
      e.stopPropagation();
      gloss.textContent = texts.glossary[term.dataset.term];
      gloss.hidden = false;
      return;
    }
    if (!gloss.hidden){ gloss.hidden = true; return; }
    next();
  });
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); next(); } });
  host.querySelector('.mv-next').onclick = () => { tw.finish(); next(); };
  host.querySelector('.mv-back').onclick = () => { tw.finish(); back(); };
  host.querySelector('.mv-why').onclick = why;
  showFrame(0);
  return { next, back, why, close(){ tw.finish(); host.hidden = true; host.replaceChildren(); }, get frame(){ return st.frame; }, nameReady: () => nameReady };
}
