/* =====================================================================
 * HEXeffectiveness — diagrams.js
 * Geometri yönlendirme çizimleri (satır içi SVG): kanatçık/alan ve
 * akış kesiti/akış boyu. Alanlardaki data-hl özniteliği, çizimdeki
 * aynı data-part öğelerini vurgular. Renkler CSS değişkenlerinden gelir
 * (açık/koyu tema uyumlu).
 * ===================================================================== */
'use strict';

const svgDefs = (id) => `<defs>
  <marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" class="arrowhead"/>
  </marker>
  <pattern id="${id}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="6" class="hatchline"/>
  </pattern>
</defs>`;

// Kesit: iki ayırıcı plaka arasında düz (dikdörtgen) kanatçıklar
function finsDiagram() {
  const x0 = 20, x1 = 420, yT = 40, yB = 210, pt = 10;
  const fins = [80, 150, 220, 290, 360];
  const tf = 7;
  const finRects = fins.map((x) => `<rect x="${x}" y="${yT + pt}" width="${tf}" height="${yB - yT - pt}" class="fin" data-part="Af A"/>`).join('');
  // Birincil (plaka) yüzeyleri: kanatçıklar arasındaki plaka iç yüzeyleri
  const edges = [x0].concat(fins.flatMap((x) => [x, x + tf])).concat([x1]);
  let prim = '';
  for (let i = 0; i < edges.length; i += 2) {
    prim += `<line x1="${edges[i]}" y1="${yT + pt}" x2="${edges[i + 1]}" y2="${yT + pt}" class="prim" data-part="Ap A"/>`;
    prim += `<line x1="${edges[i]}" y1="${yB}" x2="${edges[i + 1]}" y2="${yB}" class="prim" data-part="Ap A"/>`;
  }
  const dots = [115, 185, 255, 325].map((x) => `<circle cx="${x}" cy="${(yT + pt + yB) / 2}" r="7" class="flowdot"/><circle cx="${x}" cy="${(yT + pt + yB) / 2}" r="2" class="flowdot-c"/>`).join('');
  const fx = 290 + tf, mid = (yT + pt + yB) / 2;
  return `<svg viewBox="0 0 600 260" class="geo" role="img" aria-label="Kanatçık geometrisi kesiti">${svgDefs('arrF')}
    <rect x="${x0}" y="${yT}" width="${x1 - x0}" height="${pt}" class="plate"/>
    <rect x="${x0}" y="${yB}" width="${x1 - x0}" height="${pt}" class="plate"/>
    <text x="${x0}" y="${yT - 8}" class="lbl muted-t">ayırıcı plaka (duvar)</text>
    ${finRects}${prim}${dots}
    <line x1="${x0 + 10}" y1="${mid}" x2="${x1 - 10}" y2="${mid}" class="midline"/>
    <!-- L_f: plakadan kanatçık ortasına -->
    <g data-part="Lf">
      <line x1="${fx + 12}" y1="${yT + pt + 2}" x2="${fx + 12}" y2="${mid - 2}" class="dim" marker-start="url(#arrF)" marker-end="url(#arrF)"/>
      <text x="${fx + 18}" y="${(yT + pt + mid) / 2 + 5}" class="lbl b">L<tspan class="sub" dy="4">f</tspan></text>
    </g>
    <!-- b: plaka aralığı -->
    <g data-part="Lf">
      <line x1="${x1 + 16}" y1="${yT + pt}" x2="${x1 + 16}" y2="${yB}" class="dim" marker-start="url(#arrF)" marker-end="url(#arrF)"/>
      <text x="${x1 + 22}" y="${mid + 5}" class="lbl">b</text>
    </g>
    <!-- t_f: kanatçık kalınlığı -->
    <g data-part="tf">
      <line x1="${150 - 26}" y1="${yB - 26}" x2="${150}" y2="${yB - 26}" class="dim" marker-end="url(#arrF)"/>
      <line x1="${150 + tf + 26}" y1="${yB - 26}" x2="${150 + tf}" y2="${yB - 26}" class="dim" marker-end="url(#arrF)"/>
      <text x="${150 + tf + 30}" y="${yB - 21}" class="lbl b">t<tspan class="sub" dy="4">f</tspan></text>
    </g>
    <!-- Lejant -->
    <g transform="translate(455,62)">
      <rect x="0" y="0" width="14" height="14" class="fin" data-part="Af A"/><text x="20" y="12" class="lbl s">A<tspan class="sub" dy="3">f</tspan><tspan dy="-3"> kanatçık yüzeyi</tspan></text>
      <line x1="0" y1="33" x2="14" y2="33" class="prim" data-part="Ap A"/><text x="20" y="38" class="lbl s">A<tspan class="sub" dy="3">p</tspan><tspan dy="-3"> plaka yüzeyi</tspan></text>
      <text x="0" y="66" class="lbl s b" data-part="A">A = A<tspan class="sub" dy="3">p</tspan><tspan dy="-3"> + A</tspan><tspan class="sub" dy="3">f</tspan></text>
      <text x="0" y="88" class="lbl s" data-part="Af">oran = A<tspan class="sub" dy="3">f</tspan><tspan dy="-3"> / A</tspan></text>
      <circle cx="7" cy="112" r="6" class="flowdot"/><circle cx="7" cy="112" r="2" class="flowdot-c"/><text x="20" y="116" class="lbl s muted-t">akış (sayfaya dik)</text>
      <line x1="0" y1="138" x2="14" y2="138" class="midline"/><text x="20" y="142" class="lbl s muted-t">kanatçık ortası</text>
    </g>
  </svg>`;
}

