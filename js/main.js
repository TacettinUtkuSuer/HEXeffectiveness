/* =====================================================================
 * HEXeffectiveness — main.js
 * Başlatma: yardım paneli, gezinme, bağlama, olaylar
 * Klasik <script> dosyaları global kapsamı paylaşır (derleme adımı yok);
 * yükleme sırası: physics → core → library → data → analysis → outputs → main
 * ===================================================================== */
'use strict';

/* ------------------------------------------------------------------
 * Yardım: README.md -> marked.js (+ MathJax)
 * ------------------------------------------------------------------ */
async function loadHelp() {
  const box = $('#helpContent');
  try {
    const r = await fetch('./README.md', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const md = await r.text();
    // Matematik bloklarını marked'dan koru (alt çizgi / ters bölü bozulmasın)
    const math = [];
    const protect = (s) => s
      .replace(/\$\$([\s\S]+?)\$\$/g, (m) => { math.push(m); return '@@MATH' + (math.length - 1) + '@@'; })
      .replace(/(^|[^\\$])\$(?!\s)([^$\n]+?)\$/g, (m, pre, body) => { math.push('$' + body + '$'); return pre + '@@MATH' + (math.length - 1) + '@@'; });
    // Kod bloklarını koru
    const codes = [];
    let src = md.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => { codes.push(m); return '@@CODE' + (codes.length - 1) + '@@'; });
    src = protect(src).replace(/@@CODE(\d+)@@/g, (m, i) => codes[+i]);
    let html = marked.parse(src, { gfm: true });
    html = html.replace(/@@MATH(\d+)@@/g, (m, i) => esc(math[+i]));
    box.innerHTML = html;
    // GitHub uyumlu başlık id'leri (içindekiler bağlantıları için)
    $$('h1,h2,h3,h4', box).forEach((h) => { h.id = h.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-'); });
    $$('a[href^="http"]', box).forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    const typeset = () => (window.MathJax && MathJax.typesetPromise ? MathJax.typesetPromise([box]).catch((e) => console.warn(e)) : setTimeout(typeset, 400));
    typeset();
  } catch (e) {
    box.innerHTML = `<div class="msg err">README.md okunamadı (${esc(e.message)}). Uygulamayı bir web sunucusu üzerinden (örn. GitHub Pages veya <code>python -m http.server</code>) açtığınızdan emin olun.</div>`;
  }
}

/* ------------------------------------------------------------------
 * Gezinme: adımlar, veri kaynağı, çıktı sekmeleri, yan paneller
 * ------------------------------------------------------------------ */
const STEPS = ['data', 'hex', 'result', 'out'];

function goStep(name, opts) {
  opts = opts || {};
  if (!STEPS.includes(name)) name = 'data';
  S.ui.step = name;
  $$('#stepper button').forEach((b) => b.classList.toggle('active', b.dataset.step === name));
  $$('.step').forEach((p) => p.classList.toggle('active', p.id === 'step-' + name));
  if (name === 'result' && !RESULT && canAnalyze().ok) runAnalysis(true);
  if (name === 'result') renderResultVisibility();
  if (name === 'out') {
    if (!RESULT && canAnalyze().ok) runAnalysis(true);
    renderResultVisibility();
    setOutTab(S.ui.outTab || 'rating', true);
  }
  if (name === 'hex') updateHexInfo();
  if (!opts.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  resizePlots('#step-' + name);
  updateStepper();
  saveDraft();
}

function setSource(src) {
  S.ui.source = src;
  $$('#srcTabs button').forEach((b) => b.classList.toggle('active', b.dataset.src === src));
  $$('.src-panel').forEach((p) => p.classList.toggle('active', p.id === 'src-' + src));
  $('#srcTabs').classList.toggle('compact', !!src);
  if (src === 'manual') renderManualForm();
  resizePlots('#src-' + src);
  saveDraft();
}

function setOutTab(tab, silent) {
  S.ui.outTab = tab;
  $$('#outTabs button').forEach((b) => b.classList.toggle('active', b.dataset.out === tab));
  $$('.out-panel').forEach((p) => p.classList.toggle('active', p.id === 'out-' + tab));
  if (RESULT) {
    if (tab === 'rating') { fillRatingDefaults(false); runRating(true); }
    if (tab === 'map' && !MAP) buildMap(true);
    if (tab === 'map' && MAP) plotMap();
  }
  resizePlots('#out-' + tab);
  if (!silent) saveDraft();
}

function resizePlots(scope) {
  setTimeout(() => $$((scope || '') + ' .js-plotly-plot').forEach((gd) => { if (gd.offsetParent) Plotly.Plots.resize(gd); }), 40);
}

// Analiz için veri hazır mı?
function canAnalyze() {
  if (!S.raw || !S.raw.rows.length) return { ok: false, msg: 'Henüz veri yok.' };
  const miss = VARS.filter((v) => v.req && !S.map[v.key].col);
  if (miss.length) return { ok: false, msg: 'Eşlenmemiş zorunlu sütun: ' + miss.map((v) => v.short || v.key).join(', ') };
  if (!S.map.T1_out.col && !S.map.T2_out.col && !S.map.Effectiveness.col) return { ok: false, msg: 'En az bir çıkış sıcaklığı (veya ε) eşlenmeli.' };
  if (S.raw.rows.length < 3) return { ok: false, msg: `${S.raw.rows.length} nokta var; analiz için en az 3 gerekli.` };
  return { ok: true, msg: '' };
}

// Adım çubuğundaki durum yazıları ve ✓ işaretleri
function updateStepper() {
  const set = (step, txt, state) => {
    const b = $(`#stepper button[data-step="${step}"]`);
    b.classList.remove('done', 'warn');
    if (state) b.classList.add(state);
    $('#st' + step[0].toUpperCase() + step.slice(1)).textContent = txt;
  };
  const ca = canAnalyze();
  const n = S.raw ? S.raw.rows.length : 0;
  if (!n) set('data', 'Veri ekleyin', '');
  else set('data', ca.ok ? `${n} nokta` : (n < 3 ? `${n} nokta (≥3 gerekli)` : 'Eşleme eksik'), ca.ok ? 'done' : 'warn');
  set('hex', `${S.fluid1} ↔ ${S.fluid2}`, n ? 'done' : '');
  if (RESULT) {
    const m = RESULT.stats.eps.MAPE;
    set('result', `Ort. hata %${fx(m, 2)}`, m <= 5 ? 'done' : 'warn');
  } else set('result', ca.ok ? 'Hazır — hesaplanacak' : 'Bekliyor', '');
  set('out', MAP ? 'Harita hazır' : 'Tahmin · Harita · Rapor', MAP ? 'done' : '');
  // Adım altlarındaki ipuçları ve düğmeler
  $('#dataHint').textContent = n ? (ca.ok ? `✓ ${n} test noktası hazır.` : '⚠ ' + ca.msg) : '';
  $('#welcome').style.display = n ? 'none' : '';
  $('#dataTableCard').style.display = n ? '' : 'none';
  $('#hexHint').textContent = ca.ok ? '' : ca.msg;
  $('#next1').disabled = !ca.ok; $('#next2').disabled = !ca.ok;
  $('#next1').title = ca.ok ? '' : ca.msg; $('#next2').title = ca.ok ? '' : ca.msg;
}

function renderResultVisibility() {
  const has = !!RESULT;
  $('#resultEmpty').style.display = has ? 'none' : '';
  $('#resultBody').style.display = has ? '' : 'none';
  $('#outEmpty').style.display = has ? 'none' : '';
  $('#outBody').style.display = has ? '' : 'none';
  if (!has) {
    const ca = canAnalyze();
    const t = ca.ok ? 'Analiz yapılamadı. Ayrıntı aşağıda.' : ca.msg + ' Önce veri adımını tamamlayın.';
    $('#resultEmpty p').textContent = t; $('#outEmpty p').textContent = t;
  }
}

// Sıcak / soğuk taraf etiketleri
function updateHexInfo() {
  let t1 = '', t2 = '';
  try {
    const pts = buildPoints().filter((p) => isFinite(p.T1in) && isFinite(p.T2in));
    if (pts.length) {
      const a = H.mean(pts.map((p) => p.T1in)), b = H.mean(pts.map((p) => p.T2in));
      const u = S.map.T1_in.unit;
      t1 = `${a > b ? '🔥 sıcak' : '❄️ soğuk'} · giriş ≈ ${fx(H.fromKelvin(a, u), 1)} ${u}`;
      t2 = `${b > a ? '🔥 sıcak' : '❄️ soğuk'} · giriş ≈ ${fx(H.fromKelvin(b, u), 1)} ${u}`;
    }
  } catch (e) { /* veri yoksa etiket yok */ }
  $('#sideInfo1').textContent = t1; $('#sideInfo2').textContent = t2;
}

// Tek nokta tahmini alanlarını test ortalamasıyla doldur (kullanıcı değiştirmediyse)
function fillRatingDefaults(force) {
  if (!RESULT || (S.ui.ratingTouched && !force)) return;
  const u = RESULT.pts.filter((p) => p.included);
  if (!u.length) return;
  const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
  const T1 = H.mean(u.map((p) => p.T1in)), T2 = H.mean(u.map((p) => p.T2in));
  const r = S.rating;
  r.flowUnit1 = S.map.m_dot1.unit; r.flowUnit2 = S.map.m_dot2.unit; r.tempUnit = S.map.T1_in.unit;
  r.m1 = +fromSIflow(H.mean(u.map((p) => p.m1)), r.flowUnit1, f1.rho(T1)).toPrecision(4);
  r.m2 = +fromSIflow(H.mean(u.map((p) => p.m2)), r.flowUnit2, f2.rho(T2)).toPrecision(4);
  r.T1in = +H.fromKelvin(T1, r.tempUnit).toFixed(1); r.T2in = +H.fromKelvin(T2, r.tempUnit).toFixed(1);
  syncBindings();
}

function openDrawer(name, anchor) {
  closeDrawers();
  $('#drawer-' + name).classList.add('open');
  $('#backdrop').classList.add('open');
  document.body.classList.add('noscroll');
  if (name === 'library') resizePlots('#drawer-library');
  if (anchor) {
    const el = document.getElementById(anchor);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}
function closeDrawers() {
  $$('.drawer').forEach((d) => d.classList.remove('open'));
  $('#backdrop').classList.remove('open');
  document.body.classList.remove('noscroll');
}

/* ------------------------------------------------------------------
 * Bağlama (data-bind ↔ durum)
 * ------------------------------------------------------------------ */
function syncBindings() {
  $$('select[data-units]').forEach((sel) => {
    if (!sel.options.length) sel.innerHTML = H.UNITS[sel.dataset.units].map((u) => `<option>${u}</option>`).join('');
  });
  fillLists();
  $$('[data-bind]').forEach((el) => {
    const v = getPath(S, el.dataset.bind);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'radio') el.checked = el.value === v;
    else if (el.dataset.scale && v !== undefined && v !== null && v !== '' && isFinite(v)) el.value = +(v * +el.dataset.scale).toPrecision(8);
    else el.value = v === undefined || v === null || (typeof v === 'number' && !isFinite(v)) ? '' : v;
  });
  ['side1', 'side2'].forEach((s) => {
    const box = $(`[data-fins="${s}"]`), on = !!S.geom[s].finsOn;
    box.classList.toggle('off', !on);
    $$('input, select', box).forEach((el) => { el.disabled = !on; });
  });
  const at = (S.settings.arr || {}).type || 'cross_uu';
  $('#arrMulti').style.display = at === 'multipass' ? '' : 'none';
  $('#arrMixed').style.display = at === 'cross_mixed' ? '' : 'none';
  if (at === 'multipass') $('#arrFig').innerHTML = multipassDiagram(S.settings.arr);
  updateArrCompare();
  const re = S.settings.thermalModel === 'reynolds';
  $('#reBox').style.display = re ? '' : 'none';
  $$('.re-only').forEach((el) => { el.disabled = !re; });
}

function renderAllUI() {
  renderLibrary();
  renderData();
  renderManualForm();
  syncBindings();
  if (S.ui.source) setSource(S.ui.source); else { $$('.src-panel').forEach((p) => p.classList.remove('active')); $('#srcTabs').classList.remove('compact'); $$('#srcTabs button').forEach((b) => b.classList.remove('active')); }
  renderResultVisibility();
  updateStepper();
}

function onBindChange(el) {
  const p = el.dataset.bind;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
  else if (el.type === 'number') { v = el.value === '' ? NaN : +el.value; if (el.dataset.scale) v /= +el.dataset.scale; }
  else v = el.value;
  setPath(S, p, v);
  if (/^geom\.side\d\.finsOn$/.test(p) || /material$/.test(p) || p === 'settings.thermalModel' || p.startsWith('settings.arr')) syncBindings();
  saveDraft();
  if (p.startsWith('rating.')) { S.ui.ratingTouched = true; runRating(true); }
  else if (RESULT && /^(geom|settings|fluid)/.test(p) && p !== 'settings.nBoot') runAnalysis(true);
  if (/^(geom|settings|fluid)/.test(p)) manualPreview();
  if (/^fluid/.test(p)) updateHexInfo();
  if (/^pmap\.(qty|flowUnit|tempUnit|dpUnit)/.test(p) && MAP) plotMap();
  updateStepper();
}

/* ------------------------------------------------------------------
 * Olaylar
 * ------------------------------------------------------------------ */
function wire() {
  $('#btnTheme').addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true));
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (err) { /* yok say */ }
      if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    });
  }
  // Gezinme
  $('#stepper').addEventListener('click', (e) => { const b = e.target.closest('button[data-step]'); if (b) goStep(b.dataset.step); });
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) { e.preventDefault(); goStep(g.dataset.goto); }
    const a = e.target.closest('[data-action]');
    if (a) {
      e.preventDefault();
      if (a.dataset.action === 'demo') loadDemo();
      if (a.dataset.action === 'library') openDrawer('library');
      if (a.dataset.action === 'suggest') { goStep('data'); setSource('manual'); runSuggest(); setTimeout(() => $('#suggestOut').scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }
      if (a.dataset.action === 'boot') { const d = $('#btnBoot').closest('details'); d.open = true; runBootstrap(); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      if (a.dataset.action === 'points') { const d = $('#ptsCard'); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      if (a.dataset.action === 'advanced') { goStep('hex'); $('#advCard').open = true; setTimeout(() => $('#advCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 200); }
      if (a.dataset.action === 'remodel') { S.settings.thermalModel = 'reynolds'; syncBindings(); saveDraft(); goStep('hex'); setTimeout(() => $('#reBox').scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }
    }
    // Açık menüleri dışarı tıklayınca kapat
    $$('details.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.open = false; });
  });
  $('#srcTabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-src]'); if (b) setSource(b.dataset.src); });
  $('#outTabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-out]'); if (b) setOutTab(b.dataset.out); });
  // Katlanır bölüm açıldığında içindeki grafikleri yeniden boyutlandır
  document.addEventListener('toggle', (e) => { if (e.target.open && e.target.matches('details')) resizePlots(''); }, true);
  // Yan paneller
  $('#btnOpenLibrary').addEventListener('click', () => openDrawer('library'));
  $('#btnOpenHelp').addEventListener('click', () => openDrawer('help'));
  $('#backdrop').addEventListener('click', closeDrawers);
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeDrawers));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawers(); $$('details.menu[open]').forEach((m) => { m.open = false; }); } });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-bind]')) onBindChange(el);
    else if (el.matches('[data-mapcol]')) {
      const k = el.dataset.mapcol; S.map[k].col = el.value;
      const u = el.value && detectUnit(el.value, VARS.find((v) => v.key === k).group);
      if (u) S.map[k].unit = u;
      RESULT = null; MAP = null;
      renderData(); saveDraft(); updateStepper();
    } else if (el.matches('[data-mapunit]')) { S.map[el.dataset.mapunit].unit = el.value; RESULT = null; MAP = null; renderData(); renderManualForm(); saveDraft(); updateStepper(); }
    else if (el.matches('[data-incl]')) {
      const i = +el.dataset.incl;
      S.excluded = S.excluded.filter((x) => x !== i);
      if (!el.checked) S.excluded.push(i);
      runAnalysis(true);
    }
  });
  // Veri dosyası
  const dz = $('#dropzone');
  $('#fileData').addEventListener('change', (e) => { if (e.target.files[0]) loadDataFile(e.target.files[0]); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadDataFile(f); });
  // Manuel giriş
  $('#manualForm').addEventListener('input', manualPreview);
  $('#manualForm').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); manualAdd(); } });
  $('#btnManAdd').addEventListener('click', manualAdd);
  $('#btnManCancel').addEventListener('click', () => { MAN_EDIT = -1; $$('[data-man]').forEach((el) => { el.value = ''; }); renderData(); renderManualForm(); });
  $('#btnManNew').addEventListener('click', () => {
    if (S.raw && S.raw.rows.length && !confirm('Mevcut veri (' + S.raw.rows.length + ' nokta) kapatılıp boş bir test başlatılsın mı? Önce "Veri tablosu → CSV olarak indir" ile saklamanız önerilir.')) return;
    S.raw = null; RESULT = null; MAP = null; MAN_EDIT = -1;
    S.map = defaultState().map;
    ensureManualDataset(); renderData(); renderManualForm(); saveDraft(); updateStepper(); renderResultVisibility();
    toast('Boş test hazır — ilk noktayı girin');
  });
  $('#btnManExport').addEventListener('click', () => {
    if (!S.raw || !S.raw.rows.length) { toast('İndirilecek nokta yok'); return; }
    download(S.raw.fileName.replace(/\.[^.]+$/, '') + '_' + new Date().toISOString().slice(0, 10) + '.csv', Papa.unparse(S.raw.rows, { columns: S.raw.headers }), 'text/csv');
  });
  $('#previewTbl').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-redit]'), dl = e.target.closest('[data-rdel]');
    if (ed) { setSource('manual'); manualEdit(+ed.dataset.redit); }
    if (dl) deleteRow(+dl.dataset.rdel);
  });
  $('#btnAutoMap').addEventListener('click', () => { autoMap(true); RESULT = null; MAP = null; renderData(); saveDraft(); updateStepper(); toast('Otomatik eşleme yapıldı — lütfen kontrol edin'); });
  $('#btnRun').addEventListener('click', () => { runAnalysis(); renderResultVisibility(); });
  $('#btnBoot').addEventListener('click', runBootstrap);
  $('#btnMap').addEventListener('click', () => buildMap(false));
  $('#btnMapSmart').addEventListener('click', fillSmartRange);
  $('#mapLevel').addEventListener('change', (e) => { S.pmap.level = +e.target.value; plotMap(); saveDraft(); });
  $('#btnMapCsvLong').addEventListener('click', exportMapCsvLong);
  $('#btnMapCsvMatrix').addEventListener('click', exportMapCsvMatrix);
  $('#btnMapXlsx').addEventListener('click', exportMapXlsx);
  $('#btnMapJson').addEventListener('click', exportMapJson);
  $('#btnSuggest').addEventListener('click', runSuggest);
  $('#suggestOut').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sugm1]'); if (!b) return;
    $('[data-man="m_dot1"]').value = +(+b.dataset.sugm1).toPrecision(4); $('[data-man="m_dot2"]').value = +(+b.dataset.sugm2).toPrecision(4);
    manualPreview();
    $('#manualCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('[data-man="T1_out"]').focus(), 300);
    toast('Önerilen debiler forma alındı — ölçümden sonra sıcaklıkları girin');
  });
  $('#fileSeries').addEventListener('change', (e) => { if (e.target.files[0]) loadSeriesFile(e.target.files[0]); e.target.value = ''; });
  $('#ssTime').addEventListener('change', () => { if (STEADY) { STEADY.timeCol = $('#ssTime').value; renderSteadySignals(); } });
  $('#btnSteady').addEventListener('click', runSteady);
  $('#btnSteadyAdd').addEventListener('click', addSteadyPoints);
  $('#btnRate').addEventListener('click', () => runRating());
  $('#btnRateFill').addEventListener('click', () => { fillRatingDefaults(true); S.ui.ratingTouched = false; runRating(true); });
  $('#sweepVar').addEventListener('change', () => runRating(true));
  // Demo
  $('#btnDemoLoad').addEventListener('click', loadDemo);
  $('#btnDemoDownload').addEventListener('click', () => { download('demo_test_data.csv', Papa.unparse(demoRows()), 'text/csv'); $$('details.menu').forEach((m) => { m.open = false; }); });
  // Proje
  const save = () => { download('hex_project_' + new Date().toISOString().slice(0, 10) + '.json', projectJson(), 'application/json'); $$('details.menu').forEach((m) => { m.open = false; }); };
  $('#btnProjSave').addEventListener('click', save);
  $('#btnProjSave2').addEventListener('click', save);
  ['#fileProject', '#fileProject2'].forEach((id) => $(id).addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = '';
    $$('details.menu').forEach((m) => { m.open = false; });
    if (f) readJsonFile(f, (obj) => { try { applyProject(obj); saveDraft(); } catch (err) { toast(err.message, 5000); } });
  }));
  $('#btnReset').addEventListener('click', () => {
    $$('details.menu').forEach((m) => { m.open = false; });
    if (!confirm('Tüm veri, ayarlar ve taslak silinecek; kütüphane varsayılana dönecek. Emin misiniz?')) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* yok say */ }
    S = defaultState(); RESULT = null; MAP = null; STEADY = null; LIB = JSON.parse(JSON.stringify(LIB_REPO));
    ['plotHB', 'plotParity', 'plotSurface', 'plotCurves', 'plotWilson', 'plotDP', 'plotParityDP', 'plotSweep', 'plotMap', 'plotSteady'].forEach((id) => Plotly.purge(id));
    $('#mapMsg').innerHTML = ''; $('#suggestOut').innerHTML = ''; $('#ssOut').innerHTML = ''; $('#plotSteady').style.display = 'none';
    $('#analysisMsg').innerHTML = ''; $('#fitSummary').innerHTML = ''; $('#ptsTbl').innerHTML = ''; $('#rateOut').innerHTML = ''; $('#verdict').innerHTML = ''; $('#keyStats').innerHTML = '';
    renderAllUI(); goStep('data'); toast('Sıfırlandı');
  });
  // Kütüphane
  $('#fluidTbl').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-fedit]'), dl = e.target.closest('[data-fdel]');
    if (ed) {
      const f = LIB.fluids[+ed.dataset.fedit];
      fillFluidForm(f);
      $('#fluidEditCard').open = true;
      try { testFluid(f); } catch (err) { $('#fluidTestOut').innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
      setTimeout(() => $('#fluidEditCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
    if (dl) {
      const f = LIB.fluids[+dl.dataset.fdel];
      if (confirm(f.name + ' silinsin mi?')) { LIB.fluids.splice(+dl.dataset.fdel, 1); renderLibrary(); saveDraft(); }
    }
  });
  $('#btnFluidTest').addEventListener('click', () => { try { testFluid(readFluidForm()); } catch (e) { $('#fluidTestOut').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; } });
  $('#btnFluidSave').addEventListener('click', () => {
    try {
      const f = readFluidForm();
      const j = LIB.fluids.findIndex((x) => x.name === f.name);
      if (j >= 0) LIB.fluids[j] = Object.assign(LIB.fluids[j], f); else LIB.fluids.push(f);
      renderLibrary(); syncBindings(); saveDraft(); testFluid(f);
      toast(f.name + (j >= 0 ? ' güncellendi' : ' eklendi'));
    } catch (e) { $('#fluidTestOut').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
  });
  $('#fileTable').addEventListener('change', (e) => { if (e.target.files.length) importPropertyTables(Array.from(e.target.files)); e.target.value = ''; });
  $('#btnFluidNew').addEventListener('click', () => { fillFluidForm({ name: '', T_unit: 'C' }); $('#fluidTestOut').innerHTML = ''; Plotly.purge('plotProps'); $('#fluidEditCard').open = true; setTimeout(() => $('#fName').focus(), 60); });
  $('#fileFluidCsv').addEventListener('change', (e) => { if (e.target.files[0]) importFluidCsv(e.target.files[0]); e.target.value = ''; });
  $('#btnFluidCsvTemplate').addEventListener('click', () => download('fluids_template.csv',
    Papa.unparse(LIB.fluids.map((f) => ({ Fluid_Name: f.name, Cp_Eq: f.Cp_Eq, Density_Eq: f.Density_Eq, Viscosity_Eq: f.Viscosity_Eq, k_Eq: f.k_Eq, T_Unit: f.T_unit || 'C' }))), 'text/csv'));
  $('#solidTbl').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-sedit]'), dl = e.target.closest('[data-sdel]');
    if (ed) { const s = LIB.solids[+ed.dataset.sedit]; $('#sName').value = s.name; $('#sK').value = s.k; }
    if (dl && confirm('Silinsin mi?')) { LIB.solids.splice(+dl.dataset.sdel, 1); renderLibrary(); saveDraft(); }
  });
  $('#btnSolidSave').addEventListener('click', () => {
    const name = $('#sName').value.trim(), k = +$('#sK').value;
    if (!name || !(k > 0)) { toast('Malzeme adı ve k > 0 girin'); return; }
    const j = LIB.solids.findIndex((x) => x.name === name);
    if (j >= 0) LIB.solids[j].k = k; else LIB.solids.push({ name, k });
    renderLibrary(); saveDraft(); if (RESULT) runAnalysis(true);
  });
  $('#btnLibDownload').addEventListener('click', () => {
    const out = Object.assign({}, LIB, { version: (LIB.version || 1), updatedAt: new Date().toISOString() });
    download('materials_db.json', JSON.stringify(out, null, 2), 'application/json');
    toast('materials_db.json indirildi — depodaki dosyanın yerine koyup commit edin');
  });
  $('#btnLibReset').addEventListener('click', () => {
    if (!confirm('Kütüphane depodaki haline dönecek; eklediğiniz akışkanlar silinir.')) return;
    LIB = JSON.parse(JSON.stringify(LIB_REPO)); renderLibrary(); syncBindings(); saveDraft();
  });
  $('#btnPdf').addEventListener('click', makePdf);
}

