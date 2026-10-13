/* =====================================================================
 * HEXeffectiveness — outputs.js
 * Çıktılar: tek nokta tahmini, performans haritası ve dışa aktarma, PDF
 * Klasik <script> dosyaları global kapsamı paylaşır (derleme adımı yok);
 * yükleme sırası: physics → core → library → data → analysis → outputs → main
 * ===================================================================== */
'use strict';

/* ------------------------------------------------------------------
 * Performans tahmini
 * ------------------------------------------------------------------ */
// Bootstrap fit'lerinden ε için %95 bant metni
function epsBand(m1, m2, T1in, T2in) {
  if (!RESULT || !RESULT.boot || !RESULT.boot.length) return '';
  const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
  const es = RESULT.boot.map((bf) => { try { return H.rate({ m1, m2, T1in, T2in }, bf, RESULT.geom, f1, f2).eps; } catch (e) { return NaN; } });
  const lo = H.percentile(es, 0.025), hi = H.percentile(es, 0.975);
  return `%95 GA: ${fx(lo, 4)}…${fx(hi, 4)} (±${fx((hi - lo) / 2, 4)})`;
}

function runRating(silent) {
  const out = $('#rateOut'), warn = $('#rateWarn');
  if (!RESULT) { out.innerHTML = ''; warn.innerHTML = '<div class="msg info">Önce <b>Analiz</b> sekmesinde fit işlemini çalıştırın.</div>'; Plotly.purge('plotSweep'); return; }
  try {
    const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2), r = S.rating;
    const T1in = H.toKelvin(+r.T1in, r.tempUnit), T2in = H.toKelvin(+r.T2in, r.tempUnit);
    const m1 = H.toKgPerS(+r.m1, r.flowUnit1, f1.rho(T1in)), m2 = H.toKgPerS(+r.m2, r.flowUnit2, f2.rho(T2in));
    if (!(m1 > 0 && m2 > 0)) throw new Error('Debiler pozitif olmalı');
    if (Math.abs(T1in - T2in) < 1e-6) throw new Error('Giriş sıcaklıkları farklı olmalı');
    const res = H.rate({ m1, m2, T1in, T2in }, RESULT.fit, RESULT.geom, f1, f2, RESULT.dpFit1, RESULT.dpFit2);
    const tu = r.tempUnit, du = r.dpUnit;
    const dpc = (v) => (du === 'kPa' ? v / 1000 : du === 'mbar' ? v / 100 : v);
    const k = (cls, key, v, u) => `<div class="kpi ${cls}"><div class="k">${key}</div><div class="v">${v}</div><div class="u">${u || ''}</div></div>`;
    const T = (v) => fx(H.fromKelvin(v, tu), 1) + ' ' + tu;
    out.innerHTML = [
      k('g', 'Etkinlik ε', fx(res.eps, 3), epsBand(m1, m2, T1in, T2in) || ''),
      k('g', 'Isı yükü Q', fmt(res.Q / 1000, 4) + ' kW', ''),
      k('s1', 'Taraf 1 çıkış', T(res.T1out), `${res.T1out < T1in ? 'soğuyor' : 'ısınıyor'} ${fx(Math.abs(res.T1out - T1in), 1)} K`),
      k('s2', 'Taraf 2 çıkış', T(res.T2out), `${res.T2out < T2in ? 'soğuyor' : 'ısınıyor'} ${fx(Math.abs(res.T2out - T2in), 1)} K`),
      k('s1', 'Basınç düşümü 1', isFinite(res.dp1) ? fmt(dpc(res.dp1), 4) + ' ' + du : '—', isFinite(res.dp1) ? '' : 'ΔP ölçümü yok'),
      k('s2', 'Basınç düşümü 2', isFinite(res.dp2) ? fmt(dpc(res.dp2), 4) + ' ' + du : '—', isFinite(res.dp2) ? '' : 'ΔP ölçümü yok')
    ].join('') + `<details class="section rate-more"><summary><span class="small">Teknik değerler (NTU, UA, h, η)</span></summary><div class="grid kpis">${[
      k('', 'NTU', fx(res.NTU, 4), 'C<sub>r</sub> = ' + fx(res.Cr, 4)), k('', 'UA', fmt(res.UA, 5), 'W/K'),
      k('s1', 'h₁ · η<sub>o1</sub>', fmt(res.h1, 4) + ' · ' + fx(res.eta1, 3), 'W/m²K'), k('s2', 'h₂ · η<sub>o2</sub>', fmt(res.h2, 4) + ' · ' + fx(res.eta2, 3), 'W/m²K'),
      k('', 'ṁ₁ · ṁ₂ (SI)', fx(m1, 4) + ' · ' + fx(m2, 4), 'kg/s'), k('', 'C<sub>min</sub>', fmt(res.Cmin, 5), 'W/K')
    ].join('')}</div></details>`;
    const inc = RESULT.pts.filter((p) => p.included);
    const ext = (v, arr) => v < Math.min(...arr) * 0.9 || v > Math.max(...arr) * 1.1;
    const w = [];
    if (ext(m1, inc.map((p) => p.m1))) w.push('ṁ₁ test aralığının dışında (ekstrapolasyon).');
    const tr1 = inc.map((p) => p.T1in), tr2 = inc.map((p) => p.T2in);
    if (T1in < Math.min(...tr1) - 10 || T1in > Math.max(...tr1) + 10 || T2in < Math.min(...tr2) - 10 || T2in > Math.max(...tr2) + 10) {
      w.push(RESULT.model === 'reynolds' ? 'Giriş sıcaklığı test aralığından >10 K farklı; Re/Pr modeli özellik değişimini hesaba katar, ancak sonuç yine de ekstrapolasyondur.'
        : 'Giriş sıcaklığı test aralığından >10 K farklı. Kütle debisi modelinde sıcaklık etkisi yalnızca c<sub>p</sub> üzerinden yansır; viskozitesi sıcaklıkla değişen akışkanlar için Akışkan & Geometri sekmesinden <b>Re/Nu–Pr modelini</b> seçin.');
    }
    if (ext(m2, inc.map((p) => p.m2))) w.push('ṁ₂ test aralığının dışında (ekstrapolasyon).');
    if (RESULT.fit.mode === '1D-m1' && Math.abs(m2 - RESULT.fit.mConstMean) / RESULT.fit.mConstMean > 0.05) w.push('1D modda ṁ₂ sabitti; ṁ₂ değişimi varsayılan üsse (n₂) dayanır.');
    if (RESULT.fit.mode === '1D-m2' && Math.abs(m1 - RESULT.fit.mConstMean) / RESULT.fit.mConstMean > 0.05) w.push('1D modda ṁ₁ sabitti; ṁ₁ değişimi varsayılan üsse (n₁) dayanır.');
    warn.innerHTML = w.map((x) => `<div class="msg warn">⚠ ${x}</div>`).join('');

    // Tarama grafiği
    const sv = $('#sweepVar').value;
    const arr = inc.map((p) => p[sv]);
    const xs = Array.from({ length: 60 }, (_, i) => Math.min(...arr) * 0.6 + (Math.max(...arr) * 1.3 - Math.min(...arr) * 0.6) * i / 59);
    const rs = xs.map((x) => H.rate({ m1: sv === 'm1' ? x : m1, m2: sv === 'm2' ? x : m2, T1in, T2in }, RESULT.fit, RESULT.geom, f1, f2, RESULT.dpFit1, RESULT.dpFit2));
    // Görüntüleme birimine çevir (kullanıcının seçtiği debi birimi)
    const ufl = sv === 'm1' ? r.flowUnit1 : r.flowUnit2, rho = sv === 'm1' ? f1.rho(T1in) : f2.rho(T2in);
    const xd = xs.map((x) => fromSIflow(x, ufl, rho));
    const hasDp = rs.some((q) => isFinite(sv === 'm1' ? q.dp1 : q.dp2));
    Plotly.react('plotSweep', [
      { x: xd, y: rs.map((q) => q.eps), name: 'Etkinlik ε', line: { color: TC.main, width: 3 } },
      hasDp ? { x: xd, y: rs.map((q) => dpc(sv === 'm1' ? q.dp1 : q.dp2)), name: `Basınç düşümü ${sv === 'm1' ? '1' : '2'} [${du}]`, yaxis: 'y2', line: { color: sv === 'm1' ? C1C : C2C, dash: 'dash', width: 2 } } : null,
      { x: [fromSIflow(sv === 'm1' ? m1 : m2, ufl, rho)], y: [res.eps], mode: 'markers', name: 'Seçili nokta', marker: { size: 13, color: '#f0a030', line: { color: TC.line, width: 1 } } }
    ].filter(Boolean), baseLayout({
      xaxis: { title: `${sv === 'm1' ? 'Taraf 1' : 'Taraf 2'} debisi [${ufl}]` }, yaxis: { title: 'Etkinlik ε' },
      yaxis2: { title: `ΔP [${du}]`, overlaying: 'y', side: 'right', showgrid: false },
      margin: { r: 70 }
    }), PCFG);
  } catch (e) {
    out.innerHTML = ''; warn.innerHTML = `<div class="msg err">⚠ ${esc(e.message)}</div>`;
    if (!silent) toast(e.message, 4000);
  }
}