// Akış kesiti (A_c, D_h) ve çapraz akışta akış boyları (L1, L2)
function flowDiagram() {
  // Sol: tek kanal büyütmesi
  const cx = 30, cy = 40, cw = 150, ch = 110;
  // Sağ: çekirdek (üstten görünüş), taraf 1 soldan sağa, taraf 2 yukarıdan aşağıya
  const kx = 360, ky = 40, kw = 150, kh = 150;
  const arrowsH = [0.25, 0.5, 0.75].map((f) => `<line x1="${kx - 40}" y1="${ky + kh * f}" x2="${kx - 6}" y2="${ky + kh * f}" class="flow1" marker-end="url(#arrW)"/>`).join('');
  const arrowsV = [0.25, 0.5, 0.75].map((f) => `<line x1="${kx + kw * f}" y1="${ky - 34}" x2="${kx + kw * f}" y2="${ky - 6}" class="flow2" marker-end="url(#arrW)"/>`).join('');
  return `<svg viewBox="0 0 600 250" class="geo" role="img" aria-label="Akış kesiti ve akış boyu">${svgDefs('arrW')}
    <text x="${cx}" y="${cy - 14}" class="lbl s muted-t">Bir akış kanalının kesiti</text>
    <rect x="${cx - 8}" y="${cy - 8}" width="${cw + 16}" height="8" class="plate"/>
    <rect x="${cx - 8}" y="${cy + ch}" width="${cw + 16}" height="8" class="plate"/>
    <rect x="${cx - 8}" y="${cy}" width="8" height="${ch}" class="fin"/>
    <rect x="${cx + cw}" y="${cy}" width="8" height="${ch}" class="fin"/>
    <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" class="ac" data-part="Ac"/>
    <rect x="${cx + 2}" y="${cy + 2}" width="${cw - 4}" height="${ch - 4}" class="perim" data-part="Dh"/>
    <text x="${cx + cw / 2}" y="${cy + ch / 2 - 4}" class="lbl b mid" data-part="Ac">A<tspan class="sub" dy="4">c</tspan></text>
    <text x="${cx + cw / 2}" y="${cy + ch / 2 + 16}" class="lbl s mid muted-t">açık kesit</text>
    <text x="${cx}" y="${cy + ch + 30}" class="lbl s" data-part="Ac">A<tspan class="sub" dy="3">c</tspan><tspan dy="-3"> = tüm kanalların açık kesitlerinin toplamı</tspan></text>
    <text x="${cx}" y="${cy + ch + 50}" class="lbl s" data-part="Dh">D<tspan class="sub" dy="3">h</tspan><tspan dy="-3"> = 4·(kanal kesiti) / (ıslak çevre</tspan><tspan class="perim-key"> ┄ </tspan><tspan>)</tspan></text>
    <text x="${cx}" y="${cy + ch + 70}" class="lbl s muted-t" data-part="Dh">dikdörtgen kanal (s × b): D<tspan class="sub" dy="3">h</tspan><tspan dy="-3"> ≈ 2·s·b / (s + b)</tspan></text>

    <text x="${kx - 40}" y="${ky + kh + 52}" class="lbl s muted-t">Çekirdek, üstten görünüş (çapraz akış)</text>
    <rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" class="core"/>
    ${arrowsH}${arrowsV}
    <text x="${kx - 44}" y="${ky - 14}" class="lbl s t1">Taraf 1 →</text>
    <text x="${kx + kw + 6}" y="${ky - 14}" class="lbl s t2">↓ Taraf 2</text>
    <g data-part="L1">
      <line x1="${kx}" y1="${ky + kh + 16}" x2="${kx + kw}" y2="${ky + kh + 16}" class="dim" marker-start="url(#arrW)" marker-end="url(#arrW)"/>
      <text x="${kx + kw / 2}" y="${ky + kh + 34}" class="lbl b mid t1">L<tspan class="sub" dy="4">1</tspan></text>
    </g>
    <g data-part="L2">
      <line x1="${kx + kw + 16}" y1="${ky}" x2="${kx + kw + 16}" y2="${ky + kh}" class="dim" marker-start="url(#arrW)" marker-end="url(#arrW)"/>
      <text x="${kx + kw + 22}" y="${ky + kh / 2 + 5}" class="lbl b t2">L<tspan class="sub" dy="4">2</tspan></text>
    </g>
  </svg>`;
}

function renderDiagrams() {
  $$('.geo-fig[data-kind]').forEach((el) => {
    const box = el.querySelector('.geo-svg');
    box.innerHTML = el.dataset.kind === 'fins' ? finsDiagram() : flowDiagram();
  });
}

// Alan ↔ çizim vurgulama
function highlightPart(part) {
  $$('.geo [data-part]').forEach((n) => {
    const on = !!part && n.getAttribute('data-part').split(' ').includes(part);
    n.classList.toggle('hl', on);
  });
  $$('.geo').forEach((s) => s.classList.toggle('dim-others', !!part));
}
function wireDiagrams() {
  renderDiagrams();
  const find = (t) => (t && t.closest ? t.closest('[data-hl]') : null);
  document.addEventListener('focusin', (e) => { const h = find(e.target); if (h) highlightPart(h.dataset.hl); });
  document.addEventListener('focusout', (e) => { if (find(e.target)) highlightPart(null); });
  document.addEventListener('mouseover', (e) => { const h = find(e.target); if (h) highlightPart(h.dataset.hl); });
  document.addEventListener('mouseout', (e) => {
    const h = find(e.target);
    if (h && !h.contains(e.relatedTarget) && !(document.activeElement && find(document.activeElement))) highlightPart(null);
  });
}
