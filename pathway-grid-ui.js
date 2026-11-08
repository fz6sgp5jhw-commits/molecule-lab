// "Which pathway wins?" window on the Reactions tab: the grid from pathway-grid.js (generated from
// data/rules.json) as a Win95 table on a laptop, and as "pick the substrate class, then see its row"
// on a phone. Tapping a cell shows the rule's reasons, course/disagreement marks, how it changes with
// the conditions, an example, and Try it (loads the example into the editor and the reagent box).

import { buildGrid, GRID_ROWS, GRID_COLS } from './pathway-grid.js';
import { findReagent, findSolvent } from './reagents.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountGrid({ rules, cat, texts, tryIt, svgOf, nameLocal, OCL }){
  const T = texts.grid;
  const st = { solvent: 'usual', heat: false, row: '2', sel: null };
  let pref = null; try { pref = JSON.parse(localStorage.getItem('ml-grid') || 'null'); } catch {}
  if (pref) Object.assign(st, { solvent: pref.solvent || st.solvent, heat: !!pref.heat, row: pref.row || st.row });
  const save = () => { try { localStorage.setItem('ml-grid', JSON.stringify({ solvent: st.solvent, heat: st.heat, row: st.row })); } catch {} };
  const reason = (k) => rules.reasons[k] || k;
  const data = { rules, cat };
  let grid = [];

  $('pwIntro').textContent = T.intro;
  $('pwLegend').textContent = T.legend;
  $('pwFixed').textContent = T.fixedNote + ' ' + T.tsNote;

  function marks(c){
    return `${c.tags.includes('course') ? '<i class="pw-m" title="course rule">★</i>' : ''}${c.tags.includes('disagree') ? '<i class="pw-m" title="textbooks disagree">⚑</i>' : ''}${c.varies ? '<i class="pw-m" title="changes with solvent or heat">⇄</i>' : ''}`;
  }
  // "E2 > SN2": the major pathway(s) in bold
  function cellHTML(c){
    if (c.notCovered) return `<span class="pw-nc">${esc(T.notCovered.toLowerCase())}</span>`;
    if (c.noReaction) return `<span class="pw-none">${esc(T.noReaction.toLowerCase())}</span>`;
    const rest = c.competing.length ? ['≈', c.competing] : c.minor.length ? ['&gt;', c.minor] : null;
    return `<b>${esc(c.major.join(' + '))}</b>${rest ? ` ${rest[0]} <span class="pw-min">${esc(rest[1].join(', '))}</span>` : ''}`;
  }
  const kind = (c) => (c.notCovered ? 'nc' : c.noReaction ? 'none' : c.major[0] || 'none');

  function renderControls(){
    const box = $('pwConds');
    box.innerHTML = `<span class="rx-lab">${esc(T.solvent)}</span>` + ['usual', 'protic', 'aprotic'].map((m) => `<button type="button" class="chip" data-solv="${m}" aria-pressed="${st.solvent === m}">${esc(T[m])}</button>`).join('') +
      `<button type="button" class="chip" id="pwHeat" aria-pressed="${st.heat}">${esc(T.heat)}</button>`;
    for (const b of box.querySelectorAll('[data-solv]')) b.onclick = () => { st.solvent = b.dataset.solv; save(); render(); };
    $('pwHeat').onclick = () => { st.heat = !st.heat; save(); render(); };
    $('pwRows').innerHTML = `<span class="rx-lab">${esc(T.pickRow)}</span>` + GRID_ROWS.map((r) => `<button type="button" class="chip" data-row="${r.id}" aria-pressed="${st.row === r.id}">${esc(r.label)}</button>`).join('');
    for (const b of $('pwRows').querySelectorAll('[data-row]')) b.onclick = () => { st.row = b.dataset.row; save(); st.sel = null; render(); };
  }
  function solventLabel(col){
    if (col.fixed) return findSolvent(cat, col.fixed.solvent).label + (col.fixed.heat ? ', heat' : '');
    return findSolvent(cat, col.solvent[st.solvent]).label;
  }
  function render(){
    grid = buildGrid({ solvent: st.solvent, heat: st.heat }, data);
    renderControls();
    // laptop: the table
    const head = `<tr><th scope="col" class="pw-corner">Substrate ↓ / reagent →</th>${GRID_COLS.map((c) => `<th scope="col"><span class="pw-short">${esc(c.short)}</span><small>${esc(c.eg)}</small><small class="pw-solv">${esc(solventLabel(c))}</small></th>`).join('')}</tr>`;
    const body = grid.map(({ row, cells }) => `<tr><th scope="row">${esc(row.label)}</th>${cells.map((c, j) => `<td><button type="button" class="pw-cell pw-${kind(c)}" data-r="${row.id}" data-c="${GRID_COLS[j].id}" aria-pressed="${!!st.sel && st.sel.r === row.id && st.sel.c === GRID_COLS[j].id}">${cellHTML(c)}${marks(c)}</button></td>`).join('')}</tr>`).join('');
    $('pwTable').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
    // phone: one substrate class at a time
    const g = grid.find((x) => x.row.id === st.row) || grid[0];
    $('pwList').innerHTML = g.cells.map((c, j) => { const col = GRID_COLS[j]; return `<li><button type="button" class="pw-cell pw-${kind(c)}" data-r="${g.row.id}" data-c="${col.id}" aria-pressed="${!!st.sel && st.sel.r === g.row.id && st.sel.c === col.id}"><span class="pw-colname">${esc(col.label)}<small>${esc(col.eg)} · ${esc(solventLabel(col))}</small></span><span class="pw-res">${cellHTML(c)}${marks(c)}</span></button></li>`; }).join('');
    for (const b of document.querySelectorAll('#pwWin .pw-cell')) b.onclick = () => { const same = st.sel && st.sel.r === b.dataset.r && st.sel.c === b.dataset.c; st.sel = same ? null : { r: b.dataset.r, c: b.dataset.c }; if (!same) st.row = b.dataset.r; render(); if (!same) $('pwDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    renderDetail();
  }
  function renderDetail(){
    const box = $('pwDetail');
    if (!st.sel){ box.hidden = true; return; }
    const g = grid.find((x) => x.row.id === st.sel.r), j = GRID_COLS.findIndex((c) => c.id === st.sel.c);
    const c = g.cells[j], col = GRID_COLS[j], row = g.row, e = c.example;
    const line = (lab, list) => (list.length ? `<dt>${esc(lab)}</dt><dd>${esc(list.join(', '))}</dd>` : '');
    let verdict;
    if (c.notCovered) verdict = `<dt>${esc(T.notCovered)}</dt><dd>${esc(reason(c.notCovered))}</dd>`;
    else if (c.noReaction) verdict = `<dt>${esc(T.noReaction)}</dt><dd></dd>`;
    else verdict = line(T.major, c.major) + line(T.competing, c.competing) + line(T.minor, c.minor);
    const courseKeys = c.tags.includes('course') ? c.reasons.filter((k) => /^(course_|hx_secondary)/.test(k)) : [];
    const why = c.reasons.map((k) => `<li class="${courseKeys.includes(k) ? 'pw-course' : ''}">${courseKeys.includes(k) ? `<b>${esc(T.course)}:</b> ` : ''}${esc(reason(k))}</li>`).join('');
    const variants = c.varies ? `<div class="rx-lab">${esc(T.variants)}</div><table class="pw-var"><tbody>${c.variants.map((v) => `<tr><th scope="row">${esc(T[v.solvent])}, ${esc(v.heat ? T.heatOn : T.heatOff)}</th><td>${cellHTML(v.cell)}</td></tr>`).join('')}</tbody></table>` : '';
    const r = findReagent(cat, e.reagent), sv = findSolvent(cat, e.solvent);
    let mol = null; try { mol = OCL.Molecule.fromSmiles(e.smiles); } catch {}
    const subName = mol && nameLocal(mol) || e.smiles;
    box.innerHTML = `
      <div class="pw-dh">${esc(row.label)} × ${esc(col.label)}<small>${esc(col.fixed ? solventLabel(col) : `${T[st.solvent]} (${solventLabel(col)})${st.heat ? ', heat' : ''}`)}</small></div>
      <dl class="rx-dl pw-verdict">${verdict}</dl>
      ${c.tags.includes('disagree') ? `<div class="badge warn"><span>${esc(T.disagree)}</span></div>` : ''}
      ${why ? `<div class="rx-lab">${esc(T.why)}</div><ul class="pw-why">${why}</ul>` : ''}
      ${variants}
      <div class="rx-lab">${esc(T.example)}</div>
      <div class="pw-ex"><span class="pw-exdraw">${mol ? svgOf(mol, 160, 90) : ''}</span><span class="pw-extext"><span class="chem-name">${esc(subName)}</span> + <b>${esc(r.label)}</b>, ${esc(sv.label)}${e.heat ? ', heat' : ''}</span></div>
      <div class="row"><button type="button" class="primary" id="pwTry">${esc(T.tryIt)}</button></div>`;
    box.hidden = false;
    $('pwTry').onclick = () => tryIt(e);
  }
  render();
  return { render, st };
}
