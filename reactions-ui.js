// Reactions window: reagent entry (type / chip / draw), solvent + heat, Predict, decision path,
// SN1/SN2/E1/E2 lamps, result cards, the "Reactivity facts" panel, site chips and ranking mode.
// All chemistry comes from predict.js / reactivity.js / reagents.js (rules as data); this file only
// wires it to the page. Names use the app's naming flow (PubChem → namer.js, checked by OPSIN),
// passed in from index.html so there is one implementation.

import { analyse, cationPathways, buildProduct, LG_LABEL } from './reactivity.js';
import { findReagent, matchMolecule, guessBox, entryFromMolecule, findSolvent, parseSequence } from './reagents.js';
import { plan as planRoutes } from './planner.js';
import { predict, runSequence, rankSN1, rankSN2, rankE1, rankAlkenes, PATHWAYS } from './predict.js';
import { mountGrid } from './pathway-grid-ui.js';
import { TEMPLATES, PRELUDES, ACTIVATION } from './mech-templates.js';
import { openMechanism } from './mech-view.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const subs = (s) => s.replace(/\d/g, (d) => SUB[d]);
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const CLS_TEXT = { methyl: 'methyl', 1: '1°', 2: '2°', 3: '3°', vinyl: 'vinyl', aryl: 'aryl' };
const QUICK = ['NaI', 'NaCN', 'NaN3', 'CH3SNa', 'NaOEt', 'KOtBu', 'H2O', 'EtOH', 'TsCl'];
const SOLVENT_CHIPS = ['H2O', 'MeOH', 'EtOH', 'DMSO', 'DMF', 'acetone', 'THF'];
const ROLES = ['nuc', 'nucbase', 'bulky', 'weak'];
const ROLE_TEXT = { nuc: 'Strong Nu, weak base', nucbase: 'Strong Nu + strong base', bulky: 'Bulky strong base', weak: 'Weak Nu / weak base' };
const smooth = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const LAMP_TEXT = { major: 'major', minor: 'minor', competing: 'competing', none: 'off' };
// Alcohol activation before the main mechanism: which prelude, and how the activated leaving group is drawn
const PRELUDE_OF = { HX: 'protonate', acid: 'protonate', PBr3: 'pbr3', SOCl2: 'socl2' };
const ACTIVATED = {
  protonate: { label: 'OH₂', LG: 'OH₂⁺', LGion: 'H₂O (neutral water)', bound: '+', free: '' },
  pbr3: { label: 'O(H)PBr₂', LG: 'O(H)PBr₂⁺', LGion: 'HOPBr₂ (neutral)', bound: '+', free: '' },
  socl2: { label: 'OS(O)Cl', LG: 'OS(O)Cl', LGion: '⁻OS(O)Cl (it falls apart into SO₂ + Cl⁻)', bound: '', free: '−' },
};
const ACT_ATOMS = { PBr3: [{ atom: 'P', rest: 'Br₂' }, { atom: 'Br' }], SOCl2: [{ atom: 'S', rest: '(O)Cl' }, { atom: 'Cl' }], TsCl: [{ atom: 'Ts' }, { atom: 'Cl' }], MsCl: [{ atom: 'Ms' }, { atom: 'Cl' }] };
const LG_ION = { OTs: 'TsO⁻', OMs: 'MsO⁻', OSO2R: 'a sulfonate anion' };
const PARTNER = { SN1: 'E1', E1: 'SN1', SN2: 'E2', E2: 'SN2' };

