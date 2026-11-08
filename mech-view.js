// Mechanism viewer: draws a template (mech-templates.js) on the substrate's own 2D coordinates.
// Atoms never move between frames, except a shifting H/alkyl group, which travels along an arc.
// Every visual cue is qualitative and comes from the template (rule-based), not from a calculation.
//
// openMechanism(host, opts) → { next, back, why, close, frame, nameReady }
//   opts: { OCL, mol (prepared substrate, same indices as the analyser's), site,
//           roles { ca, lg, c, cb, n, g, ab, y }   substrate atom indices (null when not used)
//           virt  { nu, base, hp, hx, act, ax: { atom, rest } }   atoms drawn that aren't in the substrate
//           flags { shift, shiftH, shiftAlkyl, shiftRing, allylic, allylicFar, canShift, nuNeutral, major, hofmann, … }
//           tokens { nu, nuAfter, base, baseH, lgBound, lgFree, c0, c1, nuRestOx, nuRestR, … }  values for '@name'
//           labels { lg: 'OH₂', … }  label overrides for every frame
//           template { humps, show, pull, frames }, texts (data/mech-text.json),
//           vars { Nu, LG, … }, productName (Promise<string>), resultCard () → Element,
//           offer { text, label, open() } | null   competing pathway offered at the end,
//           onResult (bool) → called on every page: is the last (result) step showing? }
//
// Roles used in frames: substrate roles above, plus virtual ones: nu, base, hb (the β-H that is removed),
// gh (a shifting H), hp (an acid's H⁺), hx (the acid's counter-ion), act (P/S of PBr₃/SOCl₂/TsCl), ax (its Br/Cl).
// A bond key is 'role-role'. If both ends are substrate atoms and bonded, the frame overrides that bond;
// otherwise it is an extra bond. Frames and keys that name a role this case doesn't have are skipped,
// so one template serves e.g. SN1 with and without a shift.

const NS = 'http://www.w3.org/2000/svg';
const BL = 42;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const VIRTUAL = ['nu', 'base', 'hb', 'gh', 'hp', 'hx', 'act', 'ax'];
const LONE = new Set(['nu', 'base']);

function fill(t, vars){ return t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)); }

// "[[term|label]]" → a tappable glossary button; everything else escaped
function richText(t, glossary){
  return esc(t).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, term, label) =>
    glossary[term] ? `<button type="button" class="term" data-term="${esc(term)}">${label || term}</button>` : (label || term));
}

// ---------- vector helpers ----------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => { const d = len(a) || 1; return { x: a.x / d, y: a.y / d }; };
const fromAngle = (t) => ({ x: Math.cos(t), y: Math.sin(t) });