/* ------------------------------------------------------------------
 * Harita aralıkları (kullanıcı veya akıllı)
 * ------------------------------------------------------------------ */
function parseList(str) {
  return String(str || '').split(/[;,\s]+/).map((x) => num(x)).filter((x) => isFinite(x));
}
// Harita/öneri için debi aralığını SI cinsinden çöz
function mapRanges() {
  if (!RESULT) throw new Error('Önce analizi çalıştırın');
  const used = RESULT.pts.filter((p) => p.included);
  const P = S.pmap, f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
  const T1 = H.mean(used.map((p) => p.T1in)), T2 = H.mean(used.map((p) => p.T2in));
  const toSI1 = (v) => H.toKgPerS(v, P.flowUnit1, f1.rho(T1)), toSI2 = (v) => H.toKgPerS(v, P.flowUnit2, f2.rho(T2));
  const side = (vals, minS, maxS, nS, toSI) => {
    const sr = H.smartRange(vals, +nS || 13);
    const lo = isFinite(num(minS)) ? toSI(num(minS)) : sr.lo;
    const hi = isFinite(num(maxS)) ? toSI(num(maxS)) : sr.hi;
    if (!(lo > 0 && hi >= lo)) throw new Error('Geçersiz debi aralığı');
    const n = hi === lo ? 1 : Math.max(2, Math.min(200, Math.round(+nS || sr.n)));
    const log = P.spacing === 'log' || (P.spacing === 'auto' && hi / lo > 4);
    return { lo, hi, n, log, values: H.spaced(lo, hi, n, log) };
  };
  return {
    r1: side(used.map((p) => p.m1), P.m1min, P.m1max, P.m1n, toSI1),
    r2: side(used.map((p) => p.m2), P.m2min, P.m2max, P.m2n, toSI2),
    T1: T1, T2: T2, used
  };
}
const fromSIflow = (v, u, rho) => (u === 'kg/h' ? v * 3600 : u === 'g/s' ? v * 1000 : u === 'L/min' ? v / rho * 60000 : v);
const dpConv = (v, u) => (u === 'kPa' ? v / 1000 : u === 'mbar' ? v / 100 : v);

