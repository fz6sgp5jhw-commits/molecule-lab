// Reactions window: reagent entry (type / chip / draw), solvent + heat, Predict, decision path,
// SN1/SN2/E1/E2 lamps, result cards, the "Reactivity facts" panel, site chips and ranking mode.
// All chemistry comes from predict.js / reactivity.js / reagents.js (rules as data); this file only
// wires it to the page. Names use the app's naming flow (PubChem → namer.js, checked by OPSIN),
// passed in from index.html so there is one implementation.

import { analyse, cationPathways, buildProduct, LG_LABEL } from './reactivity.js';
import { findReagent, matchMolecule, guessBox, entryFromMolecule, findSolvent } from './reagents.js';
import { predict, rankSN1, rankSN2, PATHWAYS } from './predict.js';
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
  const st = { key: null, mol: null, sites: [], site: 0, frags: [], reagent: null, drawn: null, guess: null, solvent: null, heat: false, res: null, ed: null, quiet: false, mech: null };
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
    const list = (kind === 'SN1' ? rankSN1 : rankSN2)(OCL, st.frags);
    for (const b of [$('rxRankSN1'), $('rxRankSN2')]) b.setAttribute('aria-pressed', String(b.id.endsWith(kind)));
    let prev = null;
    $('rxRankList').innerHTML = `<li class="rx-rankhead">${kind} rate, fastest first</li>` + list.map((x) => {
      const tie = x.place !== null && list.filter((y) => y.place === x.place).length > 1;
      const place = x.place === null ? '—' : (tie ? '=' : '') + x.place;
      prev = x.place;
      return `<li class="${x.none ? 'none' : ''}"><b class="rx-place">${place}</b><span class="rx-thumb">${svgOf(st.frags[x.index], 160, 90)}</span><span class="rx-why">${esc(x.reason)}${x.none ? '' : tie ? ' (tie)' : ''}</span></li>`;
    }).join('');
  }
  $('rxRankSN1').onclick = () => showRank('SN1');
  $('rxRankSN2').onclick = () => showRank('SN2');

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
      if (how !== 'drawn' && st.ed){ st.quiet = true; try { st.ed.setMolecule(OCL.Molecule.fromSmiles(r.smiles[0])); } catch {} st.quiet = false; }
    }
    for (const b of $('rxReagentChips').children) b.setAttribute('aria-pressed', String(!!r && findReagent(cat, b.dataset.q) === r));
    clearOut();
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
  function drawnReagent(){
    if (st.quiet) return;
    const m = st.ed.getMolecule();
    if (!m || !m.getAllAtoms()){ st.drawn = null; return; }
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
  $('rxReagentForm').onsubmit = (e) => { e.preventDefault(); const t = $('rxReagentInput').value.trim(); if (t) typedReagent(t); };
  $('rxDrawBox').addEventListener('toggle', () => {
    if (!$('rxDrawBox').open || st.ed) return;
    st.ed = new OCL.CanvasEditor($('rxReagentEd'), { initialMode: 'molecule' });
    if (st.reagent && st.reagent.smiles && st.reagent.smiles[0]){ st.quiet = true; try { st.ed.setMolecule(OCL.Molecule.fromSmiles(st.reagent.smiles[0])); } catch {} st.quiet = false; }
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
      b.onclick = () => { setSolvent(sv.id); clearOut(); };
      return b;
    }));
    $('rxSolventType').textContent = s ? `polar ${s.type}` : 'pick a solvent';
  }
  setSolvent(null);
  $('rxHeat').onclick = () => { st.heat = !st.heat; $('rxHeat').setAttribute('aria-pressed', String(st.heat)); clearOut(); };

  // ---------- predict ----------
  function setMsg(t, kind = 'warn'){ const m = $('rxMsg'); m.hidden = !t; m.className = 'msg ' + kind; m.textContent = t; }
  function clearOut(){ $('rxOut').hidden = true; $('rxStale').hidden = true; st.res = null; st.resAn = null; closeMech(); }
  $('rxPredict').onclick = () => {
    if (!st.mol){ setMsg('Draw a substrate in the editor first.'); return; }
    if (!st.reagent){ setMsg('Pick a reagent first: type it, tap a chip, or draw it.'); return; }
    if (!st.solvent){ setMsg('Pick a solvent.'); return; }
    let res;
    try { res = predict(OCL, st.mol, st.reagent, { solvent: st.solvent, heat: st.heat, site: st.sites.length > 1 ? st.site : undefined }, { rules, cat }); }
    catch (e) { console.error(e); setMsg('Something went wrong in the prediction: ' + e.message, 'bad'); return; }
    $('rxStale').hidden = true; closeMech();
    st.res = res;
    st.resAn = st.an; // the mechanism viewer keeps using this substrate even after a product is loaded
    renderResult(res);
  };

  function renderResult(res){
    setMsg('');
    $('rxOut').hidden = false;
    // decision path
    const lit = PATHWAYS.filter((p) => res.lamps[p] && res.lamps[p] !== 'none');
    const boxes = [...res.path.map((p) => ({ step: p.step, text: p.text })),
      { step: 'rule', text: res.notCovered ? 'not covered yet' : res.activation ? 'activation step' : lit.length ? lit.map((p) => `${p} ${res.lamps[p]}`).join(', ') : 'no reaction' }];
    $('rxPath').innerHTML = boxes.map((b, i) => `<button type="button" class="rx-box" data-step="${b.step}"><small>${esc(b.step)}</small>${esc(b.text)}</button>${i < boxes.length - 1 ? '<span class="rx-arrow" aria-hidden="true">→</span>' : ''}`).join('');
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
    for (const pw of PATHWAYS) for (const n of (res.pathways[pw] && res.pathways[pw].notes) || []) if (!/warning/.test(n)) notes.push(['warn', `${pw}: ${reason(n)}`]);
    if (st.reagent && st.reagent.estimated) notes.push(['warn', 'The reagent’s role is estimated by the rules, not looked up.']);
    $('rxNotes').innerHTML = notes.map(([k, t]) => `<div class="badge ${k}"><span>${esc(t)}</span></div>`).join('');
    // result cards
    const cards = $('rxCards'); cards.replaceChildren();
    if (res.activation) cards.appendChild(card(res.activation.product, 'activation', 'OH → sulfonate ester (a good leaving group). Now pick a nucleophile for step 2.'));
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
    if (step === 'reagent' && st.reagent) t.push(texts.path.reagent[st.reagent.box] || '');
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
    // the product's own views (name, facts, 3D model) live on the Molecule tab; the reaction stays on the Reactions tab
    div.querySelector('.rx-3d').onclick = () => {
      st.keepOut = true; app.loadMolecule(p.mol.getCompactCopy());
      setApp('mol');
      const t = document.querySelector('.tab[data-view="v3d"]'); if (t) t.click();
      $('viewer3d').scrollIntoView({ behavior: smooth(), block: 'center' });
    };
    return div;
  }

  // ---------- mechanism ----------
  function closeMech(){ if (st.mech){ st.mech.close(); st.mech = null; } $('mechWin').hidden = true; }
  $('mechClose').onclick = closeMech;
  // pw's mechanism for one product (default: its first, i.e. the major one). Several products of one
  // pathway (SN1 with/without a shift, E2 Zaitsev/Hofmann) each get a Watch button, so each can be followed.
  function openPathway(pw, chosen){
    const res = st.res; if (!res) return;
    closeMech();
    const out = res.pathways[pw];
    const win = $('mechWin'), mount = $('mechMount');
    $('mechTitle').textContent = `${pw} mechanism`;
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
    st.mech = openMechanism(mount, mechOptions(pw, p, out));
    win.scrollIntoView({ behavior: smooth(), block: 'start' });
  }

  // The prepared substrate (same atom indices as the analysis), as a fresh copy: the viewer lays it out
  // and sets helper arrays on it, so the stored analysis isn't touched.
  function subMol(){ const c = (st.resAn || st.an || analyse(OCL, st.mol)).mol.getCompactCopy(); c.ensureHelperArrays(OCL.Molecule.cHelperRings); return c; }
  // Everything the viewer needs to follow this product: roles (atom indices), flags (which optional
  // frames apply), tokens (charges/labels that depend on the reagent) and the text variables.
  function mechOptions(pw, p, out){
    const res = st.res, site = res.site, r = st.reagent;
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
    const solv = findSolvent(cat, st.solvent) || { label: 'solvent' };
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
      resultCard: () => card(p, pw, undefined, true),
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
    const v = { other, Nu: speciesText(st.reagent), class: CLS_TEXT[res.site.cls] };
    const why = texts.compete[`${maj}>${min}`] || texts.compete.generic;
    return {
      text: fill(otherMajor ? texts.ui.offerMajor : texts.ui.offerMinor, v) + ' ' + fill(why, v),
      label: fill(texts.ui.offerButton, v),
      open: () => openPathway(other),
    };
  }
  // Step 1 of a two-step sequence (TsCl/MsCl): the activation on its own; the C–O bond is kept
  function openActivation(p){
    const res = st.res, site = res.site, r = st.reagent;
    closeMech();
    $('mechTitle').textContent = 'Activation (step 1)';
    $('mechWin').hidden = false;
    const [actA, axA] = ACT_ATOMS[r.act] || ACT_ATOMS.TsCl;
    st.mech = openMechanism($('mechMount'), {
      OCL, mol: subMol(), site, roles: { ca: site.ca, lg: site.lgAtom }, flags: {}, tokens: {},
      virt: { act: actA, ax: axA }, template: ACTIVATION, texts,
      vars: { Nu: '', LG: 'OH', class: CLS_TEXT[site.cls], stereo: '', rank: '' },
      productName: nameOf(p.mol).then((n) => String(n.name || n.why || '').replace(/\.$/, '')),
      resultCard: () => card(p, 'activation', undefined, true),
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
  function setApp(tab, remember = true){
    document.querySelector('main').dataset.app = tab;
    for (const b of document.querySelectorAll('.apptab')) b.setAttribute('aria-selected', String(b.dataset.app === tab));
    if (remember){
      try { localStorage.setItem('ml-app-tab', tab); } catch {}
      history.replaceState(null, '', tab === 'rx' ? '#reactions' : location.pathname + location.search);
    }
    window.dispatchEvent(new Event('resize')); // 3D viewers and the editor size themselves on resize
  }
  for (const b of document.querySelectorAll('.apptab')) b.onclick = () => setApp(b.dataset.app);
  let saved = null; try { saved = localStorage.getItem('ml-app-tab'); } catch {}
  setApp(location.hash === '#reactions' ? 'rx' : saved === 'rx' ? 'rx' : 'mol', false);

  document.addEventListener('ml:molecule', (e) => onMolecule(e.detail));
  onMolecule(app.getMol());
  return { st };
}
