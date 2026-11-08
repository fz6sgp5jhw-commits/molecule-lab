// "Cl" in the UI font (Pixelify Sans) reads like "CI": its lowercase l and capital I are both plain bars.
// Chemical text therefore uses VT323, whose l has a flag and a foot and whose I has serifs. Names, formulas
// and the mechanism drawings already use VT323 (CSS); this catches chlorine anywhere else in the UI text
// (chips, cards, facts, notes) by wrapping it in <span class="chem">, which CSS sets in VT323.
//
// chemWrap(root) wraps the text under root once; watchChemText(root) keeps doing it as the page changes.

// "Cl" as a symbol: not the start of a word such as "Click" or "Close"
export const CL = /Cl(?![a-z])/g;
const HAS = /Cl(?![a-z])/;
const SKIP = 'script,style,textarea,input,select,svg,canvas,.chem,.mv-dialog,[contenteditable]';

export function chemWrap(root){
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (HAS.test(n.nodeValue) && !(n.parentElement && n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const hits = [];
  while (walker.nextNode()) hits.push(walker.currentNode);
  for (const n of hits){
    const frag = document.createDocumentFragment();
    let last = 0;
    n.nodeValue.replace(CL, (m, i) => {
      if (i > last) frag.appendChild(document.createTextNode(n.nodeValue.slice(last, i)));
      const s = document.createElement('span'); s.className = 'chem'; s.textContent = m; frag.appendChild(s);
      last = i + m.length;
      return m;
    });
    if (last < n.nodeValue.length) frag.appendChild(document.createTextNode(n.nodeValue.slice(last)));
    n.replaceWith(frag);
  }
}

export function watchChemText(root = document.body){
  chemWrap(root);
  let queued = false;
  const obs = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    // once per frame, after whatever changed the page has finished
    requestAnimationFrame(() => { queued = false; obs.disconnect(); chemWrap(root); obs.observe(root, OPTS); });
  });
  const OPTS = { childList: true, subtree: true, characterData: true };
  obs.observe(root, OPTS);
  return obs;
}
