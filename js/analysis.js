/* =====================================================================
 * HEXeffectiveness — analysis.js
 * Analiz: fit, sonuç özeti, grafikler, bootstrap
 * Klasik <script> dosyaları global kapsamı paylaşır (derleme adımı yok);
 * yükleme sırası: physics → core → library → data → analysis → outputs → main
 * ===================================================================== */
'use strict';

/* ------------------------------------------------------------------
 * Analiz
 * ------------------------------------------------------------------ */
function runAnalysis(silent) {
  const msg = $('#analysisMsg');
  try {
    const pts = buildPoints();
    const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
    const geom = calcGeom();
    const st = S.settings;
    const opts = Object.assign({}, st, { unc: st.uncOn ? { T: +st.uT || 0, m: +st.uM || 0, dp: +st.uDP || 0 } : null });
    RESULT = H.analyze(pts, f1, f2, geom, opts);
    RESULT.geom = geom;
    RESULT.boot = null; RESULT.bootSum = null;
    if (MAP) { try { buildMap(true); } catch (e) { MAP = null; } }
    S.autoRun = true;
    if (!S.ui.ratingTouched) fillRatingDefaults(false);
    renderAnalysis();
    saveDraft();
    if (!silent) toast('Analiz tamamlandı: ' + RESULT.nUsed + ' nokta kullanıldı');
  } catch (e) {
    console.warn('Analiz yapılamadı:', e.message);
    RESULT = null; MAP = null;
    msg.innerHTML = `<div class="msg err">⚠ ${esc(e.message)}</div>`;
    $('#fitSummary').innerHTML = '';
    if (!silent) toast('Analiz yapılamadı: ' + e.message, 5000);
  }
  renderResultVisibility();
  if (!RESULT) $('#resultEmpty p').innerHTML = esc(lastError(msg)) || 'Analiz yapılamadı.';
  updateStepper();
}

const modeText = (m) => ({ '2D': '2D yüzey fit (her iki debi değişken)', '1D-m1': '1D eğri fit (ṁ₂ sabit, ṁ₁ değişken)', '1D-m2': '1D eğri fit (ṁ₁ sabit, ṁ₂ değişken)' }[m] || m);

const lastError = (el) => (el.textContent || '').replace(/^⚠\s*/, '');

