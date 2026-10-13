/* =====================================================================
 * HEXeffectiveness — core.js
 * Çekirdek: durum, yardımcılar, akışkan/geometri, grafik teması, proje/taslak, tema
 * Klasik <script> dosyaları global kapsamı paylaşır (derleme adımı yok);
 * yükleme sırası: physics → core → library → data → analysis → outputs → main
 * ===================================================================== */
'use strict';

const H = window.HEX;
const DRAFT_KEY = 'hexeffectiveness_draft_v1';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

// Repo dosyası okunamazsa (örn. file:// ile açıldığında) kullanılacak asgari kütüphane
const FALLBACK_LIB = {
  version: 1,
  fluids: [
    { name: 'Water', T_unit: 'C', Cp_Eq: '4213.92; -2.15431; 0.036352; -0.000148019', Density_Eq: '999.915; 0.0234538; -0.00598893; 1.61033e-05', Viscosity_Eq: 'exp(-6.3292 + (-0.0326019)*T + (0.000214288)*T^2 + (-7.30479e-07)*T^3)', k_Eq: '0.56042; 0.00208714; -8.28671e-06; -7.77001e-09' },
    { name: 'Air', T_unit: 'C', Cp_Eq: '1003.86; 0.0435035; 9.44596e-05; 8.22062e-07', Density_Eq: '1.29376; -0.00470805; 1.47254e-05; -2.44511e-08', Viscosity_Eq: '1.72367e-05; 4.74105e-08; -1.63145e-11; -4.65879e-14', k_Eq: '0.0242557; 7.10146e-05; 5.57523e-10; 1.60856e-11' }
  ],
  solids: [{ name: 'Aluminum 3003', k: 193 }, { name: 'Copper (C11000)', k: 388 }, { name: 'Stainless Steel 304', k: 16.2 }]
};

// Eşlenecek fiziksel büyüklükler
const VARS = [
  { key: 'm_dot1', label: 'Taraf 1 debisi', short: 'Taraf 1 debisi', sym: 'ṁ₁', group: 'flow', side: 1, req: true },
  { key: 'm_dot2', label: 'Taraf 2 debisi', short: 'Taraf 2 debisi', sym: 'ṁ₂', group: 'flow', side: 2, req: true },
  { key: 'T1_in', label: 'Taraf 1 giriş sıcaklığı', short: 'T₁ giriş', sym: 'T₁,in', group: 'temp', req: true },
  { key: 'T1_out', label: 'Taraf 1 çıkış sıcaklığı', short: 'T₁ çıkış', sym: 'T₁,out', group: 'temp' },
  { key: 'T2_in', label: 'Taraf 2 giriş sıcaklığı', short: 'T₂ giriş', sym: 'T₂,in', group: 'temp', req: true },
  { key: 'T2_out', label: 'Taraf 2 çıkış sıcaklığı', short: 'T₂ çıkış', sym: 'T₂,out', group: 'temp' },
  { key: 'Effectiveness', label: 'Ölçülen etkinlik ε (varsa)', short: 'ε', sym: 'ε', group: 'eps' },
  { key: 'dp1', label: 'Taraf 1 basınç düşümü (varsa)', short: 'ΔP₁', sym: 'ΔP₁', group: 'dp' },
  { key: 'dp2', label: 'Taraf 2 basınç düşümü (varsa)', short: 'ΔP₂', sym: 'ΔP₂', group: 'dp' }
];
const DEFAULT_UNIT = { flow: 'kg/s', temp: '°C', dp: 'Pa', eps: '-' };

function defaultState() {
  return {
    raw: null, // {fileName, headers:[], rows:[{}]}
    map: Object.fromEntries(VARS.map((v) => [v.key, { col: '', unit: DEFAULT_UNIT[v.group] }])),
    excluded: [], // manuel olarak fit dışı bırakılan satır indeksleri
    fluid1: 'Water',
    fluid2: 'Air',
    geom: {
      side1: { A: 1, finsOn: false, AfRatio: 0.6, Lf: 0.003, tf: 0.0002, material: 'Aluminum 3003', Dh: 0.003, Ac: 0.001, Lflow: 0.3 },
      side2: { A: 1, finsOn: false, AfRatio: 0.85, Lf: 0.004, tf: 0.0001, material: 'Aluminum 3003', Dh: 0.003, Ac: 0.01, Lflow: 0.3 },
      Rw: 0
    },
    settings: { hbThreshold: 5, excludeHB: true, epsSource: 'temps', cvThreshold: 2, nMin: 0.3, nMax: 0.8, assumedN: 0.6, npMin: 1.5, npMax: 2.0,
      thermalModel: 'mass', uncOn: true, uT: 0.2, uM: 1.0, uDP: 1.0, nBoot: 100 },
    pmap: { m1min: '', m1max: '', m1n: 13, m2min: '', m2max: '', m2n: 13, spacing: 'auto', flowUnit1: 'kg/s', flowUnit2: 'kg/s',
      T1list: '', T2list: '', tempUnit: '°C', qty: 'eps', level: 0, dpUnit: 'Pa' },
    steady: { window: 60, minDur: 60, tolT: 0.2, tolRel: 1.0, dt: 1, trim: 10 },
    rating: { m1: 0.3, m2: 0.6, flowUnit1: 'kg/s', flowUnit2: 'kg/s', T1in: 80, T2in: 25, tempUnit: '°C', dpUnit: 'Pa' },
    meta: { project: 'Plate-Fin Eşanjör Performans Testi', unit: '', engineer: '', notes: '', includeTable: true },
    autoRun: false,
    ui: { step: 'data', source: null, outTab: 'rating', ratingTouched: false },
    manualAutoRun: true
  };
}

