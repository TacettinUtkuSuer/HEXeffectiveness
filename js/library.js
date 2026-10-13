/* =====================================================================
 * HEXeffectiveness — library.js
 * Malzeme ve akışkan kütüphanesi arayüzü
 * Klasik <script> dosyaları global kapsamı paylaşır (derleme adımı yok);
 * yükleme sırası: physics → core → library → data → analysis → outputs → main
 * ===================================================================== */
'use strict';

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