// Düz dille özet: karar bandı + yapılacaklar listesi + anahtar sayılar
function renderVerdict() {
  const R = RESULT, F = R.fit, st = R.stats;
  const m = st.eps.MAPE, r2 = st.eps.R2;
  const lvl = m <= 2 && r2 >= 0.98 ? 'good' : m <= 5 ? 'ok' : 'bad';
  const head = { good: '✅ Model güvenilir', ok: '⚠️ Model kabul edilebilir', bad: '❌ Model veriyi iyi açıklamıyor' }[lvl];
  const sent = `Model, ${R.nUsed} test noktasındaki etkinliği ortalama <b>%${fx(m, 2)}</b> hatayla açıklıyor (R² = ${fx(r2, 3)}).` +
    (lvl === 'bad' ? ' Ölçümleri, akışkan seçimini ve sütun birimlerini kontrol edin.' : '');
  const todo = [];
  const btn = (action, label) => ` <a href="#" class="link-btn" data-action="${action}">${label}</a>`;
  if (R.nHB) todo.push(['warn', `${R.nHB} noktada iki taraftan hesaplanan ısı yükleri %${S.settings.hbThreshold}'ten fazla tutmuyor${S.settings.excludeHB ? ' — bu noktalar analize katılmadı' : ''}.` + btn('points', 'Noktaları gör')]);
  if (R.nInvalid) todo.push(['bad', `${R.nInvalid} satır eksik veya fiziksel olmayan değer içeriyor ve kullanılamadı.` + btn('points', 'Noktaları gör')]);
  if (F.mode !== '2D') todo.push(['warn', `Testlerde ${F.mode === '1D-m1' ? 'taraf 2' : 'taraf 1'} debisi sabit tutulmuş. Bu debi değişirse tahminler bir varsayıma dayanır.` + btn('suggest', 'Hangi noktaları ölçmeliyim?')]);
  try {
    const sh = R.pts.filter((p) => p.included).map((p) => p.R1 / (1 / p.UA_pred));
    const s1 = H.mean(sh);
    if (F.mode === '2D' && (s1 < 0.2 || s1 > 0.8)) {
      const weak = s1 < 0.2 ? 1 : 2;
      todo.push(['info', `Isıl direncin %${fx((weak === 1 ? s1 : 1 - s1) * 100, 0)}'i taraf ${weak}'de; bu tarafın katsayıları zayıf belirlenmiş. Tahminler yine geçerlidir; katsayıları ayrı yorumlayacaksanız ek ölçüm önerilir.` + btn('suggest', 'Önerilen noktalar')]);
    }
  } catch (e) { /* yok say */ }
  try {
    const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
    const v = R.pts.filter((p) => p.valid);
    const o = v.filter((p) => !f1.inRange(p.T1m) || !f2.inRange(p.T2m)).length;
    if (o) todo.push(['warn', `${o} noktada sıcaklık, akışkan özellik verisinin aralığı dışında.` + btn('library', 'Kütüphane')]);
  } catch (e) { /* yok say */ }
  if (R.model !== 'reynolds') {
    const tr = R.pts.filter((p) => p.included).map((p) => p.T1in);
    if (Math.max(...tr) - Math.min(...tr) > 15) todo.push(['info', 'Testler farklı giriş sıcaklıklarında yapılmış. Sıcaklık etkisini modele katmak için boyutsuz model daha doğru olabilir.' + btn('remodel', 'Boyutsuz modele geç')]);
  }
  if (R.nUsed < 8) todo.push(['info', `Yalnızca ${R.nUsed} nokta kullanıldı; daha fazla nokta tahminleri sağlamlaştırır.` + btn('suggest', 'Önerilen noktalar')]);
  if (F.warning) todo.push(['warn', esc(F.warning)]);
  if (!R.boot) todo.push(['info', 'Katsayıların ne kadar kesin olduğunu görmek için güven aralığını hesaplayabilirsiniz.' + btn('boot', 'Güven aralığını hesapla')]);
  $('#verdict').innerHTML = `<div class="verdict ${lvl}"><div class="vh">${head}</div><div>${sent}</div>
    ${todo.length ? '<ul class="todo">' + todo.map(([c, t]) => `<li class="${c}">${t}</li>`).join('') + '</ul>' : ''}</div>`;

  const uu = R.pts.filter((p) => p.included && isFinite(p.U_eps));
  const dpm = [st.dp1.MAPE, st.dp2.MAPE].filter(isFinite);
  const k = (key, v, u, cls) => `<div class="kpi ${cls || ''}"><div class="k">${key}</div><div class="v">${v}</div><div class="u">${u || ''}</div></div>`;
  $('#keyStats').innerHTML = [
    k('Etkinlik tahmin hatası', '%' + fx(m, 2), 'ortalama mutlak (MAPE)', lvl === 'bad' ? 'bad' : 'g'),
    k('Uyum', 'R² ' + fx(r2, 4), 'etkinlik, ölçüm vs model'),
    k('Kullanılan nokta', `${R.nUsed} / ${R.nTotal}`, R.nTotal - R.nUsed ? `${R.nTotal - R.nUsed} nokta dışarıda` : 'hepsi kullanıldı'),
    dpm.length ? k('Basınç düşümü hatası', '%' + fx(Math.max(...dpm), 2), 'en kötü taraf (MAPE)') : k('Basınç düşümü', '—', 'ölçüm yok'),
    uu.length ? k('Ölçüm belirsizliği', '±' + fx(H.mean(uu.map((p) => p.U_eps)), 3), 'etkinlikte, %95') : ''
  ].join('');
}