function fillSmartRange() {
  try {
    S.pmap.m1min = ''; S.pmap.m1max = ''; S.pmap.m2min = ''; S.pmap.m2max = ''; S.pmap.T1list = ''; S.pmap.T2list = '';
    const r = mapRanges();
    const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2), P = S.pmap;
    const c1 = (v) => +fromSIflow(v, P.flowUnit1, f1.rho(r.T1)).toPrecision(4), c2 = (v) => +fromSIflow(v, P.flowUnit2, f2.rho(r.T2)).toPrecision(4);
    Object.assign(P, { m1min: c1(r.r1.lo), m1max: c1(r.r1.hi), m1n: r.r1.n, m2min: c2(r.r2.lo), m2max: c2(r.r2.hi), m2n: r.r2.n,
      T1list: String(+H.fromKelvin(r.T1, P.tempUnit).toFixed(1)), T2list: String(+H.fromKelvin(r.T2, P.tempUnit).toFixed(1)) });
    syncBindings(); saveDraft();
    toast('Akıllı aralık dolduruldu');
  } catch (e) { toast(e.message, 4000); }
}

/* ------------------------------------------------------------------
 * Performans haritası
 * ------------------------------------------------------------------ */
function buildMap(silent) {
  const msg = $('#mapMsg');
  try {
    const r = mapRanges(), P = S.pmap;
    const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
    const T1s = parseList(P.T1list).map((t) => H.toKelvin(t, P.tempUnit));
    const T2s = parseList(P.T2list).map((t) => H.toKelvin(t, P.tempUnit));
    const L1 = T1s.length ? T1s : [r.T1], L2 = T2s.length ? T2s : [r.T2];
    const levels = [];
    for (const T1in of L1) for (const T2in of L2) {
      if (Math.abs(T1in - T2in) < 1e-6) continue;
      const m = H.computeMap({ m1s: r.r1.values, m2s: r.r2.values, T1in, T2in },
        { fit: RESULT.fit, geom: RESULT.geom, fl1: f1, fl2: f2, dpFit1: RESULT.dpFit1, dpFit2: RESULT.dpFit2, used: r.used, boot: RESULT.boot });
      levels.push({ T1in, T2in, rows: m.rows, hull: m.hull });
    }
    if (!levels.length) throw new Error('Geçerli sıcaklık seviyesi yok (T₁ ≠ T₂ olmalı)');
    MAP = { levels, m1s: r.r1.values, m2s: r.r2.values, ranges: r, created: new Date().toISOString(), fit: RESULT.fit, model: RESULT.model };
    const nOut = levels[0].rows.filter((x) => !x.inside).length;
    msg.innerHTML = (nOut ? `<div class="msg info">Haritanın ${nOut} / ${levels[0].rows.length} noktası test edilen bölgenin dışında (×). Bu bölgedeki değerler tahmindir.</div>` : '') +
      (RESULT.model !== 'reynolds' && levels.length > 1 ? '<div class="msg warn">Birden çok sıcaklık seviyesi kütle debisi modeliyle hesaplandı: sıcaklık etkisi yalnızca c<sub>p</sub> üzerinden yansır. Daha gerçekçi sonuç için boyutsuz (Re/Nu–Pr) modeli seçin.</div>' : '');
    $('#mapLevel').innerHTML = levels.map((l, i) => `<option value="${i}">T₁=${fx(H.fromKelvin(l.T1in, P.tempUnit), 1)} / T₂=${fx(H.fromKelvin(l.T2in, P.tempUnit), 1)} ${P.tempUnit}</option>`).join('');
    if (!(S.pmap.level < levels.length)) S.pmap.level = 0;
    const fr = (rr, u, rho) => `${fmt(fromSIflow(rr.lo, u, rho), 3)}–${fmt(fromSIflow(rr.hi, u, rho), 3)} ${u} (${rr.values.length} adım${rr.log ? ', log' : ''})`;
    const custom = ['m1min', 'm1max', 'm2min', 'm2max', 'T1list', 'T2list'].some((k) => String(P[k] || '').trim() !== '');
    $('#mapRangeInfo').innerHTML = `${custom ? 'Özel aralık' : 'Otomatik aralık (test aralığı ±%20)'} · Taraf 1: ${fr(r.r1, P.flowUnit1, f1.rho(r.T1))} · Taraf 2: ${fr(r.r2, P.flowUnit2, f2.rho(r.T2))} · ${levels.length} sıcaklık seviyesi`;
    $('#mapLevel').value = S.pmap.level;
    plotMap();
    updateStepper();
    if (!silent) toast('Performans haritası oluşturuldu');
  } catch (e) {
    console.error(e);
    msg.innerHTML = `<div class="msg err">⚠ ${esc(e.message)}</div>`;
    if (!silent) toast(e.message, 4000);
  }
}