// ---------- geometry (computed once per mechanism) ----------
function layout(OCL, m, site, roles, flags){
  let xs = [], ys = [];
  for (let a = 0; a < m.getAtoms(); a++){ xs.push(m.getAtomX(a)); ys.push(m.getAtomY(a)); }
  if (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) < 0.01){
    m.inventCoordinates();
    xs = []; ys = [];
    for (let a = 0; a < m.getAtoms(); a++){ xs.push(m.getAtomX(a)); ys.push(m.getAtomY(a)); }
  }
  const k = BL / (m.getAverageBondLength() || 1);
  const P0 = xs.map((x, i) => ({ x: x * k, y: ys[i] * k }));
  const n = m.getAtoms();
  const adj0 = Array.from({ length: n }, () => new Set());
  for (let b = 0; b < m.getBonds(); b++){ const a1 = m.getBondAtom(0, b), a2 = m.getBondAtom(1, b); adj0[a1].add(a2); adj0[a2].add(a1); }
  const ca = roles.ca, lg = roles.lg;
  const dir = unit(sub(P0[ca], P0[lg]));               // from LG through Cα (the backside direction)
  const virt = {};
  const placed = [];
  const clearance = (pt, P, skip) => {
    let d = Infinity;
    P.forEach((q, i) => { if (!skip.has(i)) d = Math.min(d, len(sub(pt, q))); });
    for (const q of placed) d = Math.min(d, len(sub(pt, q)));
    return d;
  };
  // the most open direction around an atom: bisector of the largest gap between its neighbours
  const freeDir = (a, P, adj) => {
    const ang = [...adj[a]].map((b) => Math.atan2(P[b].y - P[a].y, P[b].x - P[a].x)).sort((u, v) => u - v);
    if (!ang.length) return { x: 0, y: -1 };
    if (ang.length === 1) return fromAngle(ang[0] + Math.PI);
    let best = -1, at = 0;
    ang.forEach((t, i) => { const nx = i + 1 < ang.length ? ang[i + 1] : ang[0] + 2 * Math.PI; if (nx - t > best){ best = nx - t; at = t + (nx - t) / 2; } });
    return fromAngle(at);
  };
  // does the segment o→pt cross a drawn bond (not one that ends at o)?
  let segs = [];
  const cross = (o, pt) => segs.some(([a, b]) => {
    if (len(sub(a, o)) < 1 || len(sub(b, o)) < 1) return false;
    const d1 = sub(pt, o), d2 = sub(b, a), den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-9) return false;
    const w = sub(a, o), t = (w.x * d2.y - w.y * d2.x) / den, u = (w.x * d1.y - w.y * d1.x) / den;
    return t > 0.02 && t < 1 && u > 0.02 && u < 0.98;
  });
  // a point `d` away from `o`, in the first preferred direction that is clear, else the clearest of 24
  const spot = (o, prefs, d, P, skip = new Set()) => {
    for (const u of prefs){ const pt = add(o, mul(unit(u), d)); if (clearance(pt, P, skip) >= 0.62 * BL && !cross(o, pt)) return pt; }
    let best = null, bc = -Infinity;
    for (let i = 0; i < 24; i++){ const pt = add(o, mul(fromAngle(i * Math.PI / 12), d)); const c = clearance(pt, P, skip) - (cross(o, pt) ? 1000 : 0); if (c > bc){ bc = c; best = pt; } }
    return best;
  };
  const segsOf = (P, adj) => { const out = []; adj.forEach((s, a) => s.forEach((b) => { if (a < b) out.push([P[a], P[b]]); })); return out; };
  segs = segsOf(P0, adj0);

  // after a shift: the group sits on Cα, the C–LG bond is gone
  const adj1 = adj0.map((s) => new Set(s));
  adj1[ca].delete(lg); adj1[lg].delete(ca);
  const P1 = P0.map((p) => ({ ...p }));
  let ghFrom = null, ghTo = null, branch = [], move = null;
  if (flags.shiftH || flags.shiftAlkyl){
    const N = P0[roles.n], A = P0[ca];
    // the moving thing: an explicit H on n, or the alkyl branch starting at g
    const start = flags.shiftH ? spot(N, [freeDir(roles.n, P0, adj0)], 0.75 * BL, P0, new Set([roles.n])) : P0[roles.g];
    if (flags.shiftAlkyl){
      const seen = new Set([roles.n, roles.g]); const stack = [roles.g]; branch = [roles.g];
      while (stack.length){ const a = stack.pop(); for (const b of adj0[a]) if (!seen.has(b)){ seen.add(b); branch.push(b); stack.push(b); } }
    }
    // landing spot on Cα: the group's mirror image across the perpendicular bisector of n–Cα
    // (or across the n–Cα line as well), whichever is clearer; else the clearest direction from Cα
    const u = unit(sub(A, N)), mid = mul(add(A, N), 0.5);
    const rel = sub(start, mid);
    const along = rel.x * u.x + rel.y * u.y;
    const m1 = sub(start, mul(u, 2 * along));
    const m2 = add(mid, sub(mul(u, -along), sub(rel, mul(u, along))));
    const skip = new Set([roles.n, lg, ...branch]);
    const lenG = flags.shiftH ? 0.75 * BL : BL;
    const cands = [m1, m2].map((p) => add(A, mul(unit(sub(p, A)), lenG)));
    let end = cands.sort((p, q) => clearance(q, P0, skip) - clearance(p, P0, skip))[0];
    if (clearance(end, P0, skip) < 0.5 * BL) end = spot(A, [freeDir(ca, P0, adj1)], lenG, P0, skip);
    const bulge = unit(sub(mul(add(start, end), 0.5), mid));
    move = { start, end, ctrl: add(mul(add(start, end), 0.5), mul(bulge, 0.6 * BL)) };
    if (flags.shiftH){ ghFrom = start; ghTo = end; placed.push(start, end); }
    else {
      const T = sub(end, start);
      for (const a of branch) P1[a] = add(P0[a], T);
      adj1[roles.n].delete(roles.g); adj1[roles.g].delete(roles.n); adj1[ca].add(roles.g); adj1[roles.g].add(ca);
    }
  }
  if (flags.shiftRing){ adj1[roles.n].delete(roles.g); adj1[roles.g].delete(roles.n); adj1[ca].add(roles.g); adj1[roles.g].add(ca); }

  segs = segsOf(P1, adj1);
  // the nucleophile: SN2 and attack at Cα → the backside (mirror of LG across Cα); attack elsewhere → the open side
  const c = roles.c ?? ca;
  if (c === ca) virt.nu = add(P0[ca], mul(dir, 1.45 * BL));
  else {
    const prefs = [];
    if (flags.shiftAlkyl) prefs.push(sub(P0[roles.g], P0[c]));
    if (flags.shiftH) prefs.push(sub(ghFrom, P0[c]));
    prefs.push(freeDir(c, P1, adj1));
    virt.nu = spot(P1[c], prefs, 1.45 * BL, P1, new Set([c]));
  }
  placed.push(virt.nu);
  // the β-H that leaves: anti-periplanar to the LG in the drawing plane for E2 (C–H parallel to C–LG,
  // pointing the other way); for E1 the open side of Cβ
  if (roles.cb != null){
    const P = flags.e1 ? P1 : P0, adj = flags.e1 ? adj1 : adj0;
    segs = segsOf(P, adj);
    const prefs = flags.e1 ? [freeDir(roles.cb, P, adj)] : [mul(dir, 1), freeDir(roles.cb, P, adj)];
    virt.hb = spot(P[roles.cb], prefs, 0.75 * BL, P, new Set([roles.cb]));
    placed.push(virt.hb);
    virt.base = spot(virt.hb, [sub(virt.hb, P[roles.cb])], 1.25 * BL, P, new Set([roles.cb]));
    placed.push(virt.base);
  }
  segs = segsOf(P0, adj0);
  // an acid's H⁺ (with its counter-ion), or the P/S of an activating reagent, near the alcohol O
  const lgOut = freeDir(lg, P0, adj0);
  virt.hp = virt.act = spot(P0[lg], [lgOut], 1.05 * BL, P0, new Set([lg]));
  virt.hx = virt.ax = spot(virt.hp, [sub(virt.hp, P0[lg])], 1.15 * BL, P0, new Set([lg]));
  virt.gh = ghFrom;
  return { P0, P1, adj0, adj1, dir, virt, ghTo, branch, move, freeDir };
}