/* ------------------------------------------------------------------
 * Başlangıç
 * ------------------------------------------------------------------ */
async function init() {
  wire();
  wireDiagrams();
  applyTheme(currentTheme(), false);
  loadHelp();
  LIB_REPO = await loadRepoLibrary();
  LIB = JSON.parse(JSON.stringify(LIB_REPO));
  const draft = loadDraft();
  if (draft) {
    try {
      // Taslaktaki kütüphane, repo kütüphanesiyle birleştirilir (repoya yeni eklenen akışkanlar kaybolmasın)
      if (draft.library) {
        const lib = JSON.parse(JSON.stringify(LIB_REPO));
        (draft.library.fluids || []).forEach((f) => { const j = lib.fluids.findIndex((x) => x.name === f.name); if (j >= 0) lib.fluids[j] = f; else lib.fluids.push(f); });
        (draft.library.solids || []).forEach((s) => { const j = lib.solids.findIndex((x) => x.name === s.name); if (j >= 0) lib.solids[j] = s; else lib.solids.push(s); });
        draft.library = lib;
      }
      applyProject(draft, true);
      if (S.raw) toast('Kaldığınız yerden devam ediyorsunuz');
    } catch (e) { console.warn('Taslak yüklenemedi', e); renderAllUI(); }
  } else renderAllUI();
  goStep(S.ui.step || 'data', { noScroll: true });
}
document.addEventListener('DOMContentLoaded', init);