const QTY = {
  eps: { label: 'ε', get: (r) => r.eps, unit: () => '-' },
  Q: { label: 'Q', get: (r) => r.Q / 1000, unit: () => 'kW' },
  dp1: { label: 'ΔP₁', get: (r) => dpConv(r.dp1, S.pmap.dpUnit), unit: () => S.pmap.dpUnit },
  dp2: { label: 'ΔP₂', get: (r) => dpConv(r.dp2, S.pmap.dpUnit), unit: () => S.pmap.dpUnit },
  T1out: { label: 'T₁,çıkış', get: (r) => H.fromKelvin(r.T1out, S.pmap.tempUnit), unit: () => S.pmap.tempUnit },
  T2out: { label: 'T₂,çıkış', get: (r) => H.fromKelvin(r.T2out, S.pmap.tempUnit), unit: () => S.pmap.tempUnit },
  UA: { label: 'UA', get: (r) => r.UA, unit: () => 'W/K' },
  U_eps: { label: 'U(ε) %95', get: (r) => r.U_eps, unit: () => '-' }
};

function plotMap() {
  if (!MAP) return;
  const P = S.pmap, L = MAP.levels[+P.level || 0] || MAP.levels[0];
  const q = QTY[P.qty] || QTY.eps;
  const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
  const cx = (v) => fromSIflow(v, P.flowUnit1, f1.rho(L.T1in)), cy = (v) => fromSIflow(v, P.flowUnit2, f2.rho(L.T2in));
  const xs = MAP.m1s.map(cx), ys = MAP.m2s.map(cy);
  const nx = MAP.m1s.length, ny = MAP.m2s.length;
  const at = (i, j) => L.rows[i * ny + j];
  const lvlTxt = `T₁,in = ${fx(H.fromKelvin(L.T1in, P.tempUnit), 1)} ${P.tempUnit}, T₂,in = ${fx(H.fromKelvin(L.T2in, P.tempUnit), 1)} ${P.tempUnit}`;
  $('#mapTitle').textContent = `${q.label} haritası [${q.unit()}] — ${lvlTxt}`;
  const used = RESULT ? RESULT.pts.filter((p) => p.included) : [];
  const testTr = { x: used.map((p) => cx(p.m1)), y: used.map((p) => cy(p.m2)), mode: 'markers', name: 'Test noktaları', marker: { color: TC.line, size: 7, symbol: 'circle-open', line: { width: 2 } } };
  const outside = L.rows.filter((r) => !r.inside);
  const outTr = { x: outside.map((r) => cx(r.m1)), y: outside.map((r) => cy(r.m2)), mode: 'markers', name: 'Ekstrapolasyon', marker: { color: TC.gray, size: 5, symbol: 'x-thin', line: { width: 1, color: TC.gray } }, hoverinfo: 'skip' };
  const isLog = MAP.ranges.r1.log || MAP.ranges.r2.log;
  if (nx > 1 && ny > 1) {
    const z = ys.map((_, j) => xs.map((__, i) => q.get(at(i, j))));
    const tr = [{ type: 'contour', x: xs, y: ys, z, colorscale: 'Viridis', contours: { coloring: 'heatmap', showlabels: true, labelfont: { color: '#fff', size: 11 } },
      colorbar: { title: q.label, tickfont: { color: TC.font }, titlefont: { color: TC.font } }, hovertemplate: `ṁ₁ %{x:.4g}<br>ṁ₂ %{y:.4g}<br>${q.label} %{z:.4g}<extra></extra>` }];
    if (L.hull && L.hull.length > 2) {
      const hh = L.hull.concat([L.hull[0]]);
      tr.push({ x: hh.map((p) => cx(p[0])), y: hh.map((p) => cy(p[1])), mode: 'lines', name: 'Test bölgesi (zarf)', line: { color: '#ffffff', width: 2, dash: 'dash' } });
    }
    tr.push(outTr, testTr);
    // Log eksenlerde okunaklı, az sayıda etiket
    const ticks = (vals, log) => {
      if (!log) return {};
      const tv = H.spaced(Math.min(...vals), Math.max(...vals), 6, true).map((v) => +v.toPrecision(2));
      return { tickvals: tv, ticktext: tv.map((v) => String(v)) };
    };
    Plotly.react('plotMap', tr, baseLayout({ xaxis: Object.assign({ title: `ṁ₁ [${P.flowUnit1}]`, type: MAP.ranges.r1.log ? 'log' : 'linear' }, ticks(xs, MAP.ranges.r1.log)),
      yaxis: Object.assign({ title: `ṁ₂ [${P.flowUnit2}]`, type: MAP.ranges.r2.log ? 'log' : 'linear' }, ticks(ys, MAP.ranges.r2.log)), legend: { orientation: 'h', y: -0.15 } }), PCFG);
  } else {
    // 1D harita: eğri (+ bootstrap bandı)
    const one = nx > 1;
    const xv = one ? xs : ys;
    const rows = one ? MAP.m1s.map((_, i) => at(i, 0)) : MAP.m2s.map((_, j) => at(0, j));
    const tr = [];
    if (P.qty === 'eps' && rows[0].eps_lo !== undefined) {
      tr.push({ x: xv.concat(xv.slice().reverse()), y: rows.map((r) => r.eps_hi).concat(rows.map((r) => r.eps_lo).reverse()), fill: 'toself', fillcolor: 'rgba(93,162,232,.25)', line: { width: 0 }, name: '%95 bant', hoverinfo: 'skip' });
    }
    tr.push({ x: xv, y: rows.map(q.get), mode: 'lines+markers', name: q.label, line: { color: TC.main, width: 3 },
      marker: { color: rows.map((r) => (r.inside ? TC.main : TC.gray)), size: 6 } });
    Plotly.react('plotMap', tr, baseLayout({ xaxis: { title: one ? `ṁ₁ [${P.flowUnit1}]` : `ṁ₂ [${P.flowUnit2}]`, type: isLog ? 'log' : 'linear' }, yaxis: { title: `${q.label} [${q.unit()}]` } }), PCFG);
  }
  $('#mapInfo').innerHTML = `Izgara: ${nx} × ${ny} · ${MAP.levels.length} seviye · model: ${MAP.model === 'reynolds' ? 'Re/Nu–Pr' : 'kütle debisi'} · oluşturma: ${new Date(MAP.created).toLocaleString('tr-TR')}`;
}

