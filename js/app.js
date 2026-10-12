/* =====================================================================
 * HEXeffectiveness — Arayüz / Uygulama Katmanı (app.js)
 * Durum yönetimi, veri yükleme/eşleme, kütüphane, grafikler, rapor.
 * Fizik hesapları js/physics.js (window.HEX) içindedir.
 * ===================================================================== */
(function () {
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
    { key: 'm_dot1', label: 'ṁ₁ — Akışkan 1 debisi', group: 'flow', side: 1, req: true },
    { key: 'm_dot2', label: 'ṁ₂ — Akışkan 2 debisi', group: 'flow', side: 2, req: true },
    { key: 'T1_in', label: 'T₁,giriş', group: 'temp', req: true },
    { key: 'T1_out', label: 'T₁,çıkış', group: 'temp' },
    { key: 'T2_in', label: 'T₂,giriş', group: 'temp', req: true },
    { key: 'T2_out', label: 'T₂,çıkış', group: 'temp' },
    { key: 'Effectiveness', label: 'ε — Etkinlik (ölçülen)', group: 'eps' },
    { key: 'dp1', label: 'ΔP₁ — Taraf 1 basınç düşümü', group: 'dp' },
    { key: 'dp2', label: 'ΔP₂ — Taraf 2 basınç düşümü', group: 'dp' }
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
        side1: { A: 1, finsOn: false, AfRatio: 0.6, Lf: 0.003, tf: 0.0002, material: 'Aluminum 3003' },
        side2: { A: 1, finsOn: false, AfRatio: 0.85, Lf: 0.004, tf: 0.0001, material: 'Aluminum 3003' },
        Rw: 0
      },
      settings: { hbThreshold: 5, excludeHB: true, epsSource: 'temps', cvThreshold: 2, nMin: 0.3, nMax: 0.8, assumedN: 0.6, npMin: 1.5, npMax: 2.0 },
      rating: { m1: 0.3, m2: 0.6, flowUnit1: 'kg/s', flowUnit2: 'kg/s', T1in: 80, T2in: 25, tempUnit: '°C', dpUnit: 'Pa' },
      meta: { project: 'Plate-Fin Eşanjör Performans Testi', unit: '', engineer: '', notes: '', includeTable: true },
      autoRun: false,
      manualAutoRun: true
    };
  }

  let S = defaultState();
  let LIB = null;
  let LIB_REPO = null;
  let RESULT = null;

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
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,5
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

  const tblInfo = (f) => (f.table && Array.isArray(f.table.T) ? `${f.table.T.length} nokta, ${fmt(Math.min(...f.table.T))}…${fmt(Math.max(...f.table.T))} °C` : '');
  function renderLibrary() {
    const ft = $('#fluidTbl');
    ft.innerHTML = '<thead><tr><th>Fluid_Name</th><th>Model</th><th>T</th><th>Cp_Eq</th><th>Density_Eq</th><th>Viscosity_Eq</th><th>k_Eq</th><th>c<sub>p</sub>(25 °C)</th><th></th></tr></thead><tbody>' +
      LIB.fluids.map((f, i) => {
        let cp25 = '—';
        try { cp25 = fmt(H.fluidModel(f).cp(298.15), 5); } catch (e) { cp25 = '<span class="req">hata</span>'; }
        const isTbl = f.source === 'table' && f.table;
        const model = isTbl ? `<span class="badge tbl">Tablo</span><br><small class="muted">${esc(tblInfo(f))}</small>`
          : `<span class="badge eq">Denklem</span>${f.table ? '<br><small class="muted">tablodan uydurma</small>' : ''}`;
        const eqc = (v) => `<td class="${isTbl ? 'dim' : ''}"><code>${esc(v)}</code></td>`;
        return `<tr><td><b>${esc(f.name)}</b></td><td>${model}</td><td>${esc(f.T_unit || 'C')}</td>${eqc(f.Cp_Eq)}${eqc(f.Density_Eq)}${eqc(f.Viscosity_Eq)}${eqc(f.k_Eq)}<td class="num">${cp25}</td>
        <td><button class="btn sm" data-fedit="${i}">Düzenle</button> <button class="btn sm danger" data-fdel="${i}">Sil</button></td></tr>`;
      }).join('') + '</tbody>';
    const st = $('#solidTbl');
    st.innerHTML = '<thead><tr><th>Malzeme</th><th>k [W/(m·K)]</th><th></th></tr></thead><tbody>' +
      LIB.solids.map((s, i) => `<tr><td>${esc(s.name)}</td><td class="num">${fmt(s.k)}</td><td><button class="btn sm" data-sedit="${i}">Düzenle</button> <button class="btn sm danger" data-sdel="${i}">Sil</button></td></tr>`).join('') + '</tbody>';
    fillLists();
  }

  function fillLists() {
    $$('select[data-list]').forEach((sel) => {
      const list = sel.dataset.list === 'fluids' ? LIB.fluids : LIB.solids;
      const cur = getPath(S, sel.dataset.bind);
      sel.innerHTML = list.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('') +
        (cur && !list.some((x) => x.name === cur) ? `<option value="${esc(cur)}">${esc(cur)} (kütüphanede yok!)</option>` : '');
      sel.value = cur;
    });
    $$('[data-kshow]').forEach((el) => {
      const s = findSolid(S.geom[el.dataset.kshow].material);
      el.textContent = s ? fmt(s.k) : '—';
    });
  }

  // Formda düzenlenen akışkanın tablo verisi (varsa)
  let FORM_TABLE = null;
  function fillFluidForm(f) {
    FORM_TABLE = f.table ? JSON.parse(JSON.stringify(f.table)) : null;
    $('#fName').value = f.name || ''; $('#fTunit').value = f.T_unit || 'C';
    $('#fCp').value = f.Cp_Eq || ''; $('#fRho').value = f.Density_Eq || ''; $('#fMu').value = f.Viscosity_Eq || ''; $('#fK').value = f.k_Eq || '';
    $('#fSource').value = f.source === 'table' && FORM_TABLE ? 'table' : 'equation';
    $('#fSource option[value=table]').disabled = !FORM_TABLE;
    $('#fTableInfo').textContent = FORM_TABLE ? 'Tablo verisi: ' + tblInfo(f) : 'Bu akışkanın tablo verisi yok (yalnızca denklem).';
  }
  function readFluidForm() {
    const f = {
      name: $('#fName').value.trim(), T_unit: $('#fTunit').value,
      Cp_Eq: $('#fCp').value.trim(), Density_Eq: $('#fRho').value.trim(),
      Viscosity_Eq: $('#fMu').value.trim(), k_Eq: $('#fK').value.trim(),
      source: $('#fSource').value
    };
    if (FORM_TABLE) { f.table = FORM_TABLE; f.T_unit = 'C'; f.T_range = [Math.min(...FORM_TABLE.T), Math.max(...FORM_TABLE.T)]; }
    if (!f.name) throw new Error('Fluid_Name boş olamaz');
    if (f.source === 'table' && !FORM_TABLE) throw new Error('Tablo modeli için önce özellik tablosu yükleyin');
    if (f.source !== 'table' && !f.Cp_Eq) throw new Error('Cp_Eq zorunludur');
    for (const k of ['Cp_Eq', 'Density_Eq', 'Viscosity_Eq', 'k_Eq']) {
      try { const fn = H.parseEquation(f[k]); if (fn && !isFinite(fn(20))) throw new Error('T=20 için sonlu değil'); }
      catch (e) { throw new Error(k + ': ' + e.message); }
    }
    return f;
  }

  function testFluid(f) {
    const m = H.fluidModel(f);
    const K = f.T_unit === 'K';
    const toK = (t) => (K ? t : t + 273.15);
    let lo, hi;
    if (f.table && f.table.T) { lo = Math.min(...f.table.T); hi = Math.max(...f.table.T); }
    else if (f.T_range) { lo = f.T_range[0]; hi = f.T_range[1]; }
    else { lo = K ? 253.15 : -20; hi = K ? 423.15 : 150; }
    const Ts = Array.from({ length: 6 }, (_, i) => +(lo + (hi - lo) * i / 5).toFixed(2));
    const rows = Ts.map((t) => `<tr><td>${t} ${K ? 'K' : '°C'}</td><td class="num">${fmt(m.cp(toK(t)), 5)}</td><td class="num">${fmt(m.rho(toK(t)), 5)}</td><td class="num">${fmt(m.mu(toK(t)), 4)}</td><td class="num">${fmt(m.k(toK(t)), 4)}</td><td class="num">${fmt(m.Pr(toK(t)), 3)}</td></tr>`).join('');
    let errTxt = '';
    if (f.table) {
      try {
        const e = H.fitTableToEquations(f.table).errors;
        errTxt = `<div class="muted small">Polinom/ifade uydurmasının tabloya göre maks. hatası: c<sub>p</sub> ${fx(e.cp, 3)} %, ρ ${fx(e.rho, 3)} %, μ ${fx(e.mu, 3)} %, k ${fx(e.k, 3)} %. Aktif model: <b>${m.source === 'table' ? 'Tablo + enterpolasyon' : 'Denklem'}</b></div>`;
      } catch (e) { /* yok say */ }
    }
    $('#fluidTestOut').innerHTML = `<table class="tbl small"><thead><tr><th>T</th><th>c<sub>p</sub> [J/kgK]</th><th>ρ [kg/m³]</th><th>μ [Pa·s]</th><th>k [W/mK]</th><th>Pr</th></tr></thead><tbody>${rows}</tbody></table>${errTxt}`;
    const span = hi - lo, a = lo - 0.1 * span, b = hi + 0.1 * span;
    const tt = Array.from({ length: 121 }, (_, i) => a + (b - a) * i / 120);
    const props = [['cp', 'c_p [J/kgK]', '', ''], ['rho', 'ρ [kg/m³]', '2', ''], ['mu', 'μ [Pa·s]', '3', 'log'], ['k', 'k [W/mK]', '4', '']];
    const tr = [];
    props.forEach(([p, name, ax], i) => {
      tr.push({ x: tt, y: tt.map((t) => m[p](toK(t))), mode: 'lines', name: 'model', showlegend: i === 0, line: { color: PALETTE[0] }, xaxis: 'x' + ax, yaxis: 'y' + ax });
      if (f.table && Array.isArray(f.table[p])) {
        tr.push({ x: f.table.T, y: f.table[p], mode: 'markers', name: 'tablo', showlegend: i === 0, marker: { color: C1C, size: 6 }, xaxis: 'x' + ax, yaxis: 'y' + ax });
      }
    });
    const tl = 'T [' + (K ? 'K' : '°C') + ']';
    const lay = baseLayout({
      title: { text: esc(f.name) + ' — özellik eğrileri', font: { size: 13 } }, margin: { t: 40, r: 20, l: 70, b: 50 },
      grid: { rows: 2, columns: 2, pattern: 'independent', ygap: 0.35, xgap: 0.2 }, legend: { orientation: 'h', y: -0.18 }
    });
    props.forEach(([, name, ax, type]) => {
      lay['xaxis' + ax] = Object.assign({}, lay.xaxis, { title: tl });
      lay['yaxis' + ax] = Object.assign({}, lay.yaxis, { title: name, type: type || 'linear', exponentformat: 'e' });
    });
    Plotly.react('plotProps', tr, lay, PCFG);
  }

  // Tablo dosyasından (T, ρ, cp, μ, k) akışkan oluştur
  function importPropertyTables(files) {
    const mode = $('#tblMode').value;
    let done = 0, last = null;
    const msgs = [];
    Array.from(files).forEach((file) => {
      Papa.parse(file, {
        header: false, skipEmptyLines: true,
        complete: (res) => {
          try {
            const rows = res.data.filter((r) => r.some((c) => String(c).trim() !== ''));
            const tbl = H.parsePropertyTable(rows[0], rows.slice(1));
            const fit = H.fitTableToEquations(tbl);
            const name = file.name.replace(/\.[^.]+$/, '').replace(/^[0-9a-f]{8}-/i, '').trim() || 'Yeni akışkan';
            const f = { name, T_unit: 'C', source: mode, T_range: [tbl.T[0], tbl.T[tbl.T.length - 1]],
              Cp_Eq: fit.Cp_Eq || '', Density_Eq: fit.Density_Eq || '', Viscosity_Eq: fit.Viscosity_Eq || '', k_Eq: fit.k_Eq || '', table: tbl };
            const j = LIB.fluids.findIndex((x) => x.name === name);
            if (j >= 0) LIB.fluids[j] = f; else LIB.fluids.push(f);
            last = f;
            const miss = ['rho', 'mu', 'k'].filter((p) => !tbl[p]);
            msgs.push(`${name}: ${tbl.T.length} nokta${j >= 0 ? ' (güncellendi)' : ''}${miss.length ? ' · eksik: ' + miss.join(', ') : ''}`);
          } catch (e) { msgs.push(file.name + ': ' + e.message); }
          if (++done === files.length) {
            renderLibrary(); syncBindings(); saveDraft();
            if (last) { fillFluidForm(last); testFluid(last); }
            $('#tblImportOut').innerHTML = msgs.map((m) => `<div class="msg ${/:\s\d+ nokta/.test(m) ? 'ok' : 'err'}">${esc(m)}</div>`).join('');
            toast(msgs.join(' · '), 5000);
            if (RESULT) runAnalysis(true);
          }
        }
      });
    });
  }

  function importFluidCsv(file) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        // Başlıklar T/ρ/cp/μ/k ise bu bir özellik tablosudur -> tablo içe aktarmaya yönlendir
        const hs = res.meta.fields || [];
        if (!hs.some((h) => /fluid_name/i.test(h)) && hs.some((h) => /^t\s*[\[(]|^t$/i.test(h.trim()))) { importPropertyTables([file]); return; }
        let n = 0; const errs = [];
        res.data.forEach((row, i) => {
          const get = (k) => { const key = Object.keys(row).find((h) => h.trim().toLowerCase() === k.toLowerCase()); return key ? String(row[key]).trim() : ''; };
          const f = { name: get('Fluid_Name'), T_unit: (get('T_Unit') || 'C').toUpperCase().replace('°', ''), Cp_Eq: get('Cp_Eq'), Density_Eq: get('Density_Eq'), Viscosity_Eq: get('Viscosity_Eq'), k_Eq: get('k_Eq'), source: 'equation' };
          if (!f.name || !f.Cp_Eq) { errs.push('Satır ' + (i + 2) + ': Fluid_Name/Cp_Eq eksik'); return; }
          try { ['Cp_Eq', 'Density_Eq', 'Viscosity_Eq', 'k_Eq'].forEach((k) => H.parseEquation(f[k])); }
          catch (e) { errs.push('Satır ' + (i + 2) + ': ' + e.message); return; }
          const j = LIB.fluids.findIndex((x) => x.name === f.name);
          if (j >= 0) LIB.fluids[j] = Object.assign(LIB.fluids[j], f); else LIB.fluids.push(f);
          n++;
        });
        renderLibrary(); saveDraft();
        toast(n + ' akışkan içe aktarıldı' + (errs.length ? ' · ' + errs.length + ' hata (konsola bakın)' : ''));
        if (errs.length) console.warn(errs.join('\n'));
      }
    });
  }

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
    if (mapping) Object.assign(S.map, mapping); else autoMap(false);
    renderData(); saveDraft();
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
      return `<tr><td>${v.label}${v.req ? ' <span class="req">*</span>' : ''}<br><small class="muted"><code>${v.key}</code></small></td>
        <td><select data-mapcol="${v.key}">${opts}</select></td><td><select data-mapunit="${v.key}">${units}</select></td></tr>`;
    }).join('');
    const info = $('#dataInfo');
    if (!S.raw) {
      info.innerHTML = 'Henüz veri yok. Dosya yükleyin, aşağıdan <b>manuel nokta</b> ekleyin veya <b>Demo Veriyi Yükle</b> ile deneyin.';
      $('#previewTbl').innerHTML = ''; $('#previewCount').textContent = '';
      return;
    }
    info.innerHTML = `<b>${esc(S.raw.fileName)}</b> · ${S.raw.rows.length} satır · ${hs.length} sütun`;
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
        const um = H.modelUA(RESULT.fit, RESULT.geom, p.m1, p.m2);
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
   * Analiz
   * ------------------------------------------------------------------ */
  function runAnalysis(silent) {
    const msg = $('#analysisMsg');
    try {
      const pts = buildPoints();
      const f1 = fluidOrThrow(S.fluid1), f2 = fluidOrThrow(S.fluid2);
      const geom = calcGeom();
      RESULT = H.analyze(pts, f1, f2, geom, S.settings);
      RESULT.geom = geom;
      S.autoRun = true;
      renderAnalysis();
      saveDraft();
      if (!silent) toast('Analiz tamamlandı: ' + RESULT.nUsed + ' nokta kullanıldı');
    } catch (e) {
      console.error(e);
      RESULT = null;
      msg.innerHTML = `<div class="msg err">⚠ ${esc(e.message)}</div>`;
      $('#fitSummary').innerHTML = '';
      if (!silent) toast('Analiz hatası: ' + e.message, 5000);
    }
  }

  const modeText = (m) => ({ '2D': '2D yüzey fit (her iki debi değişken)', '1D-m1': '1D eğri fit (ṁ₂ sabit, ṁ₁ değişken)', '1D-m2': '1D eğri fit (ṁ₁ sabit, ṁ₂ değişken)' }[m] || m);

  function renderAnalysis() {
    const R = RESULT; if (!R) return;
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
    $('#fitSummary').innerHTML = [
      k('s1', 'C₁', fmt(F.C1, 5), 'h₁ = C₁·ṁ₁<sup>n₁</sup> [W/m²K]'),
      k('s1', 'n₁', fx(F.n1, 4), F.mode === '1D-m2' ? 'varsayılan' : 'fit'),
      k('s2', 'C₂', fmt(F.C2, 5), 'h₂ = C₂·ṁ₂<sup>n₂</sup> [W/m²K]'),
      k('s2', 'n₂', fx(F.n2, 4), F.mode === '1D-m1' ? 'varsayılan' : 'fit'),
      k('', 'R<sub>w</sub>', fmt(F.Rw, 4), 'K/W (girdi)'),
      k('s1', 'K<sub>p1</sub> · n<sub>p1</sub>', R.dpFit1 ? fmt(R.dpFit1.Kp, 5) + ' · ' + fx(R.dpFit1.np, 3) : '—', 'ΔP₁ [Pa], ṁ [kg/s]'),
      k('s2', 'K<sub>p2</sub> · n<sub>p2</sub>', R.dpFit2 ? fmt(R.dpFit2.Kp, 5) + ' · ' + fx(R.dpFit2.np, 3) : '—', 'ΔP₂ [Pa], ṁ [kg/s]'),
      k('g', 'ε: R²', fx(st.eps.R2, 4), `RMSE ${fx(st.eps.RMSE, 4)} · MAPE ${fx(st.eps.MAPE, 2)} %`),
      k('g', 'UA: R²', fx(st.UA.R2, 4), `RMSE ${fmt(st.UA.RMSE, 3)} W/K · MAPE ${fx(st.UA.MAPE, 2)} %`),
      k('g', 'ΔP₁: R²', fx(st.dp1.R2, 4), `MAPE ${fx(st.dp1.MAPE, 2)} %`),
      k('g', 'ΔP₂: R²', fx(st.dp2.R2, 4), `MAPE ${fx(st.dp2.MAPE, 2)} %`)
    ].join('');

    renderPointsTable();
    plotAll();
    manualPreview();
  }

  function renderPointsTable() {
    const R = RESULT; if (!R) return;
    const tu = S.map.T1_in.unit;
    const T = (v) => (isFinite(v) ? fx(H.fromKelvin(v, tu), 2) : '—');
    $('#ptsTbl').innerHTML = `<thead><tr><th>Dahil</th><th>#</th><th>ṁ₁ [kg/s]</th><th>ṁ₂ [kg/s]</th><th>T₁in [${tu}]</th><th>T₁out</th><th>T₂in</th><th>T₂out</th>
      <th>Q₁ [W]</th><th>Q₂ [W]</th><th>HB hata [%]</th><th>ε<sub>deney</sub></th><th>ε<sub>model</sub></th><th>Δε [%]</th><th>NTU</th><th>UA [W/K]</th><th>UA<sub>model</sub></th>
      <th>h₁</th><th>h₂</th><th>η<sub>o1</sub></th><th>η<sub>o2</sub></th><th>ΔP₁ [Pa]</th><th>ΔP₁<sub>model</sub></th><th>ΔP₂ [Pa]</th><th>ΔP₂<sub>model</sub></th><th>Durum</th></tr></thead><tbody>` +
      R.pts.map((p) => {
        const cls = !p.valid ? 'invalid' : p.hbFlag ? 'flag' : !p.included ? 'excluded' : '';
        const status = !p.valid ? esc(p.reason) : p.hbFlag ? 'Isı dengesi > eşik' : p.manualExclude ? 'Manuel hariç' : 'OK';
        const dEps = p.valid ? (p.eps_pred - p.eps_exp) / p.eps_exp * 100 : NaN;
        return `<tr class="${cls}"><td><input type="checkbox" data-incl="${p.idx}" ${p.manualExclude ? '' : 'checked'}></td><td>${esc(p.label)}</td>
          <td class="num">${fx(p.m1, 4)}</td><td class="num">${fx(p.m2, 4)}</td><td class="num">${T(p.T1in)}</td><td class="num">${T(p.T1out)}</td><td class="num">${T(p.T2in)}</td><td class="num">${T(p.T2out)}</td>
          <td class="num">${fmt(p.Q1, 5)}</td><td class="num">${fmt(p.Q2, 5)}</td><td class="num">${fx(p.hbErr, 2)}</td>
          <td class="num">${fx(p.eps_exp, 4)}</td><td class="num">${fx(p.eps_pred, 4)}</td><td class="num">${fx(dEps, 2)}</td>
          <td class="num">${fx(p.NTU, 3)}</td><td class="num">${fmt(p.UA, 4)}</td><td class="num">${fmt(p.UA_pred, 4)}</td>
          <td class="num">${fmt(p.h1, 4)}</td><td class="num">${fmt(p.h2, 4)}</td><td class="num">${fx(p.eta1, 3)}</td><td class="num">${fx(p.eta2, 3)}</td>
          <td class="num">${fmt(p.dp1, 4)}</td><td class="num">${fmt(p.dp1_pred, 4)}</td><td class="num">${fmt(p.dp2, 4)}</td><td class="num">${fmt(p.dp2_pred, 4)}</td><td>${status}</td></tr>`;
      }).join('') + '</tbody>';
  }

  /* ------------------------------------------------------------------
   * Grafikler (Plotly)
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
      { x: inc.map((p) => p.eps_exp), y: inc.map((p) => p.eps_pred), text: inc.map(lab), mode: 'markers', name: 'Fit noktaları', marker: { color: TC.main, size: 8 } },
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
    const w1x = inc.map((p) => 1 / (p.eta1 * g.side1.A * Math.pow(p.m1, F.n1)));
    const w1y = inc.map((p) => 1 / p.UA - g.Rw - p.R2);
    const w2x = inc.map((p) => 1 / (p.eta2 * g.side2.A * Math.pow(p.m2, F.n2)));
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
      xaxis: { title: '1/(η<sub>o1</sub>A₁ṁ₁<sup>n₁</sup>)', exponentformat: 'e' }, yaxis: { title: '1/UA − R<sub>w</sub> − R₂ [K/W]', exponentformat: 'e' },
      xaxis2: { title: '1/(η<sub>o2</sub>A₂ṁ₂<sup>n₂</sup>)', exponentformat: 'e' }, yaxis2: { title: '1/UA − R<sub>w</sub> − R₁ [K/W]', exponentformat: 'e' },
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
        dpTr.push({ x: xx, y: xx.map((m) => fitp.Kp * Math.pow(m, fitp.np)), mode: 'lines', name: `ΔP${side} = ${fmt(fitp.Kp, 4)}·ṁ^${fx(fitp.np, 3)}`, line: { color: col }, yaxis: side === 1 ? 'y' : 'y2' });
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
   * Performans tahmini
   * ------------------------------------------------------------------ */
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
      out.innerHTML = [
        k('g', 'ε', fx(res.eps, 4), 'etkinlik'), k('g', 'Q', fmt(res.Q / 1000, 5), 'kW'),
        k('s1', 'T₁,çıkış', fx(H.fromKelvin(res.T1out, tu), 2), tu), k('s2', 'T₂,çıkış', fx(H.fromKelvin(res.T2out, tu), 2), tu),
        k('s1', 'ΔP₁', fmt(dpc(res.dp1), 4), du), k('s2', 'ΔP₂', fmt(dpc(res.dp2), 4), du),
        k('', 'NTU', fx(res.NTU, 4), 'C<sub>r</sub> = ' + fx(res.Cr, 4)), k('', 'UA', fmt(res.UA, 5), 'W/K'),
        k('s1', 'h₁ · η<sub>o1</sub>', fmt(res.h1, 4) + ' · ' + fx(res.eta1, 3), 'W/m²K'), k('s2', 'h₂ · η<sub>o2</sub>', fmt(res.h2, 4) + ' · ' + fx(res.eta2, 3), 'W/m²K'),
        k('', 'ṁ₁ · ṁ₂', fx(m1, 4) + ' · ' + fx(m2, 4), 'kg/s (SI)'), k('', 'C<sub>min</sub>', fmt(res.Cmin, 5), 'W/K')
      ].join('');
      const inc = RESULT.pts.filter((p) => p.included);
      const ext = (v, arr) => v < Math.min(...arr) * 0.9 || v > Math.max(...arr) * 1.1;
      const w = [];
      if (ext(m1, inc.map((p) => p.m1))) w.push('ṁ₁ test aralığının dışında (ekstrapolasyon).');
      if (ext(m2, inc.map((p) => p.m2))) w.push('ṁ₂ test aralığının dışında (ekstrapolasyon).');
      if (RESULT.fit.mode === '1D-m1' && Math.abs(m2 - RESULT.fit.mConstMean) / RESULT.fit.mConstMean > 0.05) w.push('1D modda ṁ₂ sabitti; ṁ₂ değişimi varsayılan üsse (n₂) dayanır.');
      if (RESULT.fit.mode === '1D-m2' && Math.abs(m1 - RESULT.fit.mConstMean) / RESULT.fit.mConstMean > 0.05) w.push('1D modda ṁ₁ sabitti; ṁ₁ değişimi varsayılan üsse (n₁) dayanır.');
      warn.innerHTML = w.map((x) => `<div class="msg warn">⚠ ${x}</div>`).join('');

      // Tarama grafiği
      const sv = $('#sweepVar').value;
      const arr = inc.map((p) => p[sv]);
      const xs = Array.from({ length: 60 }, (_, i) => Math.min(...arr) * 0.6 + (Math.max(...arr) * 1.3 - Math.min(...arr) * 0.6) * i / 59);
      const rs = xs.map((x) => H.rate({ m1: sv === 'm1' ? x : m1, m2: sv === 'm2' ? x : m2, T1in, T2in }, RESULT.fit, RESULT.geom, f1, f2, RESULT.dpFit1, RESULT.dpFit2));
      Plotly.react('plotSweep', [
        { x: xs, y: rs.map((q) => q.eps), name: 'ε', line: { color: TC.main, width: 3 } },
        { x: xs, y: rs.map((q) => q.Q / 1000), name: 'Q [kW]', yaxis: 'y2', line: { color: '#1e8449' } },
        { x: xs, y: rs.map((q) => dpc(sv === 'm1' ? q.dp1 : q.dp2)), name: 'ΔP' + (sv === 'm1' ? '₁' : '₂') + ' [' + du + ']', yaxis: 'y3', line: { color: sv === 'm1' ? C1C : C2C, dash: 'dash' } },
        { x: [sv === 'm1' ? m1 : m2], y: [res.eps], mode: 'markers', name: 'Seçili nokta', marker: { size: 12, color: '#f0a030', line: { color: TC.line, width: 1 } } }
      ], baseLayout({
        xaxis: { title: (sv === 'm1' ? 'ṁ₁' : 'ṁ₂') + ' [kg/s]', domain: [0, 0.82] }, yaxis: { title: 'ε' },
        yaxis2: { title: 'Q [kW]', overlaying: 'y', side: 'right', anchor: 'x', showgrid: false },
        yaxis3: { title: 'ΔP [' + du + ']', overlaying: 'y', side: 'right', anchor: 'free', position: 1, showgrid: false },
        margin: { r: 30 }
      }), PCFG);
    } catch (e) {
      out.innerHTML = ''; warn.innerHTML = `<div class="msg err">⚠ ${esc(e.message)}</div>`;
      if (!silent) toast(e.message, 4000);
    }
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
        ['plotSweep', 'Şekil 8 — Performans tahmini debi taraması']
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
        <div class="eq">1/UA = 1/(η<sub>o</sub>hA)₁ + R<sub>w</sub> + 1/(η<sub>o</sub>hA)₂,  h<sub>i</sub> = C<sub>i</sub>·ṁ<sub>i</sub><sup>n<sub>i</sub></sup></div>
        <div class="eq">η<sub>o</sub> = 1 − (A<sub>f</sub>/A)(1 − η<sub>f</sub>),  η<sub>f</sub> = tanh(m<sub>f</sub>L<sub>f</sub>)/(m<sub>f</sub>L<sub>f</sub>),  m<sub>f</sub> = √(2h/(k<sub>m</sub>t<sub>f</sub>))</div>
        <div class="eq">ΔP = K<sub>p</sub>·ṁ<sup>n<sub>p</sub></sup></div>
        <p class="small">Akışkan özellikleri ortalama sıcaklıkta T<sub>m</sub> = (T<sub>in</sub>+T<sub>out</sub>)/2 kütüphane polinomlarıyla hesaplanmıştır. ε kaynağı: ${S.settings.epsSource === 'column' ? 'Effectiveness sütunu' : 'sıcaklıklar (Q<sub>ort</sub>/Q<sub>max</sub>)'}.</p>
        <h2>3. Akışkanlar ve Geometri</h2>
        <table><thead><tr><th></th><th>Akışkan</th><th>A [m²]</th><th>Kanatçık</th><th>A<sub>f</sub>/A</th><th>L<sub>f</sub> [mm]</th><th>t<sub>f</sub> [mm]</th><th>Malzeme (k)</th></tr></thead>
        <tbody>${sideRow('side1', 1)}${sideRow('side2', 2)}</tbody></table>
        <p>R<sub>w</sub> = ${fmt(g.Rw, 4)} K/W</p>
        <h2>4. Fit Parametreleri</h2>
        <table><thead><tr><th>Parametre</th><th>Taraf 1</th><th>Taraf 2</th><th>Not</th></tr></thead><tbody>
          <tr><td>C [W/(m²K)/(kg/s)<sup>n</sup>]</td><td class="num">${fmt(F.C1, 6)}</td><td class="num">${fmt(F.C2, 6)}</td><td>h = C·ṁ<sup>n</sup></td></tr>
          <tr><td>n [-]</td><td class="num">${fx(F.n1, 4)}${F.mode === '1D-m2' ? ' *' : ''}</td><td class="num">${fx(F.n2, 4)}${F.mode === '1D-m1' ? ' *' : ''}</td><td>${F.mode === '2D' ? 'Sınır: ' + S.settings.nMin + '–' + S.settings.nMax : '* varsayılan (1D mod)'}</td></tr>
          <tr><td>K<sub>p</sub> [Pa/(kg/s)<sup>n<sub>p</sub></sup>]</td><td class="num">${R.dpFit1 ? fmt(R.dpFit1.Kp, 6) : '—'}</td><td class="num">${R.dpFit2 ? fmt(R.dpFit2.Kp, 6) : '—'}</td><td>ΔP = K<sub>p</sub>·ṁ<sup>n<sub>p</sub></sup></td></tr>
          <tr><td>n<sub>p</sub> [-]</td><td class="num">${R.dpFit1 ? fx(R.dpFit1.np, 4) : '—'}</td><td class="num">${R.dpFit2 ? fx(R.dpFit2.np, 4) : '—'}</td><td>Sınır: ${S.settings.npMin}–${S.settings.npMax}</td></tr>
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
      side1: { A: dg.side1.A, finsOn: dg.side1.finsOn, AfRatio: dg.side1.AfRatio, Lf: dg.side1.Lf, tf: dg.side1.tf, material: findSolid(dg.side1.material) ? dg.side1.material : LIB.solids[0].name },
      side2: { A: dg.side2.A, finsOn: dg.side2.finsOn, AfRatio: dg.side2.AfRatio, Lf: dg.side2.Lf, tf: dg.side2.tf, material: findSolid(dg.side2.material) ? dg.side2.material : LIB.solids[0].name },
      Rw: dg.Rw
    };
    S.meta.unit = 'Demo — Su/Hava radyatör (sentetik)';
    setRaw('demo_test_data.csv', headers, rows, {
      m_dot1: { col: 'Su Debisi [kg/h]', unit: 'kg/h' }, m_dot2: { col: 'Hava Debisi [kg/s]', unit: 'kg/s' },
      T1_in: { col: 'Su T_giris [C]', unit: '°C' }, T1_out: { col: 'Su T_cikis [C]', unit: '°C' },
      T2_in: { col: 'Hava T_giris [C]', unit: '°C' }, T2_out: { col: 'Hava T_cikis [C]', unit: '°C' },
      Effectiveness: { col: 'Verim [%]', unit: '%' }, dp1: { col: 'Su dP [kPa]', unit: 'kPa' }, dp2: { col: 'Hava dP [mbar]', unit: 'mbar' }
    });
    renderAllUI();
    runAnalysis(true);
    runRating(true);
    switchTab('analysis');
    toast('Demo verisi yüklendi ve analiz edildi (gerçek parametreler: C₁=6000, n₁=0.55, C₂=115, n₂=0.50)', 5000);
  }

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
   * Arayüz bağlama
   * ------------------------------------------------------------------ */
  function switchTab(name) {
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    // Gizli sekmede çizilen grafikleri yeniden boyutlandır
    setTimeout(() => $$('#tab-' + name + ' .js-plotly-plot').forEach((gd) => Plotly.Plots.resize(gd)), 30);
    if (name === 'rating') runRating(true);
    try { localStorage.setItem(DRAFT_KEY + '_tab', name); } catch (e) { /* yok say */ }
  }

  function syncBindings() {
    $$('select[data-units]').forEach((sel) => {
      if (!sel.options.length) sel.innerHTML = H.UNITS[sel.dataset.units].map((u) => `<option>${u}</option>`).join('');
    });
    fillLists();
    $$('[data-bind]').forEach((el) => {
      const v = getPath(S, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.dataset.scale && v !== undefined && v !== null && v !== '') el.value = +(v * +el.dataset.scale).toPrecision(8);
      else el.value = v === undefined || v === null ? '' : v;
    });
    ['side1', 'side2'].forEach((s) => { $(`[data-fins="${s}"]`).disabled = !S.geom[s].finsOn; });
  }

  function renderAllUI() {
    renderLibrary();
    renderData();
    renderManualForm();
    syncBindings();
  }

  function onBindChange(el) {
    const p = el.dataset.bind;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') { v = el.value === '' ? NaN : +el.value; if (el.dataset.scale) v /= +el.dataset.scale; }
    else v = el.value;
    setPath(S, p, v);
    if (/^geom\.side\d\.finsOn$/.test(p) || /material$/.test(p)) syncBindings();
    saveDraft();
    if (p.startsWith('rating.')) runRating(true);
    else if (RESULT && /^(geom|settings|fluid)/.test(p)) { runAnalysis(true); }
    if (/^(geom|settings|fluid)/.test(p)) manualPreview();
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
    if ($('#plotProps').data) { try { testFluid(readFluidForm()); } catch (e) { /* yok say */ } }
  }

  function wire() {
    $('#btnTheme').addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true));
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (err) { /* yok say */ }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
      });
    }
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) switchTab(b.dataset.tab); });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('[data-bind]')) onBindChange(el);
      else if (el.matches('[data-mapcol]')) {
        const k = el.dataset.mapcol; S.map[k].col = el.value;
        const u = el.value && detectUnit(el.value, VARS.find((v) => v.key === k).group);
        if (u) { S.map[k].unit = u; renderData(); }
        saveDraft();
      } else if (el.matches('[data-mapunit]')) { S.map[el.dataset.mapunit].unit = el.value; renderData(); renderManualForm(); saveDraft(); }
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
      if (S.raw && S.raw.rows.length && !confirm('Mevcut veri seti (' + S.raw.rows.length + ' satır) kapatılıp boş bir manuel test başlatılsın mı? Önce CSV olarak dışa aktarmanız önerilir.')) return;
      S.raw = null; RESULT = null; MAN_EDIT = -1;
      S.map = defaultState().map;
      ensureManualDataset(); renderData(); renderManualForm(); saveDraft();
      $('#analysisMsg').innerHTML = ''; $('#fitSummary').innerHTML = '';
      toast('Boş manuel test veri seti hazır');
    });
    $('#btnManExport').addEventListener('click', () => {
      if (!S.raw || !S.raw.rows.length) { toast('Dışa aktarılacak nokta yok'); return; }
      download(S.raw.fileName.replace(/\.[^.]+$/, '') + '_' + new Date().toISOString().slice(0, 10) + '.csv', Papa.unparse(S.raw.rows, { columns: S.raw.headers }), 'text/csv');
    });
    $('#previewTbl').addEventListener('click', (e) => {
      const ed = e.target.closest('[data-redit]'), dl = e.target.closest('[data-rdel]');
      if (ed) manualEdit(+ed.dataset.redit);
      if (dl) deleteRow(+dl.dataset.rdel);
    });
    $('#btnAutoMap').addEventListener('click', () => { autoMap(true); renderData(); saveDraft(); toast('Otomatik eşleme yapıldı — lütfen kontrol edin'); });
    $('#btnGoAnalyze').addEventListener('click', () => { switchTab('analysis'); runAnalysis(); });
    $('#btnRun').addEventListener('click', () => runAnalysis());
    $('#btnRate').addEventListener('click', () => runRating());
    $('#sweepVar').addEventListener('change', () => runRating(true));
    // Demo
    $('#btnDemoLoad').addEventListener('click', loadDemo);
    $('#btnDemoDownload').addEventListener('click', () => download('demo_test_data.csv', Papa.unparse(demoRows()), 'text/csv'));
    // Proje
    const save = () => download('hex_project_' + new Date().toISOString().slice(0, 10) + '.json', projectJson(), 'application/json');
    $('#btnProjSave').addEventListener('click', save);
    $('#btnProjSave2').addEventListener('click', save);
    ['#fileProject', '#fileProject2'].forEach((id) => $(id).addEventListener('change', (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (f) readJsonFile(f, (obj) => { try { applyProject(obj); saveDraft(); } catch (err) { toast(err.message, 5000); } });
    }));
    $('#btnReset').addEventListener('click', async () => {
      if (!confirm('Tüm veri, ayarlar ve taslak silinecek. Kütüphane repo varsayılanına dönecek. Emin misiniz?')) return;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* yok say */ }
      S = defaultState(); RESULT = null; LIB = JSON.parse(JSON.stringify(LIB_REPO));
      ['plotHB', 'plotParity', 'plotSurface', 'plotCurves', 'plotWilson', 'plotDP', 'plotParityDP', 'plotSweep'].forEach((id) => Plotly.purge(id));
      $('#analysisMsg').innerHTML = ''; $('#fitSummary').innerHTML = ''; $('#ptsTbl').innerHTML = ''; $('#rateOut').innerHTML = '';
      renderAllUI(); toast('Sıfırlandı');
    });
    // Kütüphane
    $('#fluidTbl').addEventListener('click', (e) => {
      const ed = e.target.closest('[data-fedit]'), dl = e.target.closest('[data-fdel]');
      if (ed) {
        const f = LIB.fluids[+ed.dataset.fedit];
        fillFluidForm(f);
        try { testFluid(f); } catch (err) { $('#fluidTestOut').innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
        $('#fName').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        toast(f.name + (j >= 0 ? ' güncellendi' : ' eklendi') + ' — kalıcı yapmak için kütüphaneyi indirip repoya commit edin');
      } catch (e) { $('#fluidTestOut').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
    });
    $('#fileTable').addEventListener('change', (e) => { if (e.target.files.length) importPropertyTables(Array.from(e.target.files)); e.target.value = ''; });
    $('#btnFluidNew').addEventListener('click', () => { fillFluidForm({ name: '', T_unit: 'C' }); $('#fluidTestOut').innerHTML = ''; Plotly.purge('plotProps'); });
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
      toast('materials_db.json indirildi — repodaki dosyanın yerine koyup commit edin');
    });
    $('#btnLibReset').addEventListener('click', () => {
      if (!confirm('Kütüphane repo dosyasındaki (materials_db.json) haline dönecek. Eklediğiniz akışkanlar silinir.')) return;
      LIB = JSON.parse(JSON.stringify(LIB_REPO)); renderLibrary(); syncBindings(); saveDraft();
    });
    $('#btnPdf').addEventListener('click', makePdf);
  }

  /* ------------------------------------------------------------------
   * Başlangıç
   * ------------------------------------------------------------------ */
  async function init() {
    wire();
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
        toast('Önceki oturum taslağı geri yüklendi');
      } catch (e) { console.warn('Taslak yüklenemedi', e); renderAllUI(); }
    } else renderAllUI();
    let tab = null;
    try { tab = localStorage.getItem(DRAFT_KEY + '_tab'); } catch (e) { /* yok say */ }
    if (tab && $('#tab-' + tab)) switchTab(tab);
  }
  document.addEventListener('DOMContentLoaded', init);
})();
