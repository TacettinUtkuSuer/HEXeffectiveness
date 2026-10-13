/* =====================================================================
 * HEXeffectiveness — data.js
 * Veri: dosya, eşleme, manuel giriş, D-optimal öneri, zaman serisi, demo
 * Klasik <script> dosyaları global kapsamı paylaşır (derleme adımı yok);
 * yükleme sırası: physics → core → library → data → analysis → outputs → main
 * ===================================================================== */
'use strict';

/* ------------------------------------------------------------------
 * Veri yükleme & eşleme
 * ------------------------------------------------------------------ */
function loadDataFile(file) {
  const name = file.name;
  if (/\.xlsx?$/i.test(name)) {
    const rd = new FileReader();
    rd.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
        const headers = rows.length ? Object.keys(rows[0]) : [];
        setRaw(name, headers, rows);
      } catch (err) { toast('Excel okunamadı: ' + err.message, 5000); }
    };
    rd.readAsArrayBuffer(file);
  } else {
    Papa.parse(file, {
      header: true, skipEmptyLines: true, dynamicTyping: false,
      complete: (res) => setRaw(name, res.meta.fields || [], res.data),
      error: (err) => toast('CSV okunamadı: ' + err.message, 5000)
    });
  }
}

function setRaw(fileName, headers, rows, mapping) {
  headers = headers.filter((h) => h !== undefined && h !== '');
  S.raw = { fileName, headers, rows };
  S.excluded = [];
  RESULT = null;
  MAP = null;
  if (mapping) Object.assign(S.map, mapping); else autoMap(false);
  if (!S.ui.source) setSource('file');
  renderData(); saveDraft();
  if (typeof renderResultVisibility === 'function') renderResultVisibility();
  toast(fileName + ': ' + rows.length + ' satır, ' + headers.length + ' sütun yüklendi');
}

// Sütun adlarından otomatik eşleme + köşeli/parantez içindeki birimi algılama
function autoMap(force) {
  if (!S.raw) return;
  const hs = S.raw.headers;
  const pats = {
    m_dot1: [/^m_?dot_?1$/i, /^m1$/i, /(m_?dot|debi|flow|mass).*1/i, /1.*(debi|flow)/i, /su.*debi|water.*flow|s[ıi]v[ıi].*debi|hot.*flow|s[ıi]cak.*debi/i],
    m_dot2: [/^m_?dot_?2$/i, /^m2$/i, /(m_?dot|debi|flow|mass).*2/i, /2.*(debi|flow)/i, /hava.*debi|air.*flow|cold.*flow|so[gğ]uk.*debi/i],
    T1_in: [/^T_?1_?in$/i, /T_?1.*(in|giri)/i, /(su|water|hot|s[ıi]cak).*(T_?in|giri|inlet)/i],
    T1_out: [/^T_?1_?out$/i, /T_?1.*(out|[cç][ıi]k)/i, /(su|water|hot|s[ıi]cak).*(T_?out|[cç][ıi]k|outlet)/i],
    T2_in: [/^T_?2_?in$/i, /T_?2.*(in|giri)/i, /(hava|air|cold|so[gğ]uk).*(T_?in|giri|inlet)/i],
    T2_out: [/^T_?2_?out$/i, /T_?2.*(out|[cç][ıi]k)/i, /(hava|air|cold|so[gğ]uk).*(T_?out|[cç][ıi]k|outlet)/i],
    Effectiveness: [/^effectiveness$/i, /effect|verim|etkinlik|^eps|ε/i],
    dp1: [/^dp_?1$/i, /(dp|Δp|delta_?p|bas[ıi]n[cç]).*1/i, /(su|water|hot).*(dp|Δp|bas[ıi]n[cç])/i],
    dp2: [/^dp_?2$/i, /(dp|Δp|delta_?p|bas[ıi]n[cç]).*2/i, /(hava|air|cold).*(dp|Δp|bas[ıi]n[cç])/i]
  };
  const used = new Set();
  for (const v of VARS) {
    if (!force && S.map[v.key].col && hs.includes(S.map[v.key].col)) { used.add(S.map[v.key].col); continue; }
    S.map[v.key].col = '';
    for (const re of pats[v.key]) {
      const h = hs.find((x) => !used.has(x) && re.test(x));
      if (h) { S.map[v.key].col = h; used.add(h); break; }
    }
    const h = S.map[v.key].col;
    if (h) {
      const u = detectUnit(h, v.group);
      if (u) S.map[v.key].unit = u;
    }
  }
}
function detectUnit(h, group) {
  const m = /[\[(]\s*([^\])]+?)\s*[\])]/.exec(h);
  const s = (m ? m[1] : '').replace(/\s/g, '').toLowerCase();
  if (!s) return null;
  const tbl = {
    flow: { 'kg/s': 'kg/s', 'kg/h': 'kg/h', 'kg/hr': 'kg/h', 'l/min': 'L/min', 'lpm': 'L/min', 'g/s': 'g/s' },
    temp: { 'c': '°C', '°c': '°C', 'degc': '°C', 'k': 'K', 'f': '°F', '°f': '°F' },
    dp: { 'pa': 'Pa', 'kpa': 'kPa', 'mbar': 'mbar' },
    eps: { '%': '%', '-': '-' }
  };
  return (tbl[group] || {})[s] || null;
}