// Dışa aktarım satırları (birimlerle)
function mapLongRows() {
  const P = S.pmap, f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2), tu = P.tempUnit, du = P.dpUnit;
  const out = [];
  MAP.levels.forEach((L, li) => L.rows.forEach((r) => {
    out.push({
      level: li + 1,
      [`T1_in [${tu}]`]: +H.fromKelvin(r.T1in, tu).toFixed(3), [`T2_in [${tu}]`]: +H.fromKelvin(r.T2in, tu).toFixed(3),
      [`m_dot1 [${P.flowUnit1}]`]: +fromSIflow(r.m1, P.flowUnit1, f1.rho(r.T1in)).toPrecision(6),
      [`m_dot2 [${P.flowUnit2}]`]: +fromSIflow(r.m2, P.flowUnit2, f2.rho(r.T2in)).toPrecision(6),
      'eps [-]': +r.eps.toFixed(6), 'U_eps95 [-]': isFinite(r.U_eps) ? +r.U_eps.toFixed(6) : '',
      'eps_lo95 [-]': isFinite(r.eps_lo) ? +r.eps_lo.toFixed(6) : '', 'eps_hi95 [-]': isFinite(r.eps_hi) ? +r.eps_hi.toFixed(6) : '',
      'Q [W]': +r.Q.toPrecision(7),
      [`T1_out [${tu}]`]: +H.fromKelvin(r.T1out, tu).toFixed(3), [`T2_out [${tu}]`]: +H.fromKelvin(r.T2out, tu).toFixed(3),
      [`dP1 [${du}]`]: isFinite(r.dp1) ? +dpConv(r.dp1, du).toPrecision(6) : '', [`dP2 [${du}]`]: isFinite(r.dp2) ? +dpConv(r.dp2, du).toPrecision(6) : '',
      'NTU [-]': +r.NTU.toPrecision(6), 'UA [W/K]': +r.UA.toPrecision(6), 'Cr [-]': +r.Cr.toPrecision(6),
      'h1 [W/m2K]': +r.h1.toPrecision(6), 'h2 [W/m2K]': +r.h2.toPrecision(6),
      'Re1 [-]': isFinite(r.Re1) ? +r.Re1.toPrecision(6) : '', 'Re2 [-]': isFinite(r.Re2) ? +r.Re2.toPrecision(6) : '',
      extrapolated: r.inside ? 0 : 1
    });
  }));
  return out;
}
function mapMatrix(L, qkey) {
  const P = S.pmap, q = QTY[qkey], f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
  const ny = MAP.m2s.length;
  const head = [`${q.label} [${q.unit()}] | m_dot1 [${P.flowUnit1}] \\ m_dot2 [${P.flowUnit2}]`].concat(MAP.m2s.map((v) => +fromSIflow(v, P.flowUnit2, f2.rho(L.T2in)).toPrecision(6)));
  const rows = MAP.m1s.map((m1, i) => [+fromSIflow(m1, P.flowUnit1, f1.rho(L.T1in)).toPrecision(6)].concat(MAP.m2s.map((_, j) => { const v = q.get(L.rows[i * ny + j]); return isFinite(v) ? +v.toPrecision(7) : ''; })));
  return [head].concat(rows);
}
function mapInfoRows() {
  const F = MAP.fit, R = RESULT, P = S.pmap;
  const rows = [['HEXeffectiveness performans haritası'], ['Oluşturma', MAP.created], ['Proje', S.meta.project], ['Akışkan 1', S.fluid1], ['Akışkan 2', S.fluid2],
    ['Model', MAP.model === 'reynolds' ? 'Nu = C·Re^n·Pr^(1/3) ; f = Kf·Re^-b' : 'h = C·m^n ; dP = Kp·m^np'], ['Mod', F.mode],
    ['C1', F.C1], ['n1', F.n1], ['C2', F.C2], ['n2', F.n2], ['Rw [K/W]', F.Rw]];
  for (const [i, d] of [[1, R.dpFit1], [2, R.dpFit2]]) {
    if (!d) continue;
    if (d.type === 'fanning') rows.push([`Kf${i}`, d.Kf], [`b${i}`, d.b]); else rows.push([`Kp${i} [Pa/(kg/s)^np]`, d.Kp], [`np${i}`, d.np]);
  }
  if (R.bootSum) for (const k of ['C1', 'n1', 'C2', 'n2']) rows.push([`${k} %95 GA`, R.bootSum[k].lo, R.bootSum[k].hi]);
  rows.push(['ε R²', R.stats.eps.R2], ['ε MAPE [%]', R.stats.eps.MAPE], ['Birimler', `debi: ${P.flowUnit1} / ${P.flowUnit2}, sıcaklık: ${P.tempUnit}, ΔP: ${P.dpUnit}`],
    ['extrapolated', '1 = test edilen bölgenin (dışbükey zarf) dışında']);
  return rows;
}
const mapFileBase = () => 'hex_map_' + (S.meta.project || 'proje').replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, '_').slice(0, 40) + '_' + new Date().toISOString().slice(0, 10);
function requireMap() { if (!MAP) { toast('Önce haritayı oluşturun', 3500); return false; } return true; }
function exportMapCsvLong() { if (!requireMap()) return; download(mapFileBase() + '_long.csv', Papa.unparse(mapLongRows()), 'text/csv'); }
function exportMapCsvMatrix() {
  if (!requireMap()) return;
  const L = MAP.levels[+S.pmap.level || 0];
  download(mapFileBase() + `_${S.pmap.qty}_L${(+S.pmap.level || 0) + 1}.csv`, Papa.unparse(mapMatrix(L, S.pmap.qty)), 'text/csv');
}
function exportMapXlsx() {
  if (!requireMap()) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapInfoRows()), 'Info');
  MAP.levels.forEach((L, li) => {
    for (const qk of ['eps', 'Q', 'dp1', 'dp2', 'T1out', 'T2out'].concat(RESULT.boot ? ['U_eps'] : [])) {
      const name = (`L${li + 1}_${qk}`).slice(0, 31);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapMatrix(L, qk)), name);
    }
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapLongRows()), 'Long');
  XLSX.writeFile(wb, mapFileBase() + '.xlsx');
}
function exportMapJson() {
  if (!requireMap()) return;
  const out = { app: 'HEXeffectiveness', type: 'performance_map', created: MAP.created, units: { m_dot: 'kg/s', T: 'K', dP: 'Pa', Q: 'W', UA: 'W/K' },
    fluids: [S.fluid1, S.fluid2], model: MAP.model, fit: MAP.fit, dpFit1: RESULT.dpFit1, dpFit2: RESULT.dpFit2, bootstrapCI: RESULT.bootSum || null,
    geometry: RESULT.geom, m_dot1: MAP.m1s, m_dot2: MAP.m2s,
    levels: MAP.levels.map((L) => ({ T1_in: L.T1in, T2_in: L.T2in, hull_m_dot: L.hull, points: L.rows })) };
  download(mapFileBase() + '.json', JSON.stringify(out, null, 1), 'application/json');
}