function renderAnalysis() {
  const R = RESULT; if (!R) return;
  renderVerdict();
  const F = R.fit, st = R.stats;
  const msgs = [];
  msgs.push(`<div class="msg info">Mod: <b>${modeText(F.mode)}</b> · CV(ṁ₁) = ${fx(F.cv1, 2)} %, CV(ṁ₂) = ${fx(F.cv2, 2)} % · Kullanılan nokta: <b>${R.nUsed}</b> / ${R.nTotal}</div>`);
  if (R.nHB) msgs.push(`<div class="msg warn">⚠ ${R.nHB} noktada ısı dengesi hatası > %${S.settings.hbThreshold}${S.settings.excludeHB ? ' — bu noktalar fit dışında tutuldu.' : ' — bu noktalar fit’e dahil (filtre kapalı).'}</div>`);
  if (R.nInvalid) msgs.push(`<div class="msg err">${R.nInvalid} nokta geçersiz (eksik veri veya fiziksel olmayan ε). Tabloya bakınız.</div>`);
  if (F.mode !== '2D') msgs.push(`<div class="msg warn">1D modda sabit tutulan tarafın üssü varsayılan değerdir (n = ${S.settings.assumedN}). Bu taraftaki debi değiştirilerek yapılan tahminler varsayıma dayalıdır.</div>`);
  try {
    const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
    const v = R.pts.filter((p) => p.valid);
    const o1 = v.filter((p) => !f1.inRange(p.T1m)).length, o2 = v.filter((p) => !f2.inRange(p.T2m)).length;
    if (o1 || o2) msgs.push(`<div class="msg warn">Özellik verisi aralığı dışında ortalama sıcaklık: ${o1 ? esc(S.fluid1) + ' (' + o1 + ' nokta) ' : ''}${o2 ? esc(S.fluid2) + ' (' + o2 + ' nokta)' : ''} — özellikler ekstrapole edildi.</div>`);
  } catch (e) { /* yok say */ }
  if (F.warning) msgs.push(`<div class="msg warn">${esc(F.warning)}</div>`);
  if (R.dpFit1 && R.dpFit1.clamped) msgs.push(`<div class="msg warn">ΔP₁ üssü sınıra çekildi (n<sub>p</sub> = ${fx(R.dpFit1.np, 3)}).</div>`);
  if (R.dpFit2 && R.dpFit2.clamped) msgs.push(`<div class="msg warn">ΔP₂ üssü sınıra çekildi (n<sub>p</sub> = ${fx(R.dpFit2.np, 3)}).</div>`);
  $('#analysisMsg').innerHTML = msgs.join('');

  const k = (cls, key, v, u) => `<div class="kpi ${cls}"><div class="k">${key}</div><div class="v">${v}</div><div class="u">${u || ''}</div></div>`;
  const re = R.model === 'reynolds';
  const B = R.bootSum;
  const ci = (key, d) => (B ? `<br>95% GA: ${d ? fx(B[key].lo, d) + '…' + fx(B[key].hi, d) : fmt(B[key].lo, 4) + '…' + fmt(B[key].hi, 4)}` : '');
  const hLab = (i) => (re ? `Nu${i} = C${i}·Re${i}<sup>n${i}</sup>·Pr${i}<sup>1/3</sup>` : `h${i} = C${i}·ṁ${i}<sup>n${i}</sup> [W/m²K]`);
  const dpK = (d, i) => (!d ? ['—', ''] : d.type === 'fanning'
    ? [`${fmt(d.Kf, 4)} · ${fx(d.b, 3)}`, `f${i} = K<sub>f</sub>·Re<sup>−b</sup> (n<sub>p</sub> ≈ ${fx(d.np, 2)}), Re ${fmt(d.ReMin, 3)}–${fmt(d.ReMax, 3)}`]
    : [`${fmt(d.Kp, 5)} · ${fx(d.np, 3)}`, `ΔP${i} = K<sub>p</sub>·ṁ<sup>n<sub>p</sub></sup> [Pa, kg/s]`]);
  const d1 = dpK(R.dpFit1, 1), d2 = dpK(R.dpFit2, 2);
  const uMean = R.pts.filter((p) => p.included && isFinite(p.U_eps));
  $('#fitSummary').innerHTML = [
    k('s1', 'C₁', fmt(F.C1, 5), hLab(1) + ci('C1')),
    k('s1', 'n₁', fx(F.n1, 4), (F.mode === '1D-m2' ? 'varsayılan' : 'fit') + ci('n1', 3)),
    k('s2', 'C₂', fmt(F.C2, 5), hLab(2) + ci('C2')),
    k('s2', 'n₂', fx(F.n2, 4), (F.mode === '1D-m1' ? 'varsayılan' : 'fit') + ci('n2', 3)),
    k('', 'R<sub>w</sub>', fmt(F.Rw, 4), 'K/W (girdi) · model: ' + (re ? 'Re/Nu–Pr' : 'kütle debisi')),
    k('s1', R.dpFit1 && R.dpFit1.type === 'fanning' ? 'K<sub>f1</sub> · b₁' : 'K<sub>p1</sub> · n<sub>p1</sub>', d1[0], d1[1]),
    k('s2', R.dpFit2 && R.dpFit2.type === 'fanning' ? 'K<sub>f2</sub> · b₂' : 'K<sub>p2</sub> · n<sub>p2</sub>', d2[0], d2[1]),
    k('g', 'ε: R²', fx(st.eps.R2, 4), `RMSE ${fx(st.eps.RMSE, 4)} · MAPE ${fx(st.eps.MAPE, 2)} %`),
    k('g', 'UA: R²', fx(st.UA.R2, 4), `RMSE ${fmt(st.UA.RMSE, 3)} W/K · MAPE ${fx(st.UA.MAPE, 2)} %`),
    k('g', 'ΔP₁: R²', fx(st.dp1.R2, 4), `MAPE ${fx(st.dp1.MAPE, 2)} %`),
    k('g', 'ΔP₂: R²', fx(st.dp2.R2, 4), `MAPE ${fx(st.dp2.MAPE, 2)} %`),
    uMean.length ? k('', 'Ölçüm belirsizliği U(ε)', '±' + fx(H.mean(uMean.map((p) => p.U_eps)), 4), `ort. (%95) · maks ±${fx(Math.max(...uMean.map((p) => p.U_eps)), 4)}`) : ''
  ].join('');
  $('#bootStatus').innerHTML = B ? `<span class="muted small">Bootstrap: ${R.boot.length} yeniden örnekleme · parametrelerin %95 güven aralıkları kartlarda; haritada ε bandı hesaplanır.</span>` : '';

  renderPointsTable();
  plotAll();
  manualPreview();
}