let S = defaultState();
let LIB = null;
let LIB_REPO = null;
let RESULT = null;
let MAP = null; // performans haritası sonucu
let STEADY = null; // kararlı rejim tespiti sonucu

/* ------------------------------------------------------------------
 * Yardımcılar
 * ------------------------------------------------------------------ */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmt(v, d) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  d = d === undefined ? 4 : d;
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(d - 1);
  return String(Number(v.toPrecision(d)));
}
const fx = (v, n) => (isFinite(v) ? v.toFixed(n) : '—');
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2800);
}
function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.'); let x = o;
  for (let i = 0; i < ks.length - 1; i++) { if (x[ks[i]] == null) x[ks[i]] = {}; x = x[ks[i]]; }
  x[ks[ks.length - 1]] = v;
}
function num(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  // Avrupa biçimi yalnızca açıkça belliyse: "1.234,5" veya "1.234.567" (tek "1.203" ondalıktır)
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const x = Number(s);
  return isFinite(x) ? x : NaN;
}
function deepMerge(base, add) {
  if (!add || typeof add !== 'object' || Array.isArray(add)) return add === undefined ? base : add;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k of Object.keys(add)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null ? deepMerge(base[k], add[k]) : add[k];
  }
  return out;
}

/* ------------------------------------------------------------------
 * Kütüphane
 * ------------------------------------------------------------------ */
const findFluid = (name) => LIB.fluids.find((f) => f.name === name);
const findSolid = (name) => LIB.solids.find((s) => s.name === name);
function fluidOrThrow(name) {
  const f = findFluid(name);
  if (!f) throw new Error('Kütüphanede akışkan bulunamadı: ' + name);
  return H.fluidModel(f);
}
// Kanatçık malzemesinin k değeriyle birlikte hesap geometrisi
function calcGeom() {
  const g = JSON.parse(JSON.stringify(S.geom));
  for (const s of ['side1', 'side2']) {
    const sol = findSolid(g[s].material);
    g[s].k_fin = sol ? sol.k : 193;
    if (!(g[s].A > 0)) throw new Error((s === 'side1' ? 'Taraf 1' : 'Taraf 2') + ' alanı A > 0 olmalı');
    if (g[s].finsOn && !(g[s].Lf > 0 && g[s].tf > 0 && g[s].AfRatio >= 0 && g[s].AfRatio <= 1)) {
      throw new Error((s === 'side1' ? 'Taraf 1' : 'Taraf 2') + ' kanatçık parametreleri geçersiz');
    }
  }
  g.Rw = +g.Rw || 0;
  g.model = S.settings.thermalModel === 'reynolds' ? 'reynolds' : 'mass';
  if (g.model === 'reynolds') {
    for (const s of ['side1', 'side2']) {
      const nm = s === 'side1' ? 'Taraf 1' : 'Taraf 2';
      if (!(g[s].Dh > 0 && g[s].Ac > 0)) throw new Error(nm + ': Re modeli için hidrolik çap D_h ve serbest akış alanı A_c > 0 olmalı');
    }
  }
  return g;
}