function renderData() {
  const hs = S.raw ? S.raw.headers : [];
  $('#mapBody').innerHTML = VARS.map((v) => {
    const m = S.map[v.key];
    const opts = ['<option value="">— yok —</option>'].concat(hs.map((h) => `<option value="${esc(h)}" ${h === m.col ? 'selected' : ''}>${esc(h)}</option>`)).join('');
    const units = H.UNITS[v.group].map((u) => `<option ${u === m.unit ? 'selected' : ''}>${u}</option>`).join('');
    const missing = v.req && S.raw && !m.col;
    return `<tr class="${missing ? 'missing' : m.col ? 'ok' : ''}"><td><span class="mark">${m.col ? '✓' : missing ? '!' : '·'}</span> ${v.label}${v.req ? ' <span class="req">*</span>' : ''}</td>
      <td><select data-mapcol="${v.key}">${opts}</select></td><td><select data-mapunit="${v.key}" class="unit">${units}</select></td></tr>`;
  }).join('');
  const nReq = VARS.filter((v) => v.req).length, nOk = VARS.filter((v) => v.req && S.map[v.key].col).length;
  const st = $('#mapStatus');
  if (!S.raw) { st.textContent = ''; st.className = 'badge'; }
  else if (nOk === nReq && (S.map.T1_out.col || S.map.T2_out.col || S.map.Effectiveness.col)) { st.textContent = '✓ tamam'; st.className = 'badge tbl'; }
  else { st.textContent = `${nOk}/${nReq} zorunlu eşlendi`; st.className = 'badge bad'; }
  const info = $('#dataInfo');
  if (!S.raw) {
    info.innerHTML = '';
    $('#previewTbl').innerHTML = ''; $('#previewCount').textContent = '';
    if (typeof updateStepper === 'function') updateStepper();
    return;
  }
  info.innerHTML = `✓ <b>${esc(S.raw.fileName)}</b> · ${S.raw.rows.length} satır · ${hs.length} sütun`;
  if (typeof updateStepper === 'function') updateStepper();
  const LIM = 1000;
  $('#previewCount').textContent = '(' + Math.min(S.raw.rows.length, LIM) + ' / ' + S.raw.rows.length + ' satır)';
  $('#previewTbl').innerHTML = '<thead><tr><th>#</th><th></th>' + hs.map((h) => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>' +
    S.raw.rows.slice(0, LIM).map((r, i) => `<tr class="${i === MAN_EDIT ? 'editing' : ''}"><td>${i + 1}</td><td><button class="btn sm" data-redit="${i}" title="Formda düzenle">✎</button> <button class="btn sm danger" data-rdel="${i}" title="Sil">✕</button></td>` +
      hs.map((h) => `<td>${esc(r[h])}</td>`).join('') + '</tr>').join('') + '</tbody>';
}

// Nokta etiketi sütunu (Point, Test_ID, Nokta ...)
function labelHeader() {
  if (!S.raw) return '';
  const hs = S.raw.headers;
  return hs.find((h) => /^(point|nokta|test[_ ]?(id|no)?|id|no|#)$/i.test(String(h).trim())) || hs.find((h) => /(^|[_\s])(id|no)$/i.test(String(h).trim())) || '';
}

// Eşleme birimlerindeki değerleri (get(key) -> sayı) SI test noktasına çevir
function siPoint(get, f1, f2) {
  const T = (k) => { const x = get(k); return isFinite(x) ? H.toKelvin(x, S.map[k].unit) : NaN; };
  const T1in = T('T1_in'), T2in = T('T2_in');
  const rho1 = f1.rho(isFinite(T1in) ? T1in : 293.15), rho2 = f2.rho(isFinite(T2in) ? T2in : 293.15);
  if ((S.map.m_dot1.unit === 'L/min' && !(rho1 > 0)) || (S.map.m_dot2.unit === 'L/min' && !(rho2 > 0))) throw new Error('L/min dönüşümü için akışkanın yoğunluğu tanımlı olmalı');
  let eps = get('Effectiveness');
  if (isFinite(eps) && (S.map.Effectiveness.unit === '%' || eps > 1.5)) eps /= 100;
  const dp = (k) => { const x = get(k); return isFinite(x) ? H.toPa(x, S.map[k].unit) : NaN; };
  return {
    m1: H.toKgPerS(get('m_dot1'), S.map.m_dot1.unit, rho1),
    m2: H.toKgPerS(get('m_dot2'), S.map.m_dot2.unit, rho2),
    T1in, T1out: T('T1_out'), T2in, T2out: T('T2_out'),
    eps, dp1: dp('dp1'), dp2: dp('dp2')
  };
}

// Ham satırları SI noktalarına dönüştür
function buildPoints() {
  if (!S.raw) throw new Error('Önce test verisi yükleyin veya manuel nokta ekleyin');
  for (const v of VARS) if (v.req && !S.map[v.key].col) throw new Error('Zorunlu eşleme eksik: ' + v.label);
  const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
  const lh = labelHeader();
  return S.raw.rows.map((row, i) => Object.assign(siPoint((key) => (S.map[key].col ? num(row[S.map[key].col]) : NaN), f1, f2), {
    idx: i,
    label: (lh && row[lh] !== undefined && row[lh] !== '' ? String(row[lh]) : String(i + 1)),
    manualExclude: S.excluded.includes(i)
  }));
}

/* ------------------------------------------------------------------
 * Manuel test girişi (nokta nokta)
 * ------------------------------------------------------------------ */
let MAN_EDIT = -1; // düzenlenen satır indeksi (-1: yeni nokta)
function renderManualForm() {
  const box = $('#manualForm');
  const cur = {};
  $$('[data-man]', box).forEach((el) => { cur[el.dataset.man] = el.value; });
  box.innerHTML = VARS.map((v) => {
    const units = H.UNITS[v.group].map((u) => `<option ${u === S.map[v.key].unit ? 'selected' : ''}>${u}</option>`).join('');
    return `<label>${v.label}${v.req ? ' <span class="req">*</span>' : ''}
      <span class="inline"><input type="number" step="any" data-man="${v.key}" value="${esc(cur[v.key] || '')}"><select data-mapunit="${v.key}" title="Birim (eşleme tablosuyla ortak)">${units}</select></span></label>`;
  }).join('') + `<label>Etiket / Nokta adı <input type="text" data-man="_label" value="${esc(cur._label || '')}" placeholder="otomatik"></label>
    <label>Not <input type="text" data-man="_note" value="${esc(cur._note || '')}" placeholder="örn. fan kademesi 3"></label>`;
  $('#btnManAdd').textContent = MAN_EDIT >= 0 ? '✔ Noktayı Güncelle (#' + (MAN_EDIT + 1) + ')' : '＋ Nokta Ekle';
  $('#btnManCancel').style.display = MAN_EDIT >= 0 ? '' : 'none';
  manualPreview();
}
const manVal = (k) => { const el = $(`[data-man="${k}"]`); return el ? num(el.value) : NaN; };
const manStr = (k) => { const el = $(`[data-man="${k}"]`); return el ? el.value.trim() : ''; };

// Girilen noktanın anlık ısı dengesi / ε / NTU kontrolü (ve varsa model sapması)
function manualPreview() {
  const out = $('#manualPreview');
  const anyVal = VARS.some((v) => isFinite(manVal(v.key)));
  if (!anyVal) { out.innerHTML = '<div class="muted small">Değerleri girdikçe ısı dengesi, ε ve NTU burada anlık hesaplanır.</div>'; return; }
  try {
    const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
    const p = H.processPoint(siPoint(manVal, f1, f2), f1, f2, S.settings);
    if (!p.valid) { out.innerHTML = `<div class="msg info">${esc(p.reason)}</div>`; return; }
    const hb = p.hbErr, bad = isFinite(hb) && hb > S.settings.hbThreshold;
    const k = (cls, key, v, u) => `<div class="kpi ${cls}"><div class="k">${key}</div><div class="v">${v}</div><div class="u">${u || ''}</div></div>`;
    const cards = [
      k('s1', 'Q₁', fmt(p.Q1, 5), 'W'), k('s2', 'Q₂', fmt(p.Q2, 5), 'W'),
      k(bad ? 'bad' : 'g', 'Isı dengesi hatası', fx(hb, 2) + ' %', bad ? '⚠ eşik %' + S.settings.hbThreshold + ' aşıldı' : 'eşik %' + S.settings.hbThreshold),
      k('', 'ε', fx(p.eps_exp, 4), 'C<sub>r</sub> = ' + fx(p.Cr, 3)), k('', 'NTU', fx(p.NTU, 4), 'UA = ' + fmt(p.UA, 4) + ' W/K')
    ];
    if (RESULT) {
      const g = RESULT.geom;
      const um = H.modelUA(RESULT.fit, g, H.sideBasis(g.model, g.side1, f1, p.m1, p.T1m), H.sideBasis(g.model, g.side2, f2, p.m2, p.T2m));
      const em = H.epsCrossflow(um.UA / p.Cmin, p.Cr);
      const d = (p.eps_exp - em) / em * 100;
      cards.push(k(Math.abs(d) > 5 ? 'bad' : 'g', 'Mevcut modele göre', fx(d, 2) + ' %', 'ε<sub>model</sub> = ' + fx(em, 4)));
    }
    const rng = [];
    if (!f1.inRange(p.T1m)) rng.push(S.fluid1);
    if (!f2.inRange(p.T2m)) rng.push(S.fluid2);
    out.innerHTML = `<div class="grid kpis">${cards.join('')}</div>` +
      (bad ? '<div class="msg warn">⚠ Isı dengesi hatası yüksek — ölçümü (rejim, sensör, debi) kontrol edip tekrarlamanız önerilir. Nokta yine de eklenebilir; analizde filtre ayarına göre hariç tutulur.</div>' : '') +
      (rng.length ? `<div class="msg warn">Ortalama sıcaklık özellik verisinin aralığı dışında: ${esc(rng.join(', '))} (ekstrapolasyon).</div>` : '');
  } catch (e) { out.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

function ensureManualDataset() {
  if (!S.raw) {
    S.raw = { fileName: 'manuel_test.csv', headers: ['Point'].concat(VARS.map((v) => v.key), ['Note']), rows: [] };
    VARS.forEach((v) => { S.map[v.key].col = v.key; });
    S.excluded = [];
  }
}

function manualAdd() {
  for (const v of VARS) if (v.req && !isFinite(manVal(v.key))) { toast('Zorunlu alan eksik: ' + v.label, 3500); return; }
  if (!isFinite(manVal('T1_out')) && !isFinite(manVal('T2_out')) && !isFinite(manVal('Effectiveness'))) { toast('En az bir çıkış sıcaklığı veya ε girin', 3500); return; }
  ensureManualDataset();
  const R = S.raw;
  const addHeader = (h) => { if (!R.headers.includes(h)) { R.headers.push(h); R.rows.forEach((r) => { if (r[h] === undefined) r[h] = ''; }); } };
  // Değer girilen ama eşlenmemiş büyüklükler için sütun aç
  VARS.forEach((v) => {
    if (isFinite(manVal(v.key)) && !S.map[v.key].col) {
      let h = v.key; while (R.headers.includes(h) && Object.values(S.map).some((m) => m.col === h)) h += '_';
      addHeader(h); S.map[v.key].col = h;
    }
  });
  let lh = labelHeader();
  if (!lh) { lh = 'Point'; R.headers.unshift(lh); R.rows.forEach((r, i) => { r[lh] = 'P' + String(i + 1).padStart(2, '0'); }); }
  const note = manStr('_note');
  if (note) addHeader('Note');
  const row = MAN_EDIT >= 0 ? R.rows[MAN_EDIT] : Object.fromEntries(R.headers.map((h) => [h, '']));
  VARS.forEach((v) => { if (S.map[v.key].col) { const x = manVal(v.key); row[S.map[v.key].col] = isFinite(x) ? x : ''; } });
  row[lh] = manStr('_label') || (MAN_EDIT >= 0 ? row[lh] : 'P' + String(R.rows.length + 1).padStart(2, '0'));
  if (R.headers.includes('Note')) row.Note = note;
  const wasEdit = MAN_EDIT >= 0;
  if (!wasEdit) R.rows.push(row);
  MAN_EDIT = -1;
  $$('[data-man]').forEach((el) => {
    // Giriş sıcaklıkları genelde testte sabit kalır -> korunur; diğerleri temizlenir
    if (!['T1_in', 'T2_in'].includes(el.dataset.man)) el.value = '';
  });
  renderData(); saveDraft();
  if (S.manualAutoRun && R.rows.length >= 3) { runAnalysis(true); runRating(true); }
  renderManualForm();
  toast(wasEdit ? 'Nokta güncellendi' : 'Nokta eklendi (' + R.rows.length + ' nokta)');
}

function manualEdit(i) {
  const row = S.raw.rows[i];
  MAN_EDIT = i;
  VARS.forEach((v) => { const el = $(`[data-man="${v.key}"]`); const x = S.map[v.key].col ? num(row[S.map[v.key].col]) : NaN; el.value = isFinite(x) ? x : ''; });
  const lh = labelHeader();
  $('[data-man="_label"]').value = lh ? row[lh] : '';
  $('[data-man="_note"]').value = row.Note || '';
  renderManualForm();
  $('#manualCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteRow(i) {
  const lh = labelHeader();
  if (!confirm('Nokta silinsin mi? (' + (lh ? S.raw.rows[i][lh] : '#' + (i + 1)) + ')')) return;
  S.raw.rows.splice(i, 1);
  S.excluded = S.excluded.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x));
  if (MAN_EDIT === i) MAN_EDIT = -1; else if (MAN_EDIT > i) MAN_EDIT--;
  renderData(); saveDraft();
  if (RESULT) { if (S.raw.rows.length >= 3) { runAnalysis(true); runRating(true); } else RESULT = null; }
  renderManualForm();
}


/* ------------------------------------------------------------------
 * Test matrisi önerisi (D-optimal)
 * ------------------------------------------------------------------ */
function runSuggest() {
  const out = $('#suggestOut');
  try {
    if (!RESULT && canAnalyze().ok) runAnalysis(true);
    if (!RESULT) {
      const ca = canAnalyze();
      throw new Error(ca.ok ? 'Mevcut noktalarla analiz yapılamadı: ' + lastError($('#analysisMsg')) : 'Öneri için önce analiz gerekli. ' + ca.msg);
    }
    const r = mapRanges();
    const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
    // 1D modda sabit tutulan debi için de aday üret (üssün belirlenebilmesi için)
    const g1 = r.r1.n > 1 ? H.spaced(r.r1.lo, r.r1.hi, 12, r.r1.log) : H.spaced(r.r1.lo * 0.6, r.r1.lo * 1.4, 12, false);
    const g2 = r.r2.n > 1 ? H.spaced(r.r2.lo, r.r2.hi, 12, r.r2.log) : H.spaced(r.r2.lo * 0.6, r.r2.lo * 1.4, 12, false);
    const cand = []; for (const a of g1) for (const b of g2) cand.push([a, b]);
    const k = Math.max(1, Math.min(12, +$('#sugK').value || 5));
    const sg = H.suggestPoints({ fit: RESULT.fit, geom: RESULT.geom, fl1: f1, fl2: f2, used: r.used }, cand, k);
    const u1 = S.map.m_dot1.unit, u2 = S.map.m_dot2.unit;
    const c1 = (v) => fromSIflow(v, u1, f1.rho(r.T1)), c2 = (v) => fromSIflow(v, u2, f2.rho(r.T2));
    const names = ['C₁', 'n₁', 'C₂', 'n₂'];
    const red = sg.sdBefore.map((b, i) => (isFinite(b) && b > 0 ? (1 - sg.sdAfter[i] / b) * 100 : NaN));
    const hints = [];
    if (sg.share1 < 0.2) hints.push(`Taraf 1 direnci toplam direncin yalnızca %${fx(sg.share1 * 100, 0)}'i — C₁/n₁ zayıf belirlenir; <b>düşük ṁ₁</b> ve <b>yüksek ṁ₂</b> noktaları bu tarafın payını artırır.`);
    if (sg.share2 < 0.2) hints.push(`Taraf 2 direnci toplam direncin yalnızca %${fx(sg.share2 * 100, 0)}'i — C₂/n₂ zayıf belirlenir; <b>düşük ṁ₂</b> ve <b>yüksek ṁ₁</b> noktaları önerilir.`);
    if (RESULT.fit.mode !== '2D') hints.push('Şu an 1D moddasınız: sabit tutulan debiyi değiştiren noktalar, varsayılan üssün yerine gerçek üssün bulunmasını sağlar.');
    out.innerHTML = `<table class="tbl small"><thead><tr><th>#</th><th>ṁ₁ [${esc(u1)}]</th><th>ṁ₂ [${esc(u2)}]</th><th>Bilgi kazancı (Δ ln det)</th><th></th></tr></thead><tbody>` +
      sg.picks.map((p, i) => `<tr><td>S${i + 1}</td><td class="num">${fmt(c1(p.m1), 4)}</td><td class="num">${fmt(c2(p.m2), 4)}</td><td class="num">${fx(p.gain, 3)}</td>
        <td><button class="btn sm" data-sugm1="${c1(p.m1)}" data-sugm2="${c2(p.m2)}">Forma al</button></td></tr>`).join('') + '</tbody></table>' +
      `<div class="muted small">Bu ${sg.picks.length} nokta eklendiğinde beklenen parametre standart sapması azalması: ${names.map((n, i) => `${n} %${fx(red[i], 0)}`).join(', ')}. Direnç payları: taraf 1 %${fx(sg.share1 * 100, 0)}, taraf 2 %${fx(sg.share2 * 100, 0)}.</div>` +
      hints.map((h) => `<div class="msg info">${h}</div>`).join('');
  } catch (e) { out.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ------------------------------------------------------------------
 * Kararlı rejim tespiti (zaman serisi)
 * ------------------------------------------------------------------ */
function loadSeriesFile(file) {
  const done = (headers, rows) => {
    headers = headers.filter((h) => h !== undefined && h !== '');
    const numeric = headers.filter((h) => rows.slice(0, 50).filter((r) => isFinite(num(r[h]))).length >= Math.min(5, rows.length));
    const tcol = headers.find((h) => /^(time|zaman|t|t\s*[\[(]\s*s|sec|second|saniye|timestamp|date|tarih)/i.test(String(h).trim())) || '';
    STEADY = { fileName: file.name, headers, rows, numeric, timeCol: tcol, result: null };
    $('#ssTime').innerHTML = '<option value="">— yok (sabit örnekleme) —</option>' + headers.map((h) => `<option ${h === tcol ? 'selected' : ''}>${esc(h)}</option>`).join('');
    renderSteadySignals();
    $('#ssOut').innerHTML = `<div class="msg info">${esc(file.name)}: ${rows.length} örnek, ${headers.length} sütun.</div>`;
    $('#btnSteadyAdd').disabled = true;
  };
  if (/\.xlsx?$/i.test(file.name)) {
    const rd = new FileReader();
    rd.onload = (e) => { try { const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true }); done(rows.length ? Object.keys(rows[0]) : [], rows); } catch (err) { toast('Okunamadı: ' + err.message, 5000); } };
    rd.readAsArrayBuffer(file);
  } else Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => done(res.meta.fields || [], res.data) });
}
const isTempHeader = (h) => /(^|[^a-z])t[_\s]?\d|temp|sıcak|sicak|\[\s*°?[ck]\s*\]|\(\s*°?[ck]\s*\)|°/i.test(h) && !/dp|Δp|bas[ıi]n[cç]|press/i.test(h);
function renderSteadySignals() {
  if (!STEADY) { $('#ssSignals').innerHTML = ''; return; }
  // Yalnızca bu dosyada da bulunan eşlenmiş sütunlar dikkate alınır
  const mappedCols = new Set(VARS.filter((v) => v.group === 'flow' || v.group === 'temp').map((v) => S.map[v.key].col).filter((c) => c && STEADY.headers.includes(c)));
  const cand = STEADY.numeric.filter((h) => h !== STEADY.timeCol);
  // Varsayılan seçim: eşlemedeki debi/sıcaklık sütunları; yoksa adı debi/sıcaklık gibi görünenler
  const def = (h) => (mappedCols.size ? mappedCols.has(h) : (isTempHeader(h) || /debi|flow|m_?dot|kg\/|l\/min/i.test(h)));
  $('#ssSignals').innerHTML = '<div class="muted" style="margin:6px 0">Kararlılık ölçütü sinyalleri (sıcaklıklar mutlak K toleransı, diğerleri % toleransı ile):</div>' +
    cand.map((h) => `<label class="chk" style="display:inline-flex;margin-right:14px;white-space:nowrap"><input type="checkbox" data-sssig="${esc(h)}" ${def(h) ? 'checked' : ''}> ${esc(h)} <span class="badge ${isTempHeader(h) ? 'tbl' : 'eq'}">${isTempHeader(h) ? 'K' : '%'}</span></label>`).join('');
}
function runSteady() {
  const out = $('#ssOut');
  try {
    if (!STEADY) throw new Error('Önce zaman serisi dosyası yükleyin');
    const st = S.steady, rows = STEADY.rows;
    STEADY.timeCol = $('#ssTime').value;
    let t;
    if (STEADY.timeCol) {
      t = rows.map((r) => { const v = r[STEADY.timeCol]; const x = num(v); if (isFinite(x)) return x; const d = Date.parse(v); return isFinite(d) ? d / 1000 : NaN; });
      const t0 = t.find(isFinite); t = t.map((x) => x - t0);
    } else t = rows.map((_, i) => i * (+st.dt || 1));
    if (t.some((x) => !isFinite(x))) throw new Error('Zaman sütununda geçersiz değer var');
    const sigNames = $$('[data-sssig]').filter((el) => el.checked).map((el) => el.dataset.sssig);
    if (!sigNames.length) throw new Error('En az bir kararlılık sinyali seçin');
    const sig = sigNames.map((h) => (isTempHeader(h) ? { name: h, y: rows.map((r) => num(r[h])), tolAbs: +st.tolT } : { name: h, y: rows.map((r) => num(r[h])), tolRel: +st.tolRel }));
    const res = H.detectSteady(t, sig, { window: +st.window, minDur: +st.minDur, trim: (+st.trim || 0) / 100 });
    // Segment ortalamaları (tüm sayısal sütunlar)
    const pts = res.segments.map((sg, k) => {
      const row = { Point: 'SS' + String(k + 1).padStart(2, '0') };
      for (const h of STEADY.numeric) {
        if (h === STEADY.timeCol) continue;
        const v = []; for (let i = sg.i0; i <= sg.i1; i++) { const x = num(rows[i][h]); if (isFinite(x)) v.push(x); }
        row[h] = v.length ? +H.mean(v).toPrecision(7) : '';
      }
      row['t_start [s]'] = +sg.t0.toFixed(2); row['t_end [s]'] = +sg.t1.toFixed(2); row['n_samples'] = sg.i1 - sg.i0 + 1;
      return row;
    });
    STEADY.result = { t, sig, res, pts };
    $('#btnSteadyAdd').disabled = !pts.length;
    const hs = pts.length ? Object.keys(pts[0]) : [];
    out.innerHTML = `<div class="msg ${pts.length ? 'ok' : 'warn'}">${pts.length} kararlı bölge bulundu (pencere ${st.window} s, min. süre ${st.minDur} s, kenar kırpma %${st.trim}). Grafikte açık yeşil: kararlı bölge, çerçeveli: ortalama alınan kısım.</div>` +
      (pts.length ? `<div class="scroll-x"><table class="tbl small"><thead><tr>${hs.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${pts.map((r) => '<tr>' + hs.map((h) => `<td>${esc(r[h])}</td>`).join('') + '</tr>').join('')}</tbody></table></div>` : '');
    // Grafik: seçili sinyaller (en fazla 4 alt grafik) + kararlı bölgeler
    const show = sig.slice(0, 4);
    const tr = show.map((s, i) => ({ x: t, y: s.y, mode: 'lines', name: s.name, line: { color: PALETTE[i % PALETTE.length], width: 1.5 }, xaxis: 'x', yaxis: 'y' + (i ? i + 1 : '') }));
    const lay = baseLayout({ grid: { rows: show.length, columns: 1, shared_xaxes: true, ygap: 0.08 }, margin: { t: 20, l: 70, r: 20, b: 40 }, legend: { orientation: 'h', y: -0.12 }, xaxis: { title: 't [s]' },
      shapes: res.segments.flatMap((sg) => [{ type: 'rect', xref: 'x', yref: 'paper', x0: sg.tRaw0, x1: sg.tRaw1, y0: 0, y1: 1, fillcolor: 'rgba(46,204,113,.12)', line: { width: 0 } },
        { type: 'rect', xref: 'x', yref: 'paper', x0: sg.t0, x1: sg.t1, y0: 0, y1: 1, fillcolor: 'rgba(46,204,113,.18)', line: { width: 1, color: 'rgba(46,204,113,.6)' } }]) });
    show.forEach((s, i) => { lay['yaxis' + (i ? i + 1 : '')] = Object.assign(axisTheme(TC), { title: { text: s.name.length > 18 ? s.name.slice(0, 18) + '…' : s.name, font: { size: 10 } } }); });
    $('#plotSteady').style.display = '';
    $('#plotSteady').style.minHeight = (140 * show.length + 80) + 'px';
    Plotly.react('plotSteady', tr, lay, PCFG);
  } catch (e) { out.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function addSteadyPoints() {
  if (!STEADY || !STEADY.result || !STEADY.result.pts.length) return;
  const pts = STEADY.result.pts, hs = Object.keys(pts[0]);
  if (!S.raw) {
    setRaw(STEADY.fileName.replace(/\.[^.]+$/, '') + '_steady.csv', hs, pts.map((r) => Object.assign({}, r)));
  } else {
    for (const h of hs) if (!S.raw.headers.includes(h)) { S.raw.headers.push(h); S.raw.rows.forEach((r) => { r[h] = ''; }); }
    // Etiket sütunu farklıysa SS etiketlerini oraya yaz
    const lh = labelHeader();
    pts.forEach((p) => { const row = Object.fromEntries(S.raw.headers.map((h) => [h, p[h] !== undefined ? p[h] : ''])); if (lh && lh !== 'Point') row[lh] = p.Point; S.raw.rows.push(row); });
    renderData(); saveDraft();
  }
  toast(pts.length + ' kararlı nokta veri setine eklendi — eşlemeyi kontrol edin');
  if (S.raw.rows.length >= 3) { runAnalysis(true); runRating(true); }
}


/* ------------------------------------------------------------------
 * Demo veri
 * ------------------------------------------------------------------ */
function demoRows() {
  const f1 = findFluid('Water') || LIB.fluids[0], f2 = findFluid('Air') || LIB.fluids[1] || LIB.fluids[0];
  return H.generateDemo(H.fluidModel(f1), H.fluidModel(f2));
}
function loadDemo() {
  const rows = demoRows();
  const headers = Object.keys(rows[0]);
  S.fluid1 = 'Water'; S.fluid2 = 'Air';
  const dg = H.DEMO_GEOM;
  S.geom = {
    side1: { A: dg.side1.A, finsOn: dg.side1.finsOn, AfRatio: dg.side1.AfRatio, Lf: dg.side1.Lf, tf: dg.side1.tf, material: findSolid(dg.side1.material) ? dg.side1.material : LIB.solids[0].name, Dh: dg.side1.Dh, Ac: dg.side1.Ac, Lflow: dg.side1.Lflow },
    side2: { A: dg.side2.A, finsOn: dg.side2.finsOn, AfRatio: dg.side2.AfRatio, Lf: dg.side2.Lf, tf: dg.side2.tf, material: findSolid(dg.side2.material) ? dg.side2.material : LIB.solids[0].name, Dh: dg.side2.Dh, Ac: dg.side2.Ac, Lflow: dg.side2.Lflow },
    Rw: dg.Rw
  };
  S.meta.unit = 'Demo — Su/Hava radyatör (sentetik)';
  setRaw('demo_test_data.csv', headers, rows, {
    m_dot1: { col: 'Su Debisi [kg/h]', unit: 'kg/h' }, m_dot2: { col: 'Hava Debisi [kg/s]', unit: 'kg/s' },
    T1_in: { col: 'Su T_giris [C]', unit: '°C' }, T1_out: { col: 'Su T_cikis [C]', unit: '°C' },
    T2_in: { col: 'Hava T_giris [C]', unit: '°C' }, T2_out: { col: 'Hava T_cikis [C]', unit: '°C' },
    Effectiveness: { col: 'Verim [%]', unit: '%' }, dp1: { col: 'Su dP [kPa]', unit: 'kPa' }, dp2: { col: 'Hava dP [mbar]', unit: 'mbar' }
  });
  S.ui.source = 'file'; S.ui.ratingTouched = false;
  renderAllUI();
  runAnalysis(true);
  goStep('result');
  toast('Demo yüklendi: su/hava radyatörü, 33 test noktası. Sonuçları inceleyin, sonra "Çıktılar"a geçin.', 5000);
}
