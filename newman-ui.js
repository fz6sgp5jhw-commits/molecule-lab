// Newman tab: draws newman.js's model as SVG (black viewer, green terminal text), turns the back carbon in
// 60° steps (buttons or a tap on the drawing), shows the conformation, its energy and what E2 from that
// exact shape gives, plus a small quiz ("turn it until E2 gives (E)").
import { newmanBonds, buildNewman, newmanAt, stepFor } from './newman.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sub = (s) => esc(s).replace(/(\d+)/g, '<tspan baseline-shift="sub" font-size="70%">$1</tspan>');
const LG = '#ff66ff', HC = '#55ffff';

export function mountNewman({ OCL, getMol, nameMolecule }){
  const $ = (id) => document.getElementById(id);
  const st = { key: '', bonds: null, bondIdx: 0, model: null, step: 0, quiz: null };
  const nameOf = (m) => { try { const r = nameMolecule(OCL, m); return r.name || null; } catch { return null; } };

  function message(text){
    $('newmanSvg').innerHTML = ''; $('newmanOverlay').hidden = false; $('newmanOverlay').textContent = text;
    $('newmanInfo').innerHTML = ''; for (const id of ['nwLeft', 'nwRight', 'nwAnti', 'nwQuiz']) $(id).disabled = true;
    $('nwBond').hidden = true; $('nwQuizBox').hidden = true;
  }

  function update(){
    const mol = getMol();
    if (!mol){ st.key = ''; message('Draw or name a molecule with a C–C single bond (not in a ring) to look along it.'); return; }
    const key = mol.getIDCode();
    if (key !== st.key){
      st.key = key; st.bondIdx = 0; st.quiz = null;
      st.bonds = newmanBonds(OCL, mol);
      const sel = $('nwBond');
      sel.innerHTML = st.bonds.bonds.map((b, i) => `<option value="${i}">${esc(b.label)}</option>`).join('');
      sel.hidden = st.bonds.bonds.length < 2;
      if (!st.bonds.bonds.length){ message('No C–C single bond outside a ring to look along (ring bonds are in the Chair tab).'); return; }
      build();
    }
  }

  function build(){
    $('newmanOverlay').hidden = false; $('newmanOverlay').textContent = 'Building the 3D shape…';
    // let the message paint before the (synchronous) conformer + MMFF work
    setTimeout(() => {
      const model = buildNewman(OCL, st.bonds.mol, st.bonds.bonds[st.bondIdx]);
      if (model.error){ message(model.error); return; }
      st.model = model; st.step = 0; st.quiz = null;
      $('newmanOverlay').hidden = true;
      for (const id of ['nwLeft', 'nwRight']) $(id).disabled = false;
      const e2 = !!model.alkene;
      $('nwAnti').disabled = !e2 || stepFor(model) === null;
      $('nwQuiz').disabled = !e2 || stepFor(model) === null;
      $('nwQuizBox').hidden = true;
      draw();
    }, 20);
  }

  function draw(){
    const m = st.model; if (!m) return;
    const v = newmanAt(m, st.step);
    const R = 58, L = 108, T = 128;
    const xy = (deg, r) => [Math.cos(deg * Math.PI / 180) * r, Math.sin(deg * Math.PI / 180) * r];
    const lg = v.frontSubs.find((s) => s.lg);
    const antiH = v.e2 && v.e2.possible ? v.e2.h : null;
    const color = (s, front) => s.lg ? LG : s.atom === antiH ? HC : front ? '#7dff7d' : '#2fbf2f';
    let svg = '';
    // back carbon: circle, bonds from its edge (eclipsed bonds nudged 9° so both show)
    svg += `<circle cx="0" cy="0" r="${R}" fill="none" stroke="#2fbf2f" stroke-width="3"/>`;
    for (const s of v.backSubs){
      const a = v.staggered ? s.angle : s.angle + 9;
      const [x1, y1] = xy(a, R), [x2, y2] = xy(a, L);
      svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color(s, false)}" stroke-width="4" data-atom="${s.atom}"/>`;
      const [lx, ly] = xy(a, T);
      svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${color(s, false)}" class="nw-lab back" data-atom="${s.atom}">${sub(s.label)}</text>`;
    }
    for (const s of v.frontSubs){
      const [x2, y2] = xy(s.angle, L);
      svg += `<line x1="0" y1="0" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color(s, true)}" stroke-width="5" data-atom="${s.atom}"/>`;
      const [lx, ly] = xy(s.angle, T);
      svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${color(s, true)}" class="nw-lab" data-atom="${s.atom}">${sub(s.label)}</text>`;
    }
    svg += `<circle cx="0" cy="0" r="5" fill="#7dff7d"/>`;
    $('newmanSvg').innerHTML = svg;
    $('newmanTag').textContent = `${v.staggered ? 'STAGGERED' : 'ECLIPSED'} · BACK ${st.step * 60}°`;
    info(v);
  }

  function relations(v){
    const big = (l) => l.filter((s) => !s.isH);
    const out = [];
    for (const f of big(v.frontSubs)) for (const b of big(v.backSubs)){
      const d = Math.abs(((b.angle - f.angle) % 360 + 540) % 360 - 180);
      const r = d > 155 ? 'anti' : d < 25 ? 'eclipsed' : d < 85 ? 'gauche' : null;
      if (r) out.push(`${f.label} / ${b.label} ${r}`);
    }
    return out;
  }

  function info(v){
    const m = st.model;
    const rel = relations(v);
    const lines = [];
    lines.push(`<div class="energy">${v.staggered ? (v.energy < 0.05 ? 'Lowest-energy staggered shape' : `+${v.energy.toFixed(1)} kcal/mol vs the best staggered shape`) : 'Eclipsed: torsional strain, higher in energy than any staggered shape'}</div>`);
    lines.push(`<div>${rel.length ? esc(rel.join(' · ')) : 'Only H’s eclipse or sit gauche here.'}</div>`);
    if (!m.alkene) lines.push(`<div class="nw-e2">${m.site ? '' : 'No leaving group on the front carbon, so there is no E2 to check along this bond.'}</div>`);
    else if (v.e2 && v.e2.possible){
      const name = v.e2.product ? nameOf(v.e2.product.mol) : null;
      lines.push(`<div class="nw-e2 ok"><b>E2 can go from here:</b> the <span style="color:${HC};background:#000;padding:0 3px">H</span> on the back carbon is anti (180°) to <span style="color:${LG};background:#000;padding:0 3px">${esc(m.site.lg)}</span>. This shape gives <span class="nw-name">${esc(name || (v.e2.ez ? `the (${v.e2.ez}) alkene` : 'the alkene'))}</span>${v.e2.both ? `: the groups that are ${v.e2.ez === 'E' ? 'anti' : 'gauche'} here end up ${v.e2.ez === 'E' ? 'trans' : 'cis'}.` : '.'}</div>`);
    } else lines.push(`<div class="nw-e2">E2 can’t go from this shape: no H on the back carbon is anti to ${esc(m.site.lg)}. Turn the back carbon.</div>`);
    $('newmanInfo').innerHTML = lines.join('');
  }

  const turn = (d) => { if (!st.model) return; st.step = (st.step + d + 6) % 6; draw(); if (st.quiz) $('nwQuizMsg').textContent = ''; };
  $('nwLeft').onclick = () => turn(-1);
  $('nwRight').onclick = () => turn(1);
  $('newmanSvg').addEventListener('click', () => turn(1));
  $('nwBond').onchange = () => { st.bondIdx = Number($('nwBond').value); build(); };
  $('nwAnti').onclick = () => { const s = stepFor(st.model); if (s !== null){ st.step = s; draw(); } };
  $('nwQuiz').onclick = () => {
    const m = st.model;
    const target = stepFor(m, 'E') !== null ? 'E' : stepFor(m, 'Z') !== null ? 'Z' : null;
    st.quiz = { target };
    $('nwQuizBox').hidden = false;
    $('nwQuizQ').textContent = target ? `Turn the back carbon until E2 from that shape gives the (${target}) alkene, then press Check.` : 'Turn the back carbon until E2 can happen, then press Check.';
    $('nwQuizMsg').textContent = '';
  };
  $('nwCheck').onclick = () => {
    if (!st.quiz) return;
    const v = newmanAt(st.model, st.step);
    let msg;
    if (!v.e2 || !v.e2.possible) msg = `Not yet: E2 needs an H on the back carbon anti (180°) to ${st.model.site.lg}.`;
    else if (st.quiz.target && v.e2.ez !== st.quiz.target) msg = `Close: H and ${st.model.site.lg} are anti, but this shape gives (${v.e2.ez}). Look where the big groups end up.`;
    else msg = '✔ Right! H and the leaving group are anti-periplanar, and the groups line up for ' + (st.quiz.target ? `(${st.quiz.target}).` : 'the alkene.');
    $('nwQuizMsg').textContent = msg;
    $('nwQuizMsg').className = msg.startsWith('✔') ? 'nw-good' : 'nw-bad';
  };
  return { update, isOpen: () => document.querySelector('#vnewman').classList.contains('active') };
}