async function loadRepoLibrary() {
  try {
    const r = await fetch('./materials_db.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    console.warn('materials_db.json okunamadı, gömülü kütüphane kullanılacak', e);
    return JSON.parse(JSON.stringify(FALLBACK_LIB));
  }
}


/* ------------------------------------------------------------------
 * Grafikler (Plotly) — tema ve ortak düzen
 * ------------------------------------------------------------------ */
const PCFG = { responsive: true, displaylogo: false, toImageButtonOptions: { format: 'png', scale: 2 } };
// Tema renkleri (dark mode). Plotly düzenleri bu değerlerden üretilir.
const THEMES = {
  light: { paper: '#ffffff', plot: '#ffffff', font: '#1b2533', grid: '#e5e9ee', line: '#333333', annot: 'rgba(255,255,255,.85)', main: '#1f4e79', s1: '#c0392b', s2: '#2471a3', gray: '#7f8c8d' },
  dark: { paper: '#18202a', plot: '#18202a', font: '#dbe3ec', grid: '#2c3846', line: '#c9d3de', annot: 'rgba(24,32,42,.88)', main: '#5da2e8', s1: '#ef6b5f', s2: '#4ea3e0', gray: '#8796a8' }
};
let TC = THEMES.light;
let C1C = TC.s1, C2C = TC.s2, GRAY = TC.gray;
let PALETTE = [];
function setPlotTheme(name) {
  TC = THEMES[name] || THEMES.light;
  C1C = TC.s1; C2C = TC.s2; GRAY = TC.gray;
  PALETTE = [TC.main, C1C, '#2ecc71', '#e0a43a', '#a569bd', '#1abc9c', '#dc7633', '#5dade2', '#cd6155', '#99a3a4'];
  if (name !== 'dark') PALETTE.splice(2, 8, '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e86c1', '#922b21', '#5d6d7e');
}
setPlotTheme('light');
const axisTheme = (t) => ({ gridcolor: t.grid, zerolinecolor: t.grid, linecolor: t.grid, color: t.font });
function baseLayout(extra) {
  const L = deepMerge({
    margin: { t: 30, r: 20, l: 60, b: 50 }, font: { family: 'Segoe UI, Arial', size: 12, color: TC.font },
    paper_bgcolor: TC.paper, plot_bgcolor: TC.plot, legend: { orientation: 'h', y: -0.2 },
    xaxis: { zeroline: false }, yaxis: { zeroline: false }
  }, extra || {});
  // Tanımlı tüm eksenlere tema renklerini uygula (yalnızca kullanılan eksenler)
  Object.keys(L).filter((k) => /^[xy]axis\d*$/.test(k)).forEach((k) => { L[k] = Object.assign(axisTheme(TC), L[k]); });
  return L;
}
// PDF için: mevcut grafiğin düzenini açık temaya çevir
function lightLayout(layout) {
  const t = THEMES.light, L = JSON.parse(JSON.stringify(layout || {}));
  L.paper_bgcolor = t.paper; L.plot_bgcolor = t.plot;
  L.font = Object.assign({}, L.font, { color: t.font });
  Object.keys(L).filter((k) => /^[xy]axis\d*$/.test(k)).forEach((k) => Object.assign(L[k], axisTheme(t)));
  if (L.scene) ['xaxis', 'yaxis', 'zaxis'].forEach((k) => { L.scene[k] = Object.assign({}, L.scene[k], axisTheme(t), { backgroundcolor: t.paper }); });
  (L.annotations || []).forEach((a) => { if (a.bgcolor) a.bgcolor = t.annot; a.font = Object.assign({}, a.font, { color: t.font }); });
  if (L.legend) L.legend.font = Object.assign({}, L.legend.font, { color: t.font });
  return L;
}


/* ------------------------------------------------------------------
 * Proje kaydet / yükle & taslak
 * ------------------------------------------------------------------ */
function projectJson() {
  return JSON.stringify({ app: 'HEXeffectiveness', version: 1, savedAt: new Date().toISOString(), state: S, library: LIB }, null, 1);
}
function applyProject(obj, quiet) {
  if (!obj || !obj.state) throw new Error('Geçersiz proje dosyası');
  S = deepMerge(defaultState(), obj.state);
  if (obj.state.raw) S.raw = obj.state.raw;
  if (Array.isArray(obj.state.excluded)) S.excluded = obj.state.excluded;
  if (obj.library && Array.isArray(obj.library.fluids)) LIB = obj.library;
  RESULT = null;
  renderAllUI();
  if (S.autoRun && S.raw) { runAnalysis(true); runRating(true); }
  if (!quiet) toast('Proje yüklendi');
}
let draftTimer = null;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, projectJson());
      $('#draftInfo').textContent = 'Taslak otomatik kaydedildi: ' + new Date().toLocaleTimeString('tr-TR');
    } catch (e) {
      $('#draftInfo').textContent = 'Taslak kaydedilemedi (tarayıcı depolama sınırı / gizli mod): ' + e.message;
    }
  }, 600);
}
function loadDraft() {
  try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function readJsonFile(file, cb) {
  const rd = new FileReader();
  rd.onload = () => { try { cb(JSON.parse(rd.result)); } catch (e) { toast('JSON okunamadı: ' + e.message, 5000); } };
  rd.readAsText(file);
}


/* ------------------------------------------------------------------
 * Tema (açık / koyu)
 * ------------------------------------------------------------------ */
const THEME_KEY = 'hexeffectiveness_theme';
function currentTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function applyTheme(name, persist) {
  document.documentElement.dataset.theme = name;
  setPlotTheme(name);
  const b = $('#btnTheme');
  if (b) { b.textContent = name === 'dark' ? '☀️' : '🌙'; b.title = name === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç (dark mode)'; }
  if (persist) { try { localStorage.setItem(THEME_KEY, name); } catch (e) { /* yok say */ } }
  // Grafikleri yeni renklerle yeniden çiz
  if (RESULT) { try { plotAll(); } catch (e) { console.warn(e); } runRating(true); }
  if (MAP) { try { plotMap(); } catch (e) { console.warn(e); } }
  if (STEADY && STEADY.result) { try { runSteady(); } catch (e) { console.warn(e); } }
  if ($('#plotProps').data) { try { testFluid(readFluidForm()); } catch (e) { /* yok say */ } }
}