function renderPointsTable() {
  const R = RESULT; if (!R) return;
  const tu = S.map.T1_in.unit;
  const T = (v) => (isFinite(v) ? fx(H.fromKelvin(v, tu), 2) : '—');
  $('#ptsTbl').innerHTML = `<thead><tr><th>Dahil</th><th>#</th><th>ṁ₁ [kg/s]</th><th>ṁ₂ [kg/s]</th><th>T₁in [${tu}]</th><th>T₁out</th><th>T₂in</th><th>T₂out</th>
    <th>Q₁ [W]</th><th>Q₂ [W]</th><th>HB hata [%]</th><th>ε<sub>deney</sub></th><th>U(ε) %95</th><th>ε<sub>model</sub></th><th>Δε [%]</th><th>NTU</th><th>UA [W/K]</th><th>UA<sub>model</sub></th>
    <th>h₁</th><th>h₂</th><th>Re₁</th><th>Re₂</th><th>η<sub>o1</sub></th><th>η<sub>o2</sub></th><th>ΔP₁ [Pa]</th><th>ΔP₁<sub>model</sub></th><th>ΔP₂ [Pa]</th><th>ΔP₂<sub>model</sub></th><th>Durum</th></tr></thead><tbody>` +
    R.pts.map((p) => {
      const cls = !p.valid ? 'invalid' : p.hbFlag ? 'flag' : !p.included ? 'excluded' : '';
      const status = !p.valid ? esc(p.reason) : p.hbFlag ? 'Isı dengesi > eşik' : p.manualExclude ? 'Manuel hariç' : 'OK';
      const dEps = p.valid ? (p.eps_pred - p.eps_exp) / p.eps_exp * 100 : NaN;
      return `<tr class="${cls}"><td><input type="checkbox" data-incl="${p.idx}" ${p.manualExclude ? '' : 'checked'}></td><td>${esc(p.label)}</td>
        <td class="num">${fx(p.m1, 4)}</td><td class="num">${fx(p.m2, 4)}</td><td class="num">${T(p.T1in)}</td><td class="num">${T(p.T1out)}</td><td class="num">${T(p.T2in)}</td><td class="num">${T(p.T2out)}</td>
        <td class="num">${fmt(p.Q1, 5)}</td><td class="num">${fmt(p.Q2, 5)}</td><td class="num">${fx(p.hbErr, 2)}</td>
        <td class="num">${fx(p.eps_exp, 4)}</td><td class="num">${isFinite(p.U_eps) ? '±' + fx(p.U_eps, 4) : '—'}</td><td class="num">${fx(p.eps_pred, 4)}</td><td class="num">${fx(dEps, 2)}</td>
        <td class="num">${fx(p.NTU, 3)}</td><td class="num">${fmt(p.UA, 4)}</td><td class="num">${fmt(p.UA_pred, 4)}</td>
        <td class="num">${fmt(p.h1, 4)}</td><td class="num">${fmt(p.h2, 4)}</td><td class="num">${fmt(p.Re1, 4)}</td><td class="num">${fmt(p.Re2, 4)}</td><td class="num">${fx(p.eta1, 3)}</td><td class="num">${fx(p.eta2, 3)}</td>
        <td class="num">${fmt(p.dp1, 4)}</td><td class="num">${fmt(p.dp1_pred, 4)}</td><td class="num">${fmt(p.dp2, 4)}</td><td class="num">${fmt(p.dp2_pred, 4)}</td><td>${status}</td></tr>`;
    }).join('') + '</tbody>';
}

