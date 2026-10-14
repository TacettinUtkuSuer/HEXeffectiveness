# HEXeffectiveness — Çapraz Akışlı Plate-Fin Eşanjör Analiz Uygulaması

**HEXeffectiveness**, çapraz akışlı kanatçıklı plakalı (cross-flow plate-fin) eşanjörlerin test verilerini fiziksel kanunlara ($\varepsilon$-NTU, Wilson Plot, kanatçık verimi, $\Delta P = K_p\,\dot m^{n_p}$) dayanarak işleyen, **tamamen tarayıcıda (sunucusuz)** çalışan bir tek sayfa web uygulamasıdır (SPA). GitHub Pages üzerinde doğrudan yayınlanabilir; verileriniz bilgisayarınızdan dışarı çıkmaz.

> Bu dosya hem GitHub deposunda dokümantasyon olarak durur hem de uygulamanın **❓ Yardım** panelinde `fetch('./README.md')` + `marked.js` (+ MathJax) ile **birebir ve canlı** olarak gösterilir. Teori ve kullanım açıklamaları tek kaynaktan yönetilir.

---

## İçindekiler

1. [Hızlı Başlangıç](#hızlı-başlangıç)
2. [Dosya Yapısı](#dosya-yapısı)
3. [Uygulama Akışı (4 Adım)](#uygulama-akışı-4-adım)
4. [Metodoloji ve Formüller](#metodoloji-ve-formüller)
5. [Veri Girişi, Sütun Eşleme ve Birim Dönüşümü](#veri-girişi-sütun-eşleme-ve-birim-dönüşümü)
6. [Malzeme ve Akışkan Kütüphanesi](#malzeme-ve-akışkan-kütüphanesi)
7. [Isı Dengesi Filtresi ve 1D / 2D Mod Tespiti](#isı-dengesi-filtresi-ve-1d--2d-mod-tespiti)
8. [Ölçüm Belirsizliği ve Bootstrap Güven Aralıkları](#ölçüm-belirsizliği-ve-bootstrap-güven-aralıkları)
9. [Test Matrisi Önerisi (D-optimal)](#test-matrisi-önerisi-d-optimal)
10. [Zaman Serisinden Kararlı Rejim Tespiti](#zaman-serisinden-kararlı-rejim-tespiti)
11. [Performans Tahmin Motoru (Rating)](#performans-tahmin-motoru-rating)
12. [Performans Haritası ve Dışa Aktarma](#performans-haritası-ve-dışa-aktarma)
13. [Görselleştirme, İstatistikler ve PDF Raporu](#görselleştirme-istatistikler-ve-pdf-raporu)
14. [Proje Dosyası ve Otomatik Taslak](#proje-dosyası-ve-otomatik-taslak)
15. [Demo Test Verisi](#demo-test-verisi)
16. [Sınırlamalar ve İyi Uygulamalar](#sınırlamalar-ve-iyi-uygulamalar)
17. [Geliştirme Protokolü](#geliştirme-protokolü)

---

## Hızlı Başlangıç

**GitHub Pages ile yayınlama**

1. Depoyu GitHub'a gönderin.
2. *Settings → Pages → Build and deployment → Source: Deploy from a branch* ve dalı (`main` / kök `/`) seçin.
3. `https://<kullanıcı>.github.io/<repo>/` adresini açın.

Depodaki boş `.nojekyll` dosyası, GitHub Pages'in Jekyll işlemesini kapatır; böylece `README.md` ve `materials_db.json` ham olarak sunulur ve Yardım paneli tarafından okunabilir.

**Yerel çalıştırma** (tarayıcılar `file://` altında `fetch()`'i engellediği için küçük bir sunucu gerekir):

```bash
python -m http.server 8000
# ardından http://localhost:8000 adresini açın
```

**30 saniyede deneme:** Üst çubuktaki **▶ Demo ile dene** düğmesine basın. Sentetik bir su/hava radyatörü test verisi yüklenir, sütunlar eşlenir, analiz çalışır ve **3 · Sonuç** adımı açılır.

## Dosya Yapısı

| Dosya | Açıklama |
|---|---|
| `index.html` | Ana uygulama arayüzü (4 adım, yan paneller, formlar, grafik alanları) |
| `css/style.css` | Arayüz (açık/koyu tema) ve PDF rapor stilleri |
| `js/physics.js` | Fizik/hesap motoru: ifade ayrıştırıcı, özellikler (denklem/tablo), birimler, $\varepsilon$-NTU, kanatçık verimi, kütle ve Nu–Re–Pr modelli Wilson fit, $\Delta P$ (kütle / Fanning) fit, rating, belirsizlik yayılımı, bootstrap, D-optimal öneri, kararlı rejim tespiti, performans haritası, demo veri üretici |
| `js/core.js` | Durum, ortak yardımcılar, akışkan/geometri hazırlığı, grafik teması, proje/taslak, tema |
| `js/diagrams.js` | Geometri yönlendirme çizimleri (kanatçık/alan, akış kesiti/akış boyu) ve alan↔çizim vurgulama |
| `js/library.js` | Kütüphane paneli (tablo içe aktarma, denklemler, katı malzemeler) |
| `js/data.js` | Adım 1: dosya + eşleme, elle giriş, D-optimal öneri, zaman serisi, demo |
| `js/analysis.js` | Adım 3: analiz, düz dille sonuç özeti, grafikler, bootstrap |
| `js/outputs.js` | Adım 4: tek nokta tahmini, performans haritası ve dışa aktarma, PDF |
| `js/main.js` | Gezinme (adımlar, yan paneller, menü), bağlama, olaylar, başlatma, Yardım |
| `materials_db.json` | Varsayılan akışkan ve katı malzeme kütüphanesi |
| `README.md` | Bu doküman (Yardım panelinde birebir gösterilir) |
| `.nojekyll` | GitHub Pages'te Jekyll işlemesini kapatır |

Kullanılan kütüphaneler (CDN, sabit sürüm): Plotly.js 2.35.2, PapaParse 5.4.1, marked 12.0.2, html2pdf.js 0.10.1, SheetJS (xlsx) 0.18.5, MathJax 3.2.2.

## Uygulama Akışı (4 Adım)

Uygulama, üstteki adım çubuğuyla ilerleyen **4 adımlı** bir akıştır. Her adımın durumu çubukta görünür (✓ tamam, ⚠ eksik); adımlar arasında istediğiniz an geçebilirsiniz. Her ekranın altında **Geri / Devam** düğmeleri vardır.

| Adım | Ne yaparsınız | Ayrıntı |
|---|---|---|
| **1 · Veri** | Test verisini getirirsiniz: **📄 Dosyadan** (CSV/Excel + sütun eşleme), **✍️ Elle giriş** (test sırasında nokta nokta, anlık kontrol ve "sıradaki noktayı nerede ölçmeliyim?" önerisi) veya **📈 Kayıt cihazından** (zaman serisinden kararlı rejim tespiti). Ortak veri tablosunda noktaları düzenleyip silebilirsiniz. | En az 3 nokta ve zorunlu sütunlar eşlenince "Devam" aktifleşir. |
| **2 · Eşanjör** | Her taraf için akışkanı seçersiniz ve tek bir soruyu yanıtlarsınız: sonuçları test sıcaklıkları civarında mı, farklı sıcaklıklarda da mı kullanacaksınız? (ikincisi boyutsuz Nu–Re–Pr modelini açar). Isı dengesi filtresi burada. | Alan, kanatçık, duvar direnci, sensör doğrulukları ve fit sınırları **⚙ Gelişmiş ayarlar** altında katlıdır; varsayılanlar çoğu test için uygundur. |
| **3 · Sonuç** | Analiz otomatik çalışır. En üstte düz dille bir **karar** (✅ güvenilir / ⚠️ kabul edilebilir / ❌ zayıf), tıklanabilir **yapılacaklar** listesi ve anahtar sayılar; altında ölçüm↔model ve etkinlik–debi grafikleri. | Katsayılar ve güven aralığı, ısı dengesi, 3B yüzey, Wilson grafiği, basınç düşümü, nokta tablosu ve teknik uyarılar katlanır bölümlerdedir. |
| **4 · Çıktılar** | **🎯 Tek nokta tahmini** (alanlar test ortalamasıyla önceden dolu), **🗺️ Performans haritası** (açılınca otomatik aralıkla hazırlanır; Excel / tablo CSV / liste CSV / JSON indir) ve **📄 Rapor ve proje** (PDF, proje dosyası). | Harita aralığı **Aralığı özelleştir** altında değiştirilebilir. |

Üst çubuk: **▶ Demo ile dene**, **📁 Proje** menüsü (kaydet, aç, demo CSV, sıfırla), **📚 Kütüphane** ve **❓ Yardım** yan panelleri, tema düğmesi. Alanların yanındaki **?** işaretlerinin üzerine gelince kısa açıklama görünür.

**Açık / koyu tema (dark mode):** Üst çubuktaki 🌙 / ☀️ düğmesiyle değiştirilir. İlk açılışta işletim sisteminin tema tercihi kullanılır; seçiminiz tarayıcıda hatırlanır. Grafikler temaya göre yeniden çizilir; **PDF raporu her zaman açık temada** (baskıya uygun) üretilir.

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

### 3b. Akış Düzeni: Çok Geçiş (Pass), Karışık Taraf, Ters/Paralel Akış

Yukarıdaki bağıntı **tek geçişli** çapraz akış içindir. *2 · Eşanjör → Akış düzeni* kartından eşanjörünüzün düzeni seçilir; ölçülen $\varepsilon$'dan NTU (ve UA) hesabı ile tahmin/haritadaki $\varepsilon$ hesabı **aynı seçilen bağıntıyla** yapılır.

| Düzen | Bağıntı |
|---|---|
| Tek geçiş çapraz, iki taraf karışmamış (varsayılan) | yukarıdaki $\varepsilon_{cf}(\text{NTU}, C_r)$ |
| Tek geçiş çapraz, $C_{\max}$ karışık | $\varepsilon = \frac{1}{C_r}\left[1 - e^{-C_r\,(1-e^{-\text{NTU}})}\right]$ |
| Tek geçiş çapraz, $C_{\min}$ karışık | $\varepsilon = 1 - \exp\!\left[-\frac{1}{C_r}\left(1-e^{-C_r\,\text{NTU}}\right)\right]$ |
| Ters akış | $\varepsilon = \frac{1-e^{-\text{NTU}(1-C_r)}}{1-C_r\,e^{-\text{NTU}(1-C_r)}}$ ($C_r=1$: $\frac{\text{NTU}}{1+\text{NTU}}$) |
| Paralel akış | $\varepsilon = \frac{1-e^{-\text{NTU}(1+C_r)}}{1+C_r}$ |

Karışık tarafın $C_{\min}$ mi $C_{\max}$ mı olduğu her nokta için ayrıca belirlenir.

**Çok geçişli (N pass) çapraz akış.** Bir taraf çekirdekten $N$ kez geçer, diğer taraf tek geçişle bütün geçiş bölgelerinden sırayla geçer. Her geçiş, $\text{NTU}/N$ ve aynı $C_r$ ile tek geçişli karışmamış çapraz akış birimi ($\varepsilon_p$) kabul edilir; geçiş dönüşlerinde akışkanın karıştığı (toplama haznesi / manifold) varsayılır. Genel düzen:

$$\text{çapraz-ters:}\quad \varepsilon = \frac{\left(\frac{1-\varepsilon_p C_r}{1-\varepsilon_p}\right)^{N} - 1}{\left(\frac{1-\varepsilon_p C_r}{1-\varepsilon_p}\right)^{N} - C_r} \qquad \left(C_r = 1:\ \varepsilon = \frac{N\varepsilon_p}{1+(N-1)\varepsilon_p}\right)$$

$$\text{çapraz-paralel:}\quad \varepsilon = \frac{1-\left[1-\varepsilon_p(1+C_r)\right]^{N}}{1+C_r}$$

$N=1$'de tek geçişe, $N\to\infty$'da saf ters / paralel akışa yaklaşır. **Genel yön:** geçişli akışkan geçişten geçişe ilerlerken diğer akışkanın geliş yönüne karşı ilerliyorsa *ters*, aynı yönde ilerliyorsa *paralel*'dir (kartta seçime göre çizilen şema yardımcı olur).

**Ters çözüm:** Çapraz-paralel düzende $\varepsilon(\text{NTU})$ monoton değildir (bir maksimumdan sonra düşer). Bu yüzden NTU, log ölçekli taramayla $\varepsilon$'un ilk aşıldığı aralık bulunup ikiye bölme ile çözülür; ölçülen $\varepsilon$ düzenin ulaşabileceği en yüksek değeri aşıyorsa nokta "fiziksel olmayan" işaretlenir.

**Ne kadar etkiler?** Düzen seçimi en çok $C_r \approx 1$ ve yüksek NTU'da önemlidir (ör. $C_r=1$, NTU $=2$: tek geçiş $\varepsilon = 0.615$, 2 geçiş çapraz-ters $0.638$; tek geçiş varsayımı UA'yı ~%10 fazla verir). $C_r \to 0$'da (bir taraf çok baskın) düzen fark etmez. Kart, kendi test verinizin ortalama NTU ve $C_r$ değerinde seçimin UA'yı ne kadar değiştirdiğini gösterir. Test aralığındaki $\varepsilon$ tahminleri düzen yanlış seçilse bile büyük ölçüde doğru kalır (aynı bağıntı iki yönde kullanıldığından); asıl etkilenen UA, $h$, $C/n$ katsayıları ve test dışı ($C_r$ farklı) tahminlerdir.

**Basınç düşümü:** Basit modelde ($K_p\dot m^{n_p}$) geçiş dönüş kayıpları katsayıya katılır. Boyutsuz (Fanning) modelde geçişli taraf için **akış boyu = toplam yol** (geçiş sayısı × tek geçiş boyu), **akış kesiti = tek geçişin kesiti** girilmelidir.

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

> **Uygulamada görsel kılavuz:** *2 · Eşanjör → ⚙ Gelişmiş ayarlar* bölümünde bir kesit çizimi bu büyüklüklerin neye karşılık geldiğini gösterir; bir alana tıklayınca veya üzerine gelince çizimdeki karşılığı (ör. $L_f$ oku, kanatçık yüzeyleri $A_f$, plaka yüzeyleri $A_p$) vurgulanır. Boyutsuz model seçildiğinde $A_c$, $D_h$ ve akış boyları $L_1$, $L_2$ için de benzer bir çizim görünür. Pratik kurallar: iki plakaya lehimli kanatçıkta $L_f \approx b/2$ ($b$: plaka aralığı); düz/ofset kanatçıklarda $A_f/A \approx 0.6$–$0.9$; $D_h = 4A_cL/A$.

**Fit algoritması (2D mod):**

1. Sabit $(n_1, n_2)$ için ve $\eta_o$ sabit tutulduğunda model, $a = 1/C_1$ ve $b = 1/C_2$'ye göre doğrusaldır:
   $$y_i = \frac{1}{UA_i} - R_w = a\,\underbrace{\frac{1}{\eta_{o1,i} A_1 \dot m_{1,i}^{n_1}}}_{x_{1,i}} + b\,\underbrace{\frac{1}{\eta_{o2,i} A_2 \dot m_{2,i}^{n_2}}}_{x_{2,i}}$$
2. $a, b > 0$ kısıtıyla **ağırlıklı en küçük kareler** (ağırlık $1/y_i^2$ → göreli hata) çözülür.
3. Yeni $C_1, C_2$ ile $h$ ve $\eta_o$ güncellenir; $\eta_o$ yakınsayana kadar 1–2 adımları tekrarlanır (ardışık yerine koyma).
4. Üsler $[n_{\min}, n_{\max}]$ aralığında 0.02 adımlı ızgarada taranır, en iyi nokta etrafında 0.005 ve 0.001 adımlarla inceltilir. Amaç fonksiyonu: $\sum_i \left[(y_i^{\text{model}} - y_i)/y_i\right]^2$.

**Wilson grafiği:** Her taraf için $x = 1/(\eta_o A \dot m^{n})$ eksenine karşı, diğer tarafın model direnci çıkarılmış toplam direnç $y = 1/UA - R_w - R_{\text{diğer}}$ çizilir. Eğim $1/C$'yi verir; noktaların doğru üzerinde olması modelin tutarlılığını gösterir.

> **Tanımlanabilirlik notu:** Bir tarafın direnci toplam direncin çok küçük bir kısmıysa (ör. su/hava eşanjöründe su tarafı), o tarafın $C$ ve $n$ değerleri istatistiksel olarak zayıf belirlenir; buna karşın $UA$ ve $\varepsilon$ tahmini yine de doğru olur. Parametreleri ayrı ayrı yorumlamadan önce Wilson grafiğini ve test matrisinin genişliğini kontrol edin. **Test matrisi önerisi** bu durumu tespit edip hangi noktaların ekleneceğini söyler.

### 4b. Boyutsuz Model: Nu–Re–Pr (sıcaklık ve akışkan duyarlı)

$h = C\,\dot m^{n}$ yalnızca test edilen akışkan ve sıcaklık civarında geçerlidir: aynı debide viskozite değişirse (yağ, yakıt, glikol; ör. PAO'da 0→90 °C arasında μ ~11 kat azalır) $h$ ve $\Delta P$ değişir, kütle modeli bunu göremez. *Akışkan & Geometri → Isıl / hidrolik model → Boyutsuz* seçildiğinde her taraf için:

$$\text{Nu} = \frac{h\,D_h}{k} = C\,\text{Re}^{\,n}\,\text{Pr}^{1/3}, \qquad \text{Re} = \frac{\dot m\,D_h}{A_c\,\mu}, \qquad \text{Pr} = \frac{c_p\,\mu}{k}$$

yani $h = C \cdot \underbrace{\tfrac{k}{D_h}\text{Pr}^{1/3}}_{f}\cdot \underbrace{\text{Re}^{\,n}}_{g^{\,n}}$. Özellikler ($\mu$, $k$, $c_p$) her noktanın taraf ortalama sıcaklığında hesaplanır. Wilson fit'i aynı algoritmayla, $\dot m^{n}$ yerine $f\cdot\text{Re}^{n}$ tabanıyla yapılır (genelleştirilmiş Wilson yöntemi); $C$ boyutsuzdur ve Colburn faktörü ile $j = \text{Nu}/(\text{Re}\,\text{Pr}^{1/3}) = C\,\text{Re}^{\,n-1}$ ilişkilidir.

Gerekli geometri (taraf başına): hidrolik çap $D_h$, serbest akış (minimum kesit) alanı $A_c$, akış yolu uzunluğu $L$ (ΔP için). Tahmin motoru ve harita, giriş sıcaklığı değiştiğinde özellikleri yeniden hesaplayarak $h$ ve $\Delta P$'yi günceller.

### 5. Basınç Düşümü Modeli (ΔP)

Her taraf için:

$$\Delta P = K_p \cdot \dot{m}^{n_p} \quad (1.5 \le n_p \le 2.0)$$

Fit, $\ln \Delta P = \ln K_p + n_p \ln \dot m$ doğrusal regresyonu ile yapılır. Bulunan $n_p$ sınırların dışındaysa en yakın sınıra çekilir ve $K_p$ bu sabit üsle yeniden hesaplanır (uyarı verilir). $n_p=2$ tam türbülanslı akışa (Fanning sürtünme faktörü $f\approx$ sabit), $n_p\to1.75$ ise $f \propto Re^{-0.25}$ (Blasius) davranışına karşılık gelir; Fanning bağıntısı $\Delta P = 4f\,\frac{L}{D_h}\,\frac{G^2}{2\rho}$ ile $G = \dot m / A_c$ olduğundan $\Delta P \propto \dot m^{2-b}$ ($f \propto Re^{-b}$) yazılabilir.

**Boyutsuz modelde (Fanning):**

$$\Delta P = f\,\frac{4L}{D_h}\,\frac{G^2}{2\rho}, \qquad f = K_f\,\text{Re}^{-b}, \qquad G = \frac{\dot m}{A_c}$$

Her test noktasından $f_i = \Delta P_i\,2\rho D_h/(4 L G^2)$ hesaplanır ve $\ln f = \ln K_f - b\ln\text{Re}$ regresyonu yapılır; $b$, $n_p = 2-b$ sınırlarına ($1.5\le n_p\le 2.0 \Rightarrow 0\le b\le 0.5$) göre kısıtlanır. $\rho$ ve $\mu$ ortalama sıcaklıkta alındığından ΔP tahmini sıcaklıkla doğru ölçeklenir. Giriş/çıkış ve ivmelenme kayıpları $K_f$ içine gömülüdür.

---

## Veri Girişi, Sütun Eşleme ve Birim Dönüşümü

**Desteklenen dosyalar:** `.csv`, `.txt` (ayraç otomatik algılanır), `.xlsx`, `.xls` (ilk sayfa). İlk satır başlık olmalıdır. Ondalık ayırıcı olarak nokta veya virgül kabul edilir.

**Sütun eşleme:** Sütunlar herhangi bir sırada olabilir. *1 · Veri → 📄 Dosyadan* bölümündeki açılır menülerle aşağıdaki büyüklüklere bağlanır (`*` zorunlu):

| Anahtar | Büyüklük | Not |
|---|---|---|
| `m_dot1` * | Akışkan 1 kütlesel/hacimsel debisi | |
| `m_dot2` * | Akışkan 2 debisi | |
| `T1_in` * , `T1_out` | Akışkan 1 giriş/çıkış sıcaklığı | |
| `T2_in` * , `T2_out` | Akışkan 2 giriş/çıkış sıcaklığı | |
| `Effectiveness` | Ölçülen/raporlanan $\varepsilon$ | Çıkış sıcaklıkları yoksa gerekli |
| `dp1`, `dp2` | Taraf basınç düşümleri | ΔP fit'i için |

### Manuel Test Girişi (nokta nokta)

Test sırasında veriyi dosya hazırlamadan, her kararlı rejim noktasında doğrudan girebilirsiniz (*1 · Veri → ✍️ Elle giriş*):

1. **＋ Yeni boş test** ile yeni bir test başlatın (veya noktaları mevcut CSV veri setine ekleyin).
2. ṁ₁, ṁ₂, T₁in, T₁out, T₂in, T₂out, ΔP₁, ΔP₂ (isteğe bağlı ε, etiket, not) değerlerini girin. Her alanın yanındaki birim seçicisi eşleme tablosuyla ortaktır.
3. Değerler girildikçe **anlık kontrol** yapılır: $Q_1$, $Q_2$, **ısı dengesi hatası** (eşik aşılırsa uyarı), $\varepsilon$, NTU, UA. Daha önce bir fit yapıldıysa noktanın **mevcut modele göre sapması** da gösterilir — şüpheli ölçümü test düzeneğinde hemen tekrarlayabilirsiniz.
4. **＋ Nokta Ekle** (veya <kbd>Enter</kbd>). Giriş sıcaklıkları sonraki nokta için korunur, diğer alanlar temizlenir.
5. *Her noktada analizi güncelle* açıksa (≥ 3 nokta) Wilson fit'i, grafikler ve tahminler her noktada güncellenir.

Veri tablosunda ✎ ile bir nokta forma alınıp düzeltilebilir, ✕ ile silinebilir (CSV'den gelen satırlar dahil). **Veri tablosu → ⬇ CSV olarak indir** veri setini dosyaya kaydeder; ayrıca her değişiklik otomatik taslağa yazıldığından sayfa kapansa da noktalar kaybolmaz.

**Otomatik Eşle** düğmesi, başlık adlarından (ör. `m_dot1`, `T1_in`, `Su Debisi`, `Hava T_cikis`, `dP`) ve köşeli/normal parantez içindeki birimlerden (`[kg/h]`, `(kPa)`) tahmin yapar; sonucu her zaman kontrol edin.

**Otomatik birim dönüştürücü** (iç hesaplar daima SI):

| Grup | Birimler | Dönüşüm |
|---|---|---|
| Debi | `kg/s`, `kg/h`, `L/min`, `g/s` | `L/min` → $\dot m = \rho(T_{in})\,\dot V$ (akışkanın giriş sıcaklığındaki yoğunluğu) |
| Sıcaklık | `°C`, `K`, `°F` | → K |
| Basınç düşümü | `Pa`, `kPa`, `mbar` | → Pa |
| Etkinlik | `-`, `%` | > 1.5 olan değerler otomatik % kabul edilir |

## Malzeme ve Akışkan Kütüphanesi

Uygulama açılışta `./materials_db.json` dosyasını okur (okunamazsa gömülü asgari kütüphane — Su, Hava, Alüminyum — kullanılır). Bir akışkanın özellikleri iki yoldan tanımlanabilir: **denklem** (`*_Eq` alanları) veya **ölçülmüş özellik tablosu** (`source: "table"`).

### Özellik tablosundan akışkan ekleme

Sıcaklığa karşı tablo halinde özellik verisi (ör. yakıt veya yağ veri sayfası) doğrudan yüklenebilir — *📚 Kütüphane → Tablo dosyasından akışkan ekle → ⬆ Tablo dosyası seç* (birden çok dosya seçilebilir):

```csv
T [°C],ρ [kg/m³],cp [J/kg·K],μ [Pa·s],k [W/m·K]
0,817.29,1872.54,0.002597353,0.1281
10,809.15,1916.13,0.002014872,0.1263
20,801.00,1959.56,0.001607927,0.1246
```

- Sütun sırası serbesttir; başlıklar adlarından tanınır (`T`/`Temp`/`Sıcaklık`, `ρ`/`rho`/`Density`, `cp`, `μ`/`mu`/`Viscosity`, `k`/`λ`/`Conductivity`). Yalnızca `T` ve `cp` zorunludur.
- Birimler başlıktaki köşeli parantezden okunup SI'ya çevrilir: `K`/`°F` → °C, `kJ/kg·K` → J/(kg·K), `mPa·s`/`cP` → Pa·s, `g/cm³` → kg/m³, `mW/m·K` → W/(m·K).
- Akışkan adı dosya adından alınır (`JP8.csv` → **JP8**); aynı isimli akışkan güncellenir. Ad sonradan formdan değiştirilebilir.

**Model seçimi:**

| Model | Yöntem | Ne zaman |
|---|---|---|
| **Tablo + enterpolasyon** (önerilen, varsayılan) | $\rho$, $c_p$, $k$: tablo noktaları arasında doğrusal; $\mu$: $\ln\mu$ üzerinde doğrusal, $\mu(T) = \exp\!\left[\ln\mu_i + \frac{T-T_i}{T_{i+1}-T_i}(\ln\mu_{i+1}-\ln\mu_i)\right]$ | Veriye en sadık; viskozitesi geniş aralıkta değişen akışkanlar (ör. PAO'da −54…90 °C arasında ~900 kat) |
| **Polinom / ifadeye dönüştür** | En küçük kareler: $c_p, \rho, k$ → 3. derece polinom; $\mu$ → $\exp(a_0 + a_1T + a_2T^2 + a_3T^3)$ | Taşınabilir, kompakt denklem istendiğinde |

Her iki modelde tablo verisi saklanır; uydurulan denklemler de `*_Eq` alanlarına yazılır, böylece model *📚 Kütüphane → Akışkanı düzenle* bölümündeki **Model** seçimiyle sonradan değiştirilebilir. Form, uydurmanın tabloya göre maksimum % hatasını ve dört özelliğin eğrisini (μ logaritmik eksende) tablo noktalarıyla birlikte gösterir. Tablo aralığı dışındaki sıcaklıklarda uç segmentlerle ekstrapolasyon yapılır ve analizde uyarı verilir.

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

Aynı isimli akışkan varsa güncellenir. **CSV şablonu** düğmesi mevcut kütüphaneyi şablon olarak indirir.

**Repo kalıcılığı:** Arayüzden eklenen/düzenlenen akışkanlar önce tarayıcı taslağında saklanır. Kalıcı yapmak için **📚 Kütüphane → Kütüphaneyi kalıcı yap → ⬇ materials_db.json indir** ile güncel `materials_db.json` dosyasını indirip depodaki dosyanın yerine koyun ve commit edin. **Varsayılana dön** düğmesi kütüphaneyi depodaki dosyaya sıfırlar.

Varsayılan kütüphane: Water, Air, Ethylene Glycol 50%, Engine Oil (SAE 30) (denklem) ve **JP8** (0…90 °C), **PAO** (−54…90 °C) (tablo); katılar: Aluminum 3003/6061/1100, Copper, Brass, Stainless Steel 304, Carbon Steel. Polinomlar tablo verilerine en küçük kareler ile uydurulmuştur (geçerlilik aralığı `T_range` alanındadır).

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

## Ölçüm Belirsizliği ve Bootstrap Güven Aralıkları

**1) Nokta bazında ölçüm belirsizliği.** *2 · Eşanjör → ⚙ Gelişmiş ayarlar* altında sensör doğrulukları (%95, genişletilmiş) girilir: $U_T$ [K], $U_{\dot m}$ [%], $U_{\Delta P}$ [%]. Her test noktası için $\varepsilon$, UA ve Q belirsizliği sayısal (merkezi fark) yayılımla hesaplanır:

$$U(\varepsilon) = \sqrt{\sum_i \left(\frac{\partial \varepsilon}{\partial x_i}\,U_{x_i}\right)^2}, \qquad x_i \in \{\dot m_1, \dot m_2, T_{1,in}, T_{1,out}, T_{2,in}, T_{2,out}\}$$

Sonuçlar nokta tablosunda ($U(\varepsilon)$ sütunu), ε parity grafiğinde yatay hata çubukları olarak ve özet kartında gösterilir. Küçük sıcaklık farklarında (ör. düşük ısı yükü) $U(\varepsilon)$ hızla büyür — bu noktalar fit'te daha az güvenilirdir.

**2) Parametre güven aralıkları (bootstrap).** *3 · Sonuç → Model katsayıları ve güven aralığı → Σ Güven aralığını hesapla*: fit'e dahil noktalar yerine koyarak $B$ kez (varsayılan 100) yeniden örneklenir, her örnek için Wilson fit'i (önceki çözümün çevresinde hızlı yerel arama ile) tekrarlanır. $C_1, n_1, C_2, n_2$ için 2.5–97.5 yüzdelik aralıkları %95 güven aralığı olarak raporlanır. Bootstrap sonrası performans tahmini ve haritadaki her nokta için $\varepsilon$'nin %95 bandı da (tüm bootstrap modelleriyle hesaplanan dağılımdan) verilir. Bootstrap ölçüm saçılımını doğrudan içerdiğinden ayrı bir birleştirme yapılmaz.

## Test Matrisi Önerisi (D-optimal)

*1 · Veri → ✍️ Elle giriş → Sıradaki noktayı nerede ölçmeliyim? → 💡 Öner* (veya Sonuç ekranındaki "Önerilen noktalar" bağlantısı): mevcut fit'e göre, parametre vektörü $\boldsymbol\theta = [\ln C_1,\, n_1,\, \ln C_2,\, n_2]$ ve yanıt $y=\ln(1/UA)$ için duyarlılık (Jacobian) $J$ sayısal hesaplanır. Bilgi matrisi $M = \sum J^\mathsf{T} J$ olmak üzere, aday ızgaradan (harita debi aralığı, 12×12) her adımda

$$\max_{c}\; \ln\det\!\left(M + J_c^\mathsf{T} J_c\right)$$

olan nokta seçilir (açgözlü D-optimal tasarım). Mevcut noktalara %5'ten yakın adaylar elenir. Tablo; önerilen debileri (eşleme birimlerinde), her noktanın bilgi kazancını ve tüm öneriler eklendiğinde beklenen parametre standart sapması azalmasını (%) gösterir. Ayrıca taraf direnç payları hesaplanır: bir tarafın payı < %20 ise o tarafın parametrelerinin zayıf belirlendiği belirtilir ve hangi yönde ölçüm alınacağı önerilir. 1D modda sabit tutulan debiyi değiştiren adaylar da üretilir. **Forma al** düğmesi debileri manuel giriş formuna aktarır.

## Zaman Serisinden Kararlı Rejim Tespiti

*1 · Veri → 📈 Kayıt cihazından*: veri kaydedici dosyası (CSV/Excel) yüklenir. Zaman sütunu adından algılanır (`Time`, `t [s]`, `Zaman`, tarih-saat metni de olabilir); yoksa sabit örnekleme aralığı kullanılır.

- **Ölçüt sinyalleri:** varsayılan olarak eşleme tablosundaki debi ve sıcaklık sütunları (yoksa adı debi/sıcaklık gibi olanlar) seçilir. Sıcaklıklar mutlak tolerans (varsayılan 0.2 K), diğerleri göreli tolerans (varsayılan %1) ile değerlendirilir.
- **Kayan pencere** $W$ (varsayılan 60 s): her $t_i$ için $[t_i-W,\,t_i]$ penceresinde her sinyalin standart sapması $\sigma \le \text{tol}$ **ve** doğrusal eğim kaynaklı değişim $\vert \text{eğim}\vert\cdot W \le \text{tol}$ ise o an kararlıdır (önek toplamlarıyla $O(N)$).
- Ardışık kararlı anlar birleştirilir; süresi *min. kararlı süre*'den kısa olanlar atılır. Geçiş bölgelerinin ortalamaya sızmaması için her bölgenin iki ucundan *kenar kırpma* (varsayılan %10) kadar kısım çıkarılır.
- Her bölge için tüm sayısal sütunların ortalaması bir test noktası olur (`SS01`, `SS02`…; `t_start`, `t_end`, `n_samples` ile). Grafikte kararlı bölgeler yeşil, ortalaması alınan kısım çerçeveli gösterilir.
- **＋ Bulunan noktaları ekle** ile mevcut veri setine eklenir (veri seti yoksa yeni veri seti oluşturulur ve otomatik eşleme yapılır).

## Performans Tahmin Motoru (Rating)

Analizden elde edilen $C_1, n_1, C_2, n_2, R_w$ ve $K_p, n_p$ ile istenen $\dot m_1, \dot m_2, T_{1,in}, T_{2,in}$ için:

1. $h_1, h_2$ → $\eta_{o1}, \eta_{o2}$ → $UA$
2. $T_m$ tahmini → $c_p$ → $C_{\min}, C_r$ → $\text{NTU} = UA/C_{\min}$ → $\varepsilon$ (çapraz akış bağıntısı)
3. $Q = \varepsilon\,C_{\min}\,\vert T_{1,in}-T_{2,in}\vert$, $T_{1,out} = T_{1,in} \mp Q/C_1$, $T_{2,out} = T_{2,in} \pm Q/C_2$
4. $T_m$ değişmeyene kadar 2–3 tekrarlanır (boyutsuz modelde $\mu, k, \text{Pr}$ ve dolayısıyla $h$ de her adımda güncellenir); $\Delta P_i = K_{p,i}\,\dot m_i^{n_{p,i}}$ veya Fanning bağıntısı.

Girdiler test aralığının ±%10 dışına çıkarsa **ekstrapolasyon** uyarısı verilir; giriş sıcaklığı test aralığından 10 K'den fazla farklıysa da uyarı verilir (kütle modelinde boyutsuz model önerilir). Bootstrap yapıldıysa $\varepsilon$ için %95 güven aralığı gösterilir. Sağdaki grafik, diğer debi sabitken seçili debinin taranmasıyla $\varepsilon$, $Q$ ve $\Delta P$ eğrilerini gösterir.

## Performans Haritası ve Dışa Aktarma

*4 · Çıktılar → 🗺️ Performans haritası*, analiz sonucundaki modelle bir debi ızgarasında tüm performans büyüklüklerini hesaplar.

**Aralık:** $\dot m_1$ ve $\dot m_2$ için min / max / adım sayısı ve birim; giriş sıcaklıkları için bir veya birden çok seviye (virgülle, ör. `60, 80, 100`). Her $T_{1,in}\times T_{2,in}$ kombinasyonu ayrı bir harita seviyesidir. **Boş bırakılan her alan akıllı aralıkla doldurulur:**

| Alan | Akıllı varsayılan |
|---|---|
| Debi aralığı | Test edilen min–max'ın ×0.8 – ×1.2'si (hafif ekstrapolasyon) |
| Dağılım | max/min > 4 ise logaritmik, değilse doğrusal (veya elle seçim) |
| Adım sayısı | 13 (1D modda sabit debi tek değer → eğri haritası) |
| Sıcaklıklar | Test verisinin ortalama giriş sıcaklıkları |

**Aralığı özelleştir → ✨ Otomatik değerleri yaz** düğmesi bu değerleri forma yazar; sonra düzenleyebilirsiniz.

**Her ızgara noktasında:** $\varepsilon$, $Q$, $T_{1,out}$, $T_{2,out}$, $\Delta P_1$, $\Delta P_2$, NTU, UA, $C_r$, $h_1$, $h_2$, $\eta_o$, Re (boyutsuz modelde), bootstrap yapıldıysa $\varepsilon$ %95 alt/üst sınırları ve **ekstrapolasyon bayrağı**. Test edilen bölge, fit'e dahil noktaların $(\ln\dot m_1, \ln\dot m_2)$ düzlemindeki **dışbükey zarfı**dır (1D modda değişken debi aralığı); zarf dışındaki noktalar `extrapolated = 1` olarak işaretlenir ve grafikte gri × ile gösterilir.

**Grafik:** seçilen büyüklük ve seviye için kontur haritası (test noktaları, kesikli zarf çizgisi); 1D modda eğri (+ %95 bant).

**Dışa aktarma formatları** (tüm seviyeler):

| Format | İçerik | Tipik kullanım |
|---|---|---|
| **Uzun CSV** | Her satır bir ızgara noktası, tüm büyüklükler, seçilen birimlerle | Analiz, veritabanı |
| **Matris CSV** | Seçili büyüklük ve seviye: satırlar $\dot m_1$, sütunlar $\dot m_2$ | 2D lookup tablosu (Simulink, GT-Suite, AMESim, Modelica…) |
| **Excel (.xlsx)** | `Info` (model, parametreler, GA'lar, birimler) + her seviye × büyüklük için matris sayfası (`L1_eps`, `L1_dp1`…) + `Long` | Raporlama, paylaşım |
| **JSON** | Izgara (SI), tüm noktalar, zarf, fit ve ΔP parametreleri, geometri | Başka yazılımlara aktarma |

Harita, analiz veya bootstrap yeniden çalıştırıldığında otomatik güncellenir ve PDF raporuna eklenir.

## Görselleştirme, İstatistikler ve PDF Raporu

Grafikler (Plotly.js, etkileşimli; her grafik kamera simgesiyle PNG indirilebilir):

- **3D Yüzey** $\varepsilon(\dot m_1, \dot m_2)$ — model yüzeyi + ölçüm noktaları (2D mod); 1D modda $\varepsilon$–debi eğrisi.
- **ε–debi eğrileri** — diğer debinin her seviyesi için model eğrisi ve ölçüm.
- **Parity Plot** ($y=x$, ±%5 bandı) — $\varepsilon$ ve $\Delta P$ için.
- **Wilson Plot** — iki taraf için direnç ayrıştırması.
- **Isı dengesi hatası** çubuk grafiği (eşik çizgisi ile).
- **ΔP–debi** eğrileri.
- **Performans haritası** (kontur) ve **kararlı rejim** zaman serisi grafiği.

İstatistikler (fit'e dahil noktalar üzerinden):

$$R^2 = 1 - \frac{\sum (y_i - \hat y_i)^2}{\sum (y_i - \bar y)^2}, \quad \text{RMSE} = \sqrt{\frac{1}{N}\sum (y_i-\hat y_i)^2}, \quad \text{MAPE} = \frac{100}{N}\sum \left\vert\frac{y_i - \hat y_i}{y_i}\right\vert$$

**PDF raporu** (`html2pdf.js`): proje bilgileri, özet, yöntem denklemleri, akışkan/geometri tablosu, fit parametreleri, seçili performans tahmini, tüm grafikler ve (isteğe bağlı) nokta tablosunu içeren A4 mühendislik raporu üretir.

## Proje Dosyası ve Otomatik Taslak

- **📁 Proje → 💾 Projeyi kaydet:** Ham veri, eşleme, birimler, akışkan/geometri, ayarlar, rating girdileri, rapor bilgileri ve kütüphane tek bir `.json` dosyasına yazılır.
- **📁 Proje → 📂 Proje aç:** Kaydedilen dosyayı geri yükler ve analizi yeniden çalıştırır.
- **Otomatik taslak:** Her değişiklik tarayıcının `localStorage` alanına (`hexeffectiveness_draft_v1`) yazılır; sayfa yeniden açıldığında otomatik geri yüklenir. **📁 Proje → ⟲ Her şeyi sıfırla** taslağı siler.

## Demo Test Verisi

**▶ Demo ile dene** düğmesi ve **📁 Proje → Demo verisini CSV indir**, bilinen parametrelerle üretilmiş sentetik bir su (taraf 1) / hava (taraf 2) radyatör testi oluşturur:

- Gerçek parametreler: $C_1 = 6000$, $n_1 = 0.55$, $C_2 = 115$, $n_2 = 0.50$, $R_w = 10^{-5}$ K/W; $\Delta P_1 = 12000\,\dot m_1^{1.8}$, $\Delta P_2 = 180\,\dot m_2^{1.9}$ Pa.
- Geometri: $A_1 = 0.8$ m², $A_2 = 4.5$ m², alüminyum kanatçıklar.
- 5 × 6 = 30 test noktası + ısı dengesi bozuk 3 nokta; sıcaklık, debi ve ΔP'ye gerçekçi gürültü eklenmiştir.
- Sütunlar karışık sırada ve karışık birimlerdedir (`kg/h`, `kg/s`, `°C`, `kPa`, `mbar`, `%`) — eşleme ve birim dönüştürücüyü göstermek içindir.

Gürültü nedeniyle su tarafı parametreleri (toplam direncin ~%15'i) gerçek değerlerden sapabilir; $\varepsilon$ uyumu ise $R^2 > 0.99$ düzeyindedir (bkz. tanımlanabilirlik notu).

## Sınırlamalar ve İyi Uygulamalar

- Varsayılan bağıntı **tek geçişli, iki tarafı karışmamış çapraz akış** içindir; eşanjörünüz çok geçişli, bir tarafı karışık, ters veya paralel akışlıysa *Akış düzeni* kartından seçin (bkz. 3b). Çok geçişte dönüşlerde karışma varsayılır; dönüşte karışmayan (kanal kanal dönen) düzenlerde gerçek $\varepsilon$ biraz daha yüksek olabilir.
- Faz değişimi (yoğuşma/buharlaşma) ve nem transferi modellenmez; ıslak yüzey testlerinde duyulur ısı dengesi bozulur.
- Wilson analizi için test matrisi her iki debiyi de geniş bir aralıkta (tercihen ≥ 3:1) değiştirmelidir.
- Özellik polinomlarını geçerlilik aralığı dışında kullanmaktan kaçının.
- Kütle debisi modeli tek bir akışkan/sıcaklık civarında geçerlidir; farklı giriş sıcaklıklarına veya akışkanlara tahmin için boyutsuz (Re/Nu–Pr) modeli kullanın. Boyutsuz model de laminer↔türbülanslı geçiş gibi rejim değişimlerini tek bir üsle temsil edemez — haritayı test edilen Re aralığında tutun.
- Bootstrap güven aralıkları yalnızca istatistiksel (rastgele) belirsizliği yansıtır; sistematik sensör hatalarını içermez.
- Alanlar bilinmiyorsa $A = 1$ m² ve kanatçık verimi kapalı kullanılabilir; bu durumda $C$ katsayıları doğrudan $(hA)$ korelasyonu olarak yorumlanır ve tahmin motoru yine doğru çalışır.

---

## Geliştirme Protokolü

Bu proje üzerinde AI destekli geliştirme yapılırken şu kurallar geçerlidir:

1. **İstem kontrolü:** Mesaj en başta `CODE` kelimesiyle başlamıyorsa kod üretilmez; yalnızca teorik, teknik veya operasyonel sorular yanıtlanır. Mesaj `CODE` ile başlıyorsa istenen değişiklikler mevcut kod yapısına entegre edilerek güncellenir.
2. **README ↔ Yardım senkronizasyonu:** Uygulamanın Yardım paneli bu dosyayı canlı olarak gösterir. Teori, formül veya kullanım değişiklikleri **yalnızca bu README'de** yapılır; arayüzde ayrı bir yardım metni tutulmaz.
