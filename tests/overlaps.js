// Injected into the page by the browser tests: lists overlaps in the mechanism drawing that make it hard
// to read: two text labels on top of each other, or a label (charge, δ, rest, caption) lying on a bond line.
// Atom symbols sitting on their own bonds' ends are fine (bonds are shortened for them).
window.__mvOverlaps = () => {
  const vis = (e) => { for (let x = e; x && x.tagName !== 'svg'; x = x.parentElement) if (getComputedStyle(x).display === 'none') return false; return true; };
  const rect = (e) => e.getBoundingClientRect();
  // the glyphs' ink, not the font's full line box (VT323 has a tall ascent/descent)
  const ink = (e) => { const a = rect(e), k = a.height * 0.22; return { left: a.left, right: a.right, top: a.top + k, bottom: a.bottom - k }; };
  const texts = [...document.querySelectorAll('.mv-svg text')].filter((t) => t.textContent.trim() && vis(t));
  const bad = [];
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++){
    const a = ink(texts[i]), c = ink(texts[j]);
    const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
    if (ox > 2 && oy > 2) bad.push(`${texts[i].textContent}/${texts[j].textContent}`);
  }
  const lines = [...document.querySelectorAll('.mv-svg line.mv-bond')].filter(vis).map((l) => {
    const m = l.getScreenCTM(), p = (x, y) => new DOMPoint(x, y).matrixTransform(m);
    return [p(+l.getAttribute('x1'), +l.getAttribute('y1')), p(+l.getAttribute('x2'), +l.getAttribute('y2'))];
  });
  for (const t of texts.filter((x) => !x.classList.contains('mv-atom'))){
    const a = ink(t), box = { l: a.left + 1, r: a.right - 1, t: a.top, b: a.bottom };
    for (const [p, q] of lines){
      for (let k = 0; k <= 20; k++){
        const x = p.x + (q.x - p.x) * k / 20, y = p.y + (q.y - p.y) * k / 20;
        if (x > box.l && x < box.r && y > box.t && y < box.b){ bad.push(`${t.textContent}~bond`); break; }
      }
    }
  }
  return bad;
};