/* ------------------------------------------------------------------
 * Grafikler (Plotly)
 * ------------------------------------------------------------------ */
function meanInletTemps() {
  const u = RESULT.pts.filter((p) => p.included);
  return { T1in: H.mean(u.map((p) => p.T1in)), T2in: H.mean(u.map((p) => p.T2in)) };
}
// Seviye gruplama (ör. sabit ṁ₂ seviyeleri) — %4 tolerans
function levels(values, tol) {
  const s = values.slice().sort((a, b) => a - b), out = [];
  for (const v of s) {
    const g = out[out.length - 1];
    if (g && Math.abs(v - g.mean) / g.mean < (tol || 0.04)) { g.vals.push(v); g.mean = H.mean(g.vals); } else out.push({ mean: v, vals: [v] });
  }
  return out.map((g) => g.mean);
}

function plotAll() {
  const R = RESULT; if (!R) return;
  const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
  const inc = R.pts.filter((p) => p.included), exc = R.pts.filter((p) => p.valid && !p.included);
  const lab = (p) => '#' + p.label;

  // 1) Isı dengesi
  const vp = R.pts.filter((p) => isFinite(p.hbErr));
  Plotly.react('plotHB', [{
    type: 'bar', x: vp.map(lab), y: vp.map((p) => p.hbErr), marker: { color: vp.map((p) => (p.hbFlag ? C1C : '#5d9cec')) },
    hovertemplate: '%{x}<br>Hata: %{y:.2f} %<extra></extra>'
  }], baseLayout({
    yaxis: { title: 'Isı dengesi hatası [%]' }, xaxis: { title: 'Test noktası', type: 'category' },
    shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: S.settings.hbThreshold, y1: S.settings.hbThreshold, line: { color: C1C, dash: 'dash' } }],
    annotations: [{ xref: 'paper', x: 1, y: S.settings.hbThreshold, text: 'eşik %' + S.settings.hbThreshold, showarrow: false, yanchor: 'bottom', xanchor: 'right', font: { color: C1C } }],
    showlegend: false
  }), PCFG);

  // 2) Parity ε
  const all = inc.concat(exc);
  const lo = Math.min(...all.map((p) => Math.min(p.eps_exp, p.eps_pred))) * 0.95, hi = Math.max(...all.map((p) => Math.max(p.eps_exp, p.eps_pred))) * 1.05;
  Plotly.react('plotParity', [
    { x: [lo, hi], y: [lo, hi], mode: 'lines', name: 'y = x', line: { color: TC.line } },
    { x: [lo, hi], y: [lo * 1.05, hi * 1.05], mode: 'lines', name: '±5 %', line: { color: GRAY, dash: 'dot' } },
    { x: [lo, hi], y: [lo * 0.95, hi * 0.95], mode: 'lines', showlegend: false, line: { color: GRAY, dash: 'dot' } },
    { x: inc.map((p) => p.eps_exp), y: inc.map((p) => p.eps_pred), text: inc.map(lab), mode: 'markers', name: 'Fit noktaları', marker: { color: TC.main, size: 8 },
      error_x: inc.some((p) => isFinite(p.U_eps)) ? { type: 'data', array: inc.map((p) => p.U_eps || 0), visible: true, color: TC.gray, thickness: 1, width: 2 } : undefined },
    { x: exc.map((p) => p.eps_exp), y: exc.map((p) => p.eps_pred), text: exc.map(lab), mode: 'markers', name: 'Hariç tutulan', marker: { color: C1C, size: 9, symbol: 'x' } }
  ], baseLayout({
    xaxis: { title: 'ε deneysel', range: [lo, hi] }, yaxis: { title: 'ε model', range: [lo, hi], scaleanchor: 'x' },
    annotations: [{ xref: 'paper', yref: 'paper', x: 0.02, y: 0.98, xanchor: 'left', showarrow: false, align: 'left', bgcolor: TC.annot,
      text: `R² = ${fx(R.stats.eps.R2, 4)}<br>RMSE = ${fx(R.stats.eps.RMSE, 4)}<br>MAPE = ${fx(R.stats.eps.MAPE, 2)} %` }]
  }), PCFG);

  // 3) Yüzey / eğri
  const Tin = meanInletTemps();
  const m1r = [Math.min(...inc.map((p) => p.m1)), Math.max(...inc.map((p) => p.m1))];
  const m2r = [Math.min(...inc.map((p) => p.m2)), Math.max(...inc.map((p) => p.m2))];
  const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  const epsAt = (m1, m2) => H.rate({ m1, m2, T1in: Tin.T1in, T2in: Tin.T2in }, R.fit, R.geom, f1, f2).eps;
  if (R.fit.mode === '2D') {
    $('#surfTitle').textContent = 'ε(ṁ₁, ṁ₂) Yüzeyi — Model + Ölçüm (3D)';
    const xs = lin(m1r[0] * 0.9, m1r[1] * 1.1, 30), ys = lin(m2r[0] * 0.9, m2r[1] * 1.1, 30);
    const z = ys.map((b) => xs.map((a) => epsAt(a, b)));
    Plotly.react('plotSurface', [
      { type: 'surface', x: xs, y: ys, z, colorscale: 'Viridis', opacity: 0.85, name: 'Model', colorbar: { title: 'ε', len: 0.7 },
        contours: { z: { show: true, usecolormap: true, project: { z: true } } } },
      { type: 'scatter3d', mode: 'markers', x: inc.map((p) => p.m1), y: inc.map((p) => p.m2), z: inc.map((p) => p.eps_exp), text: inc.map(lab), name: 'Ölçüm', marker: { size: 4, color: '#c0392b' } },
      { type: 'scatter3d', mode: 'markers', x: exc.map((p) => p.m1), y: exc.map((p) => p.m2), z: exc.map((p) => p.eps_exp), text: exc.map(lab), name: 'Hariç', marker: { size: 4, color: '#f0a030', symbol: 'x' } }
    ], { margin: { t: 10, l: 0, r: 0, b: 0 }, paper_bgcolor: TC.paper, font: { color: TC.font, family: 'Segoe UI, Arial', size: 12 },
      scene: { xaxis: Object.assign({ title: 'ṁ₁ [kg/s]' }, axisTheme(TC)), yaxis: Object.assign({ title: 'ṁ₂ [kg/s]' }, axisTheme(TC)), zaxis: Object.assign({ title: 'ε' }, axisTheme(TC)), camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } } }, legend: { x: 0, y: 1 } }, PCFG);
  } else {
    const v1 = R.fit.mode === '1D-m1';
    const fixedM = H.mean(inc.map((p) => (v1 ? p.m2 : p.m1)));
    $('#surfTitle').textContent = `ε – ${v1 ? 'ṁ₁' : 'ṁ₂'} Eğrisi (1D mod, ${v1 ? 'ṁ₂' : 'ṁ₁'} ≈ ${fx(fixedM, 4)} kg/s sabit)`;
    const rr = v1 ? m1r : m2r;
    const xs = lin(rr[0] * 0.8, rr[1] * 1.2, 80);
    Plotly.react('plotSurface', [
      { x: xs, y: xs.map((m) => (v1 ? epsAt(m, fixedM) : epsAt(fixedM, m))), mode: 'lines', name: 'Model', line: { color: TC.main, width: 3 } },
      { x: inc.map((p) => (v1 ? p.m1 : p.m2)), y: inc.map((p) => p.eps_exp), text: inc.map(lab), mode: 'markers', name: 'Ölçüm', marker: { color: C1C, size: 9 } },
      { x: exc.map((p) => (v1 ? p.m1 : p.m2)), y: exc.map((p) => p.eps_exp), text: exc.map(lab), mode: 'markers', name: 'Hariç', marker: { color: '#f0a030', size: 9, symbol: 'x' } }
    ], baseLayout({ xaxis: { title: (v1 ? 'ṁ₁' : 'ṁ₂') + ' [kg/s]' }, yaxis: { title: 'ε' } }), PCFG);
  }

  // 4) ε – debi eğrileri (ṁ₂ seviyeleri için ṁ₁ ekseninde; 1D-m2 ise tersine)
  const alongM1 = R.fit.mode !== '1D-m2';
  const lv = levels(inc.map((p) => (alongM1 ? p.m2 : p.m1))).slice(0, 10);
  const rr = alongM1 ? m1r : m2r;
  const xs = lin(rr[0] * 0.8, rr[1] * 1.2, 60);
  const curves = [];
  lv.forEach((L, i) => {
    const col = PALETTE[i % PALETTE.length];
    const nm = (alongM1 ? 'ṁ₂' : 'ṁ₁') + ' = ' + fx(L, 3);
    curves.push({ x: xs, y: xs.map((x) => (alongM1 ? epsAt(x, L) : epsAt(L, x))), mode: 'lines', name: nm, line: { color: col }, legendgroup: nm });
    const pp = inc.filter((p) => Math.abs((alongM1 ? p.m2 : p.m1) - L) / L < 0.04);
    curves.push({ x: pp.map((p) => (alongM1 ? p.m1 : p.m2)), y: pp.map((p) => p.eps_exp), text: pp.map(lab), mode: 'markers', showlegend: false, legendgroup: nm, marker: { color: col, size: 8 } });
  });
  Plotly.react('plotCurves', curves, baseLayout({ xaxis: { title: (alongM1 ? 'ṁ₁' : 'ṁ₂') + ' [kg/s]' }, yaxis: { title: 'ε' }, legend: { orientation: 'v', x: 1.02, y: 1 }, margin: { r: 120 } }), PCFG);

  // 5) Wilson plot: y_i = 1/UA − R_w − (diğer taraf direnci, model) ; x_i = 1/(η_o A ṁ^n) ; eğim = 1/C
  const g = R.geom, F = R.fit;
  const w1x = inc.map((p) => 1 / (p.eta1 * g.side1.A * p.b1.f * Math.pow(p.b1.g, F.n1)));
  const w1y = inc.map((p) => 1 / p.UA - g.Rw - p.R2);
  const w2x = inc.map((p) => 1 / (p.eta2 * g.side2.A * p.b2.f * Math.pow(p.b2.g, F.n2)));
  const w2y = inc.map((p) => 1 / p.UA - g.Rw - p.R1);
  const ln = (xa, slope) => { const a = Math.min(0, ...xa), b = Math.max(...xa) * 1.1; return { x: [a, b], y: [a * slope, b * slope] }; };
  const L1 = ln(w1x, 1 / F.C1), L2 = ln(w2x, 1 / F.C2);
  Plotly.react('plotWilson', [
    { x: w1x, y: w1y, text: inc.map(lab), mode: 'markers', name: 'Taraf 1', marker: { color: C1C, size: 7 } },
    { x: L1.x, y: L1.y, mode: 'lines', name: 'eğim 1/C₁', line: { color: C1C } },
    { x: w2x, y: w2y, text: inc.map(lab), mode: 'markers', name: 'Taraf 2', marker: { color: C2C, size: 7 }, xaxis: 'x2', yaxis: 'y2' },
    { x: L2.x, y: L2.y, mode: 'lines', name: 'eğim 1/C₂', line: { color: C2C }, xaxis: 'x2', yaxis: 'y2' }
  ], baseLayout({
    grid: { rows: 1, columns: 2, pattern: 'independent' },
    xaxis: { title: R.model === 'reynolds' ? '1/(η<sub>o1</sub>A₁(k/D<sub>h</sub>)Re₁<sup>n₁</sup>Pr₁<sup>1/3</sup>)' : '1/(η<sub>o1</sub>A₁ṁ₁<sup>n₁</sup>)', exponentformat: 'e' }, yaxis: { title: '1/UA − R<sub>w</sub> − R₂ [K/W]', exponentformat: 'e' },
    xaxis2: { title: R.model === 'reynolds' ? '1/(η<sub>o2</sub>A₂(k/D<sub>h</sub>)Re₂<sup>n₂</sup>Pr₂<sup>1/3</sup>)' : '1/(η<sub>o2</sub>A₂ṁ₂<sup>n₂</sup>)', exponentformat: 'e' }, yaxis2: { title: '1/UA − R<sub>w</sub> − R₁ [K/W]', exponentformat: 'e' },
    margin: { l: 70, r: 20 }
  }), PCFG);

  // 6) ΔP – debi
  const dpTr = [];
  const addDP = (side, fitp, col) => {
    const key = side === 1 ? 'm1' : 'm2', dk = side === 1 ? 'dp1' : 'dp2';
    const pp = inc.filter((p) => isFinite(p[dk]));
    if (!pp.length) return;
    dpTr.push({ x: pp.map((p) => p[key]), y: pp.map((p) => p[dk]), text: pp.map(lab), mode: 'markers', name: 'ΔP' + side + ' ölçüm', marker: { color: col, size: 7 }, yaxis: side === 1 ? 'y' : 'y2' });
    if (fitp) {
      const r0 = [Math.min(...pp.map((p) => p[key])), Math.max(...pp.map((p) => p[key]))];
      const xx = lin(r0[0] * 0.8, r0[1] * 1.2, 50);
      const Tm = H.mean(pp.map((p) => (side === 1 ? p.T1m : p.T2m)));
      const flx = side === 1 ? f1 : f2, sg = side === 1 ? R.geom.side1 : R.geom.side2;
      const nm = fitp.type === 'fanning' ? `ΔP${side} model (Fanning, T̄m = ${fx(Tm - 273.15, 1)} °C)` : `ΔP${side} = ${fmt(fitp.Kp, 4)}·ṁ^${fx(fitp.np, 3)}`;
      dpTr.push({ x: xx, y: xx.map((m) => H.dpPredict(fitp, sg, flx, m, Tm)), mode: 'lines', name: nm, line: { color: col }, yaxis: side === 1 ? 'y' : 'y2' });
    }
  };
  addDP(1, R.dpFit1, C1C); addDP(2, R.dpFit2, C2C);
  Plotly.react('plotDP', dpTr, baseLayout({ xaxis: { title: 'ṁ [kg/s]' }, yaxis: { title: 'ΔP₁ [Pa]', titlefont: { color: C1C } }, yaxis2: { title: 'ΔP₂ [Pa]', overlaying: 'y', side: 'right', titlefont: { color: C2C } }, margin: { r: 60 } }), PCFG);

  // 7) Parity ΔP
  const pd = [];
  const dpv = [];
  [[1, C1C], [2, C2C]].forEach(([s, col]) => {
    const pp = inc.filter((p) => isFinite(p['dp' + s]) && isFinite(p['dp' + s + '_pred']));
    if (!pp.length) return;
    pp.forEach((p) => { dpv.push(p['dp' + s], p['dp' + s + '_pred']); });
    pd.push({ x: pp.map((p) => p['dp' + s]), y: pp.map((p) => p['dp' + s + '_pred']), text: pp.map(lab), mode: 'markers', name: `ΔP${s} (R² ${fx(R.stats['dp' + s].R2, 4)}, MAPE ${fx(R.stats['dp' + s].MAPE, 2)} %)`, marker: { color: col, size: 7 } });
  });
  if (dpv.length) {
    const a = Math.min(...dpv.filter((v) => v > 0)) * 0.8, b = Math.max(...dpv) * 1.2;
    pd.unshift({ x: [a, b], y: [a, b], mode: 'lines', name: 'y = x', line: { color: TC.line } },
      { x: [a, b], y: [a * 1.1, b * 1.1], mode: 'lines', name: '±10 %', line: { color: GRAY, dash: 'dot' } },
      { x: [a, b], y: [a * 0.9, b * 0.9], mode: 'lines', showlegend: false, line: { color: GRAY, dash: 'dot' } });
  }
  Plotly.react('plotParityDP', pd, baseLayout({ xaxis: { title: 'ΔP ölçüm [Pa]', type: 'log' }, yaxis: { title: 'ΔP model [Pa]', type: 'log' } }), PCFG);
}