/* ------------------------------------------------------------------
 * PDF raporu (html2pdf.js)
 * ------------------------------------------------------------------ */
async function makePdf() {
  if (!RESULT) { toast('Önce analizi çalıştırın', 3500); return; }
  const st = $('#pdfStatus'); st.textContent = 'Rapor hazırlanıyor…';
  $('#btnPdf').disabled = true;
  try {
    // Grafiklerin güncel olduğundan emin ol
    runRating(true);
    const figs = [
      ['plotParity', 'Şekil 1 — ε Parity Plot (y = x analizi)'],
      ['plotSurface', 'Şekil 2 — ' + $('#surfTitle').textContent],
      ['plotCurves', 'Şekil 3 — ε – debi eğrileri (model ve ölçüm)'],
      ['plotWilson', 'Şekil 4 — Wilson Plot: taraf direnç ayrıştırması'],
      ['plotHB', 'Şekil 5 — Isı dengesi hatası'],
      ['plotDP', 'Şekil 6 — Basınç düşümü ΔP = K_p·ṁ^n_p'],
      ['plotParityDP', 'Şekil 7 — ΔP Parity Plot'],
      ['plotSweep', 'Şekil 8 — Performans tahmini debi taraması'],
      ['plotMap', 'Şekil 9 — Performans haritası: ' + $('#mapTitle').textContent]
    ];
    const imgs = [];
    for (const [id, cap] of figs) {
      const gd = document.getElementById(id);
      if (!gd || !gd.data || !gd.data.length) continue;
      const url = await Plotly.toImage({ data: gd.data, layout: lightLayout(gd.layout) }, { format: 'png', width: 1000, height: id === 'plotSurface' ? 620 : 520, scale: 1.5 });
      imgs.push({ url, cap });
    }
    const R = RESULT, F = R.fit, g = R.geom, m = S.meta, stt = R.stats;
    const tu = S.map.T1_in.unit;
    const T = (v) => (isFinite(v) ? fx(H.fromKelvin(v, tu), 2) : '—');
    const sideRow = (s, n) => `<tr><td>Taraf ${n}</td><td>${esc(S['fluid' + n])}</td><td class="num">${fmt(g[s].A)}</td><td>${g[s].finsOn ? 'Evet' : 'Hayır'}</td><td class="num">${g[s].finsOn ? fmt(g[s].AfRatio) : '—'}</td><td class="num">${g[s].finsOn ? fmt(g[s].Lf * 1000) : '—'}</td><td class="num">${g[s].finsOn ? fmt(g[s].tf * 1000) : '—'}</td><td>${g[s].finsOn ? esc(g[s].material) + ' (' + fmt(g[s].k_fin) + ')' : '—'}</td></tr>`;
    const ratingHtml = $('#rateOut').innerText ? `<h2>5. Performans Tahmini (Seçili Nokta)</h2>
      <p>Girdi: ṁ₁ = ${esc(S.rating.m1)} ${esc(S.rating.flowUnit1)}, ṁ₂ = ${esc(S.rating.m2)} ${esc(S.rating.flowUnit2)}, T₁,giriş = ${esc(S.rating.T1in)} ${esc(S.rating.tempUnit)}, T₂,giriş = ${esc(S.rating.T2in)} ${esc(S.rating.tempUnit)}</p>
      <table><tbody>${Array.from($$('#rateOut .kpi')).map((d) => `<tr><th>${d.querySelector('.k').innerHTML}</th><td class="num">${d.querySelector('.v').innerHTML}</td><td>${d.querySelector('.u').innerHTML}</td></tr>`).join('')}</tbody></table>` : '';
    const tableHtml = m.includeTable ? `<h2 class="pb">Ek A — Test Noktaları</h2>
      <table class="small"><thead><tr><th>#</th><th>Dahil</th><th>ṁ₁</th><th>ṁ₂</th><th>T₁in</th><th>T₁out</th><th>T₂in</th><th>T₂out</th><th>Q₁ [W]</th><th>Q₂ [W]</th><th>HB [%]</th><th>ε deney</th><th>ε model</th><th>ΔP₁</th><th>ΔP₂</th></tr></thead><tbody>
      ${R.pts.map((p) => `<tr><td>${esc(p.label)}</td><td>${p.included ? '✓' : '✗'}</td><td class="num">${fx(p.m1, 4)}</td><td class="num">${fx(p.m2, 4)}</td><td class="num">${T(p.T1in)}</td><td class="num">${T(p.T1out)}</td><td class="num">${T(p.T2in)}</td><td class="num">${T(p.T2out)}</td><td class="num">${fmt(p.Q1, 4)}</td><td class="num">${fmt(p.Q2, 4)}</td><td class="num">${fx(p.hbErr, 2)}</td><td class="num">${fx(p.eps_exp, 4)}</td><td class="num">${fx(p.eps_pred, 4)}</td><td class="num">${fmt(p.dp1, 4)}</td><td class="num">${fmt(p.dp2, 4)}</td></tr>`).join('')}
      </tbody></table><p class="small">Debiler kg/s, sıcaklıklar ${tu}, basınç düşümleri Pa.</p>` : '';

    const el = document.createElement('div');
    el.className = 'report';
    el.innerHTML = `
      <div class="rhead"><h1>${esc(m.project || 'Eşanjör Performans Raporu')}</h1>
        <div>Çapraz akışlı kanatçıklı plakalı eşanjör — ε-NTU / Wilson Plot / ΔP analizi</div>
        <div class="small">Numune: ${esc(m.unit || '—')} · Hazırlayan: ${esc(m.engineer || '—')} · Tarih: ${new Date().toLocaleString('tr-TR')} · Veri: ${esc(S.raw ? S.raw.fileName : '—')}</div></div>
      ${m.notes ? `<p>${esc(m.notes).replace(/\n/g, '<br>')}</p>` : ''}
      <h2>1. Özet</h2>
      <table><tbody>
        <tr><th>Analiz modu</th><td>${modeText(F.mode)}</td></tr>
        <tr><th>Kullanılan / toplam nokta</th><td>${R.nUsed} / ${R.nTotal} (ısı dengesi > %${S.settings.hbThreshold}: ${R.nHB}, geçersiz: ${R.nInvalid})</td></tr>
        <tr><th>ε uyumu</th><td>R² = ${fx(stt.eps.R2, 4)}, RMSE = ${fx(stt.eps.RMSE, 4)}, MAPE = ${fx(stt.eps.MAPE, 2)} %</td></tr>
        <tr><th>UA uyumu</th><td>R² = ${fx(stt.UA.R2, 4)}, RMSE = ${fmt(stt.UA.RMSE, 4)} W/K, MAPE = ${fx(stt.UA.MAPE, 2)} %</td></tr>
        <tr><th>ΔP₁ / ΔP₂ uyumu</th><td>R² = ${fx(stt.dp1.R2, 4)} / ${fx(stt.dp2.R2, 4)}; MAPE = ${fx(stt.dp1.MAPE, 2)} % / ${fx(stt.dp2.MAPE, 2)} %</td></tr>
      </tbody></table>
      <h2>2. Model ve Yöntem</h2>
      <div class="eq">ε = 1 − exp[ (1/C<sub>r</sub>)·NTU<sup>0.22</sup>·( exp(−C<sub>r</sub>·NTU<sup>0.78</sup>) − 1 ) ],  NTU = UA/C<sub>min</sub></div>
      <div class="eq">1/UA = 1/(η<sub>o</sub>hA)₁ + R<sub>w</sub> + 1/(η<sub>o</sub>hA)₂,  ${R.model === 'reynolds' ? 'Nu<sub>i</sub> = h<sub>i</sub>D<sub>h,i</sub>/k<sub>i</sub> = C<sub>i</sub>·Re<sub>i</sub><sup>n<sub>i</sub></sup>·Pr<sub>i</sub><sup>1/3</sup>, Re = ṁD<sub>h</sub>/(A<sub>c</sub>μ)' : 'h<sub>i</sub> = C<sub>i</sub>·ṁ<sub>i</sub><sup>n<sub>i</sub></sup>'}</div>
      <div class="eq">η<sub>o</sub> = 1 − (A<sub>f</sub>/A)(1 − η<sub>f</sub>),  η<sub>f</sub> = tanh(m<sub>f</sub>L<sub>f</sub>)/(m<sub>f</sub>L<sub>f</sub>),  m<sub>f</sub> = √(2h/(k<sub>m</sub>t<sub>f</sub>))</div>
      <div class="eq">${R.model === 'reynolds' ? 'ΔP = f·(4L/D<sub>h</sub>)·G²/(2ρ),  f = K<sub>f</sub>·Re<sup>−b</sup>,  G = ṁ/A<sub>c</sub>' : 'ΔP = K<sub>p</sub>·ṁ<sup>n<sub>p</sub></sup>'}</div>
      ${S.settings.uncOn ? `<p class="small">Ölçüm belirsizliği (%95): U<sub>T</sub> = ±${S.settings.uT} K, U<sub>ṁ</sub> = ±${S.settings.uM} %, U<sub>ΔP</sub> = ±${S.settings.uDP} %; nokta bazında sayısal yayılım. ${R.bootSum ? 'Parametre güven aralıkları ' + R.boot.length + ' bootstrap yeniden örneklemesiyle.' : ''}</p>` : ''}
      <p class="small">Akışkan özellikleri ortalama sıcaklıkta T<sub>m</sub> = (T<sub>in</sub>+T<sub>out</sub>)/2 kütüphane polinomlarıyla hesaplanmıştır. ε kaynağı: ${S.settings.epsSource === 'column' ? 'Effectiveness sütunu' : 'sıcaklıklar (Q<sub>ort</sub>/Q<sub>max</sub>)'}.</p>
      <h2>3. Akışkanlar ve Geometri</h2>
      <table><thead><tr><th></th><th>Akışkan</th><th>A [m²]</th><th>Kanatçık</th><th>A<sub>f</sub>/A</th><th>L<sub>f</sub> [mm]</th><th>t<sub>f</sub> [mm]</th><th>Malzeme (k)</th></tr></thead>
      <tbody>${sideRow('side1', 1)}${sideRow('side2', 2)}</tbody></table>
      <p>R<sub>w</sub> = ${fmt(g.Rw, 4)} K/W</p>
      <h2>4. Fit Parametreleri</h2>
      <table><thead><tr><th>Parametre</th><th>Taraf 1</th><th>Taraf 2</th><th>Not</th></tr></thead><tbody>
        <tr><td>${R.model === 'reynolds' ? 'C [-] (Nu = C·Re<sup>n</sup>·Pr<sup>1/3</sup>)' : 'C [W/(m²K)/(kg/s)<sup>n</sup>]'}</td><td class="num">${fmt(F.C1, 6)}</td><td class="num">${fmt(F.C2, 6)}</td><td>${R.bootSum ? '%95 GA: ' + fmt(R.bootSum.C1.lo, 4) + '…' + fmt(R.bootSum.C1.hi, 4) + ' / ' + fmt(R.bootSum.C2.lo, 4) + '…' + fmt(R.bootSum.C2.hi, 4) : (R.model === 'reynolds' ? 'Nu = hD<sub>h</sub>/k' : 'h = C·ṁ<sup>n</sup>')}</td></tr>
        <tr><td>n [-]</td><td class="num">${fx(F.n1, 4)}${F.mode === '1D-m2' ? ' *' : ''}</td><td class="num">${fx(F.n2, 4)}${F.mode === '1D-m1' ? ' *' : ''}</td><td>${R.bootSum ? '%95 GA: ' + fx(R.bootSum.n1.lo, 3) + '…' + fx(R.bootSum.n1.hi, 3) + ' / ' + fx(R.bootSum.n2.lo, 3) + '…' + fx(R.bootSum.n2.hi, 3) + '; ' : ''}${F.mode === '2D' ? 'Sınır: ' + S.settings.nMin + '–' + S.settings.nMax : '* varsayılan (1D mod)'}</td></tr>
        ${[1, 2].map((i) => { const d = R['dpFit' + i]; if (!d) return ''; return d.type === 'fanning'
          ? `<tr><td>ΔP${i} (Fanning)</td><td colspan="2" class="num">K<sub>f</sub> = ${fmt(d.Kf, 6)}, b = ${fx(d.b, 4)} (n<sub>p</sub> ≈ ${fx(d.np, 3)})</td><td>f = K<sub>f</sub>·Re<sup>−b</sup>, ΔP = f(4L/D<sub>h</sub>)G²/(2ρ); Re ${fmt(d.ReMin, 3)}–${fmt(d.ReMax, 3)}</td></tr>`
          : `<tr><td>ΔP${i}</td><td colspan="2" class="num">K<sub>p</sub> = ${fmt(d.Kp, 6)}, n<sub>p</sub> = ${fx(d.np, 4)}</td><td>ΔP = K<sub>p</sub>·ṁ<sup>n<sub>p</sub></sup> [Pa, kg/s]</td></tr>`; }).join('')}
      </tbody></table>
      ${F.warning ? `<p class="small">Uyarı: ${esc(F.warning)}</p>` : ''}
      ${ratingHtml}
      <h2 class="pb">6. Grafikler</h2>
      ${imgs.map((i) => `<div class="fig"><img src="${i.url}"><div class="small">${esc(i.cap)}</div></div>`).join('')}
      ${tableHtml}
      <p class="small" style="margin-top:6mm;color:#666">Bu rapor HEXeffectiveness (istemci tarafı web uygulaması) ile otomatik olarak oluşturulmuştur.</p>`;
    const fname = (m.project || 'rapor').replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, '_').slice(0, 60) + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
    await html2pdf().set({
      margin: [10, 10, 12, 10], filename: fname,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.fig', 'tr'] }
    }).from(el).save();
    st.textContent = 'PDF indirildi: ' + fname;
  } catch (e) {
    console.error(e); st.textContent = 'Hata: ' + e.message; toast('PDF oluşturulamadı: ' + e.message, 5000);
  } finally { $('#btnPdf').disabled = false; }
}
