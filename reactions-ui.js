// Reactions window: reagent entry (type / chip / draw), solvent + heat, Predict, decision path,
// SN1/SN2/E1/E2 lamps, result cards, the "Reactivity facts" panel, site chips and ranking mode.
// All chemistry comes from predict.js / reactivity.js / reagents.js (rules as data); this file only
// wires it to the page. Names use the app's naming flow (PubChem → namer.js, checked by OPSIN),
// passed in from index.html so there is one implementation.

import { analyse, cationPathways, buildProduct, LG_LABEL } from './reactivity.js';
import { findReagent, matchMolecule, guessBox, entryFromMolecule, findSolvent } from './reagents.js';
import { predict, rankSN1, rankSN2, PATHWAYS } from './predict.js';
import { TEMPLATES } from './mech-templates.js';
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
    for (const box of [$('rxSites'), $('rxFactSites')]){
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
    if (key === st.key) return;
    st.key = key;
    st.mol = m; st.site = 0; st.sites = []; st.an = null; st.frags = [];
    clearOut();
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
    setMsg(`“${text}” isn’t in the reagent list. Draw it under “Draw the reagent” and the rules will estimate its role.`, 'warn');
  }
  function renderRoles(){
    const box = $('rxRoles');
    box.innerHTML = `<div class="rx-lab">${esc(texts.ui.unknownReagent)}</div>`;
    for (const role of ROLES){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
      const isGuess = st.guess && st.guess.box === role;
      b.innerHTML = esc(ROLE_TEXT[role]) + (isGuess ? ` <span class="rx-est">${esc(texts.ui.estimated)}</span>` : '');
      b.setAttribute('aria-pressed', String(!!st.reagent && st.reagent.box === role));
      b.onclick = () => { setReagent(entryFromMolecule(OCL, st.drawn, role), 'drawn'); renderRoles(); };
      box.appendChild(b);
    }
    if (st.guess) { const w = document.createElement('div'); w.className = 'note'; w.textContent = 'Rule used: ' + st.guess.why; box.appendChild(w); }
  }
  function drawnReagent(){
    if (st.quiet) return;
    const m = st.ed.getMolecule();
    if (!m || !m.getAllAtoms()){ st.drawn = null; return; }
    const mol = m.getCompactCopy();
    const r = matchMolecule(OCL, cat, mol);
    $('rxReagentInput').value = '';
    if (r){ st.drawn = null; setReagent(r, 'drawn'); $('rxRoles').hidden = true; setMsg(''); return; }
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
  function clearOut(){ $('rxOut').hidden = true; st.res = null; closeMech(); }
  $('rxPredict').onclick = () => {
    if (!st.mol){ setMsg('Draw a substrate in the editor first.'); return; }
    if (!st.reagent){ setMsg('Pick a reagent first: type it, tap a chip, or draw it.'); return; }
    if (!st.solvent){ setMsg('Pick a solvent.'); return; }
    let res;
    try { res = predict(OCL, st.mol, st.reagent, { solvent: st.solvent, heat: st.heat, site: st.sites.length > 1 ? st.site : undefined }, { rules, cat }); }
    catch (e) { console.error(e); setMsg('Something went wrong in the prediction: ' + e.message, 'bad'); return; }
    st.res = res;
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
  function card(p, pw, extra){
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
      <div class="row"><button type="button" class="rx-load">Load into editor</button></div>`;
    nameLine(p.mol, div.querySelector('.rx-nameline'));
    div.querySelector('.rx-load').onclick = () => { app.loadMolecule(p.mol.getCompactCopy()); $('editor').scrollIntoView({ behavior: smooth(), block: 'center' }); };
    return div;
  }

  // ---------- mechanism ----------
  function closeMech(){ if (st.mech){ st.mech.close(); st.mech = null; } $('mechWin').hidden = true; }
  $('mechClose').onclick = closeMech;
  function openPathway(pw){
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
    const p = out.products[0], site = res.site, r = st.reagent;
    const nuMol = r.nu.mol || OCL.Molecule.fromSmiles(r.nu.smiles);
    const Nu = speciesText(r);
    const nuAtom = nuMol.getAtomLabel(r.nu.atom);
    st.mech = openMechanism(mount, {
      OCL, mol: analyse(OCL, st.mol).mol, site, template: TEMPLATES[pw], texts,
      nu: { atom: nuAtom, rest: nuMol.getAtoms() > 1 ? `(${Nu})` : '', charged: Nu.endsWith('⁻') },
      vars: { Nu, LG: site.lg, class: CLS_TEXT[site.cls], stereo: sn2Stereo(site, r, p) },
      productName: nameOf(p.mol).then((n) => n.name || n.why),
      resultCard: () => card(p, pw),
    });
    win.scrollIntoView({ behavior: smooth(), block: 'start' });
  }
  // the stereo sentence for SN2, with R/S from OpenChemLib on the product (never swapped by hand)
  function sn2Stereo(site, r, p){
    const S = texts.stereo;
    if (site.stereo === 'undefined') return S.undefined;
    if (site.stereo === 'none') return S.none;
    if (site.stereo === 'cis/trans') return S.inversion_cistrans;
    try {
      const m = analyse(OCL, st.mol).mol;
      const b = buildProduct(OCL, m, { replace: [{ atom: site.lgAtom, frag: r.nu }], del: site.lgAtoms.filter((a) => a !== site.lgAtom), invert: [site.ca] });
      if (b.mol.getIDCode() !== p.idcode) return '';
      const q = b.mol; q.ensureHelperArrays(OCL.Molecule.cHelperCIP);
      const c = q.getAtomCIPParity(b.map[site.ca]);
      const to = c === 1 ? 'R' : c === 2 ? 'S' : '';
      if (!to) return '';
      return fill(to === site.stereo ? S.inversion_same : S.inversion, { from: site.stereo, to });
    } catch { return ''; }
  }

  document.addEventListener('ml:molecule', (e) => onMolecule(e.detail));
  onMolecule(app.getMol());
  return { st };
}