/* ------------------------------------------------------------------
 * Bootstrap güven aralığı (asenkron, arayüzü kilitlemeden)
 * ------------------------------------------------------------------ */
let BOOT_TOKEN = 0;
async function runBootstrap() {
  if (!RESULT) { toast('Önce analizi çalıştırın', 3500); return; }
  const R = RESULT, token = ++BOOT_TOKEN;
  const used = R.pts.filter((p) => p.included);
  const n = Math.max(20, Math.min(1000, Math.round(+S.settings.nBoot || 100)));
  const rnd = H.mulberry32(20261012);
  const fits = [];
  const btn = $('#btnBoot'); btn.disabled = true;
  try {
    for (let i = 0; i < n; i++) {
      const f = H.bootstrapOne(used, R.geom, S.settings, R.fit, rnd);
      if (f) fits.push(f);
      if (i % 4 === 3) {
        $('#bootStatus').innerHTML = `<div class="msg info">Bootstrap: ${i + 1} / ${n}…</div>`;
        await new Promise((r) => setTimeout(r, 0));
        if (token !== BOOT_TOKEN || R !== RESULT) return; // analiz değişti -> iptal
      }
    }
    if (fits.length < 10) throw new Error('Yeterli bootstrap fit üretilemedi');
    R.boot = fits; R.bootSum = H.bootstrapSummary(fits);
    renderAnalysis(); runRating(true);
    if (MAP) buildMap(true);
    toast('Bootstrap tamamlandı (' + fits.length + ' fit)');
  } catch (e) {
    $('#bootStatus').innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  } finally { btn.disabled = false; }
}
