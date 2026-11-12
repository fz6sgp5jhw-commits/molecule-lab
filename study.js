// Study sheet: quick cards (data/study.json) + glossary (data/mech-text.json's terms plus study.json's
// Ch 7 terms), in a window opened from the header on either app tab. Search filters both. "Try it" sends
// the card's example to the Reactions tab (ml:try event, handled in reactions-ui.js). Print prints only
// the sheet. Text helpers are exported for the Node test.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// glossary from both files, sorted A–Z ignoring Greek letters and case; study.json wins on a clash
export function glossaryOf(mechText, study){
  const all = { ...mechText.glossary, ...study.glossary };
  const key = (t) => t.replace(/^[αβ]-?/i, '').toLowerCase();
  return Object.keys(all).sort((a, b) => key(a).localeCompare(key(b))).map((term) => ({ term, text: all[term] }));
}

// the reagent-types card is built from mech-text's reagentTypes (the same text the reagent box uses)
export function cardsOf(mechText, study){
  const rt = mechText.reagentTypes;
  const types = { ...study.reagentCard, rows: ['nuc', 'nucbase', 'bulky', 'weak'].map((k) => [rt[k].name, `${rt[k].spot} ${rt[k].does}`]) };
  return [...study.cards, types];
}

const matches = (q, ...texts) => !q || texts.some((t) => String(t).toLowerCase().includes(q));

export async function mountStudy(){
  const $ = (id) => document.getElementById(id);
  const [mechText, study] = await Promise.all(['./data/mech-text.json', './data/study.json'].map((u) => fetch(u).then((r) => r.json())));
  const cards = cardsOf(mechText, study), gloss = glossaryOf(mechText, study);
  const win = $('studyWin');
  $('studyIntro').textContent = study.intro;

  function render(){
    const q = $('studySearch').value.trim().toLowerCase();
    const shown = cards.filter((c) => matches(q, c.title, c.sub, ...c.rows.flat()));
    $('studyCards').innerHTML = shown.map((c) => `<article class="st-card" data-card="${esc(c.id)}">
      <h3>${esc(c.title)}</h3><p class="st-sub">${esc(c.sub)}</p>
      <dl>${c.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${c.example ? `<p class="st-ex"><b>Example:</b> <span class="chem-name">${esc(c.example.text)}</span> <button type="button" class="st-try" data-card="${esc(c.id)}">Try it</button></p>` : ''}
    </article>`).join('');
    const g = gloss.filter((x) => matches(q, x.term, x.text));
    $('studyGloss').innerHTML = g.map((x) => `<dt>${esc(x.term)}</dt><dd>${esc(x.text.replace(/^[^:]{1,40}:\s*/, ''))}</dd>`).join('');
    $('studyEmpty').hidden = shown.length + g.length > 0;
    for (const b of win.querySelectorAll('.st-try')) b.onclick = () => {
      const c = cards.find((x) => x.id === b.dataset.card);
      win.close();
      document.dispatchEvent(new CustomEvent('ml:try', { detail: c.example }));
    };
  }
  $('studySearch').addEventListener('input', render);
  $('studyBtn').onclick = () => { render(); win.showModal(); $('studySearch').focus(); };
  $('studyClose').onclick = () => win.close();
  $('studyPrint').onclick = () => { $('studySearch').value = ''; render(); window.print(); };
  win.addEventListener('click', (e) => { if (e.target === win) win.close(); }); // tap outside closes
  return { render };
}