export async function mountReactions(app){
  const { OCL } = app;
  const [rules, cat, texts] = await Promise.all(['./data/rules.json', './data/reagents.json', './data/mech-text.json']
    .map((u) => fetch(u).then((r) => r.json())));
  const st = { scene: [], sceneSig: '', drawnKey: '', hideSub: false, sceneNamesOn: true, sceneNames: {}, key: null, mol: null, sites: [], site: 0, frags: [], reagent: null, drawn: null, guess: null, solvent: null, heat: false, res: null, rx: null, ed: null, quiet: false, mech: null,
    // multistep sequences: the steps being entered (the current one is edited by the normal reagent controls),
    // the chain result, which step's results are shown, and the student's product picks per step
    steps: [{ reagent: null, drawn: null, guess: null, solvent: null, heat: false, text: '' }], cur: 0, chain: null, chainView: 0, picks: [] };
  const reason = (k) => rules.reasons[k] || k;

  // ---------- naming (PubChem → built-in namer → OPSIN check), same order as the main window ----------
  const names = new Map();
  function nameOf(m){
    const key = m.getIDCode();
    if (!names.has(key)) names.set(key, (async () => {
      const N = app.naming;
      let rec = null, pcErr = null;
      try { rec = await N.pubchemProps('smiles', m.toIsomericSmiles()); } catch (e) { pcErr = e; }
      if (rec && rec.iupac && N.compareMols(m, rec.mol) === 'same') return { name: rec.iupac, how: 'PubChem', ok: true };
      const r = N.nameMolecule(OCL, m);
      if (r.name){
        let back = 'unknown';
        try { const op = await N.opsin(r.name); back = N.compareMols(m, op && op.mol); } catch {}
        return { name: r.name, how: 'built-in IUPAC rules', ok: back === 'same', check: back };
      }
      return { name: null, why: pcErr ? texts.ui.nameOffline : texts.ui.noName };
    })());
    return names.get(key);
  }
  function nameLine(m, el){
    el.innerHTML = '<span class="rx-name empty">Naming…</span>';
    nameOf(m).then((n) => {
      if (!n.name){ el.innerHTML = `<span class="rx-name empty">${esc(n.why)}</span>`; return; }
      const check = n.how === 'PubChem' ? 'PubChem record' : n.check === 'same' ? 'built-in rules, ✓ OPSIN' : n.check === 'different' ? 'built-in rules, ⚠ OPSIN reads it differently: check by hand' : 'built-in rules, not double-checked';
      el.innerHTML = `<span class="rx-name">${esc(n.name)}</span> <span class="rx-src">(${esc(check)})</span>`;
    });
  }

  // ---------- small drawings ----------
  function svgOf(m, w = 260, h = 150){
    const c = m.getCompactCopy();
    let svg = '';
    try { svg = c.toSVG(w, h, 'rx' + Math.random().toString(36).slice(2, 8), { autoCrop: true, autoCropMargin: 10, strokeWidth: 1.2, suppressChiralText: true, suppressESR: true }); } catch {}
    return svg.replace(/ width="[^"]*" height="[^"]*"/, '');
  }
  function stereoLabels(m){
    const c = m.getCompactCopy();
    c.ensureHelperArrays(OCL.Molecule.cHelperCIP);
    const rs = [], ez = [];
    for (let a = 0; a < c.getAtoms(); a++){ const p = c.getAtomCIPParity(a); if (p === 1 || p === 2) rs.push(p === 1 ? 'R' : 'S'); }
    for (let b = 0; b < c.getBonds(); b++){ const p = c.getBondCIPParity(b); if (p === 1 || p === 2) ez.push(p === 1 ? 'E' : 'Z'); }
    return { rs, ez };
  }

  // ---------- reactivity facts + site chips ----------
  function renderSites(){
    for (const box of [$('rxSites')]){
      box.hidden = st.sites.length < 2;
      box.replaceChildren();
      if (st.sites.length < 2) continue;
      const lab = document.createElement('span'); lab.className = 'rx-lab'; lab.textContent = 'Which site?'; box.appendChild(lab);
      st.sites.forEach((s, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
        // label by class, not atom index (indices aren't IUPAC locants and would mislead)
        const base = `${CLS_TEXT[s.cls]} C–${s.lg}`;
        const dup = st.sites.filter((x) => `${CLS_TEXT[x.cls]} C–${x.lg}` === base).length > 1;
        b.textContent = dup ? `${base} #${st.sites.slice(0, i + 1).filter((x) => `${CLS_TEXT[x.cls]} C–${x.lg}` === base).length}` : base; b.setAttribute('aria-pressed', String(i === st.site));
        b.onclick = () => { st.site = i; renderSites(); renderFacts(); clearOut(); };
        box.appendChild(b);
      });
    }
  }
  function renderFacts(){
    const box = $('rxFacts');
    const s = st.sites[st.site];
    if (!s || st.frags.length > 1){ box.hidden = true; return; }
    let shifts = '';
    if (s.cationScore !== null){
      try {
        const cp = cationPathways(OCL, st.an.mol, s);
        const list = cp.pathways.filter((p) => p.shift).map((p) => `${p.label} → score ${p.score}`);
        shifts = list.length ? list.join('; ') : 'none that help';
      } catch { shifts = 'not checked'; }
    }
    const rows = [
      ['Class', `${CLS_TEXT[s.cls]}${s.allylic ? ', allylic' : ''}${s.benzylic ? ', benzylic' : ''}${s.inRing ? ', in a ring' : ''}`],
      ['Leaving group', `${LG_LABEL[s.lg]} (${s.lgRank >= 3 ? 'good' : s.lgRank === 2 ? 'fair' : 'poor'})`],
      ['β-H’s', String(s.betaH)],
      ['Stereo at Cα', { none: 'not a stereocentre', undefined: 'stereocentre, drawn without wedges', R: 'R', S: 'S', 'cis/trans': 'ring cis/trans', defined: 'defined' }[s.stereo] || s.stereo],
      ['Carbocation', s.cationScore === null ? 'none (vinyl/aryl)' : `${CLS_TEXT[s.cls]}, score ${s.cationScore}${s.ab ? ' (resonance)' : ''}`],
    ];
    if (shifts) rows.push(['1,2-shifts', shifts]);
    if (s.flags.length) rows.push(['Flags', [...new Set(s.flags)].join(', ')]);
    $('rxFactList').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    box.hidden = false;
  }

  // ---------- molecule from the main editor ----------
  function onMolecule(m){
    // the editor also reports redraws as changes; only a different structure resets the window
    const key = m ? m.getIDCode() : '';
    if (key === st.key){ st.keepOut = false; return; }
    st.key = key;
    st.mol = m; st.site = 0; st.sites = []; st.an = null; st.frags = [];
    // a product loaded from a result card keeps the results and mechanism on screen (marked as earlier)
    if (st.keepOut && st.res){ st.keepOut = false; $('rxStale').textContent = texts.ui.stale; $('rxStale').hidden = false; }
    else { st.keepOut = false; clearOut(); }
    if (m){
      try { st.frags = m.getFragments(); } catch { st.frags = [m]; }
      if (st.frags.length === 1){ st.an = analyse(OCL, m); st.sites = st.an.sites; }
    }
    const ranking = st.frags.length > 1;
    $('rxRank').hidden = !ranking;
    $('rxMain').hidden = ranking;
    if (ranking){ $('rxRankNote').textContent = fill(texts.ui.rankingMode, { n: st.frags.length }); $('rxRankList').replaceChildren(); }
    renderSites(); renderFacts();
    $('rxPredict').disabled = !m || ranking;
  }

  // ---------- ranking mode ----------
  function showRank(kind){
    const list = ({ SN1: rankSN1, SN2: rankSN2, E1: rankE1, Alk: rankAlkenes })[kind](OCL, st.frags);
    for (const b of [$('rxRankSN1'), $('rxRankSN2'), $('rxRankE1'), $('rxRankAlk'), $('rxPlan')]) b.setAttribute('aria-pressed', String(b.id.endsWith(kind)));
    const head = { SN1: 'SN1 rate, fastest first', SN2: 'SN2 rate, fastest first', E1: 'E1 rate with acid and heat (OH → OH₂⁺), fastest first', Alk: 'Alkene stability (rules, not energies), most stable first' }[kind];
    let prev = null;
    $('rxRankList').innerHTML = `<li class="rx-rankhead">${head}</li>` + list.map((x) => {
      const tie = x.place !== null && list.filter((y) => y.place === x.place).length > 1;
      const place = x.place === null ? '—' : (tie ? '=' : '') + x.place;
      prev = x.place;
      return `<li class="${x.none ? 'none' : ''}"><b class="rx-place">${place}</b><span class="rx-thumb">${svgOf(st.frags[x.index], 160, 90)}</span><span class="rx-why">${esc(x.reason)}${x.none ? '' : tie ? ' (tie)' : ''}</span></li>`;
    }).join('');
  }
  $('rxRankSN1').onclick = () => showRank('SN1');
  $('rxRankSN2').onclick = () => showRank('SN2');
  $('rxRankE1').onclick = () => showRank('E1');
  $('rxRankAlk').onclick = () => showRank('Alk');

  // ---------- reverse planner: first molecule → second, through the forward engine (planner.js) ----------
  let planToken = 0;
  async function showPlan(){
    for (const b of [$('rxRankSN1'), $('rxRankSN2'), $('rxRankE1'), $('rxRankAlk'), $('rxPlan')]) b.setAttribute('aria-pressed', String(b.id === 'rxPlan'));
    const list = $('rxRankList');
    if (st.frags.length !== 2){ list.innerHTML = '<li class="rx-rankhead">The planner needs exactly two molecules: the start first, then the target.</li>'; return; }
    const [A, B] = st.frags, token = ++planToken;
    list.innerHTML = '<li class="rx-rankhead" id="rxPlanHead">Trying routes…</li>';
    const res = await planRoutes(OCL, A, B, { rules, cat }, { onProgress: async (i, n) => { const h = $('rxPlanHead'); if (h) h.textContent = `Trying route ${i + 1} of ${n}…`; await new Promise((r) => setTimeout(r, 0)); } });
    if (token !== planToken) return;
    if (res.error){ list.innerHTML = '<li class="rx-rankhead">The first molecule has no leaving group or OH, so none of the routes can start.</li>'; return; }
    const nm = async (m) => m ? String((await nameOf(m)).name || 'another product').replace(/\.$/, '') : '';
    const rows = [`<li class="rx-rankhead">Get from <span class="rx-thumb">${svgOf(A, 160, 90)}</span> to <span class="rx-thumb">${svgOf(B, 160, 90)}</span></li>`];
    rows.push(`<li class="rx-rankhead">${res.works.length ? `${res.works.length} route${res.works.length > 1 ? 's give' : ' gives'} the target as the major product:` : 'None of the routes tried gives the target as the major product.'}</li>`);
    for (const r of res.works) rows.push(`<li class="plan"><b class="rx-place">✔</b><span><span class="rx-route">${esc(r.text)}</span><br>${esc(r.majorPw)}${r.via ? ' · ' + esc(r.via) : ''}${r.rank === 'competing' ? ' (competing with another product)' : ''}${r.stereoNote ? ' · ' + esc(r.stereoNote) : ''}</span></li>`);
    if (res.misses.length) rows.push('<li class="rx-rankhead">Why the others miss:</li>');
    for (const r of res.misses){
      let why;
      if (r.verdict === 'stopped') why = `stops at step ${(r.stopStep ?? 0) + 1}: ${reason(r.why)}`;
      else {
        const other = await nm(r.majorMol);
        const how = `${r.majorPw}${r.via ? ', ' + r.via : ''}`;
        why = r.verdict === 'competing' ? `the target forms, but only as one of two equal products (with ${other})`
          : r.verdict === 'minor' ? `the target is only a minor product; the major is ${other} (${how})`
          : `gives ${other} instead (${how})`;
      }
      if (token !== planToken) return;
      rows.push(`<li class="plan none"><b class="rx-place">✗</b><span><span class="rx-route">${esc(r.text)}</span><br>${esc(why)}</span></li>`);
    }
    rows.push('<li class="rx-rankhead"><small>Only these short sequences are tried, each step on the major product of the step before; every verdict comes from the same forward predictions as Predict.</small></li>');
    list.innerHTML = rows.join('');
  }
  $('rxPlan').onclick = () => showPlan();

  // ---------- reagent ----------
  function speciesText(r){
    if (r.smiles && r.smiles[0]){
      try {
        const m = OCL.Molecule.fromSmiles(r.smiles[0]);
        let q = 0; for (let a = 0; a < m.getAllAtoms(); a++) q += m.getAtomCharge(a);
        if (q < 0) return subs(m.getMolecularFormula().formula) + '⁻';
      } catch {}
      return r.label;
    }
    return 'Nu';
  }
  function setReagent(r, how){
    st.reagent = r;
    $('rxRoles').hidden = !st.drawn || how !== 'drawn';
    if (r && r.solvent) setSolvent(r.solvent);
    const info = $('rxReagentInfo');
    if (!r){ info.innerHTML = ''; }
    else if (r.id === 'custom'){
      info.innerHTML = `<b>Drawn reagent</b>: ${esc(ROLE_TEXT[r.box])}${r.estimated ? ` <span class="rx-est">${esc(texts.ui.estimated)}</span>` : ''}`;
    } else {
      info.innerHTML = `<b>${esc(r.label)}</b>: ${esc(texts.path.reagent[r.box] || '')}`;
      if (how !== 'drawn') showInEditor(r.smiles[0]);
    }
    for (const b of $('rxReagentChips').children) b.setAttribute('aria-pressed', String(!!r && findReagent(cat, b.dataset.q) === r));
    clearOut();
    touchStep();
  }
  function typedReagent(text){
    st.drawn = null;
    const r = findReagent(cat, text);
    if (r){ setReagent(r, 'typed'); setMsg(''); return; }
    setReagent(null);
    setMsg('');
    // an organic name with a leaving group (bromo…, …yl tosylate) is the substrate typed in the wrong box.
    // Alcohols aren't flagged: an unlisted alcohol may really be the (weak) nucleophile.
    if (/(fluoro|chloro|bromo|iodo)[\w-]|\w+yl (tosylate|mesylate)|\b(alkyl|benzyl) (halide|bromide|chloride|iodide)/i.test(text)){
      substrateHint(fill(texts.reagentTypes.substrateTyped, { text }), () => { $('nameInput').value = text; $('nameBtn').click(); });
      return;
    }
    $('rxReagentInfo').innerHTML = `<div class="msg warn">${esc(fill(texts.reagentTypes.typed, { text }))}</div>${typeGuide(null)}`;
  }
  // "This looks like the substrate": explain, and offer to move it where the substrate goes
  function substrateHint(msg, move){
    const info = $('rxReagentInfo');
    info.innerHTML = `<div class="msg warn">${esc(msg)}</div>`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rx-use-sub'; b.textContent = texts.reagentTypes.useAsSubstrate;
    b.onclick = () => { move(); $('rxReagentInput').value = ''; info.innerHTML = ''; $('editor').scrollIntoView({ behavior: smooth(), block: 'center' }); };
    info.appendChild(b);
  }
  // The four reagent types: how to spot each one and what it does (shown for unrecognised reagents).
  // `pick` highlights the type currently chosen for a drawn reagent.
  function typeGuide(pick){
    const T = texts.reagentTypes;
    return `<div class="rx-types"><div class="rx-lab">${esc(T.intro)}</div><dl>${ROLES.map((r) => `
      <dt class="${r === pick ? 'on' : ''}" data-type="${r}">${esc(T[r].name)}${r === pick ? ' ◀' : ''}</dt>
      <dd><b>Spot it:</b> ${esc(T[r].spot)}<br><b>Does:</b> ${esc(T[r].does)}</dd>`).join('')}</dl></div>`;
  }
  function renderRoles(){
    const box = $('rxRoles');
    box.innerHTML = `<div class="rx-lab">${esc(st.guess ? texts.reagentTypes.guessed : texts.reagentTypes.noRule)}</div>`;
    for (const role of ROLES){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
      const isGuess = st.guess && st.guess.box === role;
      b.innerHTML = esc(ROLE_TEXT[role]) + (isGuess ? ` <span class="rx-est">${esc(texts.ui.estimated)}</span>` : '');
      b.setAttribute('aria-pressed', String(!!st.reagent && st.reagent.box === role));
      b.onclick = () => { setReagent(entryFromMolecule(OCL, st.drawn, role), 'drawn'); renderRoles(); };
      box.appendChild(b);
    }
    if (st.guess) { const w = document.createElement('div'); w.className = 'note'; w.textContent = 'Rule used: ' + st.guess.why; box.appendChild(w); }
    const g = document.createElement('div'); g.innerHTML = typeGuide(st.reagent ? st.reagent.box : null); box.appendChild(g.firstElementChild);
  }
  // a typed/chosen reagent is shown in the reagent editor; remember it, so its redraws aren't read as a new drawing
  function showInEditor(smiles){
    if (!st.ed) return;
    st.quiet = true; try { st.ed.setMolecule(OCL.Molecule.fromSmiles(smiles)); } catch {} st.quiet = false;
    const m = st.ed.getMolecule(); st.drawnKey = m && m.getAllAtoms() ? m.getIDCode() : '';
  }
  function showMolInEditor(mol){
    if (!st.ed) return;
    st.quiet = true; try { st.ed.setMolecule(mol ? mol.getCompactCopy() : new OCL.Molecule(0, 0)); } catch {} st.quiet = false;
    const m = st.ed.getMolecule(); st.drawnKey = m && m.getAllAtoms() ? m.getIDCode() : '';
  }
  function drawnReagent(){
    if (st.quiet || !st.ed) return;
    const m = st.ed.getMolecule();
    // like the main editor, the reagent editor reports redraws and resizes as changes: only a different
    // structure counts (otherwise a layout change elsewhere re-set the reagent and closed the results)
    const key = m && m.getAllAtoms() ? m.getIDCode() : '';
    if (key === st.drawnKey) return;
    st.drawnKey = key;
    if (!key){ st.drawn = null; return; }
    const mol = m.getCompactCopy();
    const r = matchMolecule(OCL, cat, mol);
    $('rxReagentInput').value = '';
    if (r){ st.drawn = null; setReagent(r, 'drawn'); $('rxRoles').hidden = true; setMsg(''); return; }
    // a C–halogen or C–OSO₂R bond means this is a substrate drawn in the reagent editor
    const lgSite = mol.getFragments().length === 1 && analyse(OCL, mol).sites.find((x) => x.lg !== 'OH');
    if (lgSite){
      st.drawn = null; setReagent(null); $('rxRoles').hidden = true; setMsg('');
      substrateHint(fill(texts.reagentTypes.substrateDrawn, { lg: 'C–' + (LG_LABEL[lgSite.lg] || lgSite.lg) }), () => app.loadMolecule(mol.getCompactCopy()));
      return;
    }
    st.drawn = mol;
    st.guess = guessBox(OCL, mol);
    setReagent(st.guess ? entryFromMolecule(OCL, mol, st.guess.box) : null, 'drawn');
    $('rxRoles').hidden = false;
    renderRoles();
    setMsg('');
  }
  for (const q of QUICK){
    const r = findReagent(cat, q); if (!r) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.q = q; b.textContent = r.label;
    b.onclick = () => { $('rxReagentInput').value = r.label; st.drawn = null; setReagent(r, 'chip'); setMsg(''); };
    $('rxReagentChips').appendChild(b);
  }
  $('rxReagentForm').onsubmit = (e) => {
    e.preventDefault();
    const t = $('rxReagentInput').value.trim(); if (!t) return;
    // "1) TsCl, py 2) NaCN, DMF" fills the steps; anything else is one reagent for the current step
    const seq = parseSequence(cat, t);
    if (seq && seq.error){ setMsg(texts.sequence.parseError + ' ' + seq.error); return; }
    if (seq){ setSequence(seq.steps); setMsg(''); return; }
    typedReagent(t);
  };
  $('rxDrawBox').addEventListener('toggle', () => {
    if (!$('rxDrawBox').open || st.ed) return;
    st.ed = new OCL.CanvasEditor($('rxReagentEd'), { initialMode: 'molecule' });
    if (st.reagent && st.reagent.smiles && st.reagent.smiles[0]) showInEditor(st.reagent.smiles[0]);
    let t = 0;
    st.ed.setOnChangeListener((e) => { if (!e || e.type === 'molecule'){ clearTimeout(t); t = setTimeout(drawnReagent, 350); } });
  });

  // ---------- solvent + heat ----------
  function setSolvent(id){
    const s = findSolvent(cat, id);
    st.solvent = s ? s.id : null;
    const ids = [...SOLVENT_CHIPS]; if (s && !ids.includes(s.id)) ids.push(s.id);
    $('rxSolvents').replaceChildren(...ids.map((sid) => {
      const sv = findSolvent(cat, sid);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
      b.textContent = sv.label; b.title = `polar ${sv.type}`; b.dataset.solvent = sv.id;
      b.setAttribute('aria-pressed', String(sv.id === st.solvent));
      b.onclick = () => { setSolvent(sv.id); clearOut(); touchStep(); };
      return b;
    }));
    $('rxSolventType').textContent = s ? `polar ${s.type}` : 'pick a solvent';
  }
  setSolvent(null);
  $('rxHeat').onclick = () => { st.heat = !st.heat; $('rxHeat').setAttribute('aria-pressed', String(st.heat)); clearOut(); touchStep(); };

  // ---------- predict ----------
  function setMsg(t, kind = 'warn'){ const m = $('rxMsg'); m.hidden = !t; m.className = 'msg ' + kind; m.textContent = t; }
  function clearOut(){ $('rxOut').hidden = true; $('rxStale').hidden = true; $('rxChain').hidden = true; st.chain = null; st.res = null; st.resAn = null; closeMech(); st.scene = []; renderScene(); }
  $('rxPredict').onclick = () => {
    if (!st.mol){ setMsg('Draw a substrate in the editor first.'); return; }
    if (st.steps.length > 1){ predictChain(); return; }
    if (!st.reagent){ setMsg('Pick a reagent first: type it, tap a chip, or draw it.'); return; }
    if (!st.solvent){ setMsg('Pick a solvent.'); return; }
    let res;
    try { res = predict(OCL, st.mol, st.reagent, { solvent: st.solvent, heat: st.heat, site: st.sites.length > 1 ? st.site : undefined }, { rules, cat }); }
    catch (e) { console.error(e); setMsg('Something went wrong in the prediction: ' + e.message, 'bad'); return; }
    $('rxStale').hidden = true; closeMech();
    st.res = res;
    st.rx = { reagent: st.reagent, solvent: st.solvent };
    st.resAn = st.an; // the mechanism viewer keeps using this substrate even after a product is loaded
    st.scene = [];
    renderResult(res);
    renderScene();
  };

  // ---------- multistep sequences (1) TsCl, pyridine 2) NaCN, DMF) ----------
  // The reagent controls above edit the current step; each step keeps its own reagent, solvent and heat.
  const blankStep = () => ({ reagent: null, drawn: null, guess: null, solvent: null, heat: false, text: '' });
  function saveStep(){ st.steps[st.cur] = { reagent: st.reagent, drawn: st.drawn, guess: st.guess, solvent: st.solvent, heat: st.heat, text: $('rxReagentInput').value }; }
  function loadStep(i){
    st.cur = i; st.loading = true;
    const s = st.steps[i];
    st.drawn = s.drawn; st.guess = s.guess;
    setReagent(s.reagent, s.drawn ? 'drawn' : 'chip');
    if (s.drawn){ showMolInEditor(s.drawn); renderRoles(); }
    else if (!s.reagent) showMolInEditor(null);
    setSolvent(s.solvent);
    st.heat = s.heat; $('rxHeat').setAttribute('aria-pressed', String(st.heat));
    $('rxReagentInput').value = s.text || (s.reagent && s.reagent.id !== 'custom' ? s.reagent.label : '');
    st.loading = false;
    renderSteps();
  }
  // a reagent/solvent/heat change: keep the current step's tab label up to date
  function touchStep(){ if (st.loading || st.steps.length < 2) return; saveStepQuiet(); renderSteps(); }
  function stepLabel(s){
    if (!s.reagent) return '…';
    const sv = findSolvent(cat, s.solvent);
    return [s.reagent.id === 'custom' ? subs(s.reagent.formula || 'drawn') : s.reagent.label, sv ? sv.label : null, s.heat ? 'heat' : null].filter(Boolean).join(', ');
  }
  function renderSteps(){
    const box = $('rxSteps');
    box.replaceChildren();
    const multi = st.steps.length > 1;
    st.steps.forEach((s, i) => {
      if (!multi) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip rx-steptab';
      b.textContent = `${i + 1}) ${stepLabel(s)}`; b.setAttribute('aria-pressed', String(i === st.cur));
      b.onclick = () => { if (i === st.cur) return; saveStep(); loadStep(i); };
      box.appendChild(b);
    });
    if (st.steps.length < 3){
      const a = document.createElement('button'); a.type = 'button'; a.className = 'chip rx-addstep';
      a.textContent = multi ? `+ Step ${st.steps.length + 1}` : texts.sequence.addStep;
      a.onclick = () => { saveStep(); st.steps.push(blankStep()); loadStep(st.steps.length - 1); setMsg(''); };
      box.appendChild(a);
    }
    if (multi){
      const x = document.createElement('button'); x.type = 'button'; x.className = 'chip rx-delstep';
      x.textContent = `× Remove step ${st.cur + 1}`;
      x.onclick = () => { st.steps.splice(st.cur, 1); st.picks = []; loadStep(Math.min(st.cur, st.steps.length - 1)); };
      box.appendChild(x);
    }
    $('rxStepNote').hidden = !multi;
    if (multi) $('rxStepNote').textContent = fill(texts.sequence.editing, { n: st.cur + 1, total: st.steps.length });
  }
  // the tab labels show the current step's live choices
  function saveStepQuiet(){ const s = st.steps[st.cur]; Object.assign(s, { reagent: st.reagent, drawn: st.drawn, guess: st.guess, solvent: st.solvent, heat: st.heat }); }
  function setSequence(steps){
    st.steps = steps.map((x) => ({ ...blankStep(), reagent: x.reagent, solvent: x.solvent, heat: x.heat, text: x.reagent.label }));
    st.picks = [];
    loadStep(0);
  }
  function predictChain(){
    saveStep();
    for (const [i, s] of st.steps.entries()){
      if (!s.reagent){ setMsg(fill(texts.sequence.needReagent, { n: i + 1 })); return; }
      if (!s.solvent){ setMsg(fill(texts.sequence.needSolvent, { n: i + 1 })); return; }
    }
    const steps = st.steps.map((s, k) => ({ reagent: s.reagent, solvent: s.solvent, heat: s.heat, site: k === 0 && st.sites.length > 1 ? st.site : undefined }));
    let out;
    try { out = runSequence(OCL, st.mol, steps, { rules, cat }, st.picks); }
    catch (e) { console.error(e); setMsg('Something went wrong in the prediction: ' + e.message, 'bad'); return; }
    $('rxStale').hidden = true; closeMech();
    const keep = st.chain ? st.chainView : null;
    st.chain = { steps: st.steps.map((s) => ({ ...s })), out };
    st.scene = [];
    const last = out.stopped ?? out.steps.length - 1;
    viewChainStep(keep !== null && keep <= last ? keep : last);
  }
  // show step k of the chain in the normal result area (decision path, lamps, cards)
  function viewChainStep(k){
    const ch = st.chain, s = ch.out.steps[k];
    st.chainView = k;
    renderChain();
    $('rxOut').hidden = false;
    if (!s.res){ // not run
      for (const id of ['rxPath', 'rxLamps', 'rxNotes', 'rxCards']) $(id).replaceChildren();
      $('rxPathInfo').hidden = true;
      $('rxNotes').innerHTML = `<div class="badge warn"><span>${esc(reason('sequence_not_run'))}</span></div>`;
      st.res = null; return;
    }
    if (!s.an) s.an = analyse(OCL, s.input);
    st.res = s.res; st.rx = { reagent: ch.steps[k].reagent, solvent: ch.steps[k].solvent }; st.resAn = s.an;
    renderResult(s.res);
    if (s.stop && !s.res.notCovered) $('rxNotes').insertAdjacentHTML('afterbegin', `<div class="badge bad"><span>${esc(texts.sequence.stopped + ' ' + reason(s.stop))}</span></div>`);
    else if (s.stop) $('rxNotes').insertAdjacentHTML('afterbegin', `<div class="badge bad"><span>${esc(texts.sequence.stopped)}</span></div>`);
    // which product carries on to the next step; any other can be picked instead
    const more = k < ch.out.steps.length - 1;
    for (const c of $('rxCards').querySelectorAll('.rx-card')){
      const chosen = s.chosen && c.dataset.idcode === s.chosen.product.idcode;
      c.classList.toggle('rx-chosen', !!chosen && more);
      if (!more) continue;
      const row = c.querySelector('.row');
      if (chosen){ const t = document.createElement('span'); t.className = 'rx-carry'; t.textContent = fill(texts.sequence.carried, { n: k + 2 }); row.prepend(t); }
      else {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'rx-continue'; b.textContent = fill(texts.sequence.continueFrom, { n: k + 2 });
        b.onclick = () => { st.picks[k] = c.dataset.idcode; predictChain(); };
        row.prepend(b);
      }
    }
    renderScene();
  }
  // the strip: start → 1) reagent → product → 2) reagent → product …
  function renderChain(){
    const ch = st.chain, box = $('rxChain');
    box.hidden = false;
    const n = ch.out.steps.length;
    const node = (m, cls) => `<span class="rx-cthumb ${cls || ''}">${m ? svgOf(m, 150, 90) : ''}</span>`;
    let h = `<div class="rx-chead">${esc(texts.sequence.title)}</div><ol class="rx-clist"><li class="rx-cstart">${node(ch.out.steps[0].input || st.mol)}<small>${esc(texts.sequence.start)}</small></li>`;
    ch.out.steps.forEach((s, k) => {
      const lab = `${k + 1}) ${stepLabel(ch.steps[k])}`;
      const body = s.chosen && !s.stop ? `${node(s.chosen.product.mol)}<small>${esc(s.chosen.pw === 'activation' ? 'activated' : s.chosen.pw)}${s.chosen.product.rank && s.chosen.pw !== 'activation' ? ' · ' + esc(s.chosen.product.rank) : ''}${st.picks[k] && s.chosen.product.idcode === st.picks[k] ? ' · ' + esc(texts.sequence.yourPick) : ''}</small>`
        : `<span class="rx-cthumb rx-cstop">${esc(s.stop === 'sequence_not_run' ? texts.sequence.notRun : texts.sequence.stopShort)}</span><small>${esc(s.stop === 'sequence_not_run' ? '' : texts.sequence.notCovered)}</small>`;
      h += `<li class="rx-carrow" aria-hidden="true">→</li><li><button type="button" class="rx-cstep" data-k="${k}" aria-pressed="${k === st.chainView}"><b>${esc(lab)}</b>${body}</button></li>`;
    });
    h += '</ol>';
    const playable = ch.out.steps[0].chosen && !ch.out.steps[0].stop;
    h += `<div class="row">${playable ? `<button type="button" class="primary" id="rxPlayChain">${esc(texts.sequence.watchAll)}</button>` : ''}<span class="rx-lab" id="rxChainView">${esc(fill(texts.sequence.showing, { n: st.chainView + 1, total: n }))}</span></div>`;
    box.innerHTML = h;
    for (const b of box.querySelectorAll('.rx-cstep')) b.onclick = () => { closeMech(); viewChainStep(Number(b.dataset.k)); };
    const play = $('rxPlayChain'); if (play) play.onclick = () => playChain(0);
  }
  const STEP_VERB = { TsCl: 'tosylation', MsCl: 'mesylation' };
  function stepTitle(k){
    const ch = st.chain, s = ch.out.steps[k], r = ch.steps[k].reagent, n = ch.out.steps.length;
    const what = s.chosen.pw === 'activation' ? STEP_VERB[r.act] || 'activation' : `${s.chosen.pw} with ${r.id === 'custom' ? 'the drawn reagent' : r.label}`;
    return fill(texts.sequence.stepTitle, { n: k + 1, total: n, what });
  }
  // what changed between step k-1 and step k (a dialog page before step k's mechanism)
  function bridgeText(k){
    const ch = st.chain, prev = ch.out.steps[k - 1], cur = ch.out.steps[k], T = texts.sequence.bridge;
    const site = cur.res && cur.res.site;
    if (!site) return '';
    const pr = ch.steps[k - 1].reagent, nx = ch.steps[k].reagent;
    const v = { k, next: k + 1, LG: LG_LABEL[site.lg] || site.lg, LGion: LG_ION[site.lg] || `${site.lg}⁻`, class: CLS_TEXT[site.cls], prev: pr.label, Reagent: nx.id === 'custom' ? 'the drawn reagent' : nx.label, pw: prev.chosen.pw };
    const before = prev.res.site;
    let t = prev.chosen.pw === 'activation' ? T.activated : before && before.lg === 'OH' && site.lg !== 'OH' ? T.newLG : T.generic;
    t = fill(t, v);
    if (prev.chosen.product.stereo === 'retention') t += ' ' + T.retention;
    else if (prev.chosen.product.stereo === 'inversion') t += ' ' + T.inversion;
    else if (prev.chosen.product.stereo === 'racemic') t += ' ' + T.racemic;
    return t;
  }
  // play step k's mechanism (its chosen product), then offer the next step
  function playChain(k){
    const ch = st.chain, s = ch.out.steps[k], n = ch.out.steps.length;
    if (!s || !s.chosen || s.stop){ viewChainStep(k); return; }
    viewChainStep(k);
    const nx = ch.out.steps[k + 1];
    let offer = null;
    if (nx && nx.chosen && !nx.stop) offer = { text: fill(texts.sequence.nextText, { n: k + 2, total: n, what: stepLabel(ch.steps[k + 1]) }), label: fill(texts.sequence.nextButton, { n: k + 2 }), open: () => playChain(k + 1) };
    else if (nx) offer = { text: fill(texts.sequence.nextStops, { n: k + 2 }) + ' ' + reason(nx.stop), label: fill(texts.sequence.seeStep, { n: k + 2 }), open: () => { closeMech(); viewChainStep(k + 1); $('rxWin').scrollIntoView({ behavior: smooth(), block: 'start' }); } };
    const seq = { title: stepTitle(k), intro: k > 0 ? [bridgeText(k)].filter(Boolean) : [], offer };
    if (s.chosen.pw === 'activation') openActivation(s.chosen.product, seq);
    else openPathway(s.chosen.pw, s.chosen.product, seq);
  }

  function renderResult(res){
    setMsg('');
    $('rxOut').hidden = false;
    // decision path
    const lit = PATHWAYS.filter((p) => res.lamps[p] && res.lamps[p] !== 'none');
    const boxes = [...res.path.map((p) => ({ step: p.step, text: p.text })),
      { step: 'rule', text: res.notCovered ? 'not covered yet' : res.activation ? 'activation step' : lit.length ? lit.map((p) => `${p} ${res.lamps[p]}`).join(', ') : 'no reaction' }];
    $('rxPath').innerHTML = boxes.map((b, i) => `<button type="button" class="rx-box" data-step="${b.step}"><small>${esc(b.step)}</small><span>${esc(b.text)}</span></button>${i < boxes.length - 1 ? '<span class="rx-arrow" aria-hidden="true">→</span>' : ''}`).join('');
    $('rxPathInfo').hidden = true;
    for (const b of $('rxPath').querySelectorAll('.rx-box')) b.onclick = () => showStep(b.dataset.step, b);
    // lamps
    $('rxLamps').innerHTML = PATHWAYS.map((p) => `<button type="button" class="lamp ${res.lamps[p] || 'none'}" data-pw="${p}" aria-label="${p}: ${LAMP_TEXT[res.lamps[p] || 'none']}"><i></i>${p}<small>${LAMP_TEXT[res.lamps[p] || 'none']}</small></button>`).join('');
    for (const b of $('rxLamps').querySelectorAll('.lamp')) b.onclick = () => openPathway(b.dataset.pw);
    // notes
    const notes = [];
    if (res.notCovered) notes.push(['bad', 'Not covered yet: ' + reason(res.notCovered)]);
    if (res.reasons.includes('vinyl_aryl')) notes.push(['warn', reason('vinyl_aryl')]);
    for (const w of res.warnings) notes.push(['warn', reason(w)]);
    for (const pw of PATHWAYS) for (const n of (res.pathways[pw] && res.pathways[pw].notes) || []){
      if (/warning/.test(n)) continue;
      if (n === 'ring_e2_checked') notes.push(['ok', `${pw}: ${fill(reason(n), { detail: res.pathways[pw].chairCheck.text })}`]);
      else if (n === 'e2_anti_checked') notes.push(['ok', `${pw}: ${fill(reason(n), { detail: res.pathways[pw].antiCheck.text })}`]);
      else notes.push(['warn', `${pw}: ${reason(n)}`]);
    }
    if (st.rx.reagent && st.rx.reagent.estimated) notes.push(['warn', 'The reagent’s role is estimated by the rules, not looked up.']);
    $('rxNotes').innerHTML = notes.map(([k, t]) => `<div class="badge ${k}"><span>${esc(t)}</span></div>`).join('');
    // result cards
    const cards = $('rxCards'); cards.replaceChildren();
    if (res.activation) cards.appendChild(card(res.activation.product, 'activation', st.chain ? texts.sequence.activatedNote : 'OH → sulfonate ester (a good leaving group). Now pick a nucleophile for step 2.'));
    for (const pw of PATHWAYS){
      const out = res.pathways[pw];
      if (!out || out.lamp === 'none') continue;
      for (const p of out.products) cards.appendChild(card(p, pw));
    }
  }
  function showStep(step, btn){
    const info = $('rxPathInfo');
    const closing = !info.hidden && info.dataset.step === step;
    for (const b of $('rxPath').querySelectorAll('.rx-box')) b.classList.toggle('pressed', b === btn && !closing);
    if (closing){ info.hidden = true; return; }
    const res = st.res, f = res.facts || {}, s = res.site;
    let t = [];
    if (step === 'substrate' && s){ t.push(texts.path.substrate[s.cls] || ''); if (s.ab) t.push(reason('ab_cation')); }
    if (step === 'reagent' && st.rx.reagent) t.push(texts.path.reagent[st.rx.reagent.box] || '');
    if (step === 'conditions'){ if (f.solvent) t.push(texts.path.solvent[f.solvent]); if (f.heat) t.push(texts.path.solvent.heat); }
    if (step === 'rule'){ t = res.notCovered ? [reason(res.notCovered)] : res.reasons.map(reason); if (!t.length) t.push('No rule row matched.'); }
    info.dataset.step = step;
    info.innerHTML = t.filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
    info.hidden = false;
  }

  // ---------- result card ----------
  // inMech: the copy shown inside the mechanism's last frame (no Watch button there)
  function card(p, pw, extra, inMech = false){
    const div = document.createElement('div');
    div.className = 'rx-card';
    div.dataset.idcode = p.idcode;
    const out = st.res && st.res.pathways[pw];
    const lab = stereoLabels(p.mol);
    const stereoTxt = [];
    if (lab.rs.length) stereoTxt.push('R/S: ' + lab.rs.join(', '));
    if (lab.ez.length) stereoTxt.push('E/Z: ' + lab.ez.join(', '));
    if (p.stereo === 'racemic') stereoTxt.push('both configurations at the former C⁺ (racemic)');
    else if (p.stereo) stereoTxt.push(p.stereo);
    if (!stereoTxt.length) stereoTxt.push('none');
    div.innerHTML = `
      <div class="rx-cardh"><b>${esc(pw === 'activation' ? 'Step 1 product' : pw)}</b><span class="rx-rank ${esc(p.rank)}">${esc(p.rank || '')}</span></div>
      <div class="rx-draw">${svgOf(p.mol)}</div>
      <div class="rx-nameline"></div>
      <dl class="rx-dl">
        <dt>Stereo</dt><dd>${esc(stereoTxt.join('; '))}</dd>
        ${out ? `<dt>Stereospecific</dt><dd>${out.stereospecific ? 'Y' : 'N'}</dd>` : ''}
        ${p.via ? `<dt>Via</dt><dd>${esc(p.via)}</dd>` : ''}
      </dl>
      ${extra ? `<div class="note">${esc(extra)}</div>` : ''}
      <div class="row"><button type="button" class="rx-load">Load into editor</button><button type="button" class="rx-3d">${esc(texts.ui.view3d)}</button>${(out || pw === 'activation') && !inMech ? '<button type="button" class="rx-watch">▶ Watch</button>' : ''}</div>`;
    nameLine(p.mol, div.querySelector('.rx-nameline'));
    const w = div.querySelector('.rx-watch'); if (w) w.onclick = () => (pw === 'activation' ? openActivation(p) : openPathway(pw, p));
    div.querySelector('.rx-load').onclick = () => { st.keepOut = true; app.loadMolecule(p.mol.getCompactCopy()); $('editor').scrollIntoView({ behavior: smooth(), block: 'center' }); };
    // add this product to the Viewer's 3D scene, next to the substrate
    div.querySelector('.rx-3d').onclick = () => {
      toggleScene(`${pw}:${p.idcode}`, true);
      const t = document.querySelector('.tab[data-view="v3d"]'); if (t) t.click();
      $('viewer3d').scrollIntoView({ behavior: smooth(), block: 'center' });
    };
    return div;
  }

  // ---------- the mechanism's last step: product in 3D ----------
  // Laptop (two columns): the product joins the Viewer's 3D scene (left column), next to the substrate.
  // Phone (one column): the Viewer is far above, so a small 3D box sits inside the last step instead. The shape is a computed conformer
  // (OpenChemLib + MMFF94s+), like the Molecule tab's 3D model.
  const finalHooks = (fv) => ({ resultCard: () => fv.card(), onResult: (on) => fv.shown(on) });
  const wide = () => typeof matchMedia === 'function' && matchMedia('(min-width: 981px)').matches;
  function finalView(p, pw){
    const T = texts.ui;
    const box = document.createElement('div');
    box.className = 'rx-3dbox';
    box.innerHTML = `<div class="rx-3dview" role="img" aria-label="${esc(T.final3dLabel)}"></div><div class="rx-3dcap">${esc(p.stereo === 'racemic' ? T.final3dRacemic : T.final3d)}</div>`;
    const wrap = document.createElement('div');
    wrap.className = 'rx-final';
    const cardEl = card(p, pw, undefined, true);
    let v = null, built = false;
    function build(){
      if (!box.isConnected || box.closest('[hidden]')) return;
      if (built){ if (v){ v.resize(); v.render(); } return; }
      built = true;
      const view = box.querySelector('.rx-3dview');
      let conf = null;
      try {
        conf = new OCL.ConformerGenerator(42).getOneConformerAsMolecule(p.mol.getCompactCopy());
        if (conf){ try { new OCL.ForceFieldMMFF94(conf, 'MMFF94s+').minimise({ maxIts: 4000 }); } catch {} }
      } catch (e) { console.warn(e); }
      v = conf && window.$3Dmol ? $3Dmol.createViewer(view, { backgroundColor: '#000000', antialias: true }) : null;
      if (!v){ view.textContent = T.final3dNone; view.classList.add('none'); return; }
      v.addModel(conf.toMolfile(), 'sdf');
      v.setStyle({}, { stick: { radius: 0.13, colorscheme: 'Jmol' }, sphere: { scale: 0.27, colorscheme: 'Jmol' } });
      v.zoomTo(); v.zoom(0.9); v.render();
    }
    return {
      // the element for the mechanism's last step
      card(){
        if (wide()){ toggleScene(`${pw}:${p.idcode}`, true); wrap.replaceChildren(cardEl); return wrap; }
        wrap.replaceChildren(box, cardEl);
        requestAnimationFrame(build); // the viewer needs the box on the page, with its size
        return wrap;
      },
      shown(){},
    };
  }

  // ---------- quick-add: the reaction's other molecules in the Viewer's 3D scene ----------
  // Shown beside the substrate (the editor's molecule), left to right in the order they were added.
  // Groundwork for a 3D view of the whole reaction.
  function sceneItems(){
    const res = st.res, r = st.rx && st.rx.reagent, out = [];
    if (!res || res.notCovered) return out;
    if (r && r.smiles && r.smiles[0]){ try { out.push({ key: 'reagent', label: speciesText(r), mol: OCL.Molecule.fromSmiles(r.smiles[0]) }); } catch {} }
    if (res.site && /^(Cl|Br|I|F)$/.test(res.site.lg)) out.push({ key: 'lg', label: res.site.lg + '⁻', mol: OCL.Molecule.fromSmiles(`[${res.site.lg}-]`) });
    if (res.activation) out.push({ key: 'activation:' + res.activation.product.idcode, label: 'step 1 product', mol: res.activation.product.mol, p: res.activation.product });
    for (const pw of PATHWAYS){
      const o = res.pathways[pw];
      if (!o || o.lamp === 'none') continue;
      o.products.forEach((p, i) => out.push({ key: `${pw}:${p.idcode}`, label: st.sceneNames[p.idcode] ? `${pw} ${p.rank || ''}: ${st.sceneNames[p.idcode]}` : `${pw} ${p.rank || ''} #${i + 1}`, mol: p.mol, p }));
    }
    return out;
  }
  function renderScene(){
    const items = sceneItems();
    $('sceneNote').textContent = items.length ? texts.ui.sceneNote : texts.ui.sceneEmpty;
    // the substrate is a chip too, so it can be switched off like the others (on by default)
    const subChip = document.createElement('button'); subChip.type = 'button'; subChip.className = 'chip'; subChip.dataset.key = 'substrate';
    subChip.textContent = texts.ui.sceneSubstrate; subChip.setAttribute('aria-pressed', String(!st.hideSub));
    subChip.onclick = () => { st.hideSub = !st.hideSub; renderScene(); };
    $('sceneNamesBox').hidden = !items.length;
    $('sceneChips').replaceChildren(...(items.length ? [subChip] : []), ...items.map((it) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.key = it.key;
      b.textContent = it.label;
      b.setAttribute('aria-pressed', String(st.scene.includes(it.key)));
      if (it.p && !st.sceneNames[it.p.idcode]) nameOf(it.mol).then((n) => { if (n.name){ st.sceneNames[it.p.idcode] = n.name; b.textContent = `${it.label.replace(/ #\d+$/, '')}: ${n.name}`; } });
      b.onclick = () => toggleScene(it.key);
      return b;
    }));
    const byKey = new Map(items.map((it) => [it.key, it]));
    const extras = st.scene.map((k) => byKey.get(k)).filter(Boolean);
    pushScene(extras);
  }
  // the Molecule tab always shows the substrate; only the Reactions tab's chip can hide it
  function pushScene(extras){
    const hideSubstrate = st.hideSub && document.querySelector('main').dataset.app === 'rx' && !!st.res;
    const sig = [extras.map((e) => e.key).join('|'), hideSubstrate, st.sceneNamesOn].join('#');
    if (sig !== st.sceneSig){ st.sceneSig = sig; app.set3DExtras(extras, { hideSubstrate, names: st.sceneNamesOn }); } // rebuild the 3D scene only when it changes
  }
  function toggleScene(key, on){
    const has = st.scene.includes(key);
    if (on === undefined) on = !has;
    if (on === has) return;
    st.scene = on ? [...st.scene, key] : st.scene.filter((k) => k !== key);
    renderScene();
  }

  // ---------- mechanism ----------
  function closeMech(){ if (st.mech){ st.mech.close(); st.mech = null; } $('mechWin').hidden = true; }
  $('mechClose').onclick = closeMech;
  // pw's mechanism for one product (default: its first, i.e. the major one). Several products of one
  // pathway (SN1 with/without a shift, E2 Zaitsev/Hofmann) each get a Watch button, so each can be followed.
  function openPathway(pw, chosen, seq){
    const res = st.res; if (!res) return;
    closeMech();
    const out = res.pathways[pw];
    const win = $('mechWin'), mount = $('mechMount');
    $('mechTitle').textContent = seq ? seq.title : `${pw} mechanism`;
    win.hidden = false;
    if (!out || out.lamp === 'none' || !out.products.length){
      mount.innerHTML = `<div class="msg warn">${esc(pw)} doesn’t happen here (lamp off). Tap a lit lamp.</div>`;
      win.scrollIntoView({ behavior: smooth(), block: 'start' }); return;
    }
    if (!TEMPLATES[pw]){
      mount.innerHTML = `<div class="msg warn">${esc(fill(texts.ui.comingSoon, { pw }))}</div>`;
      win.scrollIntoView({ behavior: smooth(), block: 'start' }); return;
    }
    const p = chosen || out.products[0];
    const o = mechOptions(pw, p, out);
    if (seq){ o.intro = seq.intro; o.offer = [seq.offer, o.offer].filter(Boolean); }
    st.mech = openMechanism(mount, o);
    win.scrollIntoView({ behavior: smooth(), block: 'start' });
  }

  // The prepared substrate (same atom indices as the analysis), as a fresh copy: the viewer lays it out
  // and sets helper arrays on it, so the stored analysis isn't touched.
  function subMol(){ const c = (st.resAn || st.an || analyse(OCL, st.mol)).mol.getCompactCopy(); c.ensureHelperArrays(OCL.Molecule.cHelperRings); return c; }
  // Everything the viewer needs to follow this product: roles (atom indices), flags (which optional
  // frames apply), tokens (charges/labels that depend on the reagent) and the text variables.
  function mechOptions(pw, p, out){
    const res = st.res, site = res.site, r = st.rx.reagent;
    const m = subMol();
    const S = texts.stereo;
    const prelude = site.lg === 'OH' ? PRELUDE_OF[r.act] : null;
    const act = prelude && ACTIVATED[prelude];
    // nucleophile: the reagent's attaching atom; an activator's halide comes as X⁻
    const nuMol = r.nu ? (r.nu.mol || OCL.Molecule.fromSmiles(r.nu.smiles)) : null;
    const nuAtom = nuMol ? nuMol.getAtomLabel(r.nu.atom) : '';
    // a drawn, uncatalogued reagent is named by its formula; its R group is just "R"
    const rLabel = r.id === 'custom' ? subs(r.formula || '?') : r.label;
    const sp = speciesText(r);
    const Nu = r.box === 'activator' ? (nuAtom ? nuAtom + '⁻' : '') : r.id === 'custom' && !sp.endsWith('⁻') ? rLabel : sp;
    const nuCharged = Nu.endsWith('⁻');
    const R0 = r.id === 'water' ? 'H' : r.id === 'custom' ? 'R' : (r.label.replace(/OH$/, '') || r.label);
    // base: E2 → the reagent; E1 → the solvent (a weak base; water for acid dehydration). An aprotic
    // solvent (DMSO…) isn't a base, so there the reagent's anion takes the β-H (course rule for 3° benzylic + CN⁻)
    const solv = findSolvent(cat, st.rx.solvent) || { label: 'solvent' };
    const reagentBase = pw === 'E2' || (pw === 'E1' && solv.type === 'aprotic' && r.nu && r.box !== 'activator');
    const Base = reagentBase ? speciesText(r) : r.act === 'acid' ? 'H₂O' : solv.label;
    const baseCharged = reagentBase && Base.endsWith('⁻');
    const baseAtom = reagentBase ? (nuAtom || 'N') : 'O';
    // roles and flags
    const roles = { ca: site.ca, lg: site.lgAtom, c: site.ca, cb: null, n: null, g: null, ab: null, y: null };
    const flags = { major: p.rank === 'major', activated: !!act, nuNeutral: !nuCharged, e1: pw === 'E1', hofmann: pw === 'E2' && /Hofmann/.test(p.via || '') };
    const cations = (out && out.cations) || [];
    if (pw === 'SN1' || pw === 'E1'){
      roles.c = p.centre ?? site.ca;
      if (['H', 'alkyl', 'ring'].includes(p.shift)){
        flags.shift = true; flags['shift' + { H: 'H', alkyl: 'Alkyl', ring: 'Ring' }[p.shift]] = true;
        roles.n = p.centre; roles.g = p.group ?? null;
      }
      flags.canShift = cations.some((c) => ['H', 'alkyl', 'ring'].includes(c.shift));
      const al = cations.find((c) => c.shift === 'allylic');
      if (site.allylic && al){
        flags.allylic = true; roles.y = al.centre;
        for (let i = 0; i < m.getConnAtoms(site.ca); i++){ const b = m.getConnAtom(site.ca, i); for (let j = 0; j < m.getConnAtoms(al.centre); j++) if (m.getConnAtom(al.centre, j) === b) roles.ab = b; }
        flags.allylicFar = p.shift === 'allylic';
      }
    }
    if (pw === 'E1' || pw === 'E2') roles.cb = p.beta ?? null;
    // cation classes and the stability meter (from the rule-based cation score, not a calculation)
    const cation = CLS_TEXT[site.cls] + (site.allylic ? ' allylic' : site.benzylic ? ' benzylic' : '');
    const cation2 = flags.shift ? CLS_TEXT[p.cationCarbons] || `${p.cationCarbons}°` : cation;
    const meterOf = (sc) => Math.max(1, Math.min(4, (sc ?? 2) - 1));
    // leaving group as drawn, and what leaves
    const LG = act ? act.LG : site.lg;
    const LGion = act ? act.LGion : LG_ION[site.lg] || `${site.lg}⁻`;
    const tokens = {
      nu: nuCharged ? '−' : '', nuAfter: nuCharged ? '' : '+', nuDelta: nuCharged ? 'δ−' : 'δ+',
      nuRestOx: R0 === 'H' ? 'H₂' : `(H)(${R0})`, nuRestR: R0 === 'H' ? 'H' : `(${R0})`,
      base: baseCharged ? '−' : '', baseH: baseCharged ? '' : '+',
      baseRestH: baseCharged ? `(${Base.replace('⁻', '')}H)` : Base === 'H₂O' ? '(H₃O⁺)' : /OH$/.test(Base) ? `(${Base}₂⁺)` : `(${Base}–H⁺)`,
      lgBound: act ? act.bound : '', lgFree: act ? act.free : '−',
      c0: meterOf(site.cationScore), c1: meterOf(p.cationScore ?? site.cationScore),
    };
    const virt = {
      nu: { atom: nuAtom || '?', rest: nuCharged ? (nuMol && nuMol.getAtoms() > 1 ? `(${Nu})` : '') : `(${rLabel})` },
      base: { atom: baseAtom, rest: `(${Base})` },
      hx: { atom: r.act === 'acid' ? (r.id === 'h3po4' ? 'OPO₃H₂' : 'OSO₃H') : nuAtom },
    };
    if (ACT_ATOMS[r.act]){ virt.act = ACT_ATOMS[r.act][0]; virt.ax = ACT_ATOMS[r.act][1]; }
    // stereo sentence
    let stereo = '';
    if (pw === 'SN2') stereo = sn2Stereo(site, r, p);
    else if (pw === 'SN1') stereo = p.stereo === 'racemic' ? S.racemic : S.sn1_none;
    else stereo = p.ez ? fill(S.ez, { ez: p.ez }) : p.ezNotCovered ? S.ez_unknown : S.ez_none;
    const template = prelude ? { ...TEMPLATES[pw], frames: [...PRELUDES[prelude], ...TEMPLATES[pw].frames] } : TEMPLATES[pw];
    return {
      OCL, mol: m, site, roles, flags, tokens, virt, template, texts,
      labels: act ? { lg: act.label } : {},
      vars: { Nu, NuAtom: nuAtom, Base, LG, LGion, X: virt.hx.atom, Acid: rLabel, class: CLS_TEXT[site.cls], cation, cation2, via: p.via || '', stereo, rank: p.rank || '' },
      productName: nameOf(p.mol).then((n) => String(n.name || n.why || '').replace(/\.$/, '')),
      ...finalHooks(finalView(p, pw)),
      offer: offerFor(pw),
    };
  }
  // "E1 also competes here. See it?": another lit pathway (its partner first), with why it's major/minor
  function offerFor(pw){
    const res = st.res;
    const lit = (q) => q !== pw && res.lamps[q] && res.lamps[q] !== 'none' && TEMPLATES[q] && res.pathways[q] && res.pathways[q].products.length;
    const other = [PARTNER[pw], ...PATHWAYS].find(lit);
    if (!other) return null;
    const otherMajor = res.lamps[other] === 'major';
    const [maj, min] = otherMajor ? [other, pw] : [pw, other];
    const v = { other, Nu: speciesText(st.rx.reagent), class: CLS_TEXT[res.site.cls] };
    const why = texts.compete[`${maj}>${min}`] || texts.compete.generic;
    return {
      text: fill(otherMajor ? texts.ui.offerMajor : texts.ui.offerMinor, v) + ' ' + fill(why, v),
      label: fill(texts.ui.offerButton, v),
      open: () => openPathway(other),
    };
  }
  // Step 1 of a two-step sequence (TsCl/MsCl): the activation on its own; the C–O bond is kept
  function openActivation(p, seq){
    const res = st.res, site = res.site, r = st.rx.reagent;
    closeMech();
    $('mechTitle').textContent = seq ? seq.title : 'Activation (step 1)';
    $('mechWin').hidden = false;
    const [actA, axA] = ACT_ATOMS[r.act] || ACT_ATOMS.TsCl;
    st.mech = openMechanism($('mechMount'), {
      OCL, mol: subMol(), site, roles: { ca: site.ca, lg: site.lgAtom }, flags: {}, tokens: {},
      virt: { act: actA, ax: axA }, template: ACTIVATION, texts,
      vars: { Nu: '', LG: 'OH', class: CLS_TEXT[site.cls], stereo: '', rank: '' },
      productName: nameOf(p.mol).then((n) => String(n.name || n.why || '').replace(/\.$/, '')),
      ...finalHooks(finalView(p, 'activation')),
      intro: seq ? seq.intro : undefined, offer: seq && seq.offer ? [seq.offer] : undefined,
    });
    $('mechWin').scrollIntoView({ behavior: smooth(), block: 'start' });
  }
  // the stereo sentence for SN2, with R/S from OpenChemLib on the product (never swapped by hand)
  function sn2Stereo(site, r, p){
    const S = texts.stereo;
    if (site.stereo === 'undefined') return S.undefined;
    if (site.stereo === 'none') return S.none;
    if (site.stereo === 'cis/trans') return S.inversion_cistrans;
    try {
      const m = subMol();
      const b = buildProduct(OCL, m, { replace: [{ atom: site.lgAtom, frag: r.nu }], del: site.lgAtoms.filter((a) => a !== site.lgAtom), invert: [site.ca] });
      if (b.mol.getIDCode() !== p.idcode) return '';
      const q = b.mol; q.ensureHelperArrays(OCL.Molecule.cHelperCIP);
      const c = q.getAtomCIPParity(b.map[site.ca]);
      const to = c === 1 ? 'R' : c === 2 ? 'S' : '';
      if (!to) return '';
      return fill(to === site.stereo ? S.inversion_same : S.inversion, { from: site.stereo, to });
    } catch { return ''; }
  }

  // ---------- Molecule | Reactions sections (remembered per viewer; #reactions links straight here) ----------
  // The Viewer window lives in the right column on the Molecule tab; on Reactions it moves under the
  // Draw window (left column), so it stays visible beside the reaction. Moving it keeps the 3D canvas.
  const viewerHome = $('viewerWin').parentElement;
  function setApp(tab, remember = true){
    if (tab === 'rx') $('editor').closest('section').after($('viewerWin'));
    else viewerHome.prepend($('viewerWin'));
    document.querySelector('main').dataset.app = tab;
    for (const b of document.querySelectorAll('.apptab')) b.setAttribute('aria-selected', String(b.dataset.app === tab));
    if (remember){
      try { localStorage.setItem('ml-app-tab', tab); } catch {}
      history.replaceState(null, '', tab === 'rx' ? '#reactions' : location.pathname + location.search);
    }
    window.dispatchEvent(new Event('resize')); // 3D viewers and the editor size themselves on resize
    if (st.hideSub) renderScene(); // the substrate is always shown on the Molecule tab
  }
  for (const b of document.querySelectorAll('.apptab')) b.onclick = () => setApp(b.dataset.app);
  $('sceneNames').onchange = (e) => { st.sceneNamesOn = e.target.checked; renderScene(); };
  let saved = null; try { saved = localStorage.getItem('ml-app-tab'); } catch {}
  setApp(location.hash === '#reactions' ? 'rx' : saved === 'rx' ? 'rx' : 'mol', false);

  // ---------- "Which pathway wins?" grid: Try it loads the cell's example as a one-step reaction ----------
  function tryExample(e){
    st.steps = [blankStep()]; st.cur = 0; st.picks = [];
    app.loadMolecule(OCL.Molecule.fromSmiles(e.smiles));
    const r = findReagent(cat, e.reagent);
    st.drawn = null; st.guess = null;
    setReagent(r, 'chip');
    $('rxReagentInput').value = r.label;
    setSolvent(e.solvent);
    st.heat = !!e.heat; $('rxHeat').setAttribute('aria-pressed', String(st.heat));
    renderSteps(); setMsg('');
    $('rxPredict').click();
    $('rxWin').scrollIntoView({ behavior: smooth(), block: 'start' });
  }
  mountGrid({ rules, cat, texts, tryIt: tryExample, svgOf, nameLocal: (m) => { try { return app.naming.nameMolecule(OCL, m).name || null; } catch { return null; } }, OCL });

  document.addEventListener('ml:molecule', (e) => onMolecule(e.detail));
  onMolecule(app.getMol());
  renderSteps();
  // drawnReagent: re-read the reagent editor (tests set a molecule there, which fires no change event)
  return { st, drawnReagent, tryExample };
}