function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------- frame resolution: conditions, per-flag overrides, tokens ----------
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)){
    if (k === 'show') out.show = [...(a.show || []), ...v];
    else if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') out[k] = { ...a[k], ...v };
    else out[k] = v;
  }
  return out;
};
export function frameApplies(f, flags, skipProton){
  if (f.if && !flags[f.if]) return false;
  if (f.unless && flags[f.unless]) return false;
  if (skipProton && f.proton) return false;
  return true;
}
export function resolveFrame(f, flags){
  let r = { ...f };
  for (const [flag, over] of Object.entries(f.when || {})) if (flags[flag]) r = merge(r, over);
  if (r.text && typeof r.text === 'object') r.text = Object.entries(r.text).find(([k]) => k === 'else' || flags[k])?.[1];
  return r;
}

// ---------- the molecule frame ----------
// mode: positions before a shift ('P0'), after it ('P1'), or part-way along the arc (t in 0..1)
function drawFrame(svg, ctx, f, t){
  const { mol: m, roles, geo, flags } = ctx;
  svg.replaceChildren();
  const tok = (v) => (typeof v === 'string' && v[0] === '@' ? ctx.tokens[v.slice(1)] ?? '' : v);
  const moving = f.move && t < 1, after = f.move || f.moved;
  // positions for this frame
  let P = after ? geo.P1 : geo.P0;
  let gh = after ? geo.ghTo : geo.virt.gh;
  if (moving && geo.move){
    const { start, end, ctrl } = geo.move;
    const q = { x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * ctrl.x + t * t * end.x, y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * ctrl.y + t * t * end.y };
    if (flags.shiftH) gh = q;
    else { const T = sub(q, start); P = geo.P0.map((p, i) => (geo.branch.includes(i) ? add(p, T) : p)); }
  }
  const show = new Set([...(ctx.template.show || []), ...(f.show || [])]);
  for (const r of f.hide || []) show.delete(r);
  const vpos = { ...geo.virt, gh };
  // role → { a: atom index | null, p: point } (null if this case has no such role, or it's hidden)
  const R = (role) => {
    if (VIRTUAL.includes(role)) return vpos[role] && show.has(role) ? { a: null, p: vpos[role], v: role } : null;
    const a = role === 'c' ? roles.c ?? roles.ca : roles[role];
    return a == null ? null : { a, p: P[a] };
  };
  const anyR = (role) => (VIRTUAL.includes(role) ? (vpos[role] ? { a: null, p: vpos[role], v: role } : null) : R(role));

  const defs = el('defs', {}, svg);
  const grad = (id, c, a) => { const g = el('radialGradient', { id }, defs); el('stop', { offset: '0', 'stop-color': c, 'stop-opacity': a }, g); el('stop', { offset: '1', 'stop-color': c, 'stop-opacity': 0 }, g); };
  // one colour (blue) for electron density: brighter = more electrons; an electron-poor C⁺/δ+ carbon only glows faintly,
  // so the bond that breaks there stays easy to see
  grad('mvRich', '#6cc4ff', 1); grad('mvSome', '#6cc4ff', 0.6); grad('mvPoor', '#6cc4ff', 0.2);
  const mk = el('marker', { id: 'mvHead', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#c00000' }, mk);

  const forms = [f];
  if (f.resonance) forms.push(merge({ ...f, arrows: [], resonance: null }, f.resonance));
  const pts = [];
  let offset = 0;
  forms.forEach((form, i) => {
    const g = el('g', { class: 'mv-form', transform: offset ? `translate(${offset},0)` : null }, svg);
    const box = drawForm(g, ctx, form, { P, R, anyR, tok, show, gh });
    if (i === 0 && forms.length > 1){
      offset = box.maxX - box.minX + 40;
      const midY = (box.minY + box.maxY) / 2;
      el('text', { x: box.maxX + 20 - 6, y: midY, class: 'mv-reso', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg).textContent = '↔';
    }
    pts.push({ minX: box.minX + (i ? offset : 0), maxX: box.maxX + (i ? offset : 0), minY: box.minY, maxY: box.maxY });
  });
  if (moving && geo.move){ // the arc the group travels along
    const { start, end, ctrl } = geo.move;
    el('path', { d: `M${start.x},${start.y} Q${ctrl.x},${ctrl.y} ${end.x},${end.y}`, class: 'mv-trace' }, svg.querySelector('.mv-form'));
  }
  let minX = Math.min(...pts.map((b) => b.minX)), maxX = Math.max(...pts.map((b) => b.maxX));
  let minY = Math.min(...pts.map((b) => b.minY)), maxY = Math.max(...pts.map((b) => b.maxY));
  if (f.ts){
    const L = minX + 8, Rr = maxX - 8, T = minY + 6, B = maxY - 6;
    el('path', { d: `M${L + 7},${T} H${L} V${B} H${L + 7} M${Rr - 7},${T} H${Rr} V${B} H${Rr - 7}`, class: 'mv-bracket' }, svg);
    el('text', { x: Rr + 3, y: T + 6, class: 'mv-dagger' }, svg).textContent = '‡';
    maxX += 8;
  }
  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
}

function drawForm(svg, ctx, f, { P, R, anyR, tok, show }){
  const { mol: m, roles, geo } = ctx;
  const ca = roles.ca, lg = roles.lg;
  const labels = { ...(ctx.labels || {}), ...(f.labels || {}) };
  const roleOf = new Map(); // atom index → role name (for labels, data attributes)
  for (const [r, a] of Object.entries(roles)) if (a != null && !roleOf.has(a)) roleOf.set(a, r);
  const near = new Set([ca, lg, roles.c, roles.cb, roles.n, roles.g, roles.ab, roles.y].filter((a) => a != null));

  // bonds requested by the frame: substrate overrides and extra bonds
  const over = new Map(), extra = [];
  for (const [key, st0] of Object.entries(f.bonds || {})){
    const st = tok(st0);
    const [r1, r2] = key.split('-'); const A = R(r1), B = R(r2);
    if (!A || !B) continue;
    const b = A.a != null && B.a != null ? m.getBond(A.a, B.a) : -1;
    if (b >= 0) over.set(b, { st, key }); else if (st !== 'none') extra.push({ A, B, st, key });
  }

  // electron density clouds
  const cloudR = { rich: 38, some: 30, poor: 20 };
  const cloudG = { rich: 'url(#mvRich)', some: 'url(#mvSome)', poor: 'url(#mvPoor)' };
  for (const [role, lvl] of Object.entries(f.clouds || {})){
    const x = R(role); if (!x || !lvl) continue;
    el('circle', { cx: x.p.x, cy: x.p.y, r: cloudR[lvl], fill: cloudG[lvl], class: `mv-cloud mv-${lvl}`, 'data-role': role }, svg);
  }
  // p orbital (empty, on a carbocation): two open lobes across the atom
  const pRoles = [].concat(f.pOrbital || []);
  const chargeDir = (x, role) => {
    if (x.a === ca || role === 'lg' || role === 'nu') return { x: -geo.dir.y, y: geo.dir.x };
    if (x.a != null) return geo.freeDir(x.a, P, f.move || f.moved ? geo.adj1 : geo.adj0);
    return unit({ x: 1, y: -1 });
  };
  for (const role of pRoles){
    const x = R(role); if (!x) continue;
    const cd = chargeDir(x, role), ax = { x: -cd.y, y: cd.x };
    for (const s of [-1, 1]){
      const c = add(x.p, mul(ax, 13 * s));
      el('ellipse', { cx: c.x, cy: c.y, rx: 6, ry: 11, transform: `rotate(${Math.atan2(ax.y, ax.x) * 180 / Math.PI - 90} ${c.x} ${c.y})`, class: 'mv-porb', 'data-role': role }, svg);
    }
  }
  // pull line (an electron pair reaching for its target), tightening over the frames
  const [pf, pt] = ctx.template.pull || ['nu', 'ca'];
  const PF = anyR(pf), PT = anyR(pt);
  if (f.pull != null && f.pull < 1 && PF && PT && (show.has(pf) || !VIRTUAL.includes(pf))){
    const t = f.pull;
    el('line', { x1: PF.p.x, y1: PF.p.y, x2: PT.p.x, y2: PT.p.y, class: 'mv-pull',
      stroke: `rgb(${Math.round(150 + 90 * t)},${Math.round(150 - 130 * t)},${Math.round(150 - 130 * t)})`,
      'stroke-width': (1 + 2.2 * t).toFixed(2), 'stroke-dasharray': `${(2 + 8 * (1 - t)).toFixed(1)} ${(3 + 7 * (1 - t)).toFixed(1)}` }, svg);
  }

  // labels: heteroatoms (with their H's, like a skeletal drawing), overrides, and virtual atoms
  const labelOf = (a) => {
    const r = roleOf.get(a);
    if (r && labels[r] != null) return tok(labels[r]);
    if (m.getAtomicNo(a) === 6) return '';
    const h = m.getImplicitHydrogens(a);
    return m.getAtomLabel(a) + (h ? 'H' + (h > 1 ? '₂₃₄'[h - 2] : '') : '');
  };
  const lineLine = (p, q, s1, s2, cls, offs, data) => {
    const d = sub(q, p), L = len(d) || 1, u = mul(d, 1 / L), nx = -u.y, ny = u.x;
    const a = add(p, mul(u, s1)), b = sub(q, mul(u, s2));
    offs.forEach(([o, dash]) => el('line', { x1: a.x + nx * o, y1: a.y + ny * o, x2: b.x + nx * o, y2: b.y + ny * o, class: cls + (dash ? ' mv-partial' : ''), 'data-bond': data }, svg));
  };
  const OFFS = { 1: [[0]], 2: [[-2.5], [2.5]], 3: [[-4], [0], [4]] };
  const offsFor = (st, order) => st === 'single' ? OFFS[1] : st === 'double' ? OFFS[2] : st === 'partial' ? [[0, true]]
    : st === 'pdouble' ? [[-2.5], [2.5, true]] : (OFFS[order] || OFFS[1]);
  const shortBy = (a) => (labelOf(a) ? 9 : 0);
  for (let b = 0; b < m.getBonds(); b++){
    const a1 = m.getBondAtom(0, b), a2 = m.getBondAtom(1, b);
    const o = over.get(b);
    const st = o ? o.st : 'solid';
    if (st === 'none') continue;
    const cls = 'mv-bond' + (near.has(a1) && near.has(a2) ? ' mv-centre' : '');
    lineLine(P[a1], P[a2], shortBy(a1), shortBy(a2), cls, offsFor(st, m.getBondOrder(b)), o ? o.key : null);
  }
  for (const { A, B, st, key } of extra){
    const s = (x) => (x.v ? 9 : shortBy(x.a));
    lineLine(A.p, B.p, s(A), s(B), 'mv-bond mv-centre mv-new', offsFor(st, 1), key);
  }
  // heavy-atom labels
  const labelPts = [];
  for (let a = 0; a < m.getAtoms(); a++){
    const t = labelOf(a); if (!t) continue;
    const p = P[a];
    // the activated leaving group's long label (OH₂, O(H)PBr₂…) starts at the atom and runs away from Cα
    const long = t.length > 2 && roleOf.get(a) === 'lg' && a !== ca;
    const right = long ? P[a].x >= P[ca].x : true;
    if (long) labelPts.push({ x: p.x + (right ? 1 : -1) * (t.length * 10 - 20), y: p.y });
    el('text', { x: long ? p.x + (right ? -6 : 6) : p.x, y: p.y, class: 'mv-atom' + (near.has(a) ? ' mv-centre' : ''), 'text-anchor': long ? (right ? 'start' : 'end') : 'middle', 'dominant-baseline': 'central', 'data-atom': roleOf.get(a) || null }, svg).textContent = long && !right ? flipLabel(t) : t;
  }
  // virtual atoms
  for (const r of VIRTUAL){
    const x = R(r); if (!x) continue;
    const v = r === 'hb' || r === 'gh' || r === 'hp' ? { atom: 'H' } : (ctx.virt[r] || { atom: '?' });
    el('text', { x: x.p.x, y: x.p.y, class: 'mv-atom mv-nu', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'data-atom': r }, svg).textContent = v.atom;
    const rest = labels[r + 'Rest'] != null ? tok(labels[r + 'Rest']) : v.rest;
    if (rest){
      const side = r === 'nu' ? (geo.dir.x >= 0 ? 1 : -1) : 1;
      el('text', { x: x.p.x + side * 9, y: x.p.y + 13, class: 'mv-rest', 'text-anchor': side > 0 ? 'start' : 'end' }, svg).textContent = rest;
    }
  }

  // lone pairs: two dots on the side facing the electrons' target
  const lpTarget = (role, x) => {
    const arrow = (f.arrows || []).find(([from]) => from === role || from === 'lp:' + role);
    if (arrow){ const T = anchorOf(arrow[1]); if (T) return T; }
    if (role === 'nu'){ const c = R('c') || R('ca'); return c && c.p; }
    if (role === 'base'){ const h = anyR('hb'); return h && h.p; }
    return add(x.p, sub(x.p, P[ca]));
  };
  const anchorOf = (r) => {
    if (r.startsWith('lp:')) r = r.slice(3);
    if (r.includes('-')){ const [a, b] = r.split('-').map(R); return a && b ? mul(add(a.p, b.p), 0.5) : null; }
    const x = R(r); return x && x.p;
  };
  for (const role of [].concat(f.lonePair || [])){
    const x = R(role); if (!x) continue;
    const T = lpTarget(role, x); if (!T) continue;
    const u = unit(sub(T, x.p)), c = add(x.p, mul(u, 13));
    for (const o of [-3, 3]) el('circle', { cx: c.x - u.y * o, cy: c.y + u.x * o, r: 1.8, class: 'mv-lp' }, svg);
  }

  // formal charges and δ labels, beside the atom (off the bonds)
  const charges = {};
  const lgBound = (() => { const o = [...over.values()].find((v) => v.key === 'ca-lg' || v.key === 'lg-ca'); return !o || o.st !== 'none'; })();
  if (lgBound && ctx.tokens.lgBound) charges.lg = ctx.tokens.lgBound;
  for (const [r, c] of Object.entries(f.charges || {})) charges[r] = tok(c);
  const tag = (role, txt, cls) => {
    const x = R(role); if (!x || !txt) return;
    const d = chargeDir(x, role), k = x.a === ca ? 20 : 15;
    const p = x.v && role !== 'nu' ? add(x.p, { x: 11, y: -11 }) : add(x.p, mul(d, k));
    el('text', { x: p.x, y: p.y, class: cls, 'data-role': role, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg).textContent = txt;
  };
  for (const [role, c] of Object.entries(charges)) tag(role, c, 'mv-charge');
  for (const [role, d0] of Object.entries(f.deltas || {})){ const d = tok(d0); if (d && !charges[role]) tag(role, d, 'mv-delta ' + (d.includes('+') ? 'mv-dplus' : 'mv-dminus')); }

  // curved arrows that draw themselves: from a lone pair ('nu', 'base', 'lp:role') or a bond ('a-b'), to an atom or bond
  (f.arrows || []).forEach(([from, to], i) => {
    const fr = from.startsWith('lp:') ? from.slice(3) : from;
    let a;
    if (LONE.has(fr) || from.startsWith('lp:')){
      const x = R(fr); const T = anchorOf(to); if (!x || !T) return;
      a = add(x.p, mul(unit(sub(T, x.p)), 13));
    } else a = anchorOf(from);
    const b0 = anchorOf(to);
    if (!a || !b0) return;
    const d0 = sub(b0, a), d = len(d0) || 1;
    const b = sub(b0, mul(d0, (to.includes('-') ? 4 : 10) / d));
    const bend = (i % 2 ? -1 : 1) * Math.max(18, d * 0.45);
    const c = { x: (a.x + b.x) / 2 - d0.y / d * bend, y: (a.y + b.y) / 2 + d0.x / d * bend };
    el('path', { d: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`, class: 'mv-arrow', 'marker-end': 'url(#mvHead)', pathLength: 100, style: `animation-delay:${i * 0.5}s`, 'data-arrow': `${from}>${to}` }, svg);
  });

  // bounding box (atoms + everything virtual that is shown)
  const all = [...P, ...labelPts];
  for (const r of VIRTUAL){ const x = R(r); if (x) all.push(x.p); }
  return { minX: Math.min(...all.map((p) => p.x)) - 34, maxX: Math.max(...all.map((p) => p.x)) + 34, minY: Math.min(...all.map((p) => p.y)) - 34, maxY: Math.max(...all.map((p) => p.y)) + 34 };
}
// "OPBr₂" drawn to the left of its atom reads "Br₂PO": keep the attached atom next to the bond
function flipLabel(t){
  const parts = t.match(/\([^)]*\)|[A-Z][a-z]?[₀-₉]*/g) || [t];
  return parts.reverse().join('');
}

// ---------- hill + ball, stability meter ----------
// Named stops are x positions on each profile; a shift adds a small middle hump (humps: 3).
const HILLS = {
  1: { d: 'M8,74 C55,74 70,16 100,16 C130,16 145,74 192,74', peaks: [[100, 16]],
    stops: { start: 8, up1: 62, ts1: 100, end: 192 } },
  2: { d: 'M8,74 C30,74 40,18 60,18 C78,18 84,46 100,46 C116,46 122,22 140,22 C160,22 170,78 192,78', peaks: [[60, 18], [140, 22]],
    stops: { start: 8, up1: 40, ts1: 60, cation: 100, shiftTs: 100, cation2: 100, up2: 122, ts2: 140, end: 192 } },
  3: { d: 'M8,74 C28,74 36,16 50,16 C64,16 70,48 82,48 C90,48 94,38 100,38 C106,38 110,58 118,58 C130,58 136,26 150,26 C166,26 174,80 192,80', peaks: [[50, 16], [100, 38], [150, 26]],
    stops: { start: 8, up1: 34, ts1: 50, cation: 82, shiftTs: 100, cation2: 118, up2: 136, ts2: 150, end: 192 } },
};
function buildSide(side, texts, humps){
  const h = HILLS[humps] || HILLS[1];
  side.innerHTML = `
    <div class="mv-gauge"><div class="mv-cap">${esc(texts.ui.hillCaption)}</div>
      <svg class="mv-hill" viewBox="0 0 200 86" aria-hidden="true"><path class="mv-hillpath" d="${h.d}"/>${h.peaks.map(([x, y]) => `<text x="${x}" y="${y - 5}" class="mv-hilltop" text-anchor="middle">‡</text>`).join('')}<circle class="mv-ball" r="6" cx="0" cy="0"/></svg></div>
    <div class="mv-gauge"><div class="mv-cap">${esc(texts.ui.meterCaption)}</div>
      <div class="mv-meter" role="meter" aria-valuemin="0" aria-valuemax="4">${'<i></i>'.repeat(4)}</div></div>`;
}
function setGauges(side, f, humps, tok){
  const path = side.querySelector('.mv-hillpath'), ball = side.querySelector('.mv-ball');
  if (path && ball && path.getTotalLength){
    const L = path.getTotalLength();
    let at = 0;
    if (typeof f.hill === 'number') at = L * f.hill;
    else { // find the point whose x is the stop's x (the profile only moves right)
      const x = (HILLS[humps] || HILLS[1]).stops[f.hill] ?? 8;
      let lo = 0, hi = L;
      for (let i = 0; i < 20; i++){ const mid = (lo + hi) / 2; if (path.getPointAtLength(mid).x < x) lo = mid; else hi = mid; }
      at = lo;
    }
    const p = path.getPointAtLength(at);
    ball.style.transform = `translate(${p.x}px, ${p.y - 6}px)`;
  }
  const meter = side.querySelector('.mv-meter');
  const lvl = Math.max(0, Math.min(4, Number(tok(f.meter)) || 0));
  meter.setAttribute('aria-valuenow', lvl);
  meter.dataset.level = lvl;
  [...meter.children].forEach((x, i) => x.classList.toggle('on', i < lvl));
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

// remembered per viewer (tolerates blocked storage)
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('ml-mech-' + k) === '1'; localStorage.setItem('ml-mech-' + k, v ? '1' : '0'); } catch {} return false; };

export function openMechanism(host, opts){
  const { template, texts } = opts;
  const flags = opts.flags || {};
  const ctx = { ...opts, flags, roles: opts.roles || { ca: opts.site.ca, lg: opts.site.lgAtom }, virt: opts.virt || {}, tokens: opts.tokens || {} };
  ctx.humps = template.humps === 2 && flags.shift ? 3 : template.humps;
  const tok = (v) => (typeof v === 'string' && v[0] === '@' ? ctx.tokens[v.slice(1)] ?? '' : v);
  const vars = { ...opts.vars, product: '…' };
  const hasProton = template.frames.some((f) => f.proton && frameApplies({ ...f, proton: false }, flags, false));
  const st = { frame: 0, pages: [], page: 0, whyShown: false, quiz: pref('quiz'), skip: hasProton && pref('skip'), answered: new Set(), pending: null, anim: 0 };
  let frames = [];
  const build = () => { frames = template.frames.map((f, i) => ({ f, i })).filter(({ f }) => frameApplies(f, flags, st.skip)).map(({ f, i }) => ({ ...resolveFrame(f, flags), _i: i })); };
  build();
  host.hidden = false;
  host.innerHTML = `
    <div class="mv-grid">
      <div class="mv-stage"><svg class="mv-svg" role="img" aria-label="Mechanism drawing"></svg><div class="mv-key">${esc(texts.ui.densityKey)}</div><div class="mv-result"></div></div>
      <div class="mv-sidecol">
        <div class="mv-side"></div>
        <div class="mv-dialog" id="mechDialog" role="button" tabindex="0" aria-live="polite">
          <div class="mv-speaker">${esc(texts.speaker)}</div>
          <div class="mv-text"></div><div class="mv-qbtns" hidden></div><span class="mv-more" aria-hidden="true">▼</span>
          <div class="mv-gloss" hidden></div>
        </div>
        <div class="mv-controls">
          <button type="button" class="mv-back" aria-label="Previous">◀</button>
          <span class="mv-step"></span>
          <button type="button" class="mv-why">WHY?</button>
          <button type="button" class="mv-next primary" aria-label="Next">▶</button>
        </div>
        <div class="mv-opts">
          <label><input type="checkbox" class="mv-quizbox"${st.quiz ? ' checked' : ''}> ${esc(texts.ui.quizToggle)}</label>
          ${hasProton ? `<label><input type="checkbox" class="mv-skipbox"${st.skip ? ' checked' : ''}> ${esc(texts.ui.skipProton)}</label>` : ''}
        </div>
      </div>
    </div>`;
  const svg = host.querySelector('.mv-svg'), side = host.querySelector('.mv-side'), dialog = host.querySelector('.mv-dialog');
  const gloss = host.querySelector('.mv-gloss'), result = host.querySelector('.mv-result'), qbtns = host.querySelector('.mv-qbtns');
  buildSide(side, texts, ctx.humps);
  const tw = typewriter(dialog);
  ctx.geo = layout(opts.OCL, opts.mol, opts.site, ctx.roles, flags);
  // symmetry ranks, so tapping any equivalent atom counts as right
  opts.mol.ensureHelperArrays(opts.OCL.Molecule.cHelperSymmetrySimple);
  let nameReady = false;
  Promise.resolve(opts.productName).then((n) => { vars.product = n || vars.product; nameReady = true; if (frames[st.frame].result && st.page === 0 && !st.pending) showPage(); });

  function frameText(){ return texts.frames[frames[st.frame].text] || { text: `(missing text: ${frames[st.frame].text})` }; }
  // quiz.if: a flag, or '!flag' for "only when this flag is off"
  const flagOn = (k) => (k[0] === '!' ? !flags[k.slice(1)] : !!flags[k]);
  function quizOf(f){ return st.quiz && f.quiz && (!f.quiz.if || flagOn(f.quiz.if)) && !st.answered.has(f._i) ? f.quiz : null; }
  function draw(f){
    cancelAnimationFrame(st.anim);
    const q = st.pending;
    const g = q ? { ...f, arrows: [], pull: undefined, hide: [...(f.hide || []), ...(q.hide || [])] } : f;
    if (f.move && !q && !reduceMotion()){
      const t0 = performance.now();
      const step = (now) => { const t = Math.min(1, (now - t0) / 1100); drawFrame(svg, ctx, g, t); if (t < 1) st.anim = requestAnimationFrame(step); };
      drawFrame(svg, ctx, g, 0);
      st.anim = requestAnimationFrame(step);
    } else drawFrame(svg, ctx, g, 1);
    if (q && q.kind === 'tap') addHits(f, q);
  }
  // tap quiz: every heavy atom becomes a target
  function addHits(f, q){
    const P = f.move || f.moved ? ctx.geo.P1 : ctx.geo.P0;
    const form = svg.querySelector('.mv-form') || svg;
    P.forEach((p, a) => {
      const c = el('circle', { cx: p.x, cy: p.y, r: 14, class: 'mv-hit', 'data-hit': a, tabindex: 0, role: 'button', 'aria-label': `atom ${a + 1}` }, form);
      c.addEventListener('click', (e) => { e.stopPropagation(); answer(f, q, a); });
    });
  }
  // every atom that counts as right (q.role may list several, e.g. both ends of an allylic cation)
  function rightAtoms(q){ return [].concat(q.role).map((r) => (r === 'c' ? ctx.roles.c ?? ctx.roles.ca : ctx.roles[r])).filter((a) => a != null); }
  function answer(f, q, given){
    const Q = texts.quiz[q.q];
    let right, explain;
    if (q.kind === 'tap'){
      right = given !== null && rightAtoms(q).some((a) => opts.mol.getSymmetryRank(given) === opts.mol.getSymmetryRank(a));
      explain = Q.explain;
    } else {
      const yes = !!flags[q.answer];
      right = given !== null && given === yes;
      explain = yes ? (q.taken && !flags[q.taken] ? Q.explainYesNotTaken : Q.explainYes) : Q.explainNo;
    }
    st.answered.add(f._i); st.pending = null;
    qbtns.hidden = true; qbtns.replaceChildren();
    draw(f);
    if (q.kind === 'tap'){
      const P = f.move || f.moved ? ctx.geo.P1 : ctx.geo.P0;
      for (const a of rightAtoms(q)) el('circle', { cx: P[a].x, cy: P[a].y, r: 16, class: 'mv-correct' }, svg.querySelector('.mv-form') || svg);
    }
    const verdict = given === null ? texts.ui.quizSkipped : right ? texts.ui.quizRight : texts.ui.quizWrong;
    st.pages = [`${verdict} ${explain}`, frameText().text]; st.page = 0; st.whyShown = false;
    host.dataset.quiz = right ? 'right' : 'wrong';
    showPage();
  }
  function showQuiz(f, q){
    const Q = texts.quiz[q.q];
    st.pending = q;
    host.dataset.quiz = 'pending';
    draw(f);
    tw.start(richText(fill(Q.q, vars), texts.glossary));
    qbtns.replaceChildren();
    if (q.kind === 'yesno'){
      for (const [lab, v] of [[texts.ui.yes, true], [texts.ui.no, false]]){
        const b = document.createElement('button'); b.type = 'button'; b.className = 'mv-qbtn'; b.textContent = lab;
        b.onclick = (e) => { e.stopPropagation(); answer(f, q, v); };
        qbtns.appendChild(b);
      }
    }
    qbtns.hidden = q.kind !== 'yesno';
    dialog.classList.remove('mv-whypage');
    host.querySelector('.mv-step').textContent = `Step ${st.frame + 1}/${frames.length} · ${texts.ui.quizTag}`;
    host.querySelector('.mv-why').disabled = true;
    host.querySelector('.mv-back').disabled = st.frame === 0;
    host.querySelector('.mv-next').disabled = false;
    result.replaceChildren();
  }
  function showPage(){
    const f = frames[st.frame];
    const t = st.pages[st.page];
    tw.start(richText(fill(t, vars), texts.glossary));
    gloss.hidden = true;
    const why = st.pages.length > 1 && st.page > 0 && st.whyShown && st.page >= st.pages.length - (frameText().why || []).length;
    dialog.classList.toggle('mv-whypage', why);
    host.querySelector('.mv-step').textContent = `Step ${st.frame + 1}/${frames.length}` + (f.proton ? ` · ${texts.ui.protonTag}` : '') + (why ? ' · WHY' : '');
    host.querySelector('.mv-why').disabled = st.whyShown || !(frameText().why || []).length;
    host.querySelector('.mv-back').disabled = st.frame === 0 && st.page === 0;
    host.querySelector('.mv-next').disabled = st.frame === frames.length - 1 && st.page === st.pages.length - 1;
    result.replaceChildren();
    if (opts.onResult) opts.onResult(!!f.result);
    if (f.result && opts.resultCard) result.appendChild(opts.resultCard());
    if (f.result && opts.offer && st.frame === frames.length - 1){
      const d = document.createElement('div'); d.className = 'mv-offer';
      d.innerHTML = `<p>${esc(opts.offer.text)}</p>`;
      const b = document.createElement('button'); b.type = 'button'; b.textContent = opts.offer.label; b.onclick = () => opts.offer.open();
      d.appendChild(b); result.appendChild(d);
    }
  }
  function showFrame(i){
    st.frame = i; st.pages = [frameText().text]; st.page = 0; st.whyShown = false; st.pending = null;
    const f = frames[i];
    setGauges(side, f, ctx.humps, tok);
    qbtns.hidden = true;
    delete host.dataset.quiz;
    const q = quizOf(f);
    if (q){ showQuiz(f, q); return; }
    draw(f);
    showPage();
  }
  function next(){
    if (!tw.done()){ tw.finish(); return; }
    if (st.pending){ answer(frames[st.frame], st.pending, null); return; }
    if (st.page < st.pages.length - 1){ st.page++; showPage(); }
    else if (st.frame < frames.length - 1) showFrame(st.frame + 1);
  }
  function back(){
    if (!st.pending && st.page > 0){ st.page--; showPage(); }
    else if (st.frame > 0) showFrame(st.frame - 1);
  }
  function why(){
    if (st.whyShown || st.pending) return;
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
    if (e.target.closest('.mv-qbtn')) return;
    if (!gloss.hidden){ gloss.hidden = true; return; }
    next();
  });
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); next(); } });
  host.querySelector('.mv-next').onclick = () => { tw.finish(); next(); };
  host.querySelector('.mv-back').onclick = () => { tw.finish(); back(); };
  host.querySelector('.mv-why').onclick = why;
  host.querySelector('.mv-quizbox').onchange = (e) => { st.quiz = e.target.checked; pref('quiz', st.quiz); st.answered.clear(); showFrame(st.frame); };
  const skipBox = host.querySelector('.mv-skipbox');
  if (skipBox) skipBox.onchange = (e) => {
    const cur = frames[st.frame];
    st.skip = e.target.checked; pref('skip', st.skip); build();
    // stay on the same step if it still exists, else the next one that does
    let i = frames.findIndex((f) => f._i >= cur._i);
    if (i < 0) i = frames.length - 1;
    showFrame(i);
  };
  showFrame(0);
  return { next, back, why, close(){ cancelAnimationFrame(st.anim); tw.finish(); host.hidden = true; host.replaceChildren(); }, get frame(){ return st.frame; }, get frames(){ return frames.length; }, nameReady: () => nameReady };
}
