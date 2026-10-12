/* =====================================================================
 * HEXeffectiveness — Fizik / Hesap Motoru (physics.js)
 * Çapraz akışlı kanatçıklı plakalı eşanjör: ε-NTU, Wilson Plot,
 * kanatçık verimi, basınç düşümü fit'i ve performans tahmini.
 * Tarayıcıda window.HEX olarak, Node'da module.exports olarak kullanılır.
 * Tüm iç hesaplar SI birimlerindedir: kg/s, K, Pa, W, m, W/(m·K).
 * ===================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------
   * 1. Güvenli ifade ayrıştırıcı (eval kullanılmaz)
   *    Destek: sayılar, T, + - * / ^ ( ), exp ln log log10 sqrt abs pow
   * ------------------------------------------------------------------ */
  const FUNCS = {
    exp: Math.exp, ln: Math.log, log: Math.log, log10: Math.log10,
    sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow, tanh: Math.tanh
  };

  function tokenize(s) {
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
        if (!m) throw new Error('Geçersiz sayı: ' + s.slice(i, i + 8));
        tokens.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i));
        tokens.push({ t: 'id', v: m[0] }); i += m[0].length; continue;
      }
      if ('+-*/^(),'.includes(c)) {
        if (c === '*' && s[i + 1] === '*') { tokens.push({ t: 'op', v: '^' }); i += 2; continue; }
        tokens.push({ t: 'op', v: c }); i++; continue;
      }
      throw new Error('Geçersiz karakter: "' + c + '"');
    }
    return tokens;
  }

  // Özyinelemeli iniş ayrıştırıcı -> AST derlenmiş JS closure'larına dönüşür
  function compileExpr(str) {
    const tk = tokenize(str);
    let p = 0;
    const peek = () => tk[p];
    const eat = (v) => {
      const t = tk[p];
      if (!t || (v !== undefined && t.v !== v)) throw new Error('Beklenen "' + v + '"');
      p++; return t;
    };
    function expr() {
      let f = term();
      while (peek() && (peek().v === '+' || peek().v === '-')) {
        const op = eat().v, a = f, b = term();
        f = op === '+' ? (T) => a(T) + b(T) : (T) => a(T) - b(T);
      }
      return f;
    }
    function term() {
      let f = unary();
      while (peek() && (peek().v === '*' || peek().v === '/')) {
        const op = eat().v, a = f, b = unary();
        f = op === '*' ? (T) => a(T) * b(T) : (T) => a(T) / b(T);
      }
      return f;
    }
    function unary() {
      if (peek() && peek().v === '-') { eat(); const a = unary(); return (T) => -a(T); }
      if (peek() && peek().v === '+') { eat(); return unary(); }
      return power();
    }
    function power() {
      const base = primary();
      if (peek() && peek().v === '^') { eat(); const ex = unary(); return (T) => Math.pow(base(T), ex(T)); }
      return base;
    }
    function primary() {
      const t = peek();
      if (!t) throw new Error('Beklenmeyen ifade sonu');
      if (t.t === 'num') { eat(); const v = t.v; return () => v; }
      if (t.t === 'id') {
        eat();
        if (t.v === 'T' || t.v === 't') return (T) => T;
        const fn = FUNCS[t.v.toLowerCase()];
        if (!fn) throw new Error('Bilinmeyen tanımlayıcı: ' + t.v);
        eat('(');
        const args = [expr()];
        while (peek() && peek().v === ',') { eat(','); args.push(expr()); }
        eat(')');
        return (T) => fn.apply(null, args.map((a) => a(T)));
      }
      if (t.v === '(') { eat('('); const e = expr(); eat(')'); return e; }
      throw new Error('Beklenmeyen simge: ' + t.v);
    }
    const f = expr();
    if (p !== tk.length) throw new Error('Fazla simge: ' + tk[p].v);
    return f;
  }

  /**
   * Özellik denklemini derler.
   * - "a0; a1; a2; a3" (veya boşluk / | ayraçlı) -> polinom a0 + a1 T + a2 T² + a3 T³ (+ ...)
   * - "4180" -> sabit
   * - T içeren ifade -> güvenli ayrıştırıcı
   */
  function parseEquation(str) {
    if (str === undefined || str === null) return null;
    if (typeof str === 'number') { const v = str; return () => v; }
    const s = String(str).trim();
    if (!s) return null;
    const parts = s.split(/[;|]|\s+(?=[-+]?[\d.])/).map((x) => x.trim()).filter(Boolean);
    const numRe = /^[-+]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
    if (parts.length && parts.every((x) => numRe.test(x))) {
      const c = parts.map(Number);
      return (T) => { let r = 0; for (let i = c.length - 1; i >= 0; i--) r = r * T + c[i]; return r; };
    }
    return compileExpr(s);
  }

  /* ------------------------------------------------------------------
   * 2. Akışkan özellikleri
   * ------------------------------------------------------------------ */
  const PROPS = [
    { key: 'cp', eq: 'Cp_Eq', log: false },
    { key: 'rho', eq: 'Density_Eq', log: false },
    { key: 'mu', eq: 'Viscosity_Eq', log: true },
    { key: 'k', eq: 'k_Eq', log: false }
  ];

  /**
   * Tablo enterpolasyonu. Doğrusal (log=true ise ln(y) üzerinde doğrusal -> viskozite).
   * Tablo dışında uç segmentlerle doğrusal ekstrapolasyon yapılır.
   */
  function tableInterpolator(Ts, ys, log) {
    const pts = Ts.map((t, i) => [t, ys[i]]).filter(([t, y]) => isFinite(t) && isFinite(y) && (!log || y > 0)).sort((a, b) => a[0] - b[0]);
    if (!pts.length) return null;
    const X = pts.map((p) => p[0]), Y = pts.map((p) => (log ? Math.log(p[1]) : p[1]));
    if (X.length === 1) { const v = pts[0][1]; return () => v; }
    return (T) => {
      let i = 0;
      if (T <= X[0]) i = 0;
      else if (T >= X[X.length - 1]) i = X.length - 2;
      else { let lo = 0, hi = X.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= T) lo = m; else hi = m; } i = lo; }
      const t = (T - X[i]) / (X[i + 1] - X[i]);
      const y = Y[i] + t * (Y[i + 1] - Y[i]);
      return log ? Math.exp(y) : y;
    };
  }

  const _fluidCache = new Map();
  /**
   * Akışkan modeli. f.source === 'table' ise f.table = {T:[], cp:[], rho:[], mu:[], k:[]} verisinden
   * enterpolasyon; aksi halde *_Eq denklemleri. Tabloda eksik özellik varsa denkleme düşülür.
   */
  function fluidModel(f) {
    if (!f) throw new Error('Akışkan tanımlı değil');
    const useTable = f.source === 'table' && f.table && Array.isArray(f.table.T);
    const key = JSON.stringify([f.name, f.T_unit, f.source, useTable ? f.table : null, f.Cp_Eq, f.Density_Eq, f.Viscosity_Eq, f.k_Eq]);
    if (_fluidCache.has(key)) return _fluidCache.get(key);
    const toVar = (TK) => (String(f.T_unit || 'C').toUpperCase() === 'K' ? TK : TK - 273.15);
    const fn = {};
    for (const p of PROPS) {
      fn[p.key] = (useTable && Array.isArray(f.table[p.key]) ? tableInterpolator(f.table.T, f.table[p.key], p.log) : null) || parseEquation(f[p.eq]);
    }
    const m = {
      name: f.name,
      source: useTable ? 'table' : 'equation',
      range: useTable ? [Math.min(...f.table.T), Math.max(...f.table.T)] : (f.T_range || null),
      cp: (TK) => { if (!fn.cp) throw new Error(f.name + ': c_p tanımsız'); return fn.cp(toVar(TK)); },
      rho: (TK) => (fn.rho ? fn.rho(toVar(TK)) : NaN),
      mu: (TK) => (fn.mu ? fn.mu(toVar(TK)) : NaN),
      k: (TK) => (fn.k ? fn.k(toVar(TK)) : NaN)
    };
    // Sıcaklık geçerlilik aralığında mı? (T_unit cinsinden aralık)
    m.inRange = (TK) => !m.range || (toVar(TK) >= m.range[0] - 1e-9 && toVar(TK) <= m.range[1] + 1e-9);
    m.Pr = (TK) => m.cp(TK) * m.mu(TK) / m.k(TK);
    _fluidCache.set(key, m);
    return m;
  }

  /* ------------------------------------------------------------------
   * 2b. Özellik tablosu içe aktarma ve polinom uydurma
   * ------------------------------------------------------------------ */
  // Başlıktan sütun türü ve birim çarpanı algıla
  function classifyHeader(h) {
    const s = String(h || '').trim();
    const low = s.toLowerCase();
    const unit = ((/[\[(]\s*([^\])]+?)\s*[\])]/.exec(s) || [])[1] || '').replace(/\s/g, '').toLowerCase();
    if (/^(t|temp|temperature|sıcaklık|sicaklik)\b/i.test(s) || /^t\s*[\[(]/i.test(s)) {
      return { prop: 'T', unit: /^k$/.test(unit) ? 'K' : /f/.test(unit) ? 'F' : 'C' };
    }
    if (/ρ|rho|dens|yoğun|yogun/.test(low)) return { prop: 'rho', mult: /g\/cm/.test(unit) ? 1000 : 1 };
    if (/^c_?p|cp\b|özgül|specific/.test(low)) return { prop: 'cp', mult: /^kj/.test(unit) ? 1000 : 1 };
    if (/μ|mu\b|^mu|visc|viskoz|^η/.test(low)) return { prop: 'mu', mult: /mpa|cp$|^cp|centipoise/.test(unit) ? 1e-3 : 1 };
    if (/^k\b|^k\s*[\[(]|^λ|lambda|cond|iletken/.test(low)) return { prop: 'k', mult: /^mw/.test(unit) ? 1e-3 : 1 };
    return null;
  }

  /**
   * headers + rows (dizi veya nesne satırları) -> {T:[°C], cp:[], rho:[], mu:[], k:[]}
   */
  function parsePropertyTable(headers, rows) {
    const cls = headers.map(classifyHeader);
    const iT = cls.findIndex((c) => c && c.prop === 'T');
    if (iT < 0) throw new Error('Sıcaklık sütunu bulunamadı (başlık "T [°C]" gibi olmalı)');
    const tbl = { T: [] };
    const used = {};
    cls.forEach((c, i) => { if (c && c.prop !== 'T' && used[c.prop] === undefined) { used[c.prop] = i; tbl[c.prop] = []; } });
    if (tbl.cp === undefined) throw new Error('c_p sütunu bulunamadı');
    const toNum = (v) => { if (typeof v === 'number') return v; const x = Number(String(v == null ? '' : v).trim().replace(',', '.')); return String(v == null ? '' : v).trim() === '' ? NaN : x; };
    for (const r of rows) {
      const get = (i) => toNum(Array.isArray(r) ? r[i] : r[headers[i]]);
      let T = get(iT);
      if (!isFinite(T)) continue;
      if (cls[iT].unit === 'K') T -= 273.15; else if (cls[iT].unit === 'F') T = (T - 32) * 5 / 9;
      tbl.T.push(+T.toFixed(6));
      for (const [p, i] of Object.entries(used)) { const v = get(i); tbl[p].push(isFinite(v) ? v * cls[i].mult : null); }
    }
    if (tbl.T.length < 2) throw new Error('Tabloda en az 2 geçerli sıcaklık satırı olmalı');
    // Sıcaklığa göre sırala
    const order = tbl.T.map((_, i) => i).sort((a, b) => tbl.T[a] - tbl.T[b]);
    for (const k of Object.keys(tbl)) tbl[k] = order.map((i) => tbl[k][i]);
    return tbl;
  }

  // En küçük kareler polinomu (ölçekli değişkenle, iyi koşullanma için)
  function polyfit(xs, ys, deg) {
    const n = xs.length;
    deg = Math.min(deg, n - 1);
    const sc = Math.max(1, ...xs.map(Math.abs));
    const X = xs.map((x) => Array.from({ length: deg + 1 }, (_, j) => Math.pow(x / sc, j)));
    const c = solveLinearLS(X, ys);
    if (!c) return null;
    return c.map((v, j) => v / Math.pow(sc, j));
  }
  const fmtCoef = (v) => Number(v.toPrecision(6)).toString();

  /**
   * Tabloyu denklemlere dönüştür: cp, ρ, k -> 3. derece polinom; μ -> exp(3. derece polinom).
   * Dönüş: {Cp_Eq, Density_Eq, Viscosity_Eq, k_Eq, errors:{cp:%max,...}}
   */
  function fitTableToEquations(tbl) {
    const out = { errors: {} };
    for (const p of PROPS) {
      const arr = tbl[p.key];
      if (!Array.isArray(arr)) continue;
      const xs = [], ys = [];
      arr.forEach((y, i) => { if (y != null && isFinite(y) && (!p.log || y > 0)) { xs.push(tbl.T[i]); ys.push(p.log ? Math.log(y) : y); } });
      if (xs.length < 2) continue;
      const c = polyfit(xs, ys, 3);
      if (!c) continue;
      const eq = p.log
        ? 'exp(' + c.map((v, j) => (j === 0 ? fmtCoef(v) : '(' + fmtCoef(v) + ')*T' + (j > 1 ? '^' + j : ''))).join(' + ') + ')'
        : c.map(fmtCoef).join('; ');
      out[p.eq] = eq;
      const f = parseEquation(eq);
      out.errors[p.key] = Math.max(...xs.map((x, i) => { const y = p.log ? Math.exp(ys[i]) : ys[i]; return Math.abs((f(x) - y) / y) * 100; }));
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * 3. Birim dönüşümü (-> SI)
   * ------------------------------------------------------------------ */
  const UNITS = {
    flow: ['kg/s', 'kg/h', 'L/min', 'g/s'],
    temp: ['°C', 'K', '°F'],
    dp: ['Pa', 'kPa', 'mbar'],
    eps: ['-', '%']
  };
  function toKelvin(v, u) {
    if (u === 'K') return v;
    if (u === '°F') return (v - 32) * 5 / 9 + 273.15;
    return v + 273.15;
  }
  function fromKelvin(v, u) {
    if (u === 'K') return v;
    if (u === '°F') return (v - 273.15) * 9 / 5 + 32;
    return v - 273.15;
  }
  // L/min için yoğunluk gerekir (giriş sıcaklığında akışkan yoğunluğu)
  function toKgPerS(v, u, rho) {
    switch (u) {
      case 'kg/h': return v / 3600;
      case 'g/s': return v / 1000;
      case 'L/min': return v / 60000 * rho;
      default: return v;
    }
  }
  function toPa(v, u) {
    if (u === 'kPa') return v * 1000;
    if (u === 'mbar') return v * 100;
    return v;
  }

  /* ------------------------------------------------------------------
   * 4. ε-NTU (çapraz akış, her iki akışkan karışmamış)
   * ------------------------------------------------------------------ */
  function epsCrossflow(NTU, Cr) {
    if (!(NTU > 0)) return 0;
    if (Cr < 1e-6) return 1 - Math.exp(-NTU);
    return 1 - Math.exp((1 / Cr) * Math.pow(NTU, 0.22) * (Math.exp(-Cr * Math.pow(NTU, 0.78)) - 1));
  }
  const NTU_MAX = 50;
  function ntuFromEps(eps, Cr) {
    if (!(eps > 0)) return NaN;
    if (eps >= epsCrossflow(NTU_MAX, Cr)) return NaN;
    let lo = 0, hi = NTU_MAX;
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (epsCrossflow(mid, Cr) < eps) lo = mid; else hi = mid;
      if (hi - lo < 1e-12) break;
    }
    return 0.5 * (lo + hi);
  }

  /* ------------------------------------------------------------------
   * 5. Kanatçık verimi
   *    η_f = tanh(m L)/(m L),  m = sqrt(2h/(k t)),  η_o = 1 - (A_f/A)(1-η_f)
   * ------------------------------------------------------------------ */
  function finEfficiency(h, side) {
    if (!side || !side.finsOn || !(h > 0)) return 1;
    const mf = Math.sqrt(2 * h / (side.k_fin * side.tf));
    const mL = mf * side.Lf;
    return mL < 1e-9 ? 1 : Math.tanh(mL) / mL;
  }
  function surfaceEfficiency(h, side) {
    if (!side || !side.finsOn) return 1;
    return 1 - side.AfRatio * (1 - finEfficiency(h, side));
  }
  // Bir taraftaki ısıl direnç 1/(η_o h A)
  function sideResistance(h, side) {
    return 1 / (surfaceEfficiency(h, side) * h * side.A);
  }
  // Verilen direnç R için h'yi çöz: η_o(h)·h·A = 1/R (sabit nokta / bisection)
  function hFromResistance(R, side) {
    if (!(R > 0)) return NaN;
    const target = 1 / (R * side.A);
    if (!side.finsOn) return target;
    // η_o(h)·h monoton artan -> bisection
    let lo = 0, hi = target * 2;
    let g = (h) => surfaceEfficiency(h, side) * h - target;
    let guard = 0;
    while (g(hi) < 0 && guard++ < 60) hi *= 2;
    if (g(hi) < 0) return NaN;
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (g(mid) < 0) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  /* ------------------------------------------------------------------
   * 6. İstatistik yardımcıları
   * ------------------------------------------------------------------ */
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  function stdev(a) {
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, a.length - 1));
  }
  const cv = (a) => (a.length > 1 ? stdev(a) / Math.abs(mean(a)) * 100 : 0);
  function metrics(meas, pred) {
    const pairs = meas.map((y, i) => [y, pred[i]]).filter(([y, p]) => isFinite(y) && isFinite(p));
    if (!pairs.length) return { R2: NaN, RMSE: NaN, MAPE: NaN, n: 0 };
    const ys = pairs.map((p) => p[0]);
    const ym = mean(ys);
    let ssr = 0, sst = 0, ape = 0, nape = 0;
    for (const [y, p] of pairs) {
      ssr += (y - p) ** 2; sst += (y - ym) ** 2;
      if (Math.abs(y) > 1e-12) { ape += Math.abs((y - p) / y); nape++; }
    }
    return {
      R2: sst > 0 ? 1 - ssr / sst : NaN,
      RMSE: Math.sqrt(ssr / pairs.length),
      MAPE: nape ? ape / nape * 100 : NaN,
      n: pairs.length
    };
  }

  /* ------------------------------------------------------------------
   * 7. Test noktası işleme (ısı dengesi, ε, NTU, UA)
   *    raw: {m1,m2 [kg/s], T1in,T1out,T2in,T2out [K], eps [-], dp1,dp2 [Pa]}
   * ------------------------------------------------------------------ */
  function processPoint(raw, fl1, fl2, opts) {
    opts = opts || {};
    const r = Object.assign({}, raw);
    const has = (v) => typeof v === 'number' && isFinite(v);
    r.valid = has(r.m1) && has(r.m2) && has(r.T1in) && has(r.T2in) && r.m1 > 0 && r.m2 > 0;
    if (!r.valid) { r.reason = 'Eksik/geçersiz debi veya giriş sıcaklığı'; return r; }
    const dTin = r.T1in - r.T2in;
    if (Math.abs(dTin) < 1e-6) { r.valid = false; r.reason = 'T1,in = T2,in'; return r; }
    const sgn = Math.sign(dTin); // +1: akışkan 1 sıcak taraf

    let T1o = has(r.T1out) ? r.T1out : NaN, T2o = has(r.T2out) ? r.T2out : NaN;
    const useEpsCol = opts.epsSource === 'column' && has(r.eps);
    let cp1, cp2, Q1, Q2, Q, C1, C2, Cmin, Cmax, Qmax, eps;
    // cp ortalama sıcaklığa bağlı -> çıkış sıcaklığı bilinmiyorsa iteratif
    let T1m = has(T1o) ? (r.T1in + T1o) / 2 : r.T1in;
    let T2m = has(T2o) ? (r.T2in + T2o) / 2 : r.T2in;
    for (let it = 0; it < 6; it++) {
      cp1 = fl1.cp(T1m); cp2 = fl2.cp(T2m);
      C1 = r.m1 * cp1; C2 = r.m2 * cp2;
      Cmin = Math.min(C1, C2); Cmax = Math.max(C1, C2);
      Qmax = Cmin * Math.abs(dTin);
      Q1 = has(r.T1out) ? C1 * Math.abs(r.T1in - r.T1out) : NaN;
      Q2 = has(r.T2out) ? C2 * Math.abs(r.T2in - r.T2out) : NaN;
      if (useEpsCol) Q = r.eps * Qmax;
      else if (has(Q1) && has(Q2)) Q = (Q1 + Q2) / 2;
      else if (has(Q1)) Q = Q1;
      else if (has(Q2)) Q = Q2;
      else if (has(r.eps)) Q = r.eps * Qmax;
      else { r.valid = false; r.reason = 'Çıkış sıcaklığı veya ε yok'; return r; }
      // Eksik çıkış sıcaklıklarını enerji dengesinden tahmin et
      if (!has(r.T1out)) T1o = r.T1in - sgn * Q / C1;
      if (!has(r.T2out)) T2o = r.T2in + sgn * Q / C2;
      const n1 = (r.T1in + T1o) / 2, n2 = (r.T2in + T2o) / 2;
      if (Math.abs(n1 - T1m) < 1e-4 && Math.abs(n2 - T2m) < 1e-4) break;
      T1m = n1; T2m = n2;
    }
    eps = Q / Qmax;
    const Cr = Cmin / Cmax;
    r.cp1 = cp1; r.cp2 = cp2; r.T1m = T1m; r.T2m = T2m;
    r.T1out_c = T1o; r.T2out_c = T2o;
    r.C1 = C1; r.C2 = C2; r.Cmin = Cmin; r.Cmax = Cmax; r.Cr = Cr;
    r.Q1 = Q1; r.Q2 = Q2; r.Q = Q; r.Qmax = Qmax; r.eps_exp = eps;
    r.sign = sgn;
    r.hbErr = has(Q1) && has(Q2) ? Math.abs(Q1 - Q2) / ((Q1 + Q2) / 2) * 100 : NaN;
    r.NTU = ntuFromEps(eps, Cr);
    r.UA = r.NTU * Cmin;
    if (!(r.UA > 0)) { r.valid = false; r.reason = 'ε fiziksel sınırların dışında (ε ≥ ε_max veya ≤ 0)'; }
    return r;
  }

  /* ------------------------------------------------------------------
   * 8. Wilson Plot fit'i
   *    1/UA = 1/(η_o1 C1 m1^n1 A1) + R_w + 1/(η_o2 C2 m2^n2 A2)
   *    Verilen (n1, n2) için model 1/C1, 1/C2'de doğrusaldır (η_o sabit tutulduğunda);
   *    η_o ardışık yerine koyma ile güncellenir. Üsler ızgara + yerel incelterek taranır.
   * ------------------------------------------------------------------ */
  function solveLinearLS(X, y, w) {
    // Ağırlıklı en küçük kareler, küçük boyutlu (Gauss eleme)
    const k = X[0].length;
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const b = new Array(k).fill(0);
    for (let i = 0; i < y.length; i++) {
      const wi = w ? w[i] : 1;
      for (let a = 0; a < k; a++) {
        b[a] += wi * X[i][a] * y[i];
        for (let c = 0; c < k; c++) A[a][c] += wi * X[i][a] * X[i][c];
      }
    }
    for (let i = 0; i < k; i++) {
      let piv = i;
      for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
      if (Math.abs(A[i][i]) < 1e-300) return null;
      for (let r = i + 1; r < k; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < k; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(k).fill(0);
    for (let i = k - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < k; c++) s -= A[i][c] * x[c];
      x[i] = s / A[i][i];
    }
    return x;
  }

  // Doğrusal model katsayılarını pozitif tut (NNLS-lite: negatifse o terimi çıkarıp yeniden çöz)
  function solvePositive(X, y, w) {
    let active = X[0].map((_, j) => j);
    for (let pass = 0; pass < X[0].length; pass++) {
      const Xa = X.map((row) => active.map((j) => row[j]));
      const sol = solveLinearLS(Xa, y, w);
      if (!sol) return null;
      const neg = sol.findIndex((v) => v <= 0);
      if (neg < 0) {
        const full = new Array(X[0].length).fill(1e-12);
        active.forEach((j, i) => { full[j] = sol[i]; });
        return full;
      }
      active = active.filter((_, i) => i !== neg);
      if (!active.length) return null;
    }
    return null;
  }

  /**
   * pts: işlenmiş noktalar (valid, dahil); geom: {side1, side2, Rw}; o: ayarlar
   * Dönüş: {mode, C1, n1, C2, n2, Rw, ...}
   */
  function fitWilson(pts, geom, o) {
    o = Object.assign({ nMin: 0.3, nMax: 0.8, cvThreshold: 2, assumedN: 0.6 }, o || {});
    const s1 = geom.side1, s2 = geom.side2, Rw = geom.Rw || 0;
    if (pts.length < 3) throw new Error('Fit için en az 3 geçerli nokta gerekir (mevcut: ' + pts.length + ')');
    const m1 = pts.map((p) => p.m1), m2 = pts.map((p) => p.m2);
    const cv1 = cv(m1), cv2 = cv(m2);
    let mode;
    if (cv1 < o.cvThreshold && cv2 < o.cvThreshold) throw new Error('Her iki debi de sabit (CV < %' + o.cvThreshold + '); Wilson analizi için en az bir debi değişmelidir.');
    else if (cv2 < o.cvThreshold) mode = '1D-m1';
    else if (cv1 < o.cvThreshold) mode = '1D-m2';
    else mode = '2D';
    const yUA = pts.map((p) => 1 / p.UA - Rw);
    const w = yUA.map((y) => 1 / (y * y)); // göreli hata ağırlığı

    // --- 2D: hem n1 hem n2 serbest
    function eval2D(n1, n2) {
      let eta1 = pts.map(() => 1), eta2 = pts.map(() => 1), sol = null;
      for (let it = 0; it < 25; it++) {
        const X = pts.map((p, i) => [1 / (eta1[i] * s1.A * Math.pow(p.m1, n1)), 1 / (eta2[i] * s2.A * Math.pow(p.m2, n2))]);
        sol = solvePositive(X, yUA, w);
        if (!sol) return null;
        const C1 = 1 / sol[0], C2 = 1 / sol[1];
        const e1 = pts.map((p) => surfaceEfficiency(C1 * Math.pow(p.m1, n1), s1));
        const e2 = pts.map((p) => surfaceEfficiency(C2 * Math.pow(p.m2, n2), s2));
        const diff = Math.max(...e1.map((v, i) => Math.abs(v - eta1[i])), ...e2.map((v, i) => Math.abs(v - eta2[i])));
        eta1 = e1; eta2 = e2;
        if (diff < 1e-7 || !(s1.finsOn || s2.finsOn)) break;
      }
      const C1 = 1 / sol[0], C2 = 1 / sol[1];
      let sse = 0;
      pts.forEach((p, i) => {
        const pred = sideResistance(C1 * Math.pow(p.m1, n1), s1) + sideResistance(C2 * Math.pow(p.m2, n2), s2);
        sse += ((pred - yUA[i]) / yUA[i]) ** 2;
      });
      return { n1, n2, C1, C2, sse };
    }

    // --- 1D: değişken taraf üssü serbest, sabit tarafın direnci tek sabit
    function eval1D(nv, varSide) {
      const sv = varSide === 1 ? s1 : s2;
      const mv = varSide === 1 ? m1 : m2;
      let eta = pts.map(() => 1), sol = null;
      for (let it = 0; it < 25; it++) {
        const X = pts.map((p, i) => [1 / (eta[i] * sv.A * Math.pow(mv[i], nv)), 1]);
        sol = solvePositive(X, yUA, w);
        if (!sol) return null;
        const Cv = 1 / sol[0];
        const e = mv.map((m) => surfaceEfficiency(Cv * Math.pow(m, nv), sv));
        const diff = Math.max(...e.map((v, i) => Math.abs(v - eta[i])));
        eta = e;
        if (diff < 1e-7 || !sv.finsOn) break;
      }
      const Cv = 1 / sol[0], Rconst = sol[1];
      let sse = 0;
      pts.forEach((p, i) => {
        const pred = sideResistance(Cv * Math.pow(mv[i], nv), sv) + Rconst;
        sse += ((pred - yUA[i]) / yUA[i]) ** 2;
      });
      return { nv, Cv, Rconst, sse };
    }

    const grid = (lo, hi, step) => { const a = []; for (let v = lo; v <= hi + 1e-9; v += step) a.push(+v.toFixed(6)); return a; };
    const clamp = (v) => Math.min(o.nMax, Math.max(o.nMin, v));
    let res;
    if (mode === '2D') {
      let best = null;
      for (const a of grid(o.nMin, o.nMax, 0.02)) for (const b of grid(o.nMin, o.nMax, 0.02)) {
        const r = eval2D(a, b); if (r && (!best || r.sse < best.sse)) best = r;
      }
      if (!best) throw new Error('Wilson fit yakınsamadı');
      for (const step of [0.005, 0.001]) {
        const c1 = best.n1, c2 = best.n2;
        for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
          const r = eval2D(clamp(c1 + i * step), clamp(c2 + j * step));
          if (r && r.sse < best.sse) best = r;
        }
      }
      res = { mode, C1: best.C1, n1: best.n1, C2: best.C2, n2: best.n2, sse: best.sse };
    } else {
      const varSide = mode === '1D-m1' ? 1 : 2;
      let best = null;
      for (const a of grid(o.nMin, o.nMax, 0.01)) { const r = eval1D(a, varSide); if (r && (!best || r.sse < best.sse)) best = r; }
      if (!best) throw new Error('Wilson fit yakınsamadı');
      for (const step of [0.002, 0.0005]) {
        const c = best.nv;
        for (let i = -5; i <= 5; i++) { const r = eval1D(clamp(c + i * step), varSide); if (r && r.sse < best.sse) best = r; }
      }
      // Sabit taraf: R_const = 1/(η_o h A)_sabit  ->  h_sabit, varsayılan üs ile C
      const sc = varSide === 1 ? s2 : s1;
      const mc = mean(varSide === 1 ? m2 : m1);
      const hc = hFromResistance(best.Rconst, sc);
      const nc = o.assumedN;
      const Cc = hc / Math.pow(mc, nc);
      res = { mode, sse: best.sse, Rconst: best.Rconst, mConstMean: mc, hConst: hc };
      if (varSide === 1) Object.assign(res, { C1: best.Cv, n1: best.nv, C2: Cc, n2: nc });
      else Object.assign(res, { C2: best.Cv, n2: best.nv, C1: Cc, n1: nc });
      if (!(hc > 0) || best.Rconst <= 1e-11) res.warning = 'Sabit tarafın direnci ≈ 0 bulundu; R_w veya veri kalitesini kontrol edin.';
    }
    res.Rw = Rw; res.cv1 = cv1; res.cv2 = cv2;
    if ([res.n1, res.n2].some((n) => Math.abs(n - o.nMin) < 1e-6 || Math.abs(n - o.nMax) < 1e-6) && mode === '2D') {
      res.warning = (res.warning ? res.warning + ' ' : '') + 'Üslerden biri sınırda (' + o.nMin + '–' + o.nMax + '); veri aralığı yetersiz olabilir.';
    }
    return res;
  }

  // Model UA (verilen debilerde)
  function modelUA(fit, geom, m1, m2) {
    const h1 = fit.C1 * Math.pow(m1, fit.n1), h2 = fit.C2 * Math.pow(m2, fit.n2);
    const R1 = sideResistance(h1, geom.side1), R2 = sideResistance(h2, geom.side2);
    return { UA: 1 / (R1 + (geom.Rw || 0) + R2), h1, h2, R1, R2,
      eta1: surfaceEfficiency(h1, geom.side1), eta2: surfaceEfficiency(h2, geom.side2) };
  }

  /* ------------------------------------------------------------------
   * 9. Basınç düşümü: ΔP = K_p · ṁ^n_p  (log-log regresyon, n_p sınırlı)
   * ------------------------------------------------------------------ */
  function fitPressure(m, dp, o) {
    o = Object.assign({ npMin: 1.5, npMax: 2.0 }, o || {});
    const pr = m.map((x, i) => [x, dp[i]]).filter(([x, y]) => x > 0 && y > 0 && isFinite(x) && isFinite(y));
    if (pr.length < 2) return null;
    const X = pr.map(([x]) => Math.log(x)), Y = pr.map(([, y]) => Math.log(y));
    const xm = mean(X), ym = mean(Y);
    let sxy = 0, sxx = 0;
    X.forEach((x, i) => { sxy += (x - xm) * (Y[i] - ym); sxx += (x - xm) ** 2; });
    let np_ = sxx > 1e-12 ? sxy / sxx : 1.8;
    let clamped = false;
    if (np_ < o.npMin || np_ > o.npMax || sxx <= 1e-12) { np_ = Math.min(o.npMax, Math.max(o.npMin, np_)); clamped = true; }
    const lnK = mean(Y.map((y, i) => y - np_ * X[i]));
    return { Kp: Math.exp(lnK), np: np_, clamped, n: pr.length };
  }

  /* ------------------------------------------------------------------
   * 10. Performans tahmini (Rating)
   *     m1, m2 [kg/s], T1in, T2in [K] -> ε, Q, T1out, T2out, ΔP
   * ------------------------------------------------------------------ */
  function rate(inp, fit, geom, fl1, fl2, dpFit1, dpFit2) {
    const { m1, m2, T1in, T2in } = inp;
    const sgn = Math.sign(T1in - T2in) || 1;
    const um = modelUA(fit, geom, m1, m2);
    let T1o = T1in, T2o = T2in, out;
    for (let it = 0; it < 50; it++) {
      const T1m = (T1in + T1o) / 2, T2m = (T2in + T2o) / 2;
      const cp1 = fl1.cp(T1m), cp2 = fl2.cp(T2m);
      const C1 = m1 * cp1, C2 = m2 * cp2;
      const Cmin = Math.min(C1, C2), Cmax = Math.max(C1, C2), Cr = Cmin / Cmax;
      const NTU = um.UA / Cmin;
      const eps = epsCrossflow(NTU, Cr);
      const Q = eps * Cmin * Math.abs(T1in - T2in);
      const n1 = T1in - sgn * Q / C1, n2 = T2in + sgn * Q / C2;
      out = { eps, Q, NTU, Cr, Cmin, Cmax, C1, C2, cp1, cp2, T1out: n1, T2out: n2, T1m, T2m };
      if (Math.abs(n1 - T1o) < 1e-6 && Math.abs(n2 - T2o) < 1e-6) break;
      T1o = n1; T2o = n2;
    }
    Object.assign(out, um);
    out.dp1 = dpFit1 ? dpFit1.Kp * Math.pow(m1, dpFit1.np) : NaN;
    out.dp2 = dpFit2 ? dpFit2.Kp * Math.pow(m2, dpFit2.np) : NaN;
    return out;
  }

  /* ------------------------------------------------------------------
   * 11. Tam analiz hattı
   * ------------------------------------------------------------------ */
  function analyze(rawPts, fl1, fl2, geom, settings) {
    settings = Object.assign({ hbThreshold: 5, excludeHB: true, epsSource: 'temps', cvThreshold: 2,
      nMin: 0.3, nMax: 0.8, npMin: 1.5, npMax: 2.0, assumedN: 0.6 }, settings || {});
    const pts = rawPts.map((p) => {
      const r = processPoint(p, fl1, fl2, settings);
      r.hbFlag = isFinite(r.hbErr) && r.hbErr > settings.hbThreshold;
      r.included = r.valid && !p.manualExclude && !(settings.excludeHB && r.hbFlag);
      return r;
    });
    const used = pts.filter((p) => p.included);
    if (used.length < 3) {
      const nInv = pts.filter((p) => !p.valid).length, nHB = pts.filter((p) => p.valid && p.hbFlag).length;
      throw new Error('Fit için en az 3 geçerli nokta gerekir (kullanılabilir: ' + used.length + ' / ' + pts.length +
        '; geçersiz: ' + nInv + ', ısı dengesi eşiğini aşan: ' + nHB + '). Eşlemeyi, birimleri ve akışkan seçimini kontrol edin.');
    }
    const fit = fitWilson(used, geom, settings);
    pts.forEach((p) => {
      if (!p.valid) return;
      const um = modelUA(fit, geom, p.m1, p.m2);
      p.UA_pred = um.UA;
      p.h1 = um.h1; p.h2 = um.h2; p.eta1 = um.eta1; p.eta2 = um.eta2; p.R1 = um.R1; p.R2 = um.R2;
      p.eps_pred = epsCrossflow(um.UA / p.Cmin, p.Cr);
      p.Q_pred = p.eps_pred * p.Qmax;
    });
    const dpO = { npMin: settings.npMin, npMax: settings.npMax };
    const dpFit1 = fitPressure(used.map((p) => p.m1), used.map((p) => p.dp1), dpO);
    const dpFit2 = fitPressure(used.map((p) => p.m2), used.map((p) => p.dp2), dpO);
    pts.forEach((p) => {
      if (!p.valid) return;
      p.dp1_pred = dpFit1 ? dpFit1.Kp * Math.pow(p.m1, dpFit1.np) : NaN;
      p.dp2_pred = dpFit2 ? dpFit2.Kp * Math.pow(p.m2, dpFit2.np) : NaN;
    });
    const u = pts.filter((p) => p.included);
    const stats = {
      eps: metrics(u.map((p) => p.eps_exp), u.map((p) => p.eps_pred)),
      UA: metrics(u.map((p) => p.UA), u.map((p) => p.UA_pred)),
      Q: metrics(u.map((p) => p.Q), u.map((p) => p.Q_pred)),
      dp1: metrics(u.map((p) => p.dp1), u.map((p) => p.dp1_pred)),
      dp2: metrics(u.map((p) => p.dp2), u.map((p) => p.dp2_pred))
    };
    return { pts, fit, dpFit1, dpFit2, stats, nUsed: u.length, nTotal: pts.length,
      nHB: pts.filter((p) => p.hbFlag).length, nInvalid: pts.filter((p) => !p.valid).length };
  }

  /* ------------------------------------------------------------------
   * 12. Demo veri üretici (bilinen parametrelerle sentetik test verisi)
   * ------------------------------------------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const DEMO_TRUTH = { C1: 6000, n1: 0.55, C2: 115, n2: 0.50, Kp1: 12000, np1: 1.80, Kp2: 180, np2: 1.90 };
  const DEMO_GEOM = {
    side1: { A: 0.8, finsOn: true, AfRatio: 0.6, Lf: 0.003, tf: 0.0002, k_fin: 193, material: 'Aluminum 3003' },
    side2: { A: 4.5, finsOn: true, AfRatio: 0.85, Lf: 0.004, tf: 0.0001, k_fin: 193, material: 'Aluminum 3003' },
    Rw: 1e-5
  };
  function generateDemo(fl1, fl2) {
    const rnd = mulberry32(20261012);
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const fit = { C1: DEMO_TRUTH.C1, n1: DEMO_TRUTH.n1, C2: DEMO_TRUTH.C2, n2: DEMO_TRUTH.n2 };
    const rows = [];
    const m1s = [0.10, 0.20, 0.30, 0.45, 0.60];
    const m2s = [0.20, 0.35, 0.50, 0.70, 0.95, 1.20];
    let id = 1;
    const make = (m1, m2, hbBias) => {
      const T1in = 273.15 + 80 + gauss() * 0.3, T2in = 273.15 + 25 + gauss() * 0.3;
      const r = rate({ m1, m2, T1in, T2in }, fit, DEMO_GEOM, fl1, fl2, null, null);
      const dp1 = DEMO_TRUTH.Kp1 * Math.pow(m1, DEMO_TRUTH.np1) * (1 + 0.015 * gauss());
      const dp2 = DEMO_TRUTH.Kp2 * Math.pow(m2, DEMO_TRUTH.np2) * (1 + 0.015 * gauss());
      let T1o = r.T1out + gauss() * 0.08, T2o = r.T2out + gauss() * 0.08;
      if (hbBias) T2o = T2in + (T2o - T2in) * (1 + hbBias); // sensör hatası -> ısı dengesi bozuk
      const m1m = m1 * (1 + 0.004 * gauss()), m2m = m2 * (1 + 0.004 * gauss());
      rows.push({
        'Test_ID': 'T' + String(id++).padStart(2, '0'),
        'Hava T_cikis [C]': +(T2o - 273.15).toFixed(2),
        'Su Debisi [kg/h]': +(m1m * 3600).toFixed(1),
        'Hava dP [mbar]': +(dp2 / 100).toFixed(3),
        'Su T_giris [C]': +(T1in - 273.15).toFixed(2),
        'Hava Debisi [kg/s]': +m2m.toFixed(4),
        'Su T_cikis [C]': +(T1o - 273.15).toFixed(2),
        'Hava T_giris [C]': +(T2in - 273.15).toFixed(2),
        'Su dP [kPa]': +(dp1 / 1000).toFixed(3),
        'Verim [%]': +(r.eps * 100).toFixed(2)
      });
    };
    for (const a of m1s) for (const b of m2s) make(a, b, 0);
    // Isı dengesi bozuk (gürültülü) noktalar
    make(0.25, 0.60, 0.12); make(0.40, 0.30, -0.10); make(0.15, 1.00, 0.09);
    return rows;
  }

  const HEX = {
    parseEquation, compileExpr, fluidModel, tableInterpolator, parsePropertyTable, fitTableToEquations, polyfit, UNITS, toKelvin, fromKelvin, toKgPerS, toPa,
    epsCrossflow, ntuFromEps, finEfficiency, surfaceEfficiency, sideResistance, hFromResistance,
    mean, stdev, cv, metrics, processPoint, fitWilson, modelUA, fitPressure, rate, analyze,
    generateDemo, DEMO_TRUTH, DEMO_GEOM
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = HEX;
  else root.HEX = HEX;
})(typeof window !== 'undefined' ? window : globalThis);
