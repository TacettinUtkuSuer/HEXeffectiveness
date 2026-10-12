# HEXeffectiveness — Çapraz Akışlı Plate-Fin Eşanjör Analiz Uygulaması

**HEXeffectiveness**, çapraz akışlı kanatçıklı plakalı (cross-flow plate-fin) eşanjörlerin test verilerini fiziksel kanunlara ($\varepsilon$-NTU, Wilson Plot, kanatçık verimi, $\Delta P = K_p\,\dot m^{n_p}$) dayanarak işleyen, **tamamen tarayıcıda (sunucusuz)** çalışan bir tek sayfa web uygulamasıdır (SPA). GitHub Pages üzerinde doğrudan yayınlanabilir; verileriniz bilgisayarınızdan dışarı çıkmaz.

> Bu dosya hem GitHub deposunda dokümantasyon olarak durur hem de uygulamanın **❓ Yardım / Dokümantasyon** sekmesinde `fetch('./README.md')` + `marked.js` (+ MathJax) ile **birebir ve canlı** olarak gösterilir. Teori ve kullanım açıklamaları tek kaynaktan yönetilir.

---

## İçindekiler

1. [Hızlı Başlangıç](#hızlı-başlangıç)
2. [Dosya Yapısı](#dosya-yapısı)
3. [Uygulama Akışı (Sekmeler)](#uygulama-akışı-sekmeler)
4. [Metodoloji ve Formüller](#metodoloji-ve-formüller)
5. [Veri Girişi, Sütun Eşleme ve Birim Dönüşümü](#veri-girişi-sütun-eşleme-ve-birim-dönüşümü)
6. [Malzeme ve Akışkan Kütüphanesi](#malzeme-ve-akışkan-kütüphanesi)
7. [Isı Dengesi Filtresi ve 1D / 2D Mod Tespiti](#isı-dengesi-filtresi-ve-1d--2d-mod-tespiti)
8. [Performans Tahmin Motoru (Rating)](#performans-tahmin-motoru-rating)
9. [Görselleştirme, İstatistikler ve PDF Raporu](#görselleştirme-istatistikler-ve-pdf-raporu)
10. [Proje Dosyası ve Otomatik Taslak](#proje-dosyası-ve-otomatik-taslak)
11. [Demo Test Verisi](#demo-test-verisi)
12. [Sınırlamalar ve İyi Uygulamalar](#sınırlamalar-ve-iyi-uygulamalar)
13. [Geliştirme Protokolü](#geliştirme-protokolü)

---

## Hızlı Başlangıç

**GitHub Pages ile yayınlama**

1. Depoyu GitHub'a gönderin.
2. *Settings → Pages → Build and deployment → Source: Deploy from a branch* ve dalı (`main` / kök `/`) seçin.
3. `https://<kullanıcı>.github.io/<repo>/` adresini açın.

Depodaki boş `.nojekyll` dosyası, GitHub Pages'in Jekyll işlemesini kapatır; böylece `README.md` ve `materials_db.json` ham olarak sunulur ve Yardım sekmesi tarafından okunabilir.

**Yerel çalıştırma** (tarayıcılar `file://` altında `fetch()`'i engellediği için küçük bir sunucu gerekir):

```bash
python -m http.server 8000
# ardından http://localhost:8000 adresini açın
```

**30 saniyede deneme:** Üst çubuktaki **▶ Demo Veriyi Yükle** düğmesine basın. Sentetik bir su/hava radyatörü test verisi yüklenir, sütunlar eşlenir, analiz çalışır ve sonuçlar *Analiz* sekmesinde gösterilir.

## Dosya Yapısı

| Dosya | Açıklama |
|---|---|
| `index.html` | Ana uygulama arayüzü (sekmeler, formlar, grafik alanları) |
| `css/style.css` | Arayüz ve PDF rapor stilleri |
| `js/physics.js` | Fizik/hesap motoru: ifade ayrıştırıcı, özellikler, birimler, $\varepsilon$-NTU, kanatçık verimi, Wilson fit, $\Delta P$ fit, rating, demo veri üretici |
| `js/app.js` | Arayüz katmanı: durum yönetimi, veri yükleme/eşleme, kütüphane, Plotly grafikleri, PDF, proje/taslak |
| `materials_db.json` | Varsayılan akışkan ve katı malzeme kütüphanesi |
| `README.md` | Bu doküman (Yardım sekmesinde birebir gösterilir) |
| `.nojekyll` | GitHub Pages'te Jekyll işlemesini kapatır |

Kullanılan kütüphaneler (CDN, sabit sürüm): Plotly.js 2.35.2, PapaParse 5.4.1, marked 12.0.2, html2pdf.js 0.10.1, SheetJS (xlsx) 0.18.5, MathJax 3.2.2.

## Uygulama Akışı (Sekmeler)

1. **Veri & Eşleme** — CSV/TXT/Excel yükleme, sütunların fiziksel büyüklüklere bağlanması, her sütun için birim seçimi, ham veri önizleme.
2. **Akışkan & Geometri** — Her taraf için akışkan, ısı transfer alanı $A$, kanatçık parametreleri ($A_f/A$, $L_f$, $t_f$, malzeme), duvar direnci $R_w$ ve analiz ayarları.
3. **Kütüphane** — Sıcaklığa bağlı akışkan özellik denklemleri ve katı malzemeler; CSV ile toplu yükleme; `materials_db.json` indirme.
4. **Analiz** — Isı dengesi, $\varepsilon$, NTU, UA hesabı; Wilson fit; $\Delta P$ fit; grafikler ve nokta tablosu.
5. **Performans Tahmini** — Yeni debi ve giriş sıcaklıklarında $\varepsilon$, $Q$, $T_{out}$, $\Delta P$ tahmini ve debi taraması.
6. **Rapor** — PDF mühendislik raporu, proje kaydet/yükle.
7. **Yardım / Dokümantasyon** — Bu README.

---

## Metodoloji ve Formüller

Tüm iç hesaplar **SI** birimlerindedir: $\dot m$ [kg/s], $T$ [K], $\Delta P$ [Pa], $Q$ [W], $UA$ [W/K], $h$ [W/(m²·K)], $A$ [m²].
Akışkan 1 ve akışkan 2 herhangi biri sıcak taraf olabilir; işaret $T_{1,in}-T_{2,in}$ farkından otomatik belirlenir.

### 1. Sıcaklık ve Isı Dengesi Hesapları

Her iki tarafın ısı yükü ölçülen sıcaklıklardan hesaplanır:

$$Q_1 = \dot{m}_1 c_{p1} \vert{}T_{1,in} - T_{1,out}\vert{}, \quad Q_2 = \dot{m}_2 c_{p2} \vert{}T_{2,in} - T_{2,out}\vert{}$$

Ölçüm tutarlılığı ısı dengesi hatası ile değerlendirilir:

$$\text{Isı Dengesi Hatası (\%)} = \frac{\vert{}Q_1 - Q_2\vert{}}{(Q_1 + Q_2)/2} \times 100$$

Isıl kapasite debileri $C_1=\dot m_1 c_{p1}$, $C_2=\dot m_2 c_{p2}$, $C_{\min}=\min(C_1,C_2)$, $C_{\max}=\max(C_1,C_2)$ olmak üzere teorik maksimum ısı transferi ve deneysel etkinlik:

$$Q_{\max} = C_{\min} (T_{1,in} - T_{2,in}), \quad \varepsilon = \frac{Q_{\text{ort}}}{Q_{\max}}$$

Burada $Q_{\text{ort}} = (Q_1+Q_2)/2$'dir ($Q_{\max}$ mutlak değerle alınır). Yalnızca bir çıkış sıcaklığı ölçülmüşse o tarafın $Q$'su kullanılır ve diğer çıkış sıcaklığı enerji dengesinden tahmin edilir. *ε kaynağı = Effectiveness sütunu* seçilirse $Q = \varepsilon_{\text{ölçülen}}\,Q_{\max}$ alınır (sütun % ise otomatik olarak kesire çevrilir).

### 2. Sıcaklığa Bağlı Termofiziksel Özellikler

Akışkan özellikleri her taraf için ortalama sıcaklıkta hesaplanır:

$$T_m = \frac{T_{in} + T_{out}}{2}$$

$$c_p(T) = a_0 + a_1 T + a_2 T^2 + a_3 T^3$$

Yoğunluk $\rho(T)$, viskozite $\mu(T)$ ve ısıl iletkenlik $k(T)$ de aynı biçimde (polinom veya ifade olarak) tanımlanır. Çıkış sıcaklığı bilinmiyorsa (ör. tahmin modunda) $T_m$ ile $c_p$ arasındaki bağımlılık iteratif olarak çözülür. Polinomların sıcaklık değişkeninin birimi kütüphanedeki `T_unit` alanıyla belirtilir (`C` veya `K`; varsayılan °C).

### 3. ε-NTU Çapraz Akış Bağıntısı (Unmixed-Unmixed)

Her iki akışkanın da karışmadığı çapraz akış için:

$$\varepsilon = 1 - \exp\left[ \frac{1}{C_r} \text{NTU}^{0.22} \left( \exp\left( -C_r \cdot \text{NTU}^{0.78} \right) - 1 \right) \right]$$

Burada $C_r = C_{\min}/C_{\max}$ ve $\text{NTU} = UA / C_{\min}$'dir. $C_r \to 0$ limitinde $\varepsilon = 1 - e^{-\text{NTU}}$ kullanılır.

**Ters çözüm:** Her test noktası için deneysel $\varepsilon$ ve $C_r$'den NTU, bağıntı NTU'ya göre monoton olduğundan **ikiye bölme (bisection)** yöntemiyle ($0 < \text{NTU} \le 50$, tolerans $10^{-12}$) bulunur ve $UA_{\text{deney}} = \text{NTU}\cdot C_{\min}$ hesaplanır. $\varepsilon \le 0$ veya bağıntının ulaşabileceği değerin üzerindeki noktalar "fiziksel olmayan" olarak işaretlenir.

### 4. Wilson Plot ve Isıl Direnç Ayrıştırma Modeli

Toplam ısıl direnç, iki taraf konveksiyon direnci ile duvar iletim direncinin seri toplamıdır:

$$\frac{1}{UA} = \frac{1}{(\eta_o h A)_1} + R_w + \frac{1}{(\eta_o h A)_2}$$

Taraf ısı taşınım katsayıları debinin üssel fonksiyonu olarak modellenir:

$$h_1 = C_1 \cdot \dot{m}_1^{m_1}, \quad h_2 = C_2 \cdot \dot{m}_2^{m_2} \quad (0.30 \le m_1, m_2 \le 0.80)$$

(Uygulamada üsler $n_1$, $n_2$ olarak da gösterilir; kanatçık parametresi $m_f$ ile karışmaması içindir.)

**Kanatçık Verimi:**

$$\eta_o = 1 - \frac{A_f}{A}(1 - \eta_f), \quad \eta_f = \frac{\tanh(m_f L_f)}{m_f L_f}, \quad m_f = \sqrt{\frac{2 h}{k_m t_f}}$$

| Sembol | Anlam | Birim |
|---|---|---|
| $A$ | Taraftaki toplam ısı transfer alanı (birincil + kanatçık) | m² |
| $A_f/A$ | Kanatçık alanının toplam alana oranı | – |
| $L_f$ | Kanatçık etkin boyu (plakalar arası mesafenin yarısı, tipik) | m (arayüzde mm) |
| $t_f$ | Kanatçık kalınlığı | m (arayüzde mm) |
| $k_m$ | Kanatçık malzemesi ısıl iletkenliği | W/(m·K) |
| $R_w$ | Duvar (plaka) ısıl direnci, $t_w/(k_w A_w)$ | K/W |

**Fit algoritması (2D mod):**

1. Sabit $(n_1, n_2)$ için ve $\eta_o$ sabit tutulduğunda model, $a = 1/C_1$ ve $b = 1/C_2$'ye göre doğrusaldır:
   $$y_i = \frac{1}{UA_i} - R_w = a\,\underbrace{\frac{1}{\eta_{o1,i} A_1 \dot m_{1,i}^{n_1}}}_{x_{1,i}} + b\,\underbrace{\frac{1}{\eta_{o2,i} A_2 \dot m_{2,i}^{n_2}}}_{x_{2,i}}$$
2. $a, b > 0$ kısıtıyla **ağırlıklı en küçük kareler** (ağırlık $1/y_i^2$ → göreli hata) çözülür.
3. Yeni $C_1, C_2$ ile $h$ ve $\eta_o$ güncellenir; $\eta_o$ yakınsayana kadar 1–2 adımları tekrarlanır (ardışık yerine koyma).
4. Üsler $[n_{\min}, n_{\max}]$ aralığında 0.02 adımlı ızgarada taranır, en iyi nokta etrafında 0.005 ve 0.001 adımlarla inceltilir. Amaç fonksiyonu: $\sum_i \left[(y_i^{\text{model}} - y_i)/y_i\right]^2$.

**Wilson grafiği:** Her taraf için $x = 1/(\eta_o A \dot m^{n})$ eksenine karşı, diğer tarafın model direnci çıkarılmış toplam direnç $y = 1/UA - R_w - R_{\text{diğer}}$ çizilir. Eğim $1/C$'yi verir; noktaların doğru üzerinde olması modelin tutarlılığını gösterir.

> **Tanımlanabilirlik notu:** Bir tarafın direnci toplam direncin çok küçük bir kısmıysa (ör. su/hava eşanjöründe su tarafı), o tarafın $C$ ve $n$ değerleri istatistiksel olarak zayıf belirlenir; buna karşın $UA$ ve $\varepsilon$ tahmini yine de doğru olur. Parametreleri ayrı ayrı yorumlamadan önce Wilson grafiğini ve test matrisinin genişliğini kontrol edin.

### 5. Basınç Düşümü Modeli (ΔP)

Her taraf için:

$$\Delta P = K_p \cdot \dot{m}^{n_p} \quad (1.5 \le n_p \le 2.0)$$

Fit, $\ln \Delta P = \ln K_p + n_p \ln \dot m$ doğrusal regresyonu ile yapılır. Bulunan $n_p$ sınırların dışındaysa en yakın sınıra çekilir ve $K_p$ bu sabit üsle yeniden hesaplanır (uyarı verilir). $n_p=2$ tam türbülanslı akışa (Fanning sürtünme faktörü $f\approx$ sabit), $n_p\to1.75$ ise $f \propto Re^{-0.25}$ (Blasius) davranışına karşılık gelir; Fanning bağıntısı $\Delta P = 4f\,\frac{L}{D_h}\,\frac{G^2}{2\rho}$ ile $G = \dot m / A_c$ olduğundan $\Delta P \propto \dot m^{2-b}$ ($f \propto Re^{-b}$) yazılabilir.

---

## Veri Girişi, Sütun Eşleme ve Birim Dönüşümü

**Desteklenen dosyalar:** `.csv`, `.txt` (ayraç otomatik algılanır), `.xlsx`, `.xls` (ilk sayfa). İlk satır başlık olmalıdır. Ondalık ayırıcı olarak nokta veya virgül kabul edilir.

**Sütun eşleme:** Sütunlar herhangi bir sırada olabilir. *Veri & Eşleme* sekmesindeki açılır menülerle aşağıdaki büyüklüklere bağlanır (`*` zorunlu):

| Anahtar | Büyüklük | Not |
|---|---|---|
| `m_dot1` * | Akışkan 1 kütlesel/hacimsel debisi | |
| `m_dot2` * | Akışkan 2 debisi | |
| `T1_in` * , `T1_out` | Akışkan 1 giriş/çıkış sıcaklığı | |
| `T2_in` * , `T2_out` | Akışkan 2 giriş/çıkış sıcaklığı | |
| `Effectiveness` | Ölçülen/raporlanan $\varepsilon$ | Çıkış sıcaklıkları yoksa gerekli |
| `dp1`, `dp2` | Taraf basınç düşümleri | ΔP fit'i için |

**Otomatik Eşle** düğmesi, başlık adlarından (ör. `m_dot1`, `T1_in`, `Su Debisi`, `Hava T_cikis`, `dP`) ve köşeli/normal parantez içindeki birimlerden (`[kg/h]`, `(kPa)`) tahmin yapar; sonucu her zaman kontrol edin.

**Otomatik birim dönüştürücü** (iç hesaplar daima SI):

| Grup | Birimler | Dönüşüm |
|---|---|---|
| Debi | `kg/s`, `kg/h`, `L/min`, `g/s` | `L/min` → $\dot m = \rho(T_{in})\,\dot V$ (akışkanın giriş sıcaklığındaki yoğunluğu) |
| Sıcaklık | `°C`, `K`, `°F` | → K |
| Basınç düşümü | `Pa`, `kPa`, `mbar` | → Pa |
| Etkinlik | `-`, `%` | > 1.5 olan değerler otomatik % kabul edilir |

## Malzeme ve Akışkan Kütüphanesi

Uygulama açılışta `./materials_db.json` dosyasını okur (okunamazsa gömülü asgari kütüphane — Su, Hava, Alüminyum — kullanılır).

**Denklem formatı** (her özellik alanı için):

- **Katsayı listesi:** `a0; a1; a2; a3` → $a_0 + a_1T + a_2T^2 + a_3T^3$ (istenen sayıda katsayı; tek sayı = sabit).
- **İfade:** `T` değişkenli matematiksel ifade, ör. `exp(-6.3292 - 0.0326*T + 2.14e-4*T^2)`. Desteklenen: `+ - * / ^ ( )`, `exp`, `ln`, `log10`, `sqrt`, `pow`, `abs`, `tanh`. İfadeler güvenli bir ayrıştırıcıyla derlenir (`eval` kullanılmaz).

| Özellik | Birim |
|---|---|
| `Cp_Eq` | J/(kg·K) |
| `Density_Eq` | kg/m³ |
| `Viscosity_Eq` | Pa·s |
| `k_Eq` | W/(m·K) |

**CSV ile akışkan yükleme** — sütunlar: `Fluid_Name`, `Cp_Eq`, `Density_Eq`, `Viscosity_Eq`, `k_Eq` (opsiyonel `T_Unit` = `C`/`K`). Katsayı listeleri virgül yerine `;` ile ayrılmalıdır veya hücre tırnak içine alınmalıdır:

```csv
Fluid_Name,Cp_Eq,Density_Eq,Viscosity_Eq,k_Eq,T_Unit
Propylene Glycol 40%,3600; 3.0,1040; -0.5,exp(-4.6 - 0.035*T),0.40; 0.0006,C
```

Aynı isimli akışkan varsa güncellenir. **CSV Şablonu** düğmesi mevcut kütüphaneyi şablon olarak indirir.

**Repo kalıcılığı:** Arayüzden eklenen/düzenlenen akışkanlar önce tarayıcı taslağında saklanır. Kalıcı yapmak için **⬇ Kütüphaneyi İndir** ile güncel `materials_db.json` dosyasını indirip depodaki dosyanın yerine koyun ve commit edin. **Repo Varsayılanına Dön** düğmesi kütüphaneyi depodaki dosyaya sıfırlar.

Varsayılan kütüphane: Water, Air, Ethylene Glycol 50%, Engine Oil (SAE 30); katılar: Aluminum 3003/6061/1100, Copper, Brass, Stainless Steel 304, Carbon Steel. Polinomlar tablo verilerine en küçük kareler ile uydurulmuştur (geçerlilik aralığı `T_range` alanındadır).

## Isı Dengesi Filtresi ve 1D / 2D Mod Tespiti

**Isı dengesi filtresi:** Isı dengesi hatası eşiği (varsayılan **%5**) aşan noktalar turuncu ile işaretlenir ve uyarı verilir. *"Eşiği aşan noktaları fit dışında tut"* seçeneği açıksa bu noktalar Wilson ve ΔP fit'ine katılmaz (grafiklerde "Hariç" olarak gösterilir). Ayrıca nokta tablosundaki kutucuklarla herhangi bir nokta manuel olarak dışlanabilir.

**Otomatik mod tespiti** — fit'e dahil noktalarda debilerin varyasyon katsayısı $CV = \sigma/\mu$ hesaplanır:

| Durum | Mod | Yöntem |
|---|---|---|
| $CV(\dot m_2) < \%2$, $\dot m_1$ değişken | **1D (ṁ₁)** | $1/UA = a\,x_1(n_1) + c$ — eğri fit; $n_1$, $C_1$ ve sabit taraf direnci $c$ bulunur |
| $CV(\dot m_1) < \%2$, $\dot m_2$ değişken | **1D (ṁ₂)** | Simetrik |
| Her ikisi değişken | **2D** | Yüzey fit; $C_1, n_1, C_2, n_2$ birlikte bulunur |
| Her ikisi sabit | — | Hata: Wilson analizi yapılamaz |

1D modda sabit tarafın direnci $R_{\text{sabit}} = c$ (tek sayı) bulunur; bu taraf için $h$ değeri $\eta_o(h)\,h\,A = 1/R_{\text{sabit}}$ denkleminden çözülür ve *varsayılan üs* (ayarlar, varsayılan $n=0.6$) ile $C = h/\bar{\dot m}^{\,n}$ hesaplanır. Bu nedenle 1D modda sabit tutulan debinin değiştirildiği tahminler bu varsayıma dayanır (uygulama uyarır).

## Performans Tahmin Motoru (Rating)

Analizden elde edilen $C_1, n_1, C_2, n_2, R_w$ ve $K_p, n_p$ ile istenen $\dot m_1, \dot m_2, T_{1,in}, T_{2,in}$ için:

1. $h_1, h_2$ → $\eta_{o1}, \eta_{o2}$ → $UA$
2. $T_m$ tahmini → $c_p$ → $C_{\min}, C_r$ → $\text{NTU} = UA/C_{\min}$ → $\varepsilon$ (çapraz akış bağıntısı)
3. $Q = \varepsilon\,C_{\min}\,\vert T_{1,in}-T_{2,in}\vert$, $T_{1,out} = T_{1,in} \mp Q/C_1$, $T_{2,out} = T_{2,in} \pm Q/C_2$
4. $T_m$ değişmeyene kadar 2–3 tekrarlanır; $\Delta P_i = K_{p,i}\,\dot m_i^{n_{p,i}}$.

Girdiler test aralığının ±%10 dışına çıkarsa **ekstrapolasyon** uyarısı verilir. Sağdaki grafik, diğer debi sabitken seçili debinin taranmasıyla $\varepsilon$, $Q$ ve $\Delta P$ eğrilerini gösterir.

## Görselleştirme, İstatistikler ve PDF Raporu

Grafikler (Plotly.js, etkileşimli; her grafik kamera simgesiyle PNG indirilebilir):

- **3D Yüzey** $\varepsilon(\dot m_1, \dot m_2)$ — model yüzeyi + ölçüm noktaları (2D mod); 1D modda $\varepsilon$–debi eğrisi.
- **ε–debi eğrileri** — diğer debinin her seviyesi için model eğrisi ve ölçüm.
- **Parity Plot** ($y=x$, ±%5 bandı) — $\varepsilon$ ve $\Delta P$ için.
- **Wilson Plot** — iki taraf için direnç ayrıştırması.
- **Isı dengesi hatası** çubuk grafiği (eşik çizgisi ile).
- **ΔP–debi** eğrileri.

İstatistikler (fit'e dahil noktalar üzerinden):

$$R^2 = 1 - \frac{\sum (y_i - \hat y_i)^2}{\sum (y_i - \bar y)^2}, \quad \text{RMSE} = \sqrt{\frac{1}{N}\sum (y_i-\hat y_i)^2}, \quad \text{MAPE} = \frac{100}{N}\sum \left\vert\frac{y_i - \hat y_i}{y_i}\right\vert$$

**PDF raporu** (`html2pdf.js`): proje bilgileri, özet, yöntem denklemleri, akışkan/geometri tablosu, fit parametreleri, seçili performans tahmini, tüm grafikler ve (isteğe bağlı) nokta tablosunu içeren A4 mühendislik raporu üretir.

## Proje Dosyası ve Otomatik Taslak

- **💾 Proje Kaydet:** Ham veri, eşleme, birimler, akışkan/geometri, ayarlar, rating girdileri, rapor bilgileri ve kütüphane tek bir `.json` dosyasına yazılır.
- **📂 Proje Yükle:** Kaydedilen dosyayı geri yükler ve analizi yeniden çalıştırır.
- **Otomatik taslak:** Her değişiklik tarayıcının `localStorage` alanına (`hexeffectiveness_draft_v1`) yazılır; sayfa yeniden açıldığında otomatik geri yüklenir. **⟲ Sıfırla** taslağı siler.

## Demo Test Verisi

**▶ Demo Veriyi Yükle** / **⬇ Demo CSV İndir** düğmeleri, bilinen parametrelerle üretilmiş sentetik bir su (taraf 1) / hava (taraf 2) radyatör testi oluşturur:

- Gerçek parametreler: $C_1 = 6000$, $n_1 = 0.55$, $C_2 = 115$, $n_2 = 0.50$, $R_w = 10^{-5}$ K/W; $\Delta P_1 = 12000\,\dot m_1^{1.8}$, $\Delta P_2 = 180\,\dot m_2^{1.9}$ Pa.
- Geometri: $A_1 = 0.8$ m², $A_2 = 4.5$ m², alüminyum kanatçıklar.
- 5 × 6 = 30 test noktası + ısı dengesi bozuk 3 nokta; sıcaklık, debi ve ΔP'ye gerçekçi gürültü eklenmiştir.
- Sütunlar karışık sırada ve karışık birimlerdedir (`kg/h`, `kg/s`, `°C`, `kPa`, `mbar`, `%`) — eşleme ve birim dönüştürücüyü göstermek içindir.

Gürültü nedeniyle su tarafı parametreleri (toplam direncin ~%15'i) gerçek değerlerden sapabilir; $\varepsilon$ uyumu ise $R^2 > 0.99$ düzeyindedir (bkz. tanımlanabilirlik notu).

## Sınırlamalar ve İyi Uygulamalar

- Bağıntı, **her iki akışkanın karışmadığı tek geçişli çapraz akış** içindir. Çok geçişli veya karışık akış düzenlerinde sonuçlar yaklaşık olur.
- Faz değişimi (yoğuşma/buharlaşma) ve nem transferi modellenmez; ıslak yüzey testlerinde duyulur ısı dengesi bozulur.
- Wilson analizi için test matrisi her iki debiyi de geniş bir aralıkta (tercihen ≥ 3:1) değiştirmelidir.
- Özellik polinomlarını geçerlilik aralığı dışında kullanmaktan kaçının.
- Alanlar bilinmiyorsa $A = 1$ m² ve kanatçık verimi kapalı kullanılabilir; bu durumda $C$ katsayıları doğrudan $(hA)$ korelasyonu olarak yorumlanır ve tahmin motoru yine doğru çalışır.

---

## Geliştirme Protokolü

Bu proje üzerinde AI destekli geliştirme yapılırken şu kurallar geçerlidir:

1. **İstem kontrolü:** Mesaj en başta `CODE` kelimesiyle başlamıyorsa kod üretilmez; yalnızca teorik, teknik veya operasyonel sorular yanıtlanır. Mesaj `CODE` ile başlıyorsa istenen değişiklikler mevcut kod yapısına entegre edilerek güncellenir.
2. **README ↔ Yardım senkronizasyonu:** Uygulamanın Yardım sekmesi bu dosyayı canlı olarak gösterir. Teori, formül veya kullanım değişiklikleri **yalnızca bu README'de** yapılır; arayüzde ayrı bir yardım metni tutulmaz.
