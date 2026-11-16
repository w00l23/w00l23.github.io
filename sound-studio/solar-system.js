// The solar system behind Music Orbit. Made by tools/solar_bg.py from the
// solar system sim (github.com/w00l23/solar-system, cd11e54 2026-11-01): edit the sim
// or the tool, not this file. Credits for the data are in that repo.
window.SolarBackdrop = (function(){
  'use strict';

  // Set by Sound Studio before this file loads (window.SOLAR_BG_OPTS); set() changes the live ones.
  const BG = Object.assign({ pixels: 2.4e6, dpr: 2, el: 0.62, az: 0.4, turn: 1, sun: 0, planet: 0, glow: 0, each: {}, lift: 0 }, window.SOLAR_BG_OPTS || {});
  const BOX = document.createElement('div');
  BOX.innerHTML = "<div id=\"label\" aria-live=\"polite\">\n  <div><span class=\"nm\" id=\"lbName\"></span><span class=\"kd\" id=\"lbKind\"></span></div>\n  <div class=\"ft\" id=\"lbFacts\"></div>\n  <button class=\"pill\" id=\"lbGo\" type=\"button\" hidden></button>\n</div>\n\n<button class=\"pill\" id=\"home\" type=\"button\" data-en=\"\u2039 the whole system\" data-es=\"\u2039 todo el sistema\">\u2039 the whole system</button>\n<button class=\"pill\" id=\"out\" type=\"button\" data-en=\"the nearest stars \u203a\" data-es=\"las estrellas cercanas \u203a\">the nearest stars \u203a</button>\n<p id=\"far\" aria-hidden=\"true\"><span id=\"farA\"></span><span id=\"farB\"></span></p>\n<div id=\"names\" aria-hidden=\"true\"></div>\n<div id=\"night\" aria-hidden=\"true\"></div>\n\n<p class=\"hint\" id=\"hint\"></p>\n\n<div id=\"bar\">\n  <button class=\"pill\" id=\"date\" type=\"button\" aria-label=\"Date shown. Tap to come back to today.\"></button>\n  <span class=\"pace\" role=\"group\" aria-label=\"Pace of time\">\n    <button class=\"pill\" id=\"slower\" type=\"button\" aria-label=\"Slower\"><span class=\"sign\">\u2212</span></button>\n    <button class=\"pill\" id=\"paceLabel\" type=\"button\" aria-label=\"Pause or play\"></button>\n    <button class=\"pill\" id=\"faster\" type=\"button\" aria-label=\"Faster\"><span class=\"sign\">+</span></button>\n  </span>\n  <button class=\"pill\" id=\"scale\" type=\"button\" aria-pressed=\"false\" data-en=\"true distances\" data-es=\"distancias reales\">true distances</button>\n  <button class=\"pill\" id=\"journey\" type=\"button\" aria-pressed=\"false\" data-en=\"through the galaxy\" data-es=\"por la galaxia\">through the galaxy</button>\n  <button class=\"pill\" id=\"eclipse\" type=\"button\" data-en=\"next eclipse\" data-es=\"pr\u00f3ximo eclipse\">next eclipse</button>\n  <button class=\"pill\" id=\"sky\" type=\"button\" aria-pressed=\"false\" data-en=\"your sky tonight\" data-es=\"tu cielo esta noche\">your sky tonight</button>\n  <span class=\"pill\" id=\"placePill\"><span id=\"placeName\"></span><select id=\"place\" aria-label=\"Where you are\"></select></span>\n</div>\n\n<div id=\"veil\" aria-hidden=\"true\"></div>";
  const cv = document.createElement('canvas');
  const $ = id => BOX.querySelector('#' + id);
  const QS = new URLSearchParams('');

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE  = window.matchMedia('(pointer: coarse)').matches;

  // --- words ------------------------------------------------------
  // ?lang= first, then the browser's
  let LANG = 'en';
  try {
    const asked = 'en';
    LANG = /^es/i.test(asked) ? 'es' : 'en';
  } catch (e) {
    LANG = /^es/i.test(QS.get('lang') || navigator.language || '') ? 'es' : 'en';
  }
  const T = (en, es) => LANG === 'es' ? es : en;
  if (LANG === 'es') {
    document.title = 'Sistema Solar';
    document.querySelectorAll('[data-es]').forEach(el => { el.textContent = el.getAttribute('data-es'); });
    cv.setAttribute('aria-label', 'El sistema solar. Arrastra para girar, pellizca o desplaza para acercarte, toca un mundo para ver su nombre.');
    $('date').setAttribute('aria-label', 'Fecha mostrada. Toca para volver a hoy.');
    $('slower').setAttribute('aria-label', 'Más lento');
    $('faster').setAttribute('aria-label', 'Más rápido');
    $('paceLabel').setAttribute('aria-label', 'Pausar o reanudar');
    $('place').setAttribute('aria-label', 'Dónde estás');
  }
  const NUM = (v, d) => v.toLocaleString(LANG === 'es' ? 'es' : 'en-US', { maximumFractionDigits: d, minimumFractionDigits: d, useGrouping: Math.abs(v) >= 10000 });

  // --- numbers ----------------------------------------------------
  const PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
  const AU = 149597870.7;                 // km
  const J2000 = 2451545.0;
  const JD0 = 2461311.5;                  // 2026-09-28: the day the small bodies and moons were anchored
  const EPS = 23.43928 * D2R, CE = Math.cos(EPS), SE = Math.sin(EPS);
  const TT_UTC = 69.2 / 86400;            // the clock on the wall runs this far behind the clock of the orbits
  const LY = 63241.077;                   // au in a light-year
  const PARSEC = 206264.806;              // au in a parsec
  const LIGHT_DAYS = 499.004784 / 86400;  // how long light takes to cross one au, in days
  const GAUSS_K = 0.01720209895;          // the Sun's pull: rad/day at 1 au

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = a => Math.sqrt(dot(a, a));
  const cross = (a, b, o) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; };
  const unit = (a, o) => { const l = len(a) || 1; o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o; };

  // ecliptic (x to the equinox, z to the ecliptic pole) -> the scene (y up)
  const toScene = (x, y, z, o) => { o[0] = x; o[1] = z; o[2] = -y; return o; };
  // equatorial -> ecliptic -> the scene
  const eqToScene = (x, y, z, o) => toScene(x, CE * y + SE * z, -SE * y + CE * z, o);
  const raDec = (ra, dec, o) => { const a = ra * D2R, d = dec * D2R; return eqToScene(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d), o); };

  // a small seeded generator: the belts and the faint stars are the same every visit
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // --- where things are -------------------------------------------
  // Kepler's equation, M = E - e sin E
  function kepler(M, e) {
    M = ((M + PI) % TAU + TAU) % TAU - PI;
    let E = e < 0.8 ? M + e * Math.sin(M) * (1 + e * Math.cos(M)) : (M >= 0 ? PI : -PI);
    for (let k = 0; k < 40; k++) {
      const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-13) break;
    }
    return E;
  }

  // and for a body that is not coming back: M = e sinh H - H
  function keplerOut(M, e) {
    let H = Math.asinh(M / e);
    for (let k = 0; k < 40; k++) {
      const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
      H -= d;
      if (Math.abs(d) < 1e-13) break;
    }
    return H;
  }

  // an orbit, as the renderer wants it: size, shape, the two axes of its
  // plane (P to the closest point, Q a quarter turn on), and where on it the
  // body is (E). Axes are in scene coordinates. With e above 1 it is not an
  // orbit but a way out: the curve of a spacecraft that has the speed to leave.
  function Orbit() { this.a = 1; this.e = 0; this.P = [1, 0, 0]; this.Q = [0, 0, -1]; this.E = 0; }
  Orbit.prototype.setAngles = function (a, e, i, Om, w) {
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(i), si = Math.sin(i);
    this.a = a; this.e = e;
    toScene(cw * cO - sw * sO * ci, cw * sO + sw * cO * ci, sw * si, this.P);
    toScene(-sw * cO - cw * sO * ci, -sw * sO + cw * cO * ci, cw * si, this.Q);
  };
  Orbit.prototype.at = function (E, o) {
    const out = this.e > 1;
    const x = out ? this.a * (this.e - Math.cosh(E)) : this.a * (Math.cos(E) - this.e);
    const y = out ? this.a * Math.sqrt(this.e * this.e - 1) * Math.sinh(E) : this.a * Math.sqrt(1 - this.e * this.e) * Math.sin(E);
    o[0] = this.P[0] * x + this.Q[0] * y; o[1] = this.P[1] * x + this.Q[1] * y; o[2] = this.P[2] * x + this.Q[2] * y;
    return o;
  };
  // the angle that grows evenly with time, from the one that says where the body is; and back
  Orbit.prototype.mean = function () { return this.e > 1 ? this.e * Math.sinh(this.E) - this.E : this.E - this.e * Math.sin(this.E); };
  Orbit.prototype.solve = function (M) { return this.e > 1 ? keplerOut(M, this.e) : kepler(M, this.e); };

  // JPL, "Approximate Positions of the Planets" (Standish & Williams), table
  // 2a: a, e, I, L, long. of perihelion, long. of node, then the same per
  // century; table 2b for the four giants. Pluto is the same authors'
  // 1800-2050 fit, from before it was taken off the page.
  const EL = {
    mercury: [0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819, 0.00000000, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182],
    venus:   [0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496, -0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174],
    earth:   [1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389, -0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856],
    mars:    [1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984, 0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431],
    jupiter: [5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654, -0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619],
    saturn:  [9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702, -0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002],
    uranus:  [19.18797948, 0.04685740, 0.77298127, 314.20276625, 172.43404441, 73.96250215, -0.00020455, -0.00001550, -0.00180155, 428.49512595, 0.09266985, 0.05739699],
    neptune: [30.06952752, 0.00895439, 1.77005520, 304.22289287, 46.68158724, 131.78635853, 0.00006447, 0.00000818, 0.00022400, 218.46515314, 0.01009938, -0.00606302],
    pluto:   [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684, -0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]
  };
  const EL_EXTRA = {
    jupiter: [-0.00012452, 0.06064060, -0.35635438, 38.35125000],
    saturn:  [0.00025899, -0.13434469, 0.87320147, 38.35125000],
    uranus:  [0.00058331, -0.97731848, 0.17689245, 7.67025000],
    neptune: [-0.00041348, 0.68346318, -0.10162547, 7.67025000]
  };
  // osculating elements on JD0, from JPL Horizons: a, e, i, node, arg. of perihelion, M, n (deg/day)
  const SMALL = {
    ceres:    [2.76599031, 0.07976222, 10.58739797, 80.24897215, 73.19319998, 298.30966038, 0.2142535830],
    eris:     [67.90574469, 0.43875476, 43.95212414, 35.99451803, 150.83454989, 211.92976499, 0.001761344467],
    haumea:   [43.08607954, 0.19387786, 28.20846734, 121.78684605, 240.57264437, 223.71425437, 0.003484966483],
    makemake: [45.59527792, 0.15825449, 29.02508101, 79.31071851, 297.06310390, 170.32597210, 0.003201284508],
    halley:   [17.85948894, 0.96802658, 162.18997825, 59.27413706, 112.17466908, 193.77660490, 0.01305871769],
    encke:    [2.21773122, 0.84731651, 11.34775896, 334.01892837, 187.28763599, 319.64386316, 0.2984287829],
    cg67p:    [3.45899884, 0.64948840, 3.86610574, 36.28814497, 22.23745524, 274.27358322, 0.1532069439]
  };
  // fitted to JPL Horizons, 2019-2034: [a km, n rad/day, angle at JD0, e, periapsis angle, orbit normal (ecliptic x y z)]
  const MOON_FIT = {
    phobos: [9376.7, 19.70206022, 0.65655, 0.0001, 3.956, 0.44575, -0.056, 0.89341],
    deimos: [23457.6, 4.977012616, 5.10448, 0.0002, 0.8374, 0.40773, -0.05964, 0.91115],
    io: [421747.1, 3.551552274, 3.75873, 0.0001, 4.9623, -0.01464, -0.03574, 0.99925],
    europa: [671301.6, 1.76932354, 5.55187, 0.0015, 3.2113, -0.01806, -0.03244, 0.99931],
    ganymede: [1070378.0, 0.8782080114, 4.67663, 0.002, 6.2784, -0.01462, -0.03804, 0.99917],
    callisto: [1882599.4, 0.3764862282, 3.07618, 0.0073, 0.5942, -0.01339, -0.03129, 0.99942],
    enceladus: [238131.0, 4.585536147, 0.58502, 0.0, 1.154, 0.08551, 0.46242, 0.88253],
    tethys: [294673.5, 3.328305542, 5.61249, 0.0, 2.5265, 0.08629, 0.46229, 0.88252],
    dione: [377409.7, 2.295717653, 5.11129, 0.0005, 1.9514, 0.08557, 0.46244, 0.88251],
    rhea: [527070.6, 1.390853676, 6.01743, 0.001, 3.0043, 0.08338, 0.4651, 0.88132],
    titan: [1223201.0, 0.3940425941, 2.54916, 0.0287, 3.1111, 0.08822, 0.45631, 0.88544],
    iapetus: [3563420.6, 0.07920208356, 2.06917, 0.0284, 4.0561, 0.1928, 0.21953, 0.95637],
    miranda: [129832.8, 4.445194794, 2.79046, 0.0014, 1.1462, 0.22217, 0.96555, -0.13547],
    ariel: [190929.3, 2.492952111, 3.53318, 0.0004, 4.42, 0.21184, 0.96803, -0.13433],
    umbriel: [265991.8, 1.516148034, 2.28739, 0.0037, 1.1043, 0.21073, 0.96828, -0.13425],
    titania: [436290.0, 0.7217184194, 3.75412, 0.0016, 4.4868, 0.21202, 0.96788, -0.13509],
    oberon: [583460.8, 0.4666920775, 2.42, 0.0016, 3.2768, 0.21086, 0.96779, -0.13756],
    triton: [354759.4, 1.069142898, 0.51055, 0.0001, 1.9224, -0.52736, 0.56863, -0.63131],
    charon: [19595.7, 0.9837117366, 6.0372, 0.0002, 3.0124, -0.67807, 0.62367, -0.38893],
  };

  // the five that are leaving, from JPL Horizons: where each was on JD0 and
  // how fast it was going (from the Sun, in the ecliptic of J2000; au, and au
  // a day), and the day the last world it passed was behind it. Since that
  // day nothing has pulled on it but the Sun, and the one curve through this
  // one moment is its whole way out.
  const CRAFT = {
    voyager1: [-32.1594362, -136.801015, 98.9781971, -0.00119549405, -0.00786118314, 0.00567844708, 2444556.5],
    voyager2: [39.8829892, -105.448165, -89.6837047, 0.00242767556, -0.0053944939, -0.0065360181, 2447764.5],
    pioneer10: [24.0689407, 139.656751, 7.39137645, 0.000708606055, 0.00679820463, 0.000348282857, 2442021.5],
    pioneer11: [29.0800118, -110.750986, 28.2250014, 0.0023318262, -0.00583092004, 0.00140425226, 2444118.5],
    newhorizons: [20.8379748, -62.25421, 2.28966815, 0.00306554393, -0.00721339691, 0.000283881023, 2457218.5],
  };
  // the neighbours: every star within twelve light-years, and three bright
  // ones beyond. Right ascension, declination, parallax (thousandths of a
  // second of arc), brightness V, colour B-V: from SIMBAD.
  const NEAR = {
    proxima: [217.42894, -62.67949, 768.067, 11.13, 1.82],
    alfcen: [219.90208, -60.83397, 750.81, -0.1, 0.5],
    barnard: [269.45208, 4.69336, 546.976, 9.51, 1.73],
    luhman16: [162.32881, -53.31947, 501.557, 16.2, 2.2],
    wise0855: [133.81891, -7.24705, 439.0, 25.0, 2.2],
    wolf359: [164.1205, 7.01472, 415.179, 13.51, 2.03],
    lalande21185: [165.83415, 35.96988, 392.753, 7.52, 1.44],
    sirius: [101.28716, -16.71612, 379.21, -1.46, 0.0],
    luyten7268: [24.75605, -17.95057, 375.0, 12.08, 1.85],
    ross154: [282.45568, -23.83624, 336.027, 10.43, 1.76],
    ross248: [355.47932, 44.17745, 316.481, 12.29, 1.9],
    epseri: [53.23269, -9.45826, 310.577, 3.73, 0.88],
    lacaille9352: [346.46682, -35.85307, 304.135, 7.39, 1.44],
    ross128: [176.93499, 0.80456, 296.305, 11.15, 1.75],
    ezaqr: [339.6399, -15.29993, 293.6, 12.38, 1.95],
    cyg61: [316.72475, 38.74942, 285.995, 5.21, 1.18],
    procyon: [114.8255, 5.22499, 284.56, 0.37, 0.42],
    struve2398: [280.6946, 59.63039, 283.84, 8.93, 1.5],
    groombridge34: [4.59535, 44.02295, 280.707, 8.14, 1.47],
    dxcnc: [127.45564, 26.77601, 279.25, 14.81, 2.06],
    epsind: [330.84022, -56.78598, 274.843, 4.69, 1.06],
    tauceti: [26.01701, -15.93748, 273.81, 3.5, 0.72],
    gj1061: [53.99875, -44.5127, 272.161, 13.07, 1.91],
    altair: [297.69583, 8.86832, 194.95, 0.76, 0.22],
    vega: [279.23473, 38.78369, 130.23, 0.03, 0.0],
    fomalhaut: [344.41269, -29.62224, 129.81, 1.16, 0.09],
  };

  function planetOrbit(key, jd, orb) {
    const T = (jd - J2000) / 36525, k = EL[key];
    const a = k[0] + k[6] * T, e = k[1] + k[7] * T, I = k[2] + k[8] * T;
    const L = k[3] + k[9] * T, lp = k[4] + k[10] * T, ln = k[5] + k[11] * T;
    let M = L - lp;
    const x = EL_EXTRA[key];
    if (x) M += x[0] * T * T + x[1] * Math.cos(x[3] * T * D2R) + x[2] * Math.sin(x[3] * T * D2R);
    orb.setAngles(a, e, I * D2R, ln * D2R, (lp - ln) * D2R);
    orb.E = kepler(M * D2R, e);
  }
  function smallOrbit(key, jd, orb) {
    const k = SMALL[key];
    if (!orb.fixed) { orb.setAngles(k[0], k[1], k[2] * D2R, k[3] * D2R, k[4] * D2R); orb.fixed = true; }
    orb.E = kepler((k[5] + k[6] * (jd - JD0)) * D2R, k[1]);
  }
  function craftOrbit(key, jd, orb) {
    const k = CRAFT[key];
    if (!orb.fixed) {
      const r = [k[0], k[1], k[2]], v = [k[3], k[4], k[5]], mu = GAUSS_K * GAUSS_K, far = len(r);
      const h = cross(r, v, [0, 0, 0]), ev = cross(v, h, [0, 0, 0]);
      for (let i = 0; i < 3; i++) ev[i] = ev[i] / mu - r[i] / far;
      const e = len(ev), a = 1 / (dot(v, v) / mu - 2 / far);
      const P = unit(ev, [0, 0, 0]), Q = cross(unit(h, h), P, [0, 0, 0]);
      const H0 = Math.asinh(dot(r, Q) / (a * Math.sqrt(e * e - 1)));
      orb.a = a; orb.e = e; orb.n = Math.sqrt(mu / (a * a * a)); orb.M0 = e * Math.sinh(H0) - H0;
      toScene(P[0], P[1], P[2], orb.P); toScene(Q[0], Q[1], Q[2], orb.Q);
      orb.fixed = true;
    }
    orb.E = keplerOut(orb.M0 + orb.n * (jd - JD0), orb.e);
  }
  const _n = [0, 0, 0], _e1 = [0, 0, 0], _e2 = [0, 0, 0];
  function moonOrbit(key, jd, orb) {
    const k = MOON_FIT[key];
    if (!orb.fixed) {
      // the fit's own axes: e1 along the node of the orbit on the ecliptic, e2 a quarter turn on
      _n[0] = k[5]; _n[1] = k[6]; _n[2] = k[7];
      unit(cross([0, 0, 1], _n, _e1), _e1); cross(_n, _e1, _e2);
      const cw = Math.cos(k[4]), sw = Math.sin(k[4]);
      orb.a = k[0] / AU; orb.e = k[3];
      toScene(cw * _e1[0] + sw * _e2[0], cw * _e1[1] + sw * _e2[1], cw * _e1[2] + sw * _e2[2], orb.P);
      toScene(-sw * _e1[0] + cw * _e2[0], -sw * _e1[1] + cw * _e2[1], -sw * _e1[2] + cw * _e2[2], orb.Q);
      orb.fixed = true;
    }
    orb.E = kepler(k[2] + k[1] * (jd - JD0) - k[4], k[3]);
  }
  // our own Moon, from the larger terms of the lunar theory in Meeus,
  // "Astronomical Algorithms": 32 in longitude and distance, 23 in latitude.
  // Within 0.015 degrees of Horizons, which is close enough that the Moon's
  // shadow falls on the right country on the day of an eclipse.
  // rows of D, M, M', F, then longitude (1e-6 deg) and distance (m)
  const MOON_LR = [
    0,0,1,0,6288774,-20905355, 2,0,-1,0,1274027,-3699111, 2,0,0,0,658314,-2955968, 0,0,2,0,213618,-569925,
    0,1,0,0,-185116,48888, 0,0,0,2,-114332,-3149, 2,0,-2,0,58793,246158, 2,-1,-1,0,57066,-152138,
    2,0,1,0,53322,-170733, 2,-1,0,0,45758,-204586, 0,1,-1,0,-40923,-129620, 1,0,0,0,-34720,108743,
    0,1,1,0,-30383,104755, 2,0,0,-2,15327,10321, 0,0,1,2,-12528,0, 0,0,1,-2,10980,79661, 4,0,-1,0,10675,-34782,
    0,0,3,0,10034,-23210, 4,0,-2,0,8548,-21636, 2,1,-1,0,-7888,24208, 2,1,0,0,-6766,30824, 1,0,-1,0,-5163,-8379,
    1,1,0,0,4987,-16675, 2,-1,1,0,4036,-12831, 2,0,2,0,3994,-10445, 4,0,0,0,3861,-11650, 2,0,-3,0,3665,14403,
    0,1,-2,0,-2689,-7003, 2,0,-1,2,-2602,0, 2,-1,-2,0,2390,10056, 1,0,1,0,-2348,6322, 2,-2,0,0,2236,-9884
  ];
  // rows of D, M, M', F, then latitude (1e-6 deg)
  const MOON_B = [
    0,0,0,1,5128122, 0,0,1,1,280602, 0,0,1,-1,277693, 2,0,0,-1,173237, 2,0,-1,1,55413, 2,0,-1,-1,46271,
    2,0,0,1,32573, 0,0,2,1,17198, 2,0,1,-1,9266, 0,0,2,-1,8822, 2,-1,0,-1,8216, 2,0,-2,-1,4324, 2,0,1,1,4200,
    2,1,0,-1,-3359, 2,-1,-1,1,2463, 2,-1,0,1,2211, 2,-1,-1,-1,2065, 0,1,-1,-1,-1870, 4,0,-1,-1,1828, 0,1,0,1,-1794,
    0,0,0,3,-1749, 0,1,-1,1,-1565, 0,1,0,-1,-1491
  ];
  function theMoon(now, orb, out) {
    const T = (now - J2000) / 36525;
    const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T, D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
    const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T, Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
    const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T;
    const A1 = (119.75 + 131.849 * T) * D2R, A2 = (53.09 + 479264.290 * T) * D2R, A3 = (313.45 + 481266.484 * T) * D2R;
    const E = 1 - 0.002516 * T - 0.0000074 * T * T;
    let sl = 0, sr = 0, sb = 0;
    for (let i = 0; i < MOON_LR.length; i += 6) {
      const a = (MOON_LR[i] * D + MOON_LR[i + 1] * M + MOON_LR[i + 2] * Mp + MOON_LR[i + 3] * F) * D2R;
      const e = MOON_LR[i + 1] ? (Math.abs(MOON_LR[i + 1]) === 2 ? E * E : E) : 1;
      sl += MOON_LR[i + 4] * e * Math.sin(a); sr += MOON_LR[i + 5] * e * Math.cos(a);
    }
    for (let i = 0; i < MOON_B.length; i += 5) {
      const a = (MOON_B[i] * D + MOON_B[i + 1] * M + MOON_B[i + 2] * Mp + MOON_B[i + 3] * F) * D2R;
      sb += MOON_B[i + 4] * (MOON_B[i + 1] ? E : 1) * Math.sin(a);
    }
    sl += 3958 * Math.sin(A1) + 1962 * Math.sin((Lp - F) * D2R) + 318 * Math.sin(A2);
    sb += -2235 * Math.sin(Lp * D2R) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - F * D2R) + 175 * Math.sin(A1 + F * D2R)
      + 127 * Math.sin((Lp - Mp) * D2R) - 115 * Math.sin((Lp + Mp) * D2R);
    // the theory speaks in the ecliptic and equinox of the day; walk both back to J2000
    const prec = (1.396971 * T + 0.0003086 * T * T) * D2R;
    const eta = (47.0029 * T - 0.03302 * T * T) / 3600 * D2R, node0 = (174.876384 - 869.8089 / 3600 * T) * D2R;
    const lon = (Lp + sl / 1e6) * D2R - prec;
    const lat = sb / 1e6 * D2R - eta * Math.sin(lon - node0);
    const r = (385000.56 + sr / 1000) / AU;
    toScene(r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), out);
    // the line it travels on: the mean ellipse, turned as it is today, and
    // breathed by a percent or so that it passes through the Moon itself
    const node = (125.0445479 - 1934.1362891 * T) * D2R - prec, peri = (83.3532465 + 4069.0137287 * T) * D2R - prec;
    orb.setAngles(384400 / AU, 0.0549, 5.145 * D2R, node, peri - node);
    const nu = Math.atan2(dot(out, orb.Q), dot(out, orb.P));
    orb.E = 2 * Math.atan2(Math.sqrt(1 - orb.e) * Math.sin(nu / 2), Math.sqrt(1 + orb.e) * Math.cos(nu / 2));
    orb.a *= r / (orb.a * (1 - orb.e * Math.cos(orb.E)));
  }

  // --- how things are turned ---------------------------------------
  // IAU rotation models: pole (RA, per century, Dec, per century), prime
  // meridian at J2000 and degrees per day. Checked against Horizons.
  const ROT = {
    sun:      [286.13, 0, 63.87, 0, 84.176, 14.1844000],
    mercury:  [281.0103, -0.0328, 61.4155, -0.0049, 329.5988, 6.1385108],
    venus:    [272.76, 0, 67.16, 0, 160.20, -1.4813688],
    earth:    [0, -0.641, 90, -0.557, 190.147, 360.9856235],
    mars:     [317.68143, -0.1061, 52.88650, -0.0609, 176.630, 350.89198226],
    jupiter:  [268.056595, -0.006499, 64.495303, 0.002413, 284.95, 870.5360000],
    saturn:   [40.589, -0.036, 83.537, -0.004, 38.90, 810.7939024],
    uranus:   [257.311, 0, -15.175, 0, 203.81, -501.1600928],
    neptune:  [299.36, 0, 43.46, 0, 249.978, 541.1397757],
    pluto:    [132.993, 0, -6.163, 0, 302.695, 56.3625225],
    ceres:    [291.418, 0, 66.764, 0, 170.65, 952.1532],
    // no agreed model for these: a plausible tilt, the measured spin
    eris:     [70, 0, 30, 0, 0, 22.80],
    haumea:   [282.6, 0, -13.0, 0, 0, 2206.6],
    makemake: [120, 0, 40, 0, 0, 378.4],
    halley:   [40, 0, 20, 0, 0, 163.6],
    encke:    [200, 0, 10, 0, 0, 785.0],
    cg67p:    [69.3, 0, 64.1, 0, 0, 696.5]
  };
  const _p = [0, 0, 0], _q = [0, 0, 0], _r = [0, 0, 0];
  function iauFrame(key, jd, b) {
    const k = ROT[key], d = jd - J2000, T = d / 36525;
    let ra = k[0] + k[1] * T, de = k[2] + k[3] * T, W = k[4] + k[5] * d;
    if (key === 'neptune') {
      const N = (357.85 + 52.316 * T) * D2R;
      ra += 0.70 * Math.sin(N); de -= 0.51 * Math.cos(N); W -= 0.48 * Math.sin(N);
    }
    W = (W % 360) * D2R; ra *= D2R; de *= D2R;
    _p[0] = Math.cos(de) * Math.cos(ra); _p[1] = Math.cos(de) * Math.sin(ra); _p[2] = Math.sin(de);
    _q[0] = -Math.sin(ra); _q[1] = Math.cos(ra); _q[2] = 0;
    cross(_p, _q, _r);
    const c = Math.cos(W), s = Math.sin(W);
    eqToScene(c * _q[0] + s * _r[0], c * _q[1] + s * _r[1], c * _q[2] + s * _r[2], b.X);
    eqToScene(_p[0], _p[1], _p[2], b.Z);
    // the scene is the ecliptic frame with two axes exchanged and one
    // reversed, which keeps its handedness: east is still Z x X
    cross(b.Z, b.X, b.Y);
  }
  // a moon that keeps one face to its planet: X toward the planet, Z along its orbit's axis
  function lockedFrame(b) {
    b.X[0] = -b.rel[0]; b.X[1] = -b.rel[1]; b.X[2] = -b.rel[2];
    cross(b.orb.P, b.orb.Q, b.Z); unit(b.Z, b.Z);
    const k = dot(b.X, b.Z);
    b.X[0] -= b.Z[0] * k; b.X[1] -= b.Z[1] * k; b.X[2] -= b.Z[2] * k; unit(b.X, b.X);
    cross(b.Z, b.X, b.Y);
  }

  // --- the bodies ---------------------------------------------------
  //  r    : true radius, km (equatorial)          flat : how squashed at the poles
  //  mk   : drawn size from far away, px          c    : its colour from far away
  //  look : how its face is painted up close
  const B = [], byKey = {};
  function add(key, en, es, kind, r, mk, c, look, extra) {
    const b = Object.assign({
      key, en, es, kind, r: r / AU, rkm: r, flat: 0, mk, c, look,
      parent: null, moons: [], orb: new Orbit(),
      // pos: where it truly is, from the Sun, au.  rel: a moon, from its planet.
      // dp: where it is drawn (the orbits may be eased together).
      // v: the same, as the camera sees it: right, up, depth.
      pos: [0, 0, 0], rel: [0, 0, 0], dp: [0, 0, 0], v: [0, 0, 0],
      // its own axes: X through the prime meridian, Z through the north pole
      X: [1, 0, 0], Y: [0, 0, -1], Z: [0, 1, 0],
      helio: 1, px: 0, py: 0, pr: 0, rd: 0, vis: 0, shown: false
    }, extra || {});
    b.i = B.length; B.push(b); byKey[key] = b;
    if (b.of) { b.parent = byKey[b.of]; b.parent.moons.push(b); }
    return b;
  }
  const KIND = {
    star: ['star', 'estrella'], planet: ['planet', 'planeta'], dwarf: ['dwarf planet', 'planeta enano'],
    moon: ['moon', 'luna'], comet: ['comet', 'cometa'], craft: ['spacecraft', 'sonda'],
    double: ['double star', 'estrella doble'], red: ['red dwarf', 'enana roja'], reds: ['red dwarfs', 'enanas rojas'],
    brown: ['brown dwarf', 'enana marrón'], browns: ['brown dwarfs', 'enanas marrones'],
    edge: ['about 120 au out', 'a unas 120 ua'], cloud: ['never seen', 'nunca vista']
  };

  add('sun', 'The Sun', 'El Sol', 'star', 695700, 6.5, [1.0, 0.85, 0.63], { kind: 'sun' }, { visit: 7 });

  add('mercury', 'Mercury', 'Mercurio', 'planet', 2439.7, 1.9, [0.61, 0.56, 0.52],
    { kind: 'tex', map: 'mercury', tint: [1.0, 0.95, 0.88], gain: 1.12, gamma: 1.0, rough: 1, limb: 0.2, detail: 0.10, atmo: [0, 0, 0, 0] });
  add('venus', 'Venus', 'Venus', 'planet', 6051.8, 3.4, [0.88, 0.73, 0.51],
    { kind: 'band', turb: 0.55, streak: 0.16, swirl: 1.0, limb: 0.9, rim: [5, 0.2, 0.35], atmo: [1.0, 0.86, 0.6, 0.55], halo: 0.008,
      stops: [[-90, .80, .72, .55], [-60, .88, .79, .60], [-30, .95, .87, .68], [0, .97, .90, .72], [30, .94, .86, .67], [60, .87, .78, .59], [90, .80, .72, .55]] });
  add('earth', 'Earth', 'La Tierra', 'planet', 6378.137, 3.6, [0.44, 0.66, 0.86],
    { kind: 'earth', limb: 1, rim: [5, 0.08, 0.2], atmo: [0.30, 0.55, 1.0, 0.75], halo: 0.007 }, { flat: 0.00335 });
  add('mars', 'Mars', 'Marte', 'planet', 3396.2, 2.6, [0.76, 0.38, 0.29],
    { kind: 'tex', map: 'mars', tint: [1, 1, 1], gain: 1.22, gamma: 0.92, rough: 0.35, limb: 0.7, detail: 0.05, rim: [5, 0.25, 0.4], atmo: [0.95, 0.62, 0.42, 0.22], halo: 0.004 }, { flat: 0.00589 });
  add('jupiter', 'Jupiter', 'Júpiter', 'planet', 71492, 9.0, [0.82, 0.65, 0.47],
    { kind: 'tex', map: 'jupiter', tint: [1, 1, 1], gain: 1.12, gamma: 0.95, rough: 0, detail: 0.03, limb: 0.85, atmo: [0.9, 0.8, 0.65, 0.18], halo: 0.003 }, { flat: 0.06487, visit: 8 });
  add('saturn', 'Saturn', 'Saturno', 'planet', 60268, 7.6, [0.89, 0.80, 0.60],
    { kind: 'band', turb: 0.10, streak: 0.10, swirl: 0.25, limb: 0.85, atmo: [0.95, 0.85, 0.65, 0.16], halo: 0.003,
      stops: [[-90, .55, .56, .52], [-72, .66, .62, .50], [-55, .78, .69, .50], [-38, .83, .74, .54], [-24, .79, .69, .50], [-12, .87, .78, .58], [0, .93, .85, .65],
        [12, .88, .79, .59], [24, .80, .70, .51], [38, .84, .75, .55], [55, .77, .69, .52], [72, .62, .62, .54], [90, .50, .54, .54]] },
    { flat: 0.09796, ring: { key: 'saturn', in: 1.11, out: 2.34 }, visit: 13 });
  add('uranus', 'Uranus', 'Urano', 'planet', 25559, 5.2, [0.62, 0.84, 0.85],
    { kind: 'band', turb: 0.04, streak: 0.03, swirl: 0.1, limb: 0.9, atmo: [0.65, 0.9, 0.95, 0.2], halo: 0.004,
      stops: [[-90, .60, .80, .82], [-45, .66, .85, .87], [0, .68, .87, .89], [40, .67, .86, .88], [70, .74, .90, .90], [90, .78, .92, .92]] },
    { flat: 0.02293, ring: { key: 'uranus', in: 1.60, out: 2.04 }, visit: 9 });
  add('neptune', 'Neptune', 'Neptuno', 'planet', 24764, 5.0, [0.43, 0.56, 0.84],
    { kind: 'band', turb: 0.12, streak: 0.10, swirl: 0.3, limb: 0.9, atmo: [0.4, 0.6, 1.0, 0.25], halo: 0.004, spot: 1,
      stops: [[-90, .22, .33, .66], [-60, .25, .38, .74], [-35, .22, .35, .72], [-15, .28, .43, .80], [0, .30, .46, .83], [20, .27, .42, .79], [45, .24, .37, .74], [70, .27, .40, .75], [90, .24, .35, .68]] },
    { flat: 0.0171 });

  add('ceres', 'Ceres', 'Ceres', 'dwarf', 469.7, 1.3, [0.55, 0.53, 0.50],
    { kind: 'rock', a: [0.42, 0.41, 0.39], b: [0.30, 0.29, 0.28], freq: 5, contrast: 0.5, craters: 1, style: 0 }, { small: 'ceres', faint: 1 });
  add('pluto', 'Pluto', 'Plutón', 'dwarf', 1188.3, 1.6, [0.78, 0.66, 0.58],
    { kind: 'tex', map: 'pluto', tint: [1, 1, 1], gain: 1.18, gamma: 0.95, rough: 0.6, limb: 0.4, detail: 0.06, lon0: 180, atmo: [0.5, 0.7, 1.0, 0.12], halo: 0.006 }, { faint: 1 });
  add('haumea', 'Haumea', 'Haumea', 'dwarf', 780, 1.3, [0.85, 0.85, 0.86],
    { kind: 'rock', a: [0.86, 0.86, 0.88], b: [0.66, 0.62, 0.62], freq: 3, contrast: 0.4, craters: 0.4, style: 0 }, { small: 'haumea', faint: 1, flat: 0.35 });
  add('makemake', 'Makemake', 'Makemake', 'dwarf', 715, 1.3, [0.80, 0.65, 0.55],
    { kind: 'rock', a: [0.80, 0.62, 0.50], b: [0.60, 0.42, 0.34], freq: 3, contrast: 0.5, craters: 0.4, style: 0 }, { small: 'makemake', faint: 1 });
  add('eris', 'Eris', 'Eris', 'dwarf', 1163, 1.4, [0.92, 0.92, 0.90],
    { kind: 'rock', a: [0.94, 0.94, 0.92], b: [0.78, 0.78, 0.78], freq: 3, contrast: 0.3, craters: 0.3, style: 0 }, { small: 'eris', faint: 1 });

  add('halley', 'Halley', 'Halley', 'comet', 5.5, 1.2, [0.75, 0.85, 0.95],
    { kind: 'rock', a: [0.12, 0.11, 0.10], b: [0.06, 0.06, 0.06], freq: 4, contrast: 0.6, craters: 0.6, style: 0 }, { small: 'halley', faint: 1, flat: 0.45 });
  add('encke', 'Encke', 'Encke', 'comet', 2.4, 1.1, [0.75, 0.85, 0.95],
    { kind: 'rock', a: [0.12, 0.11, 0.10], b: [0.06, 0.06, 0.06], freq: 4, contrast: 0.6, craters: 0.6, style: 0 }, { small: 'encke', faint: 1, flat: 0.3 });
  add('cg67p', '67P', '67P', 'comet', 2.0, 1.1, [0.75, 0.85, 0.95],
    { kind: 'rock', a: [0.10, 0.10, 0.10], b: [0.05, 0.05, 0.05], freq: 4, contrast: 0.6, craters: 0.6, style: 0 }, { small: 'cg67p', faint: 1, flat: 0.4 });

  const rock = (a, b, freq, contrast, craters, style) => ({ kind: 'rock', a, b, freq, contrast, craters, style: style || 0 });
  add('moon', 'The Moon', 'La Luna', 'moon', 1737.4, 1.5, [0.78, 0.77, 0.74],
    { kind: 'tex', map: 'moon', tint: [1.0, 0.98, 0.94], gain: 1.28, gamma: 1.05, rough: 1, limb: 0.2, detail: 0.08, atmo: [0, 0, 0, 0] }, { of: 'earth' });
  add('phobos', 'Phobos', 'Fobos', 'moon', 11.1, 1.0, [0.5, 0.45, 0.4], rock([0.36, 0.32, 0.29], [0.22, 0.20, 0.18], 4, 0.6, 1), { of: 'mars', flat: 0.3 });
  add('deimos', 'Deimos', 'Deimos', 'moon', 6.2, 1.0, [0.55, 0.5, 0.45], rock([0.42, 0.38, 0.33], [0.28, 0.25, 0.22], 4, 0.5, 0.6), { of: 'mars', flat: 0.25 });
  add('io', 'Io', 'Ío', 'moon', 1821.6, 1.6, [0.93, 0.85, 0.45],
    { kind: 'tex', map: 'io', tint: [1, 1, 1], gain: 1.1, gamma: 1.0, rough: 1, limb: 0.3, detail: 0.05, atmo: [0, 0, 0, 0] }, { of: 'jupiter' });
  add('europa', 'Europa', 'Europa', 'moon', 1560.8, 1.5, [0.86, 0.80, 0.70],
    { kind: 'tex', map: 'europa', tint: [1.0, 0.96, 0.88], gain: 1.18, gamma: 1.0, rough: 1, limb: 0.3, detail: 0.05, lon0: 180, atmo: [0, 0, 0, 0] }, { of: 'jupiter' });
  add('ganymede', 'Ganymede', 'Ganimedes', 'moon', 2634.1, 1.8, [0.62, 0.57, 0.50],
    { kind: 'tex', map: 'ganymede', tint: [0.96, 0.90, 0.82], gain: 1.3, gamma: 1.0, rough: 1, limb: 0.3, detail: 0.05, lon0: 180, atmo: [0, 0, 0, 0] }, { of: 'jupiter' });
  add('callisto', 'Callisto', 'Calisto', 'moon', 2410.3, 1.7, [0.42, 0.38, 0.33],
    { kind: 'tex', map: 'callisto', tint: [0.90, 0.84, 0.76], gain: 1.1, gamma: 1.0, rough: 1, limb: 0.3, detail: 0.05, lon0: 180, atmo: [0, 0, 0, 0] }, { of: 'jupiter' });
  add('enceladus', 'Enceladus', 'Encélado', 'moon', 252.1, 1.1, [0.97, 0.98, 1.0], rock([0.98, 0.99, 1.0], [0.86, 0.90, 0.96], 5, 0.3, 0.3, 4), { of: 'saturn' });
  add('tethys', 'Tethys', 'Tetis', 'moon', 531.1, 1.2, [0.9, 0.9, 0.9], rock([0.92, 0.92, 0.92], [0.76, 0.76, 0.78], 5, 0.4, 0.9, 4), { of: 'saturn' });
  add('dione', 'Dione', 'Dione', 'moon', 561.4, 1.2, [0.82, 0.82, 0.82], rock([0.86, 0.86, 0.86], [0.62, 0.62, 0.64], 5, 0.5, 0.9, 4), { of: 'saturn' });
  add('rhea', 'Rhea', 'Rea', 'moon', 763.8, 1.3, [0.8, 0.8, 0.78], rock([0.84, 0.84, 0.82], [0.62, 0.62, 0.62], 5, 0.5, 1.1, 4), { of: 'saturn' });
  add('titan', 'Titan', 'Titán', 'moon', 2574.7, 1.8, [0.86, 0.62, 0.26],
    { kind: 'band', turb: 0.05, streak: 0.02, swirl: 0.1, limb: 0.9, rim: [5, 0.3, 0.3], atmo: [0.80, 0.62, 0.55, 0.5], halo: 0.006,
      stops: [[-90, .80, .56, .22], [-30, .87, .62, .25], [20, .88, .63, .26], [60, .80, .55, .22], [90, .66, .45, .20]] }, { of: 'saturn' });
  add('iapetus', 'Iapetus', 'Jápeto', 'moon', 734.5, 1.2, [0.6, 0.57, 0.52], rock([0.88, 0.86, 0.80], [0.12, 0.09, 0.07], 3, 0.4, 0.8, 3), { of: 'saturn' });
  add('miranda', 'Miranda', 'Miranda', 'moon', 235.8, 1.0, [0.7, 0.7, 0.7], rock([0.74, 0.74, 0.74], [0.50, 0.50, 0.52], 6, 0.7, 0.8), { of: 'uranus' });
  add('ariel', 'Ariel', 'Ariel', 'moon', 578.9, 1.2, [0.75, 0.75, 0.75], rock([0.78, 0.78, 0.78], [0.56, 0.56, 0.58], 5, 0.5, 0.8), { of: 'uranus' });
  add('umbriel', 'Umbriel', 'Umbriel', 'moon', 584.7, 1.2, [0.42, 0.42, 0.44], rock([0.42, 0.42, 0.44], [0.30, 0.30, 0.32], 5, 0.4, 1.0), { of: 'uranus' });
  add('titania', 'Titania', 'Titania', 'moon', 788.9, 1.3, [0.65, 0.62, 0.6], rock([0.68, 0.65, 0.62], [0.46, 0.43, 0.42], 5, 0.5, 1.0), { of: 'uranus' });
  add('oberon', 'Oberon', 'Oberón', 'moon', 761.4, 1.3, [0.6, 0.55, 0.53], rock([0.62, 0.57, 0.54], [0.40, 0.36, 0.34], 5, 0.5, 1.2), { of: 'uranus' });
  add('triton', 'Triton', 'Tritón', 'moon', 1353.4, 1.5, [0.85, 0.76, 0.72], rock([0.90, 0.80, 0.76], [0.66, 0.60, 0.62], 4, 0.5, 0.2, 4), { of: 'neptune' });
  add('charon', 'Charon', 'Caronte', 'moon', 606, 1.2, [0.62, 0.6, 0.6], rock([0.64, 0.62, 0.62], [0.40, 0.30, 0.27], 3, 0.5, 0.8, 5), { of: 'pluto' });

  // the five spacecraft that are leaving for good. None is wider than a
  // room: from anywhere it can be found from, it is a point, and stays one.
  // stand: how near the eye comes, au.
  const craft = (key, name, en, es) => add(key, name, name, 'craft', 0.002, 1.15, [0.80, 0.87, 1.0],
    rock([0.85, 0.85, 0.85], [0.7, 0.7, 0.7], 3, 0.2, 0), { craft: key, faint: 1, stand: 6, note: [en, es] });
  craft('voyager1', 'Voyager 1', 'launched in 1977 · nothing made by hand is farther away',
    'lanzada en 1977 · nada hecho a mano está más lejos');
  craft('voyager2', 'Voyager 2', 'launched in 1977 · the only one to have passed Uranus and Neptune',
    'lanzada en 1977 · la única que ha pasado junto a Urano y Neptuno');
  craft('pioneer10', 'Pioneer 10', 'launched in 1972 · the first past Jupiter · silent since 2003',
    'lanzada en 1972 · la primera en pasar junto a Júpiter · en silencio desde 2003');
  craft('pioneer11', 'Pioneer 11', 'launched in 1973 · the first past Saturn · silent since 1995',
    'lanzada en 1973 · la primera en pasar junto a Saturno · en silencio desde 1995');
  craft('newhorizons', 'New Horizons', 'launched in 2006 · it passed Pluto in 2015',
    'lanzada en 2006 · pasó junto a Plutón en 2015');

  const SUN = byKey.sun, EARTH = byKey.earth;
  const PLANETS = B.filter(b => b.kind === 'planet');
  const SHIPS = B.filter(b => b.craft);

  // --- the orbits, eased together or let go -------------------------
  // seen true, the inner four huddle against the Sun and the rest is
  // emptiness. The eased view keeps every direction and squeezes only the
  // distance from the Sun, so that all eight can be seen at once.
  const MAP_R0 = 0.25, MAP_K = 30.07 / Math.log(1 + 30.07 / MAP_R0);
  let mapM = QS.get('true') === '1' ? 1 : 0, mapTo = mapM;      // 0 eased, 1 true
  const mapR = r => (1 - mapM) * MAP_K * Math.log(1 + r / MAP_R0) + mapM * r;

  // --- the clock -----------------------------------------------------
  const jdOf = ms => ms / 86400000 + 2440587.5 + TT_UTC;
  const msOf = jd => (jd - TT_UTC - 2440587.5) * 86400000;
  const JD_MIN = jdOf(Date.UTC(1000, 0, 1)), JD_MAX = jdOf(Date.UTC(3000, 0, 1));
  let jd = jdOf(Date.now());
  if (QS.get('date')) { const d = Date.parse(QS.get('date')); if (isFinite(d)) jd = jdOf(d); }

  function place(now) {
    for (const b of B) {
      if (b === SUN) { b.pos[0] = b.pos[1] = b.pos[2] = 0; b.helio = 0; iauFrame('sun', now, b); continue; }
      if (b.parent) {
        if (b.key !== 'moon') { moonOrbit(b.key, now, b.orb); b.orb.at(b.orb.E, b.rel); }     // (ours was placed with the Earth)
        const p = b.parent;
        b.pos[0] = p.pos[0] + b.rel[0]; b.pos[1] = p.pos[1] + b.rel[1]; b.pos[2] = p.pos[2] + b.rel[2];
        b.dp[0] = p.dp[0] + b.rel[0]; b.dp[1] = p.dp[1] + b.rel[1]; b.dp[2] = p.dp[2] + b.rel[2];
        b.helio = p.helio;
        lockedFrame(b);
        continue;
      }
      if (b.craft) {
        craftOrbit(b.craft, now, b.orb);
        // before the last world it passed, it was somewhere this curve does not know of
        b.away = now >= CRAFT[b.craft][6];
      } else if (b.small) smallOrbit(b.small, now, b.orb); else planetOrbit(b.key, now, b.orb);
      b.orb.at(b.orb.E, b.pos);
      if (b === EARTH) {
        // the orbit is that of the balance point of Earth and Moon; Earth stands a little off it, away from the Moon
        const m = byKey.moon;
        theMoon(now, m.orb, m.rel);
        b.pos[0] -= m.rel[0] / 82.30057; b.pos[1] -= m.rel[1] / 82.30057; b.pos[2] -= m.rel[2] / 82.30057;
      }
      b.helio = len(b.pos);
      const k = mapR(b.helio) / b.helio;
      b.dp[0] = b.pos[0] * k; b.dp[1] = b.pos[1] * k; b.dp[2] = b.pos[2] * k;
      if (!b.craft) iauFrame(b.key, now, b);
    }
  }

  // --- the shaders ---------------------------------------------------
  // Nothing here is a mesh. Every globe is a flat square facing the eye, and
  // the fragment shader finds where the line of sight meets the sphere — so
  // a planet is round at any size, and costs the pixels it covers.
  //
  // View space throughout: x right, y up, z the depth in front of the eye.
  const F_HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
const float PI = 3.14159265;
const float TAU = 6.2831853;
`;
  const V_HEAD = `
precision highp float;
uniform vec2 uProj;
uniform float uNear;
vec4 clip(vec3 v) { return vec4(v.x * uProj.x, v.y * uProj.y, v.z - 2.0 * uNear, v.z); }
`;
  const NOISE = `
float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.9375;
}
`;
  const COLOUR = `
vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toScreen(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
float dither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) - 0.5; }
`;

  // the square a globe is drawn on
  const V_BODY = V_HEAD + `
attribute vec2 aCorner;
uniform vec3 uC;
uniform float uHalf, uR;
varying vec2 vQ;
void main() {
  vec2 q = aCorner * uHalf;
  vQ = q / uR;
  gl_Position = clip(uC + vec3(q, 0.0));
}
`;

  // where the line of sight meets the globe. Written around a cross product
  // so that a planet three thousand of its own radii away loses nothing to
  // rounding: the large vector cancels by hand, not in the arithmetic.
  const SPHERE = `
varying vec2 vQ;
uniform vec3 uCn, uL, uX, uY, uZ;
uniform float uSq, uPx, uRpx, uFill, uSunAng, uHalo, uAlpha, uTime;
// 1: the globe hides what is behind it. Toward 0 its light is only added to
// what is behind: the Moon in a daytime sky, whose dark part is sky
uniform float uSolid;
uniform vec4 uOcc[4];
uniform vec4 uRing;
uniform sampler2D uRingTex;
uniform vec4 uAtmo;
// the light in the air at the edge: how thin (a power), how strong on the
// globe, how strong past its edge
uniform vec3 uRim;

vec3 squash(vec3 v) { return v + uZ * (dot(v, uZ) * (uSq - 1.0)); }
vec3 unsquash(vec3 v) { return v + uZ * (dot(v, uZ) * (1.0 / uSq - 1.0)); }

// how much of the Sun's disc a moon (or the planet, for a moon) covers from here
float eclipsed(vec3 h) {
  float lit = 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 o = uOcc[i];
    if (o.w <= 0.0) continue;
    vec3 rel = o.xyz - h;
    float along = dot(rel, uL);
    if (along <= 0.0) continue;
    float sep = length(rel - uL * along) / along;
    float angO = o.w / along;
    float c = clamp((angO + uSunAng - sep) / (2.0 * min(angO, uSunAng)), 0.0, 1.0);
    c = c * c * (3.0 - 2.0 * c);
    lit *= 1.0 - c * min(1.0, (angO * angO) / (uSunAng * uSunAng));
  }
  return lit;
}
// the shadow the rings lay on their planet
float ringShade(vec3 h) {
  float lz = dot(uL, uZ);
  float t = -dot(h, uZ) / (abs(lz) < 1e-4 ? 1e-4 : lz);
  float u = (length(h + uL * t) - uRing.x) / max(uRing.y - uRing.x, 1e-4);
  float o = texture2D(uRingTex, vec2(clamp(u, 0.0, 1.0), 0.5), 1.5).a;
  float on = uRing.z * step(0.0, t) * step(0.0, u) * step(u, 1.0);
  return mix(1.0, pow(max(1.0 - o, 0.0), 1.0 / max(abs(lz), 0.08)), on);
}
// an equirectangular map on a sphere, without the seam: two lookups, each
// continuous where the other breaks, so the mip level is right everywhere
vec4 onSphere(sampler2D t, vec3 hb, float lon0) {
  float v = asin(clamp(hb.z, -1.0, 1.0)) / PI + 0.5;
  float lon = atan(hb.y, hb.x);
  float u1 = lon / TAU + 0.5 - lon0;
  float u2 = atan(-hb.y, -hb.x) / TAU + 1.0 - lon0;
  float w = smoothstep(0.55, 0.95, abs(lon) / PI);
  return mix(texture2D(t, vec2(u1, v)), texture2D(t, vec2(u2, v)), w);
}
`;

  // the part every globe shares: find the surface, light it, leave the
  // colour of the ground to surface()
  const BODY_MAIN = `
void main() {
  vec3 q = vec3(vQ, 0.0);
  vec3 Pq = uCn + q;
  float ln = length(Pq);
  vec3 d = Pq / ln;
  vec3 sd = squash(d);
  float sdl = length(sd);
  vec3 dh = sd / sdl;
  vec3 kk = -cross(squash(uCn), squash(q)) / (ln * sdl);
  float rho2 = dot(kk, kk);
  float rho = sqrt(rho2);
  vec3 perp = cross(dh, kk);

  // the air past the edge, where there is air: lit where the Sun reaches round the limb
  vec4 air = vec4(0.0);
  if (uHalo > 0.0) {
    float g = exp(-max(rho - 1.0, 0.0) / uHalo) * smoothstep(-0.35, 0.25, dot(perp / max(rho, 1e-4), uL)) * uAtmo.a * uRim.z;
    air = vec4(toScreen(toLinear(uAtmo.rgb) * g * 0.8), 0.5 * g) * uAlpha;
  }
  if (rho >= 1.0 + 0.5 * uPx) {
    if (air.a < 0.002) discard;
    gl_FragColor = air;
    return;
  }
  float cover = clamp((1.0 - rho) / uPx + 0.5, 0.0, 1.0);
  vec3 hs = perp - dh * sqrt(max(1.0 - rho2, 0.0));     // on the unit sphere, in the squashed space
  vec3 n = normalize(squash(hs));
  vec3 h = unsquash(hs);
  vec3 hb = vec3(dot(hs, uX), dot(hs, uY), dot(hs, uZ));
  float mu0 = dot(n, uL);
  float mu = max(dot(n, -d), 0.0);
  float sun = eclipsed(h) * ringShade(h);
  float fine = smoothstep(18.0, 90.0, uRpx);              // detail only when there are pixels for it
  vec3 col = surface(hb, n, d, mu0, mu, sun, fine);
  // the air at the rim, lit from the day side. Over a dark sea a wide rim
  // outshines the ground it lies on and the globe reads as a flat disc with
  // a bright outline: Earth's is kept to a thin line (uRim).
  float day = smoothstep(-0.12, 0.3, mu0);
  col += toLinear(uAtmo.rgb) * pow(1.0 - mu, uRim.x) * uAtmo.a * uRim.y * (0.012 + 0.988 * day) * sun;
  gl_FragColor = vec4(toScreen(col) * cover * uAlpha, cover * uAlpha * uSolid) + air * (1.0 - cover);
}
`;
  const LIGHT = `
uniform vec4 uLook;       // gain, gamma, roughness (1 airless rock .. 0 cloud tops), fine detail
uniform float uLimb;
uniform vec3 uFar, uEmber;
// a rough airless ground scatters back toward the Sun: the full Moon is
// nearly as bright at its edge as in its middle. Cloud tops darken to the limb.
float lightOn(float mu0, float mu, float rough) {
  float lam = max(mu0, 0.0);
  float ls = 2.0 * lam / (lam + mu + 0.001);
  float l = mix(lam, 0.55 * ls + 0.45 * lam, rough);
  // air softens the edge of the day; bare rock has none to soften it
  return l * smoothstep(mix(-0.06, 0.0, rough), mix(0.22, 0.05, rough), mu0);
}
vec3 lit(vec3 alb, float mu0, float mu, float sun) {
  alb = mix(alb, toLinear(uFar), uFill * 0.85);
  float whole = lightOn(mu0, mu, uLook.z);
  float l = whole * sun;
  l *= mix(1.0, 0.35 + 0.65 * pow(mu, 0.5), uLimb * (1.0 - uFill));
  // inside the shadow of a world with air, the only light is what its air
  // bends round it: every sunrise and sunset of that world at once, and red
  return alb * (l + 0.012 + 0.2 * uFill) + alb * uEmber * whole * (1.0 - sun);
}
`;

  const F_TEX = F_HEAD + NOISE + COLOUR + SPHERE + LIGHT + `
uniform sampler2D uMap0;
uniform vec3 uTint;
uniform float uLon0;
vec3 surface(vec3 hb, vec3 n, vec3 d, float mu0, float mu, float sun, float fine) {
  vec3 alb = onSphere(uMap0, hb, uLon0).rgb;
  alb = pow(alb, vec3(uLook.y)) * uLook.x * uTint;
  alb *= 1.0 + (fbm(hb * 46.0) - 0.5) * uLook.w * fine;
  return lit(toLinear(alb), mu0, mu, sun);
}
` + BODY_MAIN;

  const F_EARTH = F_HEAD + NOISE + COLOUR + SPHERE + `
uniform sampler2D uMap0, uMap1, uMap2, uMap3;
uniform float uCloud, uLimb;
uniform vec3 uFar;
vec3 surface(vec3 hb, vec3 n, vec3 d, float mu0, float mu, float sun, float fine) {
  vec3 map = onSphere(uMap0, hb, 0.0).rgb;
  float land = smoothstep(0.30, 0.70, onSphere(uMap3, hb, 0.0).r);
  // the sea is not on the map (the shoreline has a mask of its own): a deep
  // blue, a little greener and brighter toward the tropics
  vec3 sea = mix(vec3(0.010, 0.034, 0.095), vec3(0.014, 0.060, 0.130), pow(1.0 - abs(hb.z), 2.5));
  vec3 ground = toLinear(pow(map, vec3(0.9)) * 1.22);
  ground *= 1.0 + (fbm(hb * 60.0) - 0.5) * 0.18 * fine;
  vec3 alb = mix(sea, ground, land);

  float c = cos(uCloud), s = sin(uCloud);
  vec3 hc = vec3(hb.x * c - hb.y * s, hb.x * s + hb.y * c, hb.z);
  float cl = onSphere(uMap1, hc, 0.0).r;
  cl = smoothstep(0.10, 0.85, cl + (fbm(hc * 38.0) - 0.5) * 0.22 * fine);

  float l = max(mu0, 0.0) * smoothstep(-0.02, 0.10, mu0) * sun;
  float day = smoothstep(-0.10, 0.22, mu0);
  vec3 col = alb * (l + 0.006);
  // the Sun, found again in the water
  vec3 hv = normalize(uL - d);
  float gl = pow(max(dot(n, hv), 0.0), 220.0) * 0.6 + pow(max(dot(n, hv), 0.0), 18.0) * 0.05;
  col += vec3(1.0, 0.93, 0.80) * gl * (1.0 - land) * (1.0 - cl) * l * (1.0 - uFill);
  // cloud, and the dusk it goes through at the edge of the day
  vec3 white = vec3(0.92) * (l + 0.008);
  col = mix(col, white, cl * 0.94);
  // the lit face falls off toward the edge, as the other globes' do: through
  // more and more air, sea and cloud alike go dim
  col *= mix(1.0, 0.35 + 0.65 * pow(mu, 0.5), uLimb * (1.0 - uFill));
  col = mix(col, toLinear(uFar) * (l + 0.012 + 0.2 * uFill), uFill * 0.85);
  float dusk = (1.0 - smoothstep(0.02, 0.30, mu0)) * smoothstep(-0.12, 0.02, mu0);
  col *= mix(vec3(1.0), vec3(1.0, 0.62, 0.38), dusk * 0.75);
  // the cities, where it is night and the sky is clear
  float lamp = onSphere(uMap2, hb, 0.0).r;
  col += toLinear(vec3(1.0, 0.76, 0.42)) * lamp * lamp * (1.0 - day) * (1.0 - 0.8 * cl) * 0.55 * (1.0 - uFill);
  return col;
}
` + BODY_MAIN;

  const F_BAND = F_HEAD + NOISE + COLOUR + SPHERE + LIGHT + `
uniform sampler2D uBand;
uniform vec4 uBP;        // how far the belts wander, streaks, swirl, a storm
vec3 surface(vec3 hb, vec3 n, vec3 d, float mu0, float mu, float sun, float fine) {
  float lat = asin(clamp(hb.z, -1.0, 1.0));
  vec3 p = vec3(hb.xy * 2.2, hb.z * 5.0);
  float w1 = fbm(p + 3.1), w2 = fbm(p * 2.7 + vec3(w1 * 2.0 * uBP.z, 0.0, 9.0));
  float latw = lat + (w2 - 0.5) * 0.35 * uBP.x;
  vec3 alb = texture2D(uBand, vec2(latw / PI + 0.5, 0.5)).rgb;
  // winds comb everything along the parallels
  float st = fbm(vec3(hb.xy * 3.0 + w1 * uBP.z, hb.z * 34.0));
  float st2 = fbm(vec3(hb.xy * 9.0, hb.z * 90.0) + 5.0);
  alb *= 1.0 + ((st - 0.5) * 1.6 + (st2 - 0.5) * 0.9 * fine) * uBP.y;
  if (uBP.w > 0.5) {
    // a dark oval in the south, and the white cloud that rides beside it
    vec2 o = vec2(atan(hb.y, hb.x) - 0.6, (lat + 0.36) * 2.4);
    float spot = 1.0 - smoothstep(0.16, 0.30, length(o));
    alb *= 1.0 - 0.38 * spot;
    float wisp = smoothstep(0.66, 0.9, fbm(vec3(hb.xy * 3.0, hb.z * 26.0) + 2.0)) * (1.0 - smoothstep(0.2, 0.9, abs(lat + 0.30) * 3.0));
    alb = mix(alb, vec3(0.80, 0.86, 0.95), wisp * 0.3);
  }
  return lit(toLinear(alb), mu0, mu, sun);
}
` + BODY_MAIN;

  const F_ROCK = F_HEAD + NOISE + COLOUR + SPHERE + LIGHT + `
uniform vec3 uA, uB;
uniform vec4 uRP;        // grain, contrast, craters, which moon
vec3 surface(vec3 hb, vec3 n, vec3 d, float mu0, float mu, float sun, float fine) {
  float f = fbm(hb * uRP.x + 1.7);
  float k = smoothstep(0.5 - 0.5 * uRP.y, 0.5 + 0.5 * uRP.y, f);
  vec3 alb = mix(uB, uA, k);
  float st = uRP.w;
  if (st > 0.5 && st < 1.5) {
    // Io: sulphur, pocked with small dark vents and the red rings they throw
    alb = mix(vec3(0.93, 0.80, 0.36), vec3(0.82, 0.62, 0.22), k);
    alb = mix(alb, vec3(0.96, 0.95, 0.80), smoothstep(0.55, 0.78, fbm(hb * 4.0 + 9.0)) * 0.55 * (1.0 - abs(hb.z)));
    alb = mix(alb, vec3(0.62, 0.74, 0.30), smoothstep(0.60, 0.80, fbm(hb * 6.0 + 21.0)) * 0.22);
    float v = vnoise(hb * 15.0 + 4.0) * 0.75 + vnoise(hb * 33.0 + 8.0) * 0.25;
    alb = mix(alb, vec3(0.70, 0.26, 0.10), smoothstep(0.66, 0.76, v) * 0.55);
    alb = mix(alb, vec3(0.10, 0.07, 0.05), smoothstep(0.77, 0.81, v));
    alb = mix(alb, vec3(0.50, 0.28, 0.15), smoothstep(0.60, 0.95, abs(hb.z)) * 0.8);
  } else if (st > 1.5 && st < 2.5) {
    // Europa: ice, scored with long thin brown lines, stained where the ice has broken up
    vec3 w = hb * 1.6 + (fbm(hb * 1.3) - 0.5) * 0.5;
    float l1 = 1.0 - abs(2.0 * vnoise(w * 1.9) - 1.0), l2 = 1.0 - abs(2.0 * vnoise(w * 3.1 + 7.0) - 1.0), l3 = 1.0 - abs(2.0 * vnoise(w * 5.3 + 3.0) - 1.0);
    float lines = max(max(smoothstep(0.965, 0.995, l1), smoothstep(0.97, 0.995, l2) * 0.8), smoothstep(0.975, 0.995, l3) * 0.55);
    float stain = smoothstep(0.52, 0.78, fbm(hb * 2.4 + 5.0)) * 0.5;
    alb = mix(uA * (0.94 + 0.12 * f), uB, clamp(lines * 0.8 + stain * 0.55, 0.0, 1.0));
  } else if (st > 2.5 && st < 3.5) {
    // Iapetus: the side that leads is dark as coal, the poles stay bright
    float lead = smoothstep(-0.10, 0.45, -hb.y + (f - 0.5) * 0.5) * (1.0 - smoothstep(0.55, 0.9, abs(hb.z)));
    alb = mix(uA, uB, lead);
  } else if (st > 3.5 && st < 4.5) {
    // clean ice, faintly cracked
    float l1 = 1.0 - abs(2.0 * vnoise(hb * 5.0 + 3.0) - 1.0);
    alb = mix(alb, uB * vec3(0.9, 0.97, 1.05), smoothstep(0.9, 0.99, l1) * 0.6);
  } else if (st > 4.5) {
    // Charon: a rust-red cap on the north pole
    alb = mix(uA * (0.85 + 0.3 * k), uB, smoothstep(0.62, 0.92, hb.z + (f - 0.5) * 0.3));
  }
  // craters: small, many, some bright-rimmed
  float c1 = vnoise(hb * uRP.x * 7.0 + 11.0), c2 = vnoise(hb * uRP.x * 19.0 + 23.0);
  alb *= 1.0 - uRP.z * (0.22 * smoothstep(0.62, 0.8, c1) + 0.14 * smoothstep(0.66, 0.84, c2) * fine);
  alb *= 1.0 + uRP.z * 0.18 * smoothstep(0.80, 0.92, c1) * fine;
  return lit(toLinear(alb), mu0, mu, sun);
}
` + BODY_MAIN;

  // the Sun: a boiling disc, darker and redder to its edge, and the light
  // around it that the eye reads as its size from far away
  const F_SUN = F_HEAD + NOISE + COLOUR + `
varying vec2 vQ;
uniform vec3 uCn, uX, uY, uZ;
uniform float uPx, uRpx, uTime, uGlow, uReach, uAlpha;
void main() {
  vec3 q = vec3(vQ, 0.0);
  vec3 Pq = uCn + q;
  float ln = length(Pq);
  vec3 d = Pq / ln;
  vec3 kk = -cross(uCn, q) / ln;
  float rho2 = dot(kk, kk), rho = sqrt(rho2);
  vec3 perp = cross(d, kk);
  vec3 col = vec3(0.0);
  float a = 0.0;
  // the light around it
  float r = max(rho, 1.0);
  float ang = atan(perp.y, perp.x);
  float ray = 0.78 + 0.44 * fbm(vec3(cos(ang) * 2.2, sin(ang) * 2.2, uTime * 0.015 + r * 0.25));
  float halo = (exp(-(r - 1.0) * 1.9) * 0.85 + 0.42 / (r * r * r)) * ray;
  halo *= 1.0 - smoothstep(uReach * 0.45, uReach, r);
  col += vec3(1.0, 0.70, 0.40) * halo * uGlow;
  col += vec3(1.0, 0.92, 0.75) * exp(-(r - 1.0) * 7.0) * 0.5 * uGlow;
  if (rho < 1.0 + 0.5 * uPx) {
    float cover = clamp((1.0 - rho) / uPx + 0.5, 0.0, 1.0);
    vec3 hs = perp - d * sqrt(max(1.0 - rho2, 0.0));
    vec3 hb = vec3(dot(hs, uX), dot(hs, uY), dot(hs, uZ));
    float mu = max(dot(hs, -d), 0.0);
    float fine = smoothstep(18.0, 90.0, uRpx);
    float t = uTime * 0.035;
    float gran = fbm(hb * 90.0 + vec3(t, -t, t * 0.7));
    float cell = fbm(hb * 11.0 + vec3(0.0, t * 0.2, 0.0));
    // spots keep to two belts either side of the equator, a dark heart in a paler ring
    float sp = fbm(hb * 7.0 + 13.0) * (1.0 - smoothstep(0.30, 0.55, abs(hb.z))) * smoothstep(0.03, 0.12, abs(hb.z));
    float spots = smoothstep(0.66, 0.70, sp) * 0.35 + smoothstep(0.70, 0.74, sp) * 0.45;
    float limb = 0.40 + 0.60 * pow(mu, 0.55);
    vec3 face = mix(vec3(1.0, 0.50, 0.14), vec3(1.0, 0.92, 0.72), pow(mu, 0.6)) * limb;
    face *= 1.0 + ((gran - 0.5) * 0.42 + (cell - 0.5) * 0.26) * fine;
    face *= 1.0 - spots * fine;
    // bright ragged patches near the edge
    face += vec3(0.25, 0.2, 0.1) * smoothstep(0.6, 0.8, cell) * (1.0 - mu) * fine;
    col = mix(col, face * 1.12, cover);
    a = cover;
  }
  col += dither(gl_FragCoord.xy) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), a) * uAlpha;
}
`;

  // the edge of the Sun's wind: a bubble, drawn as thin as the film of one.
  // Through its middle the eye crosses the film twice and hardly sees it; at
  // the rim it looks along the film, and the rim is what shows. The film is
  // whole on the side the wind from the stars blows against, where the two
  // Voyagers went through it, and is let go toward the other side.
  const F_SHELL = F_HEAD + COLOUR + `
varying vec2 vQ;
uniform vec3 uCn, uNose, uColor;
uniform float uPx, uAlpha;
float film(vec3 p) { return smoothstep(-0.95, 0.0, dot(p, uNose)); }
void main() {
  vec3 q = vec3(vQ, 0.0);
  vec3 Pq = uCn + q;
  float ln = length(Pq);
  vec3 d = Pq / ln;
  vec3 kk = -cross(uCn, q) / ln;
  float rho2 = dot(kk, kk);
  if (rho2 >= 1.0) discard;
  vec3 perp = cross(d, kk);
  float h = sqrt(1.0 - rho2);
  float through = min(1.0 / max(h, 1e-4), 8.0) * clamp((1.0 - sqrt(rho2)) / uPx, 0.0, 1.0);
  float I = through * (film(perp - d * h) + film(perp + d * h)) * uAlpha;
  vec3 col = floor(uColor * I * 255.0 + dither(gl_FragCoord.xy) + 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 0.0);
}
`;

  // the rings: a flat square in the ring plane. The shader knows where the
  // globe is, so it can hide what passes behind it and darken what passes
  // through its shadow.
  const V_RING = V_HEAD + `
attribute vec2 aCorner;
uniform vec3 uC, uU, uV;
uniform float uR, uOut;
varying vec2 vUV;
void main() {
  vUV = aCorner * uOut;
  gl_Position = clip(uC + (uU * vUV.x + uV * vUV.y) * uR);
}
`;
  const F_RING = F_HEAD + COLOUR + `
varying vec2 vUV;
uniform vec3 uCn, uL, uU, uV, uZ;
uniform float uSq, uPx, uSunAng, uAlpha, uGain;
uniform vec4 uRing;
uniform sampler2D uRingTex;
vec3 squash(vec3 v) { return v + uZ * (dot(v, uZ) * (uSq - 1.0)); }
// 1 where the line from p along dir clears the globe, 0 where it meets it
float clears(vec3 p, vec3 dir, float soft) {
  vec3 sp = squash(p), sv = normalize(squash(dir));
  float along = dot(sp, sv);
  if (along > 0.0) return 1.0;
  return smoothstep(1.0 - soft, 1.0 + soft, sqrt(max(dot(sp, sp) - along * along, 0.0)));
}
void main() {
  float rho = length(vUV);
  float u = (rho - uRing.x) / (uRing.y - uRing.x);
  vec4 t = texture2D(uRingTex, vec2(clamp(u, 0.0, 1.0), 0.5));
  if (u <= 0.0 || u >= 1.0 || t.a < 0.003) discard;
  vec3 P = uU * vUV.x + uV * vUV.y;
  vec3 d = normalize(uCn + P);
  float seen = clears(P, -d, uPx * 1.5);
  if (seen <= 0.0) discard;
  float lit = clears(P, uL, max(uPx * 1.5, uSunAng * rho));
  float lz = dot(uL, uZ), vz = dot(-d, uZ);
  float muS = max(abs(lz), 0.02), muV = max(abs(vz), 0.02);
  float tau = -log(max(1.0 - t.a, 0.002));
  float I;
  if (lz * vz > 0.0) {
    I = muS / (muS + muV) * (1.0 - exp(-tau * (1.0 / muS + 1.0 / muV)));
  } else {
    // from the dark side the thick rings go black and the thin ones glow
    float dm = muS - muV;
    I = abs(dm) < 0.002 ? tau / muS * exp(-tau / muS) : muS / dm * (exp(-tau / muS) - exp(-tau / muV));
    I *= 0.75;
  }
  // grazing light is kinder to real rings than single scattering allows:
  // the grains shade and light each other
  I = pow(I, 0.62) * uGain;
  vec3 col = toLinear(t.rgb) * I * lit + toLinear(t.rgb) * 0.004;
  float a = (1.0 - exp(-tau / muV)) * seen * uAlpha;
  gl_FragColor = vec4(toScreen(col) * seen * uAlpha, a);
}
`;

  // a soft light, added: the glow that lets a two-pixel planet be seen
  const F_GLOW = F_HEAD + `
varying vec2 vQ;
uniform vec3 uColor;
uniform float uGlow;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float g = exp(-r2 * 5.5) - 0.0041;
  gl_FragColor = vec4(uColor * g * uGlow, 0.0);
}
`;

  // a comet's tail: a long square from the head, away from the Sun
  const V_TAIL = V_HEAD + `
attribute vec2 aCorner;
uniform vec3 uC, uU, uV;
varying vec2 vT;
void main() {
  vT = vec2(aCorner.x * 0.5 + 0.5, aCorner.y);
  gl_Position = clip(uC + uU * vT.x + uV * vT.y);
}
`;
  const F_TAIL = F_HEAD + `
varying vec2 vT;
uniform vec3 uColor;
uniform float uGlow, uSpread;
void main() {
  float w = 0.10 + uSpread * vT.x;
  float across = exp(-vT.y * vT.y / (w * w));
  float along = pow(1.0 - vT.x, 1.7) * smoothstep(0.0, 0.03, vT.x);
  gl_FragColor = vec4(uColor * across * along * uGlow, 0.0);
}
`;

  // the sky: the Milky Way as Gaia counted it, a map in right ascension and
  // declination, looked up along each line of sight
  const V_FULL = `
precision highp float;
attribute vec2 aCorner;
varying vec2 vP;
void main() { vP = aCorner; gl_Position = vec4(aCorner, 0.0, 1.0); }
`;
  const F_SKY = F_HEAD + COLOUR + `
varying vec2 vP;
uniform vec3 uRt, uUp, uFw;
uniform vec2 uTan, uTilt;         // uTilt: cosine and sine of the tilt of the Earth's equator to the plane of the planets
uniform sampler2D uSky;
uniform float uDim;
void main() {
  vec3 dir = normalize(uRt * (vP.x * uTan.x) + uUp * (vP.y * uTan.y) + uFw);
  // the scene keeps the plane of the planets level; the map is drawn on the Earth's equator
  vec3 eq = vec3(dir.x, -uTilt.x * dir.z - uTilt.y * dir.y, -uTilt.y * dir.z + uTilt.x * dir.y);
  // (right ascension runs leftward across the map, from the middle)
  vec2 uv = vec2(0.5 - atan(eq.y, eq.x) / TAU, asin(clamp(eq.z, -1.0, 1.0)) / PI + 0.5);
  vec3 c = texture2D(uSky, uv).rgb;
  c = vec3(0.0118, 0.0118, 0.0392) + c * c * uDim;
  gl_FragColor = vec4(c + dither(gl_FragCoord.xy) / 255.0, 1.0);
}
`;

  // The air, and the ground: both only when the eye stands on the Earth.
  // The air is laid over the stars and under the Sun, the Moon and the
  // planets: by day it is the whole sky, at dusk the light left along the
  // horizon on the Sun's side with the blue deepening over it, at night no
  // more than the thicker air low down and whatever the Moon lights of it.
  // It is painted to look right, not reckoned from the air's scattering.
  // The ground is laid over everything, last: whatever is below the horizon
  // is behind it.
  const F_AIR = F_HEAD + COLOUR + `
varying vec2 vP;
uniform vec3 uRt, uUp, uFw, uZen, uSun;
uniform vec2 uTan;
uniform vec3 uPart;       // 0 the air, 1 the ground; one pixel, as an angle; the Moon's light in the air
void main() {
  vec3 dir = normalize(uRt * (vP.x * uTan.x) + uUp * (vP.y * uTan.y) + uFw);
  float up = dot(dir, uZen), sunUp = dot(uSun, uZen);
  float day = smoothstep(-0.10, 0.06, sunUp);
  float grain = dither(gl_FragCoord.xy) / 255.0;
  if (uPart.x > 0.5) {
    float a = 1.0 - smoothstep(-uPart.y, uPart.y, up);
    if (a <= 0.0) discard;
    vec3 g = mix(vec3(0.007, 0.008, 0.012) + vec3(0.012, 0.014, 0.020) * uPart.z, vec3(0.105, 0.115, 0.095), day);
    g *= 0.55 + 0.45 * exp(8.0 * min(up, 0.0));
    gl_FragColor = vec4((g + grain) * a, a);
    return;
  }
  float h = max(up, 0.0);
  float low = exp(-7.0 * h);
  vec3 flatDir = dir - uZen * up, flatSun = uSun - uZen * sunUp;
  float side = 0.5 + 0.5 * dot(flatDir, flatSun) / max(length(flatDir) * length(flatSun), 1e-4);
  float toSun = max(dot(dir, uSun), 0.0);
  // by day: blue overhead, pale along the horizon, bright round the Sun
  vec3 blue = mix(vec3(0.20, 0.42, 0.80), vec3(0.70, 0.82, 0.94), pow(1.0 - h, 5.0));
  blue += vec3(0.28, 0.25, 0.18) * pow(toSun, 12.0);
  // at dusk and at dawn
  float tw = smoothstep(-0.33, -0.03, sunUp);
  float ember = clamp(low * side * side * 1.25, 0.0, 1.0);
  vec3 dusk = mix(vec3(0.07, 0.12, 0.30), vec3(1.0, 0.52, 0.20), ember);
  float aDusk = tw * mix(0.6 * tw, 1.0, clamp(low * (0.3 + 0.7 * side), 0.0, 1.0));
  // at night
  vec3 night = vec3(0.050, 0.062, 0.105) + vec3(0.030, 0.040, 0.070) * uPart.z;
  float aNight = 0.72 * low + 0.22 * uPart.z;
  vec3 col = mix(night, dusk, tw);
  float a = max(aNight, aDusk);
  col = mix(col, blue, day);
  a = mix(a, 1.0, day);
  gl_FragColor = vec4((col + grain) * a, a);
}
`;

  // a galaxy the eye can find without help. Each is a small square laid
  // on the sky at its place, its size and its tilt, and the shader paints
  // what the eye sees of it: a glow, brighter at the heart, and no detail.
  // The arms and the dust lanes belong to a camera left open for an hour.
  const V_GALAXY = `
precision highp float;
attribute vec2 aCorner;
uniform vec3 uC, uA, uB, uRt, uUp, uFw;
uniform vec2 uProj, uHalf;
varying vec2 vP;
void main() {
  // on the plane that touches the sky at the galaxy's centre, in radians
  vP = aCorner * uHalf;
  vec3 d = uC + uA * vP.x + uB * vP.y;
  vec3 v = vec3(dot(d, uRt), dot(d, uUp), dot(d, uFw));
  gl_Position = vec4(v.x * uProj.x, v.y * uProj.y, v.z - 0.02, v.z);
}
`;
  const F_GALAXY = F_HEAD + NOISE + COLOUR + `
varying vec2 vP;
uniform vec2 uAxes, uHeart;   // where it fades into the sky; its brighter heart
uniform vec4 uAmp;            // the disc, how fast it falls, the heart, how mottled
uniform vec4 uBar;            // a bar: its turn from the long axis, half length, half width, how bright
uniform vec4 uKnot;           // one bright knot: where, how wide, how bright
uniform vec3 uTint;
uniform float uSeed;
void main() {
  float r = length(vP / uAxes);
  float I = uAmp.x * exp(-r / uAmp.y);
  float cb = cos(uBar.x), sb = sin(uBar.x);
  vec2 pb = vec2(vP.x * cb + vP.y * sb, vP.y * cb - vP.x * sb) / max(uBar.yz, vec2(1e-5));
  I += uBar.w * exp(-dot(pb, pb));
  I *= 1.0 + uAmp.w * (fbm(vec3(vP * 46.0, uSeed)) * 2.0 - 1.0);
  vec2 ph = vP / uHeart;
  I += uAmp.z * exp(-0.5 * dot(ph, ph));
  vec2 pk = (vP - uKnot.xy) / max(uKnot.z, 1e-5);
  I += uKnot.w * exp(-0.5 * dot(pk, pk));
  I *= 1.0 - smoothstep(1.15, 1.9, r);
  // a glow this faint is a handful of steps of grey: break them up, or they show as rings
  vec3 col = floor(uTint * I * 255.0 + dither(gl_FragCoord.xy) + 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 0.0);
}
`;

  // Every star stands at its own distance, and the eye can leave the Sun:
  // from somewhere else each star is in another direction, and brighter or
  // fainter by five magnitudes for every tenfold of the way to it.
  const V_STAR = `
precision highp float;
attribute vec4 aStar;        // the way to it from the Sun, and one over how far it is (au); 0 when that is too far to tell
attribute vec4 aLook;        // colour, brightness seen from the Sun. Below zero: a star with a name beside it, which is never drawn fainter than uMark
uniform vec3 uRt, uUp, uFw, uEye;     // uEye: where the eye is, from the Sun, au
uniform vec3 uZen;                    // straight up, when the eye stands on the ground
uniform vec2 uAir;                    // then: the sine of the Sun's height (below -1.5: there is no ground), and the Moon's light in the air
uniform vec2 uProj;
uniform float uDpr, uDim, uMark;
varying vec4 vLook;
void main() {
  // from the eye to the star, in units of the star's distance from the Sun
  vec3 rel = aStar.xyz - uEye * aStar.w;
  float away = max(length(rel), 1e-6);
  rel /= away;
  vec3 v = vec3(dot(rel, uRt), dot(rel, uUp), dot(rel, uFw));
  float I = min(abs(aLook.a) * pow(away, -0.9), 5.0);
  if (aLook.a < 0.0) I = max(I, uMark);
  float seen = 1.0;
  if (uAir.x > -1.5) {
    // under the air a star comes out when the dusk is deep enough for one as
    // bright as it is, the brightest first; a bright Moon keeps the faint
    // ones in; and none is seen through the thick air along the horizon
    float m = min(1.0 - log(max(I, 1e-5)) / 0.41447, 6.0);
    float lost = -0.06 - 0.022 * m;
    seen = 1.0 - smoothstep(lost - 0.07, lost, uAir.x);
    seen *= 1.0 - 0.8 * uAir.y * smoothstep(2.5, 5.5, m);
    seen *= smoothstep(-0.01, 0.10, dot(rel, uZen));
  }
  vLook = vec4(aLook.rgb, clamp(1.5 * I, 0.0, 1.0) * uDim * seen);
  gl_PointSize = (1.0 + 2.1 * pow(I, 0.8)) * uDpr;
  gl_Position = v.z > 0.001 ? vec4(v.x * uProj.x, v.y * uProj.y, 0.0, v.z) : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
  const F_STAR = F_HEAD + `
varying vec4 vLook;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float g = exp(-dot(p, p) * 3.2) - 0.04;
  if (g <= 0.0) discard;
  gl_FragColor = vec4(vLook.rgb * vLook.a * g, 0.0);
}
`;

  // the belts: thousands of small bodies, each solving its own orbit in the
  // vertex shader, so the whole swarm is one draw
  const MAPR = `
uniform vec3 uMap;        // K, r0, how true (0 eased .. 1 true)
float mapR(float r) { return mix(uMap.x * log(1.0 + r / uMap.y), r, uMap.z); }
`;
  const V_BELT = V_HEAD + MAPR + `
attribute vec4 aEl1;      // a, e, i, node
attribute vec4 aEl2;      // argument of perihelion, mean anomaly at the epoch, mean motion, brightness
uniform float uT, uDpr, uSize;
uniform vec3 uCam, uRt, uUp, uFw;
varying float vB;
void main() {
  float e = aEl1.y;
  float M = mod(aEl2.y + aEl2.z * uT, 6.2831853);
  float E = M + e * sin(M);
  for (int k = 0; k < 4; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float x = aEl1.x * (cos(E) - e), y = aEl1.x * sqrt(1.0 - e * e) * sin(E);
  float cw = cos(aEl2.x), sw = sin(aEl2.x), cO = cos(aEl1.w), sO = sin(aEl1.w), ci = cos(aEl1.z), si = sin(aEl1.z);
  vec3 ecl = vec3((cw * cO - sw * sO * ci) * x + (-sw * cO - cw * sO * ci) * y,
                  (cw * sO + sw * cO * ci) * x + (-sw * sO + cw * cO * ci) * y,
                  (sw * si) * x + (cw * si) * y);
  vec3 p = vec3(ecl.x, ecl.z, -ecl.y);
  float r = length(p);
  p *= mapR(r) / r;
  vec3 rel = p - uCam;
  vec3 v = vec3(dot(rel, uRt), dot(rel, uUp), dot(rel, uFw));
  vB = aEl2.w;
  gl_PointSize = uSize * (0.8 + 0.9 * aEl2.w) * uDpr;
  gl_Position = v.z > uNear ? clip(v) : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
  const F_BELT = F_HEAD + `
varying float vB;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float g = 1.0 - dot(p, p);
  if (g <= 0.0) discard;
  gl_FragColor = vec4(uColor * (0.25 + 0.75 * vB) * g * uAlpha, 0.0);
}
`;

  // an orbit's line. Each vertex is an angle back along the orbit from where
  // the body is now, crowded close to the body, so the line passes through
  // the body's centre at any magnification and is brightest just behind it.
  const V_ORBIT = V_HEAD + MAPR + `
attribute vec4 aD;        // this angle, the one before, the one after, which edge of the line
uniform float uE, uA, uBb, uEcc, uMapOn, uHalfW, uF;
uniform vec3 uP, uQ, uOrigin, uRt, uUp, uFw;
uniform vec2 uInv;
varying float vS, vBack;
vec3 at(float back) {
  float E = uE - back;
  vec3 p = uP * (uA * (cos(E) - uEcc)) + uQ * (uBb * sin(E));
  if (uMapOn > 0.5) { float r = length(p); p *= mapR(r) / r; }
  p += uOrigin;
  return vec3(dot(p, uRt), dot(p, uUp), dot(p, uFw));
}
// a, brought forward to the near plane along the way to b
vec3 toward(vec3 a, vec3 b) {
  if (a.z >= uNear || b.z <= uNear) return a;
  return mix(a, b, (uNear - a.z) / (b.z - a.z));
}
void main() {
  vec3 c = at(aD.x), p = at(aD.y), n = at(aD.z);
  vBack = aD.x; vS = aD.w;
  if (c.z < uNear) {
    if (n.z > uNear) c = toward(c, n);
    else if (p.z > uNear) c = toward(c, p);
    else { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  }
  p = toward(p, c); n = toward(n, c);
  vec2 sc = c.xy / c.z, sp = p.xy / max(p.z, uNear), sn = n.xy / max(n.z, uNear);
  vec2 dir = (sn - sp) * uF;
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(1.0, 0.0);
  vec2 px = sc * uF + vec2(-dir.y, dir.x) * aD.w * uHalfW;
  gl_Position = vec4(px * uInv * c.z, c.z - 2.0 * uNear, c.z);
}
`;
  // the way a body has come through the galaxy: where it was on its orbit,
  // set back by as far as the Sun has carried everything since. Each vertex
  // is a time ago, crowded toward now. (uSpan below zero looks ahead.)
  const V_TRAIL = V_HEAD + MAPR + `
attribute vec4 aD;        // this time ago (0..1 of the span), the one before, the one after, which edge of the line
uniform float uM, uN, uSpan, uA, uBb, uEcc, uHalfW, uF;
uniform vec3 uP, uQ, uOrigin, uGo, uRt, uUp, uFw;
uniform vec2 uInv;
varying float vS, vBack;
vec3 at(float s) {
  float t = s * uSpan;
  vec3 p;
  if (uEcc > 1.0) {
    // a spacecraft, leaving: no turns to count, and the curve opens out
    float M = uM - uN * t;
    float x = abs(M) / uEcc;
    float H = sign(M) * log(x + sqrt(x * x + 1.0));
    for (int k = 0; k < 10; k++) {
      float ex = exp(H);
      H -= (uEcc * 0.5 * (ex - 1.0 / ex) - H - M) / (uEcc * 0.5 * (ex + 1.0 / ex) - 1.0);
    }
    float eh = exp(H);
    p = uP * (uA * (uEcc - 0.5 * (eh + 1.0 / eh))) + uQ * (uBb * 0.5 * (eh - 1.0 / eh));
  } else {
    float M = mod(uM - uN * t + 3.14159265, 6.2831853) - 3.14159265;
    float E = uEcc < 0.8 ? M + uEcc * sin(M) : (M < 0.0 ? -3.14159265 : 3.14159265);
    for (int k = 0; k < 10; k++) E -= (E - uEcc * sin(E) - M) / (1.0 - uEcc * cos(E));
    p = uP * (uA * (cos(E) - uEcc)) + uQ * (uBb * sin(E));
  }
  // from the Sun, as far as the planets are drawn from it: eased or true
  float r = length(p);
  if (r > 0.0) p *= mapR(r) / r;
  p += uOrigin - uGo * t;
  return vec3(dot(p, uRt), dot(p, uUp), dot(p, uFw));
}
vec3 toward(vec3 a, vec3 b) {
  if (a.z >= uNear || b.z <= uNear) return a;
  return mix(a, b, (uNear - a.z) / (b.z - a.z));
}
void main() {
  vec3 c = at(aD.x), p = at(aD.y), n = at(aD.z);
  vBack = aD.x; vS = aD.w;
  if (c.z < uNear) {
    if (n.z > uNear) c = toward(c, n);
    else if (p.z > uNear) c = toward(c, p);
    else { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  }
  p = toward(p, c); n = toward(n, c);
  vec2 sc = c.xy / c.z, sp = p.xy / max(p.z, uNear), sn = n.xy / max(n.z, uNear);
  vec2 dir = (sn - sp) * uF;
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(1.0, 0.0);
  vec2 px = sc * uF + vec2(-dir.y, dir.x) * aD.w * uHalfW;
  gl_Position = vec4(px * uInv * c.z, c.z - 2.0 * uNear, c.z);
}
`;
  const F_TRAIL = F_HEAD + `
varying float vS, vBack;
uniform vec3 uColor;
uniform float uGlow;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vS));
  gl_FragColor = vec4(uColor * edge * pow(1.0 - vBack, 1.6) * uGlow, 0.0);
}
`;
  const F_ORBIT = F_HEAD + `
varying float vS, vBack;
uniform vec3 uColor, uTrailColor;
uniform float uBase, uTrail;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vS));
  float trail = exp(-vBack * 1.15) * uTrail;
  vec3 c = uColor * uBase + uTrailColor * trail;
  gl_FragColor = vec4(c * edge, 0.0);
}
`;

  // --- the machinery -------------------------------------------------
  let gl = null, GLOK = false;
  const PR = {}, TX = {};
  let quadBuf = null, orbitBuf = null, trailBuf = null, starBuf = null, beltBuf = null, kuiperBuf = null, oortBuf = null;
  const ORBIT_N = 220, TRAIL_N = 640;
  let starN = 0, sunAt = 0, beltN = 0, kuiperN = 0, oortN = 0;

  function program(name, vs, fs, attrs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(p));
    const o = { p, u: {} };
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const nm = gl.getActiveUniform(p, i).name;
      o.u[nm.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, nm);
    }
    return (PR[name] = o);
  }
  let cur = null;
  const use = p => { if (cur !== p) { gl.useProgram(p.p); cur = p; } return p; };
  const u1 = (n, v) => gl.uniform1f(cur.u[n] || null, v);
  const u2 = (n, a, b) => gl.uniform2f(cur.u[n] || null, a, b);
  const u3 = (n, v) => gl.uniform3f(cur.u[n] || null, v[0], v[1], v[2]);
  const u4 = (n, a, b, c, d) => gl.uniform4f(cur.u[n] || null, a, b, c, d);
  const ui = (n, v) => gl.uniform1i(cur.u[n] || null, v);

  function texParams(mip, repeatS) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatS ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function dataTex(w, h, px, fmt, mip, repeatS) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, px);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    texParams(mip, repeatS);
    return t;
  }
  // a map arrives as a picture; until it has, the globe wears its one colour
  let mapsWaiting = 0;
  const mapImages = {};
  function mapTex(key, c, plain) {
    const t = dataTex(1, 1, new Uint8Array([c[0] * 255, c[1] * 255, c[2] * 255]), gl.RGB, false, true);
    const put = img => {
      if (!gl || gl.isContextLost()) return;
      // a map wider than this GPU can hold is drawn smaller first
      const most = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (img.width > most) {
        const small = document.createElement('canvas');
        small.width = most; small.height = most / 2;
        small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
        img = small;
      }
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (!plain) gl.generateMipmap(gl.TEXTURE_2D);
      texParams(!plain, true);
    };
    if (mapImages[key]) { if (mapImages[key].complete && mapImages[key].naturalWidth) put(mapImages[key]); else mapImages[key].addEventListener('load', () => put(mapImages[key])); return t; }
    const img = mapImages[key] = new Image();
    mapsWaiting++;
    img.onload = () => { put(img); mapsWaiting--; };
    img.onerror = () => { mapsWaiting--; };
    // what kind of picture it is can be read from how it begins
    const first = MAPS[key].charAt(0);
    img.src = 'data:image/' + (first === 'i' ? 'png' : first === 'U' ? 'webp' : 'jpeg') + ';base64,' + MAPS[key];
    return t;
  }

  // the colours of a banded planet, pole to pole
  function bandTex(stops) {
    const N = 128, px = new Uint8Array(N * 3);
    for (let i = 0; i < N; i++) {
      const lat = -90 + 180 * (i + 0.5) / N;
      let k = 0;
      while (k < stops.length - 2 && lat > stops[k + 1][0]) k++;
      const a = stops[k], b = stops[k + 1], t = smooth(a[0], b[0], lat);
      for (let c = 0; c < 3; c++) px[i * 3 + c] = clamp(mix(a[c + 1], b[c + 1], t), 0, 1) * 255;
    }
    return dataTex(N, 1, px, gl.RGB, false, false);
  }

  // Saturn's rings, by distance from the planet's centre in planet radii.
  // Edges and gaps are where Cassini measured them; the fine grooves between
  // are drawn, not measured.
  function ringTex(key, R) {
    const N = 1024, px = new Uint8Array(N * 4);
    const h = x => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };
    const n1 = x => { const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f); return mix(h(i), h(i + 1), t); };
    const band = (x, a, b, w) => smooth(a - w, a + w, x) * (1 - smooth(b - w, b + w, x));
    const bump = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (w * w));
    for (let i = 0; i < N; i++) {
      const x = R.in + (R.out - R.in) * (i + 0.5) / N;
      let o = 0, c = [0.5, 0.5, 0.5];
      if (key === 'saturn') {
        const groove = 1 + 0.22 * (n1(x * 95) - 0.5) + 0.16 * (n1(x * 310) - 0.5) + 0.10 * (n1(x * 900) - 0.5);
        const D = band(x, 1.110, 1.236, 0.004) * 0.012;
        const C = band(x, 1.239, 1.527, 0.003) * (0.05 + 0.09 * smooth(1.24, 1.52, x) + 0.10 * Math.pow(n1(x * 60), 3)) * (1 - 0.9 * bump(x, 1.290, 0.004)) * (1 - 0.95 * bump(x, 1.452, 0.004));
        const Bi = band(x, 1.527, 1.951, 0.002) * (0.52 + 0.30 * smooth(1.53, 1.70, x) + 0.14 * smooth(1.70, 1.78, x) - 0.10 * smooth(1.90, 1.95, x)) * (0.86 + 0.28 * n1(x * 42));
        const Cd = band(x, 1.958, 2.027, 0.002) * (0.05 + 0.08 * Math.pow(n1(x * 140), 2));
        const A = band(x, 2.027, 2.269, 0.002) * (0.62 - 0.20 * smooth(2.03, 2.16, x) + 0.08 * smooth(2.16, 2.26, x)) * (1 - bump(x, 2.2168, 0.0034) * 1.0) * (1 - 0.9 * bump(x, 2.2659, 0.0012));
        const F = bump(x, 2.326, 0.003) * 0.16;
        o = clamp((D + C + Bi + Cd + A + F) * groove, 0, 0.985);
        const thin = [0.52, 0.47, 0.42], thick = [0.90, 0.83, 0.70], outer = [0.86, 0.82, 0.74];
        const kB = band(x, 1.527, 1.951, 0.01), kA = band(x, 2.027, 2.269, 0.006);
        for (let k = 0; k < 3; k++) c[k] = mix(mix(thin[k], thick[k] * (0.9 + 0.1 * smooth(1.53, 1.8, x)), kB), outer[k], kA) * (0.94 + 0.12 * n1(x * 200));
      } else {
        // Uranus: nine threads, dark as soot; epsilon is the only one with any width
        const at = [1.637, 1.652, 1.666, 1.750, 1.786, 1.846, 1.863, 1.890, 2.001];
        const op = [0.10, 0.10, 0.10, 0.20, 0.20, 0.12, 0.22, 0.20, 0.55];
        for (let k = 0; k < 9; k++) o += bump(x, at[k], k === 8 ? 0.0042 : 0.0022) * op[k];
        o = clamp(o, 0, 0.9);
        c = [0.42, 0.44, 0.47];
      }
      px[i * 4] = c[0] * 255; px[i * 4 + 1] = c[1] * 255; px[i * 4 + 2] = c[2] * 255; px[i * 4 + 3] = o * 255;
    }
    return dataTex(N, 1, px, gl.RGBA, true, false);
  }

  // --- the sky ---------------------------------------------------------
  // Andromeda, the one galaxy a dark sky shows the naked eye that the map of
  // the Milky Way does not carry (the two Magellanic Clouds are in the map,
  // as Gaia saw them). at: right ascension
  // and declination. tilt: the long axis, in degrees from north toward east.
  // size: the long and short axis where the glow meets the sky, in degrees
  // (de Vaucouleurs et al., Third Reference Catalogue). The rest is how
  // bright, on the screen's own scale of 0 to 1 over a sky of 0.014: kept
  // low, all of it. Nothing here may be brighter than the Milky Way's heart.
  const GALAXIES = [
    { name: 'Andromeda', at: [10.685, 41.269], tilt: 35, size: [3.0, 1.0], disc: 0.035, fall: 0.46,
      heart: [0.22, 0.13, 0.041], mottle: 0, tint: [1.0, 0.95, 0.88], seed: 1 }
  ];
  (function () {
    const north = raDec(0, 90, [0, 0, 0]);
    for (const g of GALAXIES) {
      const c = g.c = raDec(g.at[0], g.at[1], [0, 0, 0]), k = dot(north, c);
      // at the galaxy, the way to the pole and the way east
      const n = unit([north[0] - c[0] * k, north[1] - c[1] * k, north[2] - c[2] * k], [0, 0, 0]);
      const e = unit(cross(north, c, [0, 0, 0]), [0, 0, 0]);
      const toward = deg => { const co = Math.cos(deg * D2R), si = Math.sin(deg * D2R); return [co * n[0] + si * e[0], co * n[1] + si * e[1], co * n[2] + si * e[2]]; };
      g.a = toward(g.tilt);
      g.b = cross(c, g.a, [0, 0, 0]);
      const bar = g.bar ? toward(g.bar[0]) : g.a;
      g.barTurn = Math.atan2(dot(bar, g.b), dot(bar, g.a));
      g.knotAt = [0, 0];
      if (g.knot) { const q = raDec(g.knot[0], g.knot[1], [0, 0, 0]), z = dot(q, c); g.knotAt = [dot(q, g.a) / z, dot(q, g.b) / z]; }
    }
  })();

  const GAL_Z = raDec(192.85948, 27.12825, [0, 0, 0]);       // the pole of the galaxy
  const GAL_X = raDec(266.40499, -28.93617, [0, 0, 0]);      // its centre, in Sagittarius
  const GAL_Y = cross(GAL_Z, GAL_X, [0, 0, 0]);
  function bvColour(bv) {
    const s = [[-0.4, .61, .72, 1], [0, .80, .87, 1], [0.3, .97, .97, 1], [0.6, 1, .95, .84], [1.0, 1, .84, .62], [1.5, 1, .72, .46], [2.1, 1, .60, .36]];
    let k = 0;
    while (k < s.length - 2 && bv > s[k + 1][0]) k++;
    const t = clamp((bv - s[k][0]) / (s[k + 1][0] - s[k][0]), 0, 1);
    return [mix(s[k][1], s[k + 1][1], t), mix(s[k][2], s[k + 1][2], t), mix(s[k][3], s[k + 1][3], t)];
  }
  const shine = mag => Math.pow(10, -0.18 * (mag - 1));
  // the Sun, seen from one au, is of magnitude -26.74
  const sunMag = au => -26.74 + 5 * Math.log10(Math.max(au, 1e-9));
  const NEAR_KEYS = Object.keys(NEAR);
  function makeStars() {
    const raw = atob(STARS), n = raw.length / 8, FAINT = 17000;
    const out = new Float32Array((n + FAINT + NEAR_KEYS.length + 1) * 8);
    const d = [0, 0, 0];
    let k = 0;
    const put = (dir, inv, c, I) => { out[k++] = dir[0]; out[k++] = dir[1]; out[k++] = dir[2]; out[k++] = inv; out[k++] = c[0]; out[k++] = c[1]; out[k++] = c[2]; out[k++] = I; };
    for (let i = 0; i < n; i++) {
      const b = j => raw.charCodeAt(i * 8 + j);
      const lon = (b(0) | b(1) << 8) / 65536 * TAU, lat = ((b(2) | b(3) << 8) / 65535 - 0.5) * PI;
      const mag = b(4) / 30 - 1.5, bv = b(5) / 100 - 0.4, far = b(6) | b(7) << 8;
      toScene(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), d);
      put(d, far ? 1 / (LY * Math.pow(10, (far - 1) / 65534 * 4.2)) : 0, bvColour(bv), shine(mag));
    }
    // below the catalogue: the stars too faint to have names, thicker toward
    // the Milky Way. They are not measured, so neither are their distances:
    // a few hundred light-years, a few thousand, as stars that faint are.
    const rnd = rng(20260928), deep = rng(1838);
    let made = 0;
    while (made < FAINT) {
      const z = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - z * z);
      d[0] = s * Math.cos(a); d[1] = z; d[2] = s * Math.sin(a);
      const gb = Math.asin(clamp(dot(d, GAL_Z), -1, 1));
      const gl = Math.atan2(dot(d, GAL_Y), dot(d, GAL_X));
      if (rnd() > 0.10 + 0.90 * Math.exp(-Math.abs(gb) / 0.20) * (0.45 + 0.55 * Math.exp(-gl * gl / 1.7))) continue;
      const mag = 5.7 + 3.0 * Math.pow(rnd(), 0.5);
      put(d, 1 / (LY * 120 * Math.pow(10, 1.3 * deep())), bvColour(-0.1 + 1.4 * rnd() * rnd() + 0.3 * rnd()), shine(mag));
      made++;
    }
    // the neighbours: a point for each, to put its name beside. Most are far
    // too faint for the catalogue, and for the eye: among the stars each is
    // given a point that can be seen all the same, in its own colour. (One
    // that the catalogue has is already drawn, as bright as it is; its point
    // here is only the least it may be.)
    for (const key of NEAR_KEYS) {
      const q = NEAR[key];
      put(raDec(q[0], q[1], d), q[2] / (1000 * PARSEC), bvColour(q[4]), -(q[3] > 5.6 ? Math.max(shine(q[3]), 1e-6) : 1e-6));
    }
    starN = n + FAINT + NEAR_KEYS.length;
    // and the Sun itself, for when the eye is far enough away to see it as the
    // star it is (it is kept a thousandth of an au from where it is, so that
    // it has a direction)
    sunAt = starN;
    put([1, 0, 0], 1000, bvColour(0.65), -shine(sunMag(0.001)));
    return out;
  }

  // --- the small bodies --------------------------------------------------
  function makeBelt() {
    const rnd = rng(1801), N = 3400, TRO = 260;
    const out = new Float32Array((N + TRO * 2) * 8);
    const ray = s => s * Math.sqrt(-2 * Math.log(1 - rnd() * 0.999));
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)) * Math.cos(TAU * rnd());
    let k = 0, made = 0;
    const put = (a, e, i, Om, w, M, n, br) => { out[k++] = a; out[k++] = e; out[k++] = i; out[k++] = Om; out[k++] = w; out[k++] = M; out[k++] = n; out[k++] = br; };
    while (made < N) {
      const a = 2.06 + 1.26 * rnd();
      // Jupiter sweeps out the orbits that keep time with its own
      const gap = Math.max(Math.exp(-Math.pow((a - 2.502) / 0.030, 2)), Math.exp(-Math.pow((a - 2.825) / 0.026, 2)),
        Math.exp(-Math.pow((a - 2.958) / 0.018, 2)), Math.exp(-Math.pow((a - 3.279) / 0.045, 2)), Math.exp(-Math.pow((a - 2.064) / 0.03, 2)));
      if (rnd() < gap * 0.97) continue;
      if (a > 3.2 && rnd() < 0.6) continue;
      put(a, Math.min(0.33, ray(0.085)), Math.min(30, ray(6.5)) * D2R, rnd() * TAU, rnd() * TAU, rnd() * TAU, GAUSS_K / Math.pow(a, 1.5), Math.pow(rnd(), 2.2));
      made++;
    }
    // the Trojans: two crowds that share Jupiter's orbit, a sixth of a turn ahead and behind
    const T0 = (JD0 - J2000) / 36525, jup = EL.jupiter;
    const LJ = (jup[3] + jup[9] * T0) * D2R, nJ = jup[9] / 36525 * D2R;
    for (let s = -1; s <= 1; s += 2) for (let j = 0; j < TRO; j++) {
      const lam = LJ + s * PI / 3 + gauss() * 0.20, Om = rnd() * TAU, peri = rnd() * TAU;
      put(jup[0] + gauss() * 0.04, Math.min(0.16, ray(0.05)), Math.min(36, ray(10)) * D2R, Om, peri - Om, lam - peri, nJ, Math.pow(rnd(), 2.2));
    }
    beltN = N + TRO * 2;
    return out;
  }
  function makeKuiper() {
    const rnd = rng(1930), N = 1500;
    const out = new Float32Array(N * 8);
    const ray = s => s * Math.sqrt(-2 * Math.log(1 - rnd() * 0.999));
    let k = 0;
    for (let j = 0; j < N; j++) {
      const kind = rnd();
      let a, e, i;
      if (kind < 0.2) { a = 39.4 + (rnd() - 0.5) * 0.5; e = 0.08 + 0.24 * rnd(); i = Math.min(32, ray(9)); }            // in step with Neptune, like Pluto
      else if (kind < 0.92) { a = 42 + 5.6 * rnd(); e = Math.min(0.2, ray(0.055)); i = rnd() < 0.62 ? Math.min(8, ray(2.2)) : Math.min(34, ray(13)); }
      else { a = 52 + 45 * rnd() * rnd(); e = clamp(1 - (33 + 7 * rnd()) / a, 0.1, 0.7); i = Math.min(40, ray(14)); }  // thrown outward long ago
      out[k++] = a; out[k++] = e; out[k++] = i * D2R; out[k++] = rnd() * TAU; out[k++] = rnd() * TAU; out[k++] = rnd() * TAU;
      out[k++] = GAUSS_K / Math.pow(a, 1.5); out[k++] = Math.pow(rnd(), 2.0);
    }
    kuiperN = N;
    return out;
  }
  // The Oort cloud. Nobody has seen it: it is reckoned from the long comets,
  // which fall in from every side and from a fraction of the way to the
  // stars. Thick and rather flat within, thin and round without.
  function makeOort() {
    const rnd = rng(1950), N = 6000;
    const out = new Float32Array(N * 8);
    let k = 0;
    for (let j = 0; j < N; j++) {
      const a = 2000 * Math.pow(50, Math.pow(rnd(), 1.5));
      const round = smooth(Math.log(5000), Math.log(25000), Math.log(a));
      const tilt = Math.acos(clamp(1 - 2 * rnd(), -1, 1));
      const flat = Math.min(PI, 0.45 * Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)));
      out[k++] = a; out[k++] = 0.5 * rnd(); out[k++] = mix(flat, tilt, round); out[k++] = rnd() * TAU; out[k++] = rnd() * TAU; out[k++] = rnd() * TAU;
      out[k++] = GAUSS_K / Math.pow(a, 1.5); out[k++] = Math.pow(rnd(), 2.0);
    }
    oortN = N;
    return out;
  }

  function buffer(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  function quad1() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function initGL() {
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true };
    gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts);
    if (!gl) return false;
    cur = null;
    try {
      program('tex', V_BODY, F_TEX, ['aCorner']);
      program('earth', V_BODY, F_EARTH, ['aCorner']);
      program('band', V_BODY, F_BAND, ['aCorner']);
      program('rock', V_BODY, F_ROCK, ['aCorner']);
      program('sun', V_BODY, F_SUN, ['aCorner']);
      program('glow', V_BODY, F_GLOW, ['aCorner']);
      program('ring', V_RING, F_RING, ['aCorner']);
      program('tail', V_TAIL, F_TAIL, ['aCorner']);
      program('sky', V_FULL, F_SKY, ['aCorner']);
      program('galaxy', V_GALAXY, F_GALAXY, ['aCorner']);
      program('star', V_STAR, F_STAR, ['aStar', 'aLook']);
      program('shell', V_BODY, F_SHELL, ['aCorner']);
      program('air', V_FULL, F_AIR, ['aCorner']);
      program('belt', V_BELT, F_BELT, ['aEl1', 'aEl2']);
      program('orbit', V_ORBIT, F_ORBIT, ['aD']);
      program('trail', V_TRAIL, F_TRAIL, ['aD']);
    } catch (err) {
      if (window.console) console.warn('solar: ' + err.message);
      return false;
    }
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enableVertexAttribArray(0);

    quadBuf = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    // the angles of an orbit's line: close together near the body, at both ends of the loop
    const od = new Float32Array(ORBIT_N * 2 * 4), g = s => TAU * (0.5 - 0.5 * Math.cos(PI * s));
    for (let i = 0; i < ORBIT_N; i++) {
      const b = g(i / (ORBIT_N - 1));
      const bp = i ? g((i - 1) / (ORBIT_N - 1)) : -g(1 / (ORBIT_N - 1));
      const bn = i < ORBIT_N - 1 ? g((i + 1) / (ORBIT_N - 1)) : TAU + g(1 / (ORBIT_N - 1));
      for (let s = 0; s < 2; s++) od.set([b, bp, bn, s ? 1 : -1], (i * 2 + s) * 4);
    }
    orbitBuf = buffer(od);
    // the times of a trail: from now back to the end of its span, closer together toward now
    const td = new Float32Array(TRAIL_N * 2 * 4), h = i => Math.pow(clamp(i, -1, TRAIL_N) / (TRAIL_N - 1), 1.6);
    for (let i = 0; i < TRAIL_N; i++) {
      const bp = i ? h(i - 1) : -h(1);
      for (let e = 0; e < 2; e++) td.set([h(i), bp, h(i + 1), e ? 1 : -1], (i * 2 + e) * 4);
    }
    trailBuf = buffer(td);
    starBuf = buffer(makeStars());
    beltBuf = buffer(makeBelt());
    kuiperBuf = buffer(makeKuiper());
    oortBuf = buffer(makeOort());

    for (const b of B) {
      const L = b.look;
      if (L.kind === 'tex') L.tex = mapTex(L.map, b.c);
      if (L.kind === 'earth') { L.tex = mapTex('earth', b.c); L.tex1 = mapTex('clouds', [0.2, 0.2, 0.2]); L.tex2 = mapTex('night', [0, 0, 0]); L.tex3 = mapTex('land', [0.3, 0.3, 0.3]); }
      if (L.kind === 'band') L.tex = bandTex(L.stops);
      if (b.ring) b.ring.tex = ringTex(b.ring.key, b.ring);
    }
    TX.none = dataTex(1, 1, new Uint8Array([0, 0, 0, 0]), gl.RGBA, false, false);
    TX.sky = mapTex('milkyway', [0, 0, 0], true);
    GLOK = true;
    return true;
  }
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); GLOK = false; });
  cv.addEventListener('webglcontextrestored', () => { if (initGL()) resize(); });

  // --- camera ---------------------------------------------------------
  // it circles whatever it is looking at: az around, el above the plane of
  // the planets, dist away. Distances run over fifteen orders of magnitude,
  // from beside a moon to among the stars, so everything about dist is done
  // in its logarithm.
  const TAN_HALF = Math.tan(18 * D2R);      // half the view across the screen's short side
  const HOME = 34 / (2 * 0.46 * TAN_HALF);  // far enough to hold Neptune, Pluto and the belt beyond
  // forty light-years: every star within twelve is on the screen at once.
  // (Without WebGL the stars are a flat sky, and the eye stays where it was kept before: 900 au.)
  let FAR = 40 * LY;
  const AMONG = 18 * LY;                    // where "the nearest stars" takes the eye
  const HELIOPAUSE = 120;                   // au: Voyager 1 crossed it at 121.6, Voyager 2 at 119.0
  // the wind from between the stars blows from here (ecliptic longitude 255.4, latitude 5.2)
  const NOSE = toScene(Math.cos(5.2 * D2R) * Math.cos(255.4 * D2R), Math.cos(5.2 * D2R) * Math.sin(255.4 * D2R), Math.sin(5.2 * D2R), [0, 0, 0]);
  let W = 0, H = 0, DPR = 1, RES = 1;
  let az = BG.az, el = BG.el, dist = HOME, distTo = HOME;
  let vAz = 0, vEl = 0;                     // what a drag leaves behind
  let focus = SUN, picked = null;
  let fly = null;
  const cam = { rt: [1, 0, 0], up: [0, 1, 0], fw: [0, 0, -1], pos: [0, 0, 0], at: [0, 0, 0], rest: [0, 0, 0], F: 1, near: 0.01 };
  if (QS.get('az')) az = parseFloat(QS.get('az')) || 0;
  if (QS.get('el')) el = clamp(parseFloat(QS.get('el')) || 0, -1.5, 1.5);

  const nearest = b => b.stand ? b.stand / 4 : Math.max(b.r * 2.0, 1e-9);
  const visitDist = b => b.stand || b.r * (b.visit || (b.kind === 'moon' ? 8 : 7));

  // --- leaving -------------------------------------------------------------
  // Three things change as the eye goes out past the planets, each by how
  // far out it is, none by a switch.
  //   farK    the ease on the orbits is let go: from 150 au to 1200 the worlds
  //           go to their true distances, whatever the pill says. (Eased,
  //           Alpha Centauri would stand three times as far as Neptune.)
  //   shipT   beside a spacecraft it is let go as well: the view from there
  //           is the true one or it is nothing.
  //   sunStar the Sun's marker gives way to the star the Sun is, from a third
  //           of a light-year to one and a half.
  let farK = 0, shipT = 0, sunStar = 0, starsK = 0;
  const lg = Math.log;

  // --- the journey ------------------------------------------------------
  // The Sun is not still. It goes round the galaxy at about 230 km/s, toward
  // galactic longitude 90 in Cygnus, and takes everything with it: 48.5 au a
  // year, eight times as fast as Earth goes round the Sun. The plane of the
  // planets is tipped 60 degrees to that road, so nothing trails behind the
  // Sun: every world keeps circling it, a little ahead and a little behind by
  // turns, and its path through the galaxy is a corkscrew drawn out long.
  // Over the few years drawn here the road is straight: one turn of the
  // galaxy takes 230 million.
  // The road is always drawn true. The worlds stand as far from the Sun as the
  // other switch says: eased, their corkscrews are drawn wider than life, as
  // their orbits are; with "true distances" on, everything is in proportion.
  const GO_AU_DAY = 230 * 86400 / AU;
  const GO = [GAL_Y[0] * GO_AU_DAY, GAL_Y[1] * GO_AU_DAY, GAL_Y[2] * GO_AU_DAY], NOWHERE = [0, 0, 0];
  let journey = QS.get('journey') === '1', journeyT = journey ? 1 : 0, journeyK = journeyT;
  // (jK is journeyK where there are worlds to see. Among the stars the road
  // is put away: they are going the same way, nearly abreast, and a road drawn
  // past stars that stood still would say the Sun runs through them.)
  let jK = journeyK;
  let elBefore = 1.02;
  // how much sky there is between the middle of the screen and its top, in au, at the distance of what is looked at
  const halfTall = () => dist * TAN_HALF * H / Math.max(1, Math.min(W, H));
  // how long a trail is drawn, in days: long enough to leave the screen
  const trailDays = () => clamp(1.9 * halfTall(), 1e-7, 700) / GO_AU_DAY;
  // how fast each body goes round, radians a day
  for (const b of B) {
    if (b === SUN || b.parent) { b.n = 0; continue; }
    if (b.craft) { craftOrbit(b.craft, JD0, b.orb); b.n = b.orb.n; continue; }
    b.n = (b.small ? SMALL[b.small][6] : (EL[b.key][9] - EL[b.key][10]) / 36525) * D2R;
  }
  // where a body was, a time ago, measured from where the Sun is now (or, with
  // `still`, from the Sun as it was then: its own path round the Sun)
  function wasAt(b, days, o, still) {
    if (b === SUN) o[0] = o[1] = o[2] = 0;
    else { b.orb.at(b.orb.solve(b.orb.mean() - b.n * days), o); const r = len(o), k = mapR(r) / r; o[0] *= k; o[1] *= k; o[2] *= k; }
    if (!still) { o[0] -= GO[0] * days; o[1] -= GO[1] * days; o[2] -= GO[2] * days; }
    return o;
  }
  // beside the road, a little above the plane: the corkscrews are seen from the side
  function roadside() {
    const up = 0.22, r = Math.hypot(GAL_Y[0], GAL_Y[2]), turn = Math.atan2(GAL_Y[2], GAL_Y[0]);
    const a = Math.asin(clamp(-GAL_Y[1] * Math.tan(up) / r, -1, 1));
    const one = a - turn, two = PI - a - turn;
    const near = v => Math.abs(((v - az) % TAU + TAU + PI) % TAU - PI);
    return [near(one) < near(two) ? one : two, up];
  }
  function setJourney(on) {
    if (on === journey) return;
    journey = on;
    if (on) elBefore = el;
    if (focus === SUN && dist > 4) begin(SUN, dist, false, on ? roadside() : [az, elBefore]);
  }

  // --- eclipses -------------------------------------------------------------
  // Nothing here is looked up: they are found, from where this page puts the
  // Sun, the Earth and the Moon. An eclipse of the Sun is a new Moon whose
  // shadow's axis meets the Earth; an eclipse of the Moon is a full Moon that
  // goes through the dark heart of the Earth's shadow.
  const R_EARTH = 6378.137 / AU, R_MOON = 1737.4 / AU, MONTH = 29.530589;
  const _ea = new Orbit(), _mo = new Orbit(), _e = [0, 0, 0], _m = [0, 0, 0], _ax = [0, 0, 0];
  // the Earth from the Sun and the Moon from the Earth, at any moment
  function earthMoon(t) {
    planetOrbit('earth', t, _ea); _ea.at(_ea.E, _e);
    theMoon(t, _mo, _m);
    _e[0] -= _m[0] / 82.30057; _e[1] -= _m[1] / 82.30057; _e[2] -= _m[2] / 82.30057;
  }
  // how far round from the Sun the Moon stands, seen from the Earth: 0 new, pi full
  function moonAge(t) {
    earthMoon(t);
    const a = Math.atan2(-_m[2], _m[0]) - Math.atan2(_e[2], -_e[0]);
    return ((a % TAU) + TAU) % TAU;
  }
  // an eclipse of the Sun: how far from the Earth's centre the axis of the Moon's shadow passes, in Earth radii
  function sunMiss(t) {
    earthMoon(t);
    // from the Sun (at -e, seen from the Earth) through the Moon
    unit([_m[0] + _e[0], _m[1] + _e[1], _m[2] + _e[2]], _ax);
    const along = dot(_m, _ax);
    return Math.sqrt(Math.max(0, dot(_m, _m) - along * along)) / R_EARTH;
  }
  // an eclipse of the Moon: how deep it goes into the Earth's dark shadow. 0 it touches, 1 it is all inside
  function moonDepth(t) {
    earthMoon(t);
    const far = len(_e);
    _ax[0] = _e[0] / far; _ax[1] = _e[1] / far; _ax[2] = _e[2] / far;
    const along = dot(_m, _ax), off = Math.sqrt(Math.max(0, dot(_m, _m) - along * along));
    // the shadow narrows with distance; the Earth's air makes it a fiftieth wider
    const dark = 1.02 * (R_EARTH - along * (SUN.r - R_EARTH) / far);
    return (dark + R_MOON - off) / (2 * R_MOON);
  }
  function least(f, a, b) {
    const g = 0.381966;
    let x1 = a + g * (b - a), x2 = b - g * (b - a), f1 = f(x1), f2 = f(x2);
    for (let i = 0; i < 40; i++) {
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = a + g * (b - a); f1 = f(x1); }
      else { a = x1; x1 = x2; f1 = f2; x2 = b - g * (b - a); f2 = f(x2); }
    }
    return (a + b) / 2;
  }
  // the first moment after t when the Moon is `age` round from the Sun
  function moonAt(age, t) {
    const gap = x => ((moonAge(x) - age + PI) % TAU + TAU) % TAU - PI;
    let a = t, ga = gap(a);
    for (let i = 0; i < 80; i++) {
      const b = a + 1, gb = gap(b);
      if (ga <= 0 && gb > 0 && gb - ga < 1) {
        let lo = a, hi = b;
        for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (gap(mid) > 0) hi = mid; else lo = mid; }
        return (lo + hi) / 2;
      }
      a = b; ga = gb;
    }
    return t + MONTH;
  }
  // the next eclipse after t that can be SEEN from outside: the Moon's shadow
  // on the Earth, or the Moon gone dark. (Eclipses where only the edge of a
  // shadow grazes by are passed over.)
  function nextEclipse(t) {
    let sun = null, moon = null;
    for (let from = t, i = 0; i < 40 && !sun; i++) {
      const n = moonAt(0, from), at = least(sunMiss, n - 0.25, n + 0.25);
      if (at > t && sunMiss(at) < 0.99) {
        // does the dark cone reach the ground, or end above it?
        earthMoon(at);
        const toSun = len([_m[0] + _e[0], _m[1] + _e[1], _m[2] + _e[2]]), cone = toSun * R_MOON / (SUN.r - R_MOON);
        unit([_m[0] + _e[0], _m[1] + _e[1], _m[2] + _e[2]], _ax);
        const b = dot(_m, _ax), toGround = -b - Math.sqrt(Math.max(0, b * b - dot(_m, _m) + R_EARTH * R_EARTH));
        sun = { at, of: 'sun', kind: cone >= Math.abs(toGround) ? 'total' : 'annular' };
      }
      from = n + 20;
    }
    for (let from = t, i = 0; i < 40 && !moon; i++) {
      const n = moonAt(PI, from), at = least(x => -moonDepth(x), n - 0.25, n + 0.25), deep = moonDepth(at);
      if (at > t && deep > 0.05) moon = { at, of: 'moon', kind: deep >= 1 ? 'total' : 'partial' };
      from = n + 20;
    }
    return !moon || (sun && sun.at < moon.at) ? sun : moon;
  }
  function goToEclipse() {
    const e = nextEclipse(jd + 0.2);
    if (!e) return null;
    // arrive before it begins. The clock waits for the eye to get there (from
    // far off it runs at days a second, and the eclipse would be over on
    // arrival), then runs at half the pace of the place: a quarter of an hour
    // a second beside the Earth, so that the shadow takes its time
    jd = e.at - (e.of === 'sun' ? 0.085 : 0.095);
    atNow = false; factor = 0.5; paused = false; waiting = true;
    place(jd);
    const b = e.of === 'sun' ? EARTH : byKey.moon;
    unit([-b.pos[0], -b.pos[1], -b.pos[2]], _s);
    // stand on the Sun's side, a little off its line: the whole lit face, and the shadow crossing it
    begin(b, visitDist(b), false, [Math.atan2(_s[0], _s[2]) + (e.of === 'sun' ? 0.4 : 0.22), e.of === 'sun' ? 0.28 : 0.15]);
    return e;
  }

  // --- your sky tonight -------------------------------------------------------
  // The eye comes down, stands on the Earth at one place, and looks up.
  // Nothing is made for this: the Sun, the Moon and the planets are the same
  // bodies in the same places, the stars the same stars, seen from a spot on
  // the ground that the Earth carries round with it. What is added is the
  // ground, and the air.
  //
  // Where "here" is: what the browser says, when it will say (it asks you
  // first); else the city the clock's time zone is named for; else a city
  // picked from this list. It is kept in this browser and goes nowhere.
  // name (and its name in Spanish, where that is another) | latitude | longitude, east | time zone
  const CITIES = `
    Amsterdam/Ámsterdam|52.37|4.90|Europe/Amsterdam
    Anchorage|61.22|-149.90|America/Anchorage
    Asunción|-25.28|-57.64|America/Asuncion
    Athens/Atenas|37.98|23.73|Europe/Athens
    Atlanta|33.75|-84.39|America/New_York
    Auckland|-36.85|174.76|Pacific/Auckland
    Austin|30.27|-97.74|America/Chicago
    Bangkok|13.76|100.50|Asia/Bangkok
    Barcelona|41.39|2.17|Europe/Madrid
    Beijing/Pekín|39.90|116.41|Asia/Shanghai
    Berlin/Berlín|52.52|13.40|Europe/Berlin
    Bogotá|4.71|-74.07|America/Bogota
    Boston|42.36|-71.06|America/New_York
    Buenos Aires|-34.60|-58.38|America/Argentina/Buenos_Aires
    Cairo/El Cairo|30.04|31.24|Africa/Cairo
    Cape Town/Ciudad del Cabo|-33.92|18.42|Africa/Johannesburg
    Caracas|10.49|-66.88|America/Caracas
    Casablanca|33.57|-7.59|Africa/Casablanca
    Chicago|41.88|-87.63|America/Chicago
    Dallas|32.78|-96.80|America/Chicago
    Delhi|28.61|77.21|Asia/Kolkata
    Denver|39.74|-104.99|America/Denver
    Dhaka/Daca|23.81|90.41|Asia/Dhaka
    Dubai/Dubái|25.20|55.27|Asia/Dubai
    Dublin/Dublín|53.35|-6.26|Europe/Dublin
    Guadalajara|20.67|-103.35|America/Mexico_City
    Guatemala City/Ciudad de Guatemala|14.63|-90.51|America/Guatemala
    Havana/La Habana|23.11|-82.37|America/Havana
    Hong Kong|22.32|114.17|Asia/Hong_Kong
    Honolulu/Honolulú|21.31|-157.86|Pacific/Honolulu
    Houston|29.76|-95.37|America/Chicago
    Istanbul/Estambul|41.01|28.98|Europe/Istanbul
    Jakarta/Yakarta|-6.21|106.85|Asia/Jakarta
    Jerusalem/Jerusalén|31.78|35.22|Asia/Jerusalem
    Johannesburg/Johannesburgo|-26.20|28.05|Africa/Johannesburg
    Karachi|24.86|67.01|Asia/Karachi
    Kyiv/Kiev|50.45|30.52|Europe/Kyiv
    La Paz|-16.50|-68.15|America/La_Paz
    Lagos|6.52|3.38|Africa/Lagos
    Lima|-12.05|-77.04|America/Lima
    Lisbon/Lisboa|38.72|-9.14|Europe/Lisbon
    London/Londres|51.51|-0.13|Europe/London
    Longyearbyen|78.22|15.64|Arctic/Longyearbyen
    Los Angeles/Los Ángeles|34.05|-118.24|America/Los_Angeles
    Madrid|40.42|-3.70|Europe/Madrid
    Managua|12.11|-86.24|America/Managua
    Manila|14.60|120.98|Asia/Manila
    McMurdo|-77.85|166.67|Antarctica/McMurdo
    Medellín|6.24|-75.58|America/Bogota
    Melbourne|-37.81|144.96|Australia/Melbourne
    Mexico City/Ciudad de México|19.43|-99.13|America/Mexico_City
    Miami|25.76|-80.19|America/New_York
    Monterrey|25.69|-100.32|America/Monterrey
    Montevideo|-34.90|-56.16|America/Montevideo
    Montreal|45.50|-73.57|America/Toronto
    Moscow/Moscú|55.76|37.62|Europe/Moscow
    Mumbai/Bombay|19.08|72.88|Asia/Kolkata
    Nairobi|-1.29|36.82|Africa/Nairobi
    New Orleans/Nueva Orleans|29.95|-90.07|America/Chicago
    New York/Nueva York|40.71|-74.01|America/New_York
    Oslo|59.91|10.75|Europe/Oslo
    Panama City/Ciudad de Panamá|8.98|-79.52|America/Panama
    Paris/París|48.86|2.35|Europe/Paris
    Phoenix|33.45|-112.07|America/Phoenix
    Prague/Praga|50.08|14.44|Europe/Prague
    Quito|-0.18|-78.47|America/Guayaquil
    Reykjavik/Reikiavik|64.15|-21.94|Atlantic/Reykjavik
    Rio de Janeiro/Río de Janeiro|-22.91|-43.17|America/Sao_Paulo
    Rome/Roma|41.90|12.50|Europe/Rome
    San Antonio|29.42|-98.49|America/Chicago
    San Francisco|37.77|-122.42|America/Los_Angeles
    San José, Costa Rica|9.93|-84.08|America/Costa_Rica
    San Juan|18.47|-66.11|America/Puerto_Rico
    San Salvador|13.69|-89.22|America/El_Salvador
    Santiago|-33.45|-70.67|America/Santiago
    Santo Domingo|18.49|-69.93|America/Santo_Domingo
    São Paulo|-23.55|-46.63|America/Sao_Paulo
    Seattle|47.61|-122.33|America/Los_Angeles
    Seoul/Seúl|37.57|126.98|Asia/Seoul
    Shanghai/Shanghái|31.23|121.47|Asia/Shanghai
    Singapore/Singapur|1.35|103.82|Asia/Singapore
    Stockholm/Estocolmo|59.33|18.07|Europe/Stockholm
    Sydney/Sídney|-33.87|151.21|Australia/Sydney
    Tegucigalpa|14.07|-87.19|America/Tegucigalpa
    Tehran/Teherán|35.69|51.39|Asia/Tehran
    Tokyo/Tokio|35.68|139.69|Asia/Tokyo
    Toronto|43.65|-79.38|America/Toronto
    Ushuaia|-54.80|-68.30|America/Argentina/Ushuaia
    Vancouver|49.28|-123.12|America/Vancouver
    Vienna/Viena|48.21|16.37|Europe/Vienna
    Warsaw/Varsovia|52.23|21.01|Europe/Warsaw
    Washington|38.91|-77.04|America/New_York
  `.trim().split('\n').map(row => {
    const c = row.trim().split('|'), n = c[0].split('/');
    return { en: n[0], es: n[1] || n[0], lat: +c[1], lon: +c[2], tz: c[3] };
  });
  // sure: it was said or chosen, not guessed from the clock
  const PLACE = { key: '', name: '', lat: 0, lon: 0, tz: undefined, sure: false };
  const elSky = $('sky'), elPlace = $('place'), elPlaceName = $('placeName'), elNight = $('night');
  const CAN_ASK = !!navigator.geolocation && window.isSecureContext !== false;
  const degrees = (v, pos, neg) => NUM(Math.abs(v), 1) + '° ' + (v >= 0 ? pos : neg);
  const placeCoords = () => degrees(PLACE.lat / D2R, 'N', 'S') + ' ' + degrees(PLACE.lon / D2R, 'E', T('W', 'O'));
  function showPlace() {
    elPlaceName.textContent = T('from ', 'desde ') + PLACE.name;
    elPlace.value = PLACE.key;
  }
  function setPlace(key, name, lat, lon, tz, keep) {
    // (straight over a pole there is no east: the poles are left a tenth of a degree away)
    PLACE.key = key; PLACE.lat = clamp(lat, -89.9, 89.9) * D2R; PLACE.lon = lon * D2R; PLACE.tz = tz || undefined;
    PLACE.name = name || placeCoords();
    if (keep) {
      PLACE.sure = true;
      // to a hundredth of a degree: a kilometre, which is all the sky can tell
      try { localStorage.setItem('solar_place', JSON.stringify([key, +lat.toFixed(2), +lon.toFixed(2)])); } catch (e) {}
    }
    showPlace();
  }
  const HERE = () => T('where you are', 'donde estás');
  (function () {
    if (CAN_ASK) elPlace.add(new Option(T('where I am', 'donde estoy'), 'here'));
    CITIES.slice().sort((a, b) => T(a.en, a.es).localeCompare(T(b.en, b.es), LANG)).forEach(c => elPlace.add(new Option(T(c.en, c.es), c.en)));
    const city = k => CITIES.find(c => c.en === k);
    const lat = parseFloat(QS.get('lat')), lon = parseFloat(QS.get('lon'));
    if (isFinite(lat) && isFinite(lon)) { setPlace('asked', '', lat, lon); PLACE.sure = true; return; }
    try {
      const kept = JSON.parse(localStorage.getItem('solar_place') || 'null');
      const c = kept && city(kept[0]);
      if (c) { setPlace(c.en, T(c.en, c.es), c.lat, c.lon, c.tz); PLACE.sure = true; return; }
      if (kept && kept[0] === 'here' && isFinite(kept[1]) && isFinite(kept[2])) { setPlace('here', HERE(), kept[1], kept[2]); PLACE.sure = true; return; }
    } catch (e) {}
    // not known yet: the city the clock's time zone is named for, or one that keeps the same time
    let zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    const named = zone.split('/').pop().replace(/_/g, ' ');
    const c = CITIES.find(c => c.tz === zone && c.en === named) || CITIES.find(c => c.tz === zone);
    if (c) setPlace(c.en, T(c.en, c.es), c.lat, c.lon, c.tz);
    else setPlace('zone', T('your time zone', 'tu huso horario'), 35, -new Date().getTimezoneOffset() / 4);
  })();
  function askWhere(aloud) {
    if (!CAN_ASK) return;
    navigator.geolocation.getCurrentPosition(p => {
      setPlace('here', HERE(), p.coords.latitude, p.coords.longitude, undefined, true);
      if (skyOn) rearrive();
    }, () => {
      showPlace();
      if (aloud) say(T('this browser will not say where it is · pick the nearest city', 'este navegador no dice dónde está · elige la ciudad más cercana'), 9000);
    }, { maximumAge: 3600000, timeout: 15000 });
  }

  // sky: asked for. skyPending: on the way down. skyOn: standing there.
  let skyOn = false, skyPending = false, leaving = false, leaveThen = null, skyWhen = 'now';
  let nightA = 0, nightTo = 0, paceBefore = 1;
  // which way the eye is turned (from north, through east) and how high it
  // looks, and how wide the view is: half of it across the screen's short side
  let skyAz = PI, skyAlt = 0.4, skyTan = 0.6, skyTanTo = 0.6;
  const SKY_LOW = -0.3, SKY_HIGH = 1.5, SKY_TAN_MIN = Math.tan(1.5 * D2R);
  // as wide as will not stretch the corners out of shape: 104 degrees along the long side at most
  const skyTanWide = () => Math.min(Math.tan(36 * D2R), Math.tan(52 * D2R) * Math.min(W, H) / Math.max(W, H, 1));
  // U straight up, N to the north along the ground, E to the east. sun: the
  // way to it. sunUp: the sine of its height. dim: how much of the Milky Way
  // the dusk and the Moon leave. big: how many times their size the Sun and
  // the Moon are drawn.
  const SKY = { U: [0, 1, 0], N: [0, 0, -1], E: [1, 0, 0], sun: [0, 1, 0], sunUp: -1, day: 0, dim: 1, moonLit: 0, moonWash: 0, big: 1 };
  // straight up from the place, given how the Earth is turned (f.X through
  // Greenwich's meridian on the equator, f.Z through the north pole)
  function upFrom(f, o) {
    const cl = Math.cos(PLACE.lat), sl = Math.sin(PLACE.lat), c = cl * Math.cos(PLACE.lon), s = cl * Math.sin(PLACE.lon);
    for (let i = 0; i < 3; i++) o[i] = c * f.X[i] + s * f.Y[i] + sl * f.Z[i];
    return o;
  }
  function skyFrame() {
    upFrom(EARTH, SKY.U);
    unit(cross(EARTH.Z, SKY.U, SKY.E), SKY.E);
    cross(SKY.U, SKY.E, SKY.N);
  }
  // where the eye hangs before it comes down: straight over the place
  function overPlace() {
    skyFrame();
    return [Math.atan2(SKY.U[0], SKY.U[2]), clamp(Math.asin(clamp(SKY.U[1], -1, 1)), -1.5, 1.5)];
  }
  function skyCamera() {
    skyFrame();
    const U = SKY.U, N = SKY.N, E = SKY.E, R = EARTH.r * 1.0000003;        // eye height: two metres
    const ca = Math.cos(skyAz), sa = Math.sin(skyAz), cp = Math.cos(skyAlt), sp = Math.sin(skyAlt);
    for (let i = 0; i < 3; i++) {
      const level = ca * N[i] + sa * E[i];
      cam.pos[i] = EARTH.dp[i] + U[i] * R;
      cam.rt[i] = ca * E[i] - sa * N[i];
      cam.fw[i] = cp * level + sp * U[i];
      cam.up[i] = -sp * level + cp * U[i];
      cam.at[i] = cam.rest[i] = EARTH.dp[i];
    }
    cam.F = Math.min(W, H) / 2 / skyTan;
    cam.near = 1e-9;
    // the Sun and the Moon over this place, and what they do to the sky
    const m = byKey.moon;
    unit([SUN.dp[0] - cam.pos[0], SUN.dp[1] - cam.pos[1], SUN.dp[2] - cam.pos[2]], SKY.sun);
    SKY.sunUp = dot(SKY.sun, U);
    SKY.day = smooth(-0.10, 0.06, SKY.sunUp);
    unit([m.dp[0] - cam.pos[0], m.dp[1] - cam.pos[1], m.dp[2] - cam.pos[2]], _a);
    unit([SUN.dp[0] - m.dp[0], SUN.dp[1] - m.dp[1], SUN.dp[2] - m.dp[2]], _b);
    // (the Moon's lit share, seen from here: all of it when the Sun is behind the eye)
    SKY.moonLit = (1 - dot(_a, _b)) / 2;
    SKY.moonWash = SKY.moonLit * smooth(-0.02, 0.25, dot(_a, U));
    SKY.dim = (1 - smooth(-0.31, -0.16, SKY.sunUp)) * (1 - 0.7 * SKY.moonWash);
  }

  // how high a body stands over the place at any moment, as the sine of its
  // height: for finding when it rises and sets, and when tonight is dark
  const _tf = { X: [0, 0, 0], Y: [0, 0, 0], Z: [0, 0, 0] }, _tu = [0, 0, 0], _td = [0, 0, 0], _to = new Orbit();
  function upAt(b, t) {
    iauFrame('earth', t, _tf); upFrom(_tf, _tu);
    earthMoon(t);
    if (b === SUN) _td[0] = _td[1] = _td[2] = 0;
    else if (b.key === 'moon') { _td[0] = _e[0] + _m[0]; _td[1] = _e[1] + _m[1]; _td[2] = _e[2] + _m[2]; }
    else { planetOrbit(b.key, t, _to); _to.at(_to.E, _td); }
    for (let i = 0; i < 3; i++) _td[i] -= _e[i] + _tu[i] * R_EARTH;
    return dot(_td, _tu) / len(_td);
  }
  // the first time after `from` that it crosses a height, going up or coming down
  function nextCross(b, from, level, hours) {
    let a = from, fa = upAt(b, a) - level;
    for (let i = 0; i < hours * 10; i++) {
      const c = a + 1 / 240, fc = upAt(b, c) - level;
      if ((fa < 0) !== (fc < 0)) {
        let lo = a, hi = c;
        for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if ((upAt(b, mid) - level < 0) === (fa < 0)) lo = mid; else hi = mid; }
        return { at: (lo + hi) / 2, rising: fa < 0 };
      }
      a = c; fa = fc;
    }
    return null;
  }
  // a rising or a setting is the upper edge on the horizon for the Sun and
  // the Moon; the air lifts everything there by half a degree and more
  const horizonOf = b => Math.sin((b === SUN || b.key === 'moon' ? -0.83 : -0.57) * D2R);
  const DARK = Math.sin(-13 * D2R);
  // tonight: now, if it is night here; else the moment this evening when the
  // Sun is thirteen degrees under and the stars are out. (Where a summer
  // night never gets that dark: when the Sun is lowest.)
  function skyTime() {
    const now = jdOf(Date.now());
    if (upAt(SUN, now) < Math.sin(-9 * D2R)) { jd = now; atNow = true; skyWhen = 'now'; }
    else {
      const x = nextCross(SUN, now, DARK, 24);
      let at = x && !x.rising ? x.at : 0;
      if (!at) {
        let least = 2;
        for (let i = 0; i <= 144; i++) { const t = now + i / 144, u = upAt(SUN, t); if (u < least) { least = u; at = t; } }
      }
      jd = at; atNow = false; skyWhen = 'tonight';
    }
  }
  // how bright a planet is from the Earth, in magnitudes: by how far it is
  // from the Sun and from us, and how much of its lit side is turned our way
  // (the Astronomical Almanac's formulas, as Meeus gives them; Saturn's rings
  // add their own light as they open)
  function magOf(b) {
    const r = b.helio, R = EARTH.helio, d = Math.hypot(b.pos[0] - EARTH.pos[0], b.pos[1] - EARTH.pos[1], b.pos[2] - EARTH.pos[2]);
    const a = Math.acos(clamp((r * r + d * d - R * R) / (2 * r * d), -1, 1)) / D2R, k = 5 * Math.log10(r * d);
    switch (b.key) {
      case 'mercury': return -0.42 + k + 0.0380 * a - 0.000273 * a * a + 0.000002 * a * a * a;
      case 'venus': return -4.40 + k + 0.0009 * a + 0.000239 * a * a - 0.00000065 * a * a * a;
      case 'mars': return -1.52 + k + 0.016 * a;
      case 'jupiter': return -9.40 + k + 0.005 * a;
      case 'saturn': {
        const s = Math.abs((b.pos[0] - EARTH.pos[0]) * b.Z[0] + (b.pos[1] - EARTH.pos[1]) * b.Z[1] + (b.pos[2] - EARTH.pos[2]) * b.Z[2]) / d;
        return -8.88 + k + 0.044 * a - 2.60 * s + 1.25 * s * s;
      }
      case 'uranus': return -7.19 + k;
      default: return -6.87 + k;
    }
  }
  // the sine of the Sun's height at which a light of this magnitude is lost
  // in the day: the same rule the stars keep, in their shader
  const lostAt = m => -0.06 - 0.022 * Math.min(m, 6);
  // from the ground a planet is a point of light, as a star is, and is drawn
  // as one of its brightness would be: nearer white than its marker in space
  for (const b of PLANETS) { const top = Math.max(b.c[0], b.c[1], b.c[2]); b.tint = b.c.map(v => mix(v / top, 1, 0.3)); }
  function measureSky() {
    const F = cam.F, U = SKY.U;
    order.length = 0;
    sunStar = 0;
    // the Sun and the Moon are half a degree across: a pixel or two in a view
    // this wide. Both are drawn larger by the same amount, six pixels at the
    // least, so that the Moon's phase can be read
    SKY.big = Math.max(1, 6 / (F * 0.00465));
    for (const b of B) {
      toView(b.dp, b.v);
      const dd = len(b.v), disc = b === SUN || b.key === 'moon';
      b.dd = dd; b.shown = false; b.pr = 0; b.vis = 0; b.fill = 0;
      if (!disc && (b.kind !== 'planet' || b === EARTH)) continue;
      b.up = ((b.dp[0] - cam.pos[0]) * U[0] + (b.dp[1] - cam.pos[1]) * U[1] + (b.dp[2] - cam.pos[2]) * U[2]) / dd;
      b.azm = Math.atan2((b.dp[0] - cam.pos[0]) * SKY.E[0] + (b.dp[1] - cam.pos[1]) * SKY.E[1] + (b.dp[2] - cam.pos[2]) * SKY.E[2],
        (b.dp[0] - cam.pos[0]) * SKY.N[0] + (b.dp[1] - cam.pos[1]) * SKY.N[1] + (b.dp[2] - cam.pos[2]) * SKY.N[2]);
      if (disc) {
        b.pr = F * b.r / dd * SKY.big;
        if (b === SUN) b.fill = 1 - smooth(0.3, 0.97, 1 / SKY.big);
        // (it is there until the ground has all of it)
        b.vis = smooth(-b.pr / F - 0.004, -b.pr / F, b.up);
      } else {
        b.mag = magOf(b);
        const I = Math.min(shine(b.mag), 8);
        b.pr = 0.655 * (1 + 2.1 * Math.pow(I, 0.8));
        b.shine = clamp(1.5 * I, 0, 1);
        b.vis = (1 - smooth(lostAt(b.mag) - 0.07, lostAt(b.mag), SKY.sunUp)) * smooth(-0.01, 0.10, b.up);
      }
      b.rd = b.pr * dd / F;
      if (b.v[2] <= 1e-9 || b.vis < 0.003) continue;
      b.px = W / 2 + F * b.v[0] / b.v[2];
      b.py = H / 2 - F * b.v[1] / b.v[2];
      b.shown = true;
      order.push(b);
    }
    order.sort((a, b) => b.dd - a.dd);
  }

  // the words for it
  const clock = t => {
    const d = new Date(Math.round(msOf(t) / 1000) * 1000), o = { hour: '2-digit', minute: '2-digit' };
    if (PLACE.tz) { try { return d.toLocaleTimeString(LANG, Object.assign({ timeZone: PLACE.tz }, o)); } catch (e) {} }
    return d.toLocaleTimeString(LANG, o);
  };
  const atClock = t => { const c = clock(t); return T('at ' + c, (/^0?1[:.]/.test(c) ? 'a la ' : 'a las ') + c); };
  const COMPASS = [['north', 'norte'], ['north-east', 'noreste'], ['east', 'este'], ['south-east', 'sureste'], ['south', 'sur'], ['south-west', 'suroeste'], ['west', 'oeste'], ['north-west', 'noroeste']];
  const compass = a => { const c = COMPASS[Math.round((((a % TAU) + TAU) % TAU) / (PI / 4)) % 8]; return T(c[0], c[1]); };
  const PHASES = [['new Moon', 'luna nueva'], ['a waxing crescent', 'creciente'], ['first quarter', 'cuarto creciente'], ['waxing gibbous', 'gibosa creciente'],
    ['full Moon', 'luna llena'], ['waning gibbous', 'gibosa menguante'], ['last quarter', 'cuarto menguante'], ['a waning crescent', 'menguante']];
  function moonPhase(t) {
    const age = moonAge(t), near = (v, w) => Math.abs(((age - v + PI) % TAU + TAU) % TAU - PI) < w;
    const k = near(0, 0.21) ? 0 : near(PI, 0.21) ? 4 : near(PI / 2, 0.16) ? 2 : near(3 * PI / 2, 0.16) ? 6 : age < PI / 2 ? 1 : age < PI ? 3 : age < 3 * PI / 2 ? 5 : 7;
    return { lit: (1 - Math.cos(age)) / 2, name: T(PHASES[k][0], PHASES[k][1]) };
  }
  const brightness = m => m < -1.5 ? T('brighter than any star', 'más brillante que cualquier estrella')
    : m < 1.5 ? T('as bright as the brightest stars', 'tan brillante como las estrellas más brillantes')
    : m < 4.5 ? T('an ordinary star to the eye', 'una estrella corriente a simple vista')
    : T('at the edge of what the eye can find', 'en el límite de lo que el ojo alcanza');
  // how long ago the light now arriving left it
  const lightAgo = au => {
    const s = au * 499.004784;
    return s < 90 ? T(NUM(s, 1) + ' seconds', NUM(s, 1) + ' segundos')
      : s < 5400 ? T(NUM(s / 60, s < 600 ? 1 : 0) + ' minutes', NUM(s / 60, s < 600 ? 1 : 0) + ' minutos')
      : T(NUM(s / 3600, 1) + ' hours', NUM(s / 3600, 1) + ' horas');
  };
  // what is up, said once on arriving
  function skyWords() {
    const out = [];
    out.push(skyWhen === 'tonight' ? T('tonight ' + atClock(jd) + ', once it is dark', 'esta noche ' + atClock(jd) + ', ya de noche')
      : skyWhen === 'now' ? T('your sky, right now', 'tu cielo, ahora mismo')
      : new Date(msOf(jd)).toLocaleDateString(LANG, Object.assign({ day: 'numeric', month: 'long', year: 'numeric' }, PLACE.tz ? { timeZone: PLACE.tz } : {})) + ' · ' + clock(jd));
    const names = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'].map(k => byKey[k]).filter(b => b.up > 0.05 && b.vis > 0.4).sort((a, b) => a.mag - b.mag).map(b => T(b.en, b.es));
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + T(' and ', ' y ') + names[names.length - 1] : names[0];
    out.push(!names.length ? T('no planet is up at this hour', 'ningún planeta está sobre el horizonte a esta hora')
      : names.length > 1 ? T(list + ' are up', list + ' están sobre el horizonte') : T(list + ' is up', list + ' está sobre el horizonte'));
    const m = byKey.moon, ph = moonPhase(jd);
    if (m.up > 0 && ph.lit > 0.015) out.push(T('the Moon is up: ' + ph.name, 'la Luna está en el cielo: ' + ph.name));
    else if (m.up <= 0) {
      const x = nextCross(m, jd, horizonOf(m), 14);
      if (x && x.rising) out.push(T('the Moon rises ' + atClock(x.at), 'la Luna sale ' + atClock(x.at)));
    }
    return out.join(' · ');
  }
  // turn to what there is to see: the Moon if it is up, else the brightest
  // planet, else the side of the sky the planets keep to
  function aim() {
    let to = null;
    const m = byKey.moon;
    if (m.vis > 0.5 && m.up > 0.12 && SKY.moonWash > 0.03) to = m;
    else for (const b of PLANETS) if (b !== EARTH && b.vis > 0.5 && b.up > 0.12 && b.mag < 2 && (!to || b.mag < to.mag)) to = b;
    const tall = Math.atan(skyTan * H / Math.max(1, Math.min(W, H)));       // half the view, from the middle of the screen to its top
    skyAz = to ? to.azm : PLACE.lat >= 0 ? PI : 0;
    skyAlt = clamp((to ? Math.asin(clamp(to.up, -1, 1)) : 0) - 0.5 * tall, 0.42 * tall, 1.2);
  }
  // standing there: the time is set, the eye is turned, and what is up is said
  function arrive(keepTime) {
    if (!keepTime) skyTime();
    place(jd); skyCamera(); measureSky();
    aim();
    skyCamera(); measureSky();
    farWas = null; wordsAt = 0;
    say(skyWords(), 16000);
  }
  // the ground has moved under the eye: tonight comes at another hour there
  function rearrive() {
    if (skyWhen === 'date') { arrive(true); return; }
    arrive(false);
    factor = 0; paused = false; wordsAt = 0;
  }
  function enterSky(keepTime, quick) {
    if (!GLOK || skyOn || skyPending) return;
    if (!PLACE.sure) askWhere(false);
    choose(null);
    if (keepTime) { skyWhen = 'date'; atNow = false; } else skyTime();
    // as it happens: from the ground the sky turns at the pace it turns
    paceBefore = factor;
    factor = 0; paused = false; wordsAt = 0;
    place(jd);
    elSky.setAttribute('aria-pressed', 'true');
    if (REDUCED || quick) { leaving = false; fly = null; focus = EARTH; dist = distTo = EARTH.r * 2; vAz = vEl = 0; nightA = nightTo = 1; land(); return; }
    // the clock waits while the eye comes down, as it does for an eclipse
    waiting = true;
    begin(EARTH, EARTH.r * 2, false, overPlace());
    // (a flight this long is given the time of a flight to the stars: coming home is quicker)
    if (fly) fly.ms = Math.min(fly.ms, 3400);
    skyPending = true;
  }
  function land() {
    skyPending = false; skyOn = true; nightTo = 0;
    if (REDUCED) nightA = 0;
    document.body.classList.add('sky');
    barRows();
    vAz = vEl = 0;
    mapM = 1;
    skyTan = skyTanTo = skyTanWide();
    arrive(true);
  }
  // back up: through the dark again, to hang over the place, and from there
  // to wherever was asked for
  function leaveSky(then) {
    leaveThen = then;
    if (leaving) return;
    leaving = true; nightTo = 1;
    if (REDUCED) { nightA = 1; takeOff(); }
  }
  function takeOff() {
    leaving = false; skyOn = false; nightTo = 0;
    if (REDUCED) nightA = 0;
    document.body.classList.remove('sky');
    elSky.setAttribute('aria-pressed', 'false');
    fadeHint(true);
    vAz = vEl = 0; focus = EARTH; dist = distTo = EARTH.r * 2; farWas = null; wordsAt = 0;
    // (the clock goes back to the pace it had in space, if it was left at the ground's)
    if (factor === 0 && !REDUCED) factor = paceBefore || 1;
    barRows();
    mapM = ease(mapT);
    place(jd);
    const over = overPlace();
    az = over[0]; el = over[1];
    placeCamera(performance.now()); measure();
    const then = leaveThen;
    leaveThen = null;
    if (then) then();
  }
  function drawSky(lens) {
    const F = cam.F * RES;
    const part = k => {
      use(PR.air);
      u3('uRt', cam.rt); u3('uUp', cam.up); u3('uFw', cam.fw); u3('uZen', SKY.U); u3('uSun', SKY.sun);
      u2('uTan', cv.width / (2 * F), cv.height / (2 * F));
      u3('uPart', [k, 1 / F, SKY.moonWash]);
      quad1();
    };
    part(0);
    for (const p of [PR.tex, PR.sun, PR.glow]) lens(p);
    for (const b of order) {
      if (b === SUN) drawSun(b);
      else if (b.key === 'moon') {
        // its light in the air round it, by how much of it is lit
        const lit = SKY.moonLit * (1 - SKY.day) * b.vis;
        if (lit > 0.01) { drawGlow(b, 7, 0.16 * lit, [0.78, 0.84, 1.0]); drawGlow(b, 2.4, 0.3 * lit, [0.9, 0.93, 1.0]); }
        drawGlobe(b);
      }
      else drawGlow(b, 1, b.shine * b.vis, b.tint);
    }
    part(1);
  }

  // far from a planet the eye returns to the Sun by itself: pinch out and
  // the whole system comes back to the middle
  const _tp = [0, 0, 0];
  function restingOn(b, d, o) {
    const k = b === SUN ? 0 : 1 - smooth(Math.log(7), Math.log(64), Math.log(d));
    o[0] = b.dp[0] * k; o[1] = b.dp[1] * k; o[2] = b.dp[2] * k;
    return o;
  }

  function placeCamera(now) {
    if (skyOn) { skyCamera(); return; }
    if (fly) {
      const t = clamp((now - fly.t0) / fly.ms, 0, 1);
      // going in: turn to it, then dive. coming out: rise, then turn home
      const pan = fly.inward ? ease(clamp(t / 0.5, 0, 1)) : ease(clamp((t - 0.4) / 0.6, 0, 1));
      const zoom = fly.inward ? ease(clamp((t - 0.2) / 0.8, 0, 1)) : ease(clamp(t / 0.75, 0, 1));
      restingOn(focus, fly.to, cam.at);
      cam.at[0] += fly.off[0] * (1 - pan); cam.at[1] += fly.off[1] * (1 - pan); cam.at[2] += fly.off[2] * (1 - pan);
      dist = distTo = Math.exp(mix(Math.log(fly.from), Math.log(fly.to), zoom));
      // and the eye comes round to the side the Sun is lighting, unless a hand has taken the turning
      if (fly.turn) {
        const k = ease(t);
        az += fly.dAz * (k - fly.k); el = clamp(el + fly.dEl * (k - fly.k), -1.5, 1.5);
        fly.k = k;
      }
      if (t >= 1) fly = null;
    } else restingOn(focus, dist, cam.at);
    cam.rest[0] = cam.at[0]; cam.rest[1] = cam.at[1]; cam.rest[2] = cam.at[2];
    // on the journey the eye looks a little way back down the road, so that
    // the Sun stands high on the screen and what it has left behind fills the rest
    if (jK > 0) {
      const k = jK * (focus === SUN ? 1 : smooth(Math.log(7), Math.log(64), Math.log(dist))) * 0.55 * halfTall() / GO_AU_DAY;
      cam.at[0] -= GO[0] * k; cam.at[1] -= GO[1] * k; cam.at[2] -= GO[2] * k;
    }
    const ce = Math.cos(el), se = Math.sin(el), ca = Math.cos(az), sa = Math.sin(az);
    cam.fw[0] = -ce * sa; cam.fw[1] = -se; cam.fw[2] = -ce * ca;
    cam.rt[0] = ca; cam.rt[1] = 0; cam.rt[2] = -sa;
    cross(cam.rt, cam.fw, cam.up);
    cam.pos[0] = cam.at[0] - cam.fw[0] * dist; cam.pos[1] = cam.at[1] - cam.fw[1] * dist; cam.pos[2] = cam.at[2] - cam.fw[2] * dist;
    cam.F = Math.min(W, H) / 2 / TAN_HALF;
    cam.near = dist * 0.004;
    if (BG.lift) { const k = BG.lift * (1 - jK) * H * dist / cam.F; cam.pos[0] -= cam.up[0] * k; cam.pos[1] -= cam.up[1] * k; cam.pos[2] -= cam.up[2] * k; }
  }

  // where to stand beside a world: a little above the plane and well round
  // to one side of the line to the Sun, so that the light comes across the
  // globe and the edge of the day runs down its face. With the Sun behind
  // the eye (it was, at first: 43 degrees round) nearly the whole disc is
  // lit and a lit disc is flat. For a ringed world, the side from which the
  // rings lie more open.
  // ASIDE 77 degrees round, ABOVE 17 degrees up: the Sun, the globe and the
  // eye make an angle of 78, and 60% of the disc is in daylight.
  const ASIDE = 1.35, ABOVE = 0.30;
  const _s = [0, 0, 0];
  function vantage(b) {
    if (b === SUN) return [az, 0.45];
    if (b.craft) {
      // behind it and a little above, looking home: the craft in the middle
      // of the view, and over it the Sun and every world it has left
      unit(b.pos, _s);
      return [Math.atan2(_s[0], _s[2]), clamp(Math.asin(clamp(_s[1], -1, 1)) + 0.13, -1.5, 1.5)];
    }
    unit([-b.pos[0], -b.pos[1], -b.pos[2]], _s);
    const sunward = Math.atan2(_s[0], _s[2]);
    let side = 1;
    if (b.ring) {
      const open = s => { const a = sunward + s * ASIDE; return Math.abs(Math.cos(ABOVE) * Math.sin(a) * b.Z[0] + Math.sin(ABOVE) * b.Z[1] + Math.cos(ABOVE) * Math.cos(a) * b.Z[2]); };
      if (open(-1) > open(1)) side = -1;
    }
    return [sunward + side * ASIDE, ABOVE];
  }
  function visit(b, quick) { if (b) begin(b, visitDist(b), quick, vantage(b)); }
  function goHome(quick) { begin(SUN, HOME, quick, [az, 1.02]); }
  function goFar(quick, to) { begin(SUN, clamp(to || AMONG, HOME, FAR), quick, [az, 0.5]); }
  function begin(b, to, quick, stand) {
    // from the ground, first back up through the dark; and any other flight calls the way down off
    if (skyOn) { leaveSky(() => begin(b, to, quick, stand)); return; }
    if (skyPending) { skyPending = false; nightTo = 0; elSky.setAttribute('aria-pressed', 'false'); if (factor === 0 && !REDUCED) factor = paceBefore || 1; }
    focus = b;
    vAz = vEl = 0;
    // the short way round
    const dAz = ((stand[0] - az) % TAU + TAU + PI) % TAU - PI, dEl = stand[1] - el;
    if (REDUCED || quick) { dist = distTo = to; az += dAz; el += dEl; fly = null; return; }
    // where the eye rests now, measured from where it will rest: the flight closes that gap
    restingOn(b, to, _tp);
    const off = [cam.rest[0] - _tp[0], cam.rest[1] - _tp[1], cam.rest[2] - _tp[2]];
    const span = Math.abs(Math.log(to / dist));
    // (a flight to the stars or back crosses ten thousand times what any other does, and is given the time to be seen)
    fly = { t0: performance.now(), ms: clamp(1500 + span * 190, 1600, 3400) + clamp((span - 5) * 600, 0, 2600), from: dist, to, off, inward: to < dist, turn: true, dAz, dEl, k: 0 };
  }

  // --- the pace of time -------------------------------------------------
  // from far away, twelve days a second: a year of Earth in half a minute,
  // as the first version of this page ran. Closer in, time eases with the
  // distance, so that a moon's month or a planet's day can be watched.
  let factor = 1, paused = QS.get('still') === '1', atNow = true, waiting = false;
  if (REDUCED) factor = 0;                 // nothing moves until asked
  const STEPS = 4;
  // (past 3000 au there is nothing left that a faster clock would show moving)
  const autoRate = d => 0.8 * Math.pow(Math.min(d, 3000), d < 1 ? 0.45 : 0.585);        // days per second
  const rate = () => factor === 0 ? 1 / 86400 : autoRate(dist) * factor;   // factor 0: as it happens

  // --- each frame: where everything is, and how big it is drawn ----------
  const order = [];
  const _rel = [0, 0, 0], _rel2 = [0, 0, 0];
  function toView(p, o) {
    _rel[0] = p[0] - cam.pos[0]; _rel[1] = p[1] - cam.pos[1]; _rel[2] = p[2] - cam.pos[2];
    o[0] = dot(_rel, cam.rt); o[1] = dot(_rel, cam.up); o[2] = dot(_rel, cam.fw);
    return o;
  }
  const turn = (p, o) => { const x = dot(p, cam.rt), y = dot(p, cam.up), z = dot(p, cam.fw); o[0] = x; o[1] = y; o[2] = z; return o; };

  // how many pixels from the Sun a world stands, on the screen
  const fromSun = b => cam.F * len(b.dp) / Math.max(SUN.dd, 1e-9);
  function measure() {
    if (skyOn) { measureSky(); return; }
    const F = cam.F;
    const mkScale = clamp(Math.pow(HOME / dist, 0.3), 0.6, 1.5) * clamp(Math.min(W, H) / 620, 1, 1.35);
    SUN.mk = Math.max(6.5, Math.min(W, H) * 0.0125);
    order.length = 0;
    sunStar = FAR > 1000 ? smooth(lg(0.3 * LY), lg(1.5 * LY), lg(Math.max(len(toView(SUN.dp, _rel2)), 1e-9))) : 0;
    for (const b of B) {
      toView(b.dp, b.v);
      const dd = len(b.v);
      b.dd = dd;
      b.shown = b.v[2] > cam.near && dd > b.r * 1.02;
      if (!b.shown) { b.pr = 0; continue; }
      const truePx = F * b.r / dd;
      // a marker may not be bigger than a third of the orbit it sits on: seen
      // true, the inner planets shrink with their orbits instead of piling on the Sun
      let room;
      if (b === SUN) room = 0.4 * F * len(byKey.mercury.dp) / dd;
      else if (b.parent) room = 0.3 * F * b.orb.a / b.parent.dd;
      else room = 0.3 * F * len(b.dp) / SUN.dd;
      // (the Sun is never less than a small bright point: it is what everything else is about)
      const mk = Math.max(b === SUN ? 2.6 : 0.55, Math.min(b.mk * mkScale * clamp(Math.pow(dist / dd, 0.35), 0.75, 1.35), room));
      b.pr = Math.pow(Math.pow(truePx, 4) + Math.pow(mk, 4), 0.25);
      b.pr *= b === SUN ? 1 + BG.sun : 1 + BG.planet * (b.parent ? 0.6 : 1) + (BG.each[b.key] || 0);
      b.fill = 1 - smooth(0.3, 0.97, truePx / b.pr);
      b.rd = b.pr * dd / F;
      b.px = W / 2 + F * b.v[0] / b.v[2];
      b.py = H / 2 - F * b.v[1] / b.v[2];
      b.vis = b.parent ? smooth(1.5, 3.0, (F * b.orb.a / b.parent.dd) / Math.max(b.parent.pr, 0.01)) : 1;
      // from far enough a world is lost in the light of its star: when it stands
      // less than a pixel from the Sun it is let go. And the Sun's own marker
      // goes as the eye comes among the stars, where the Sun is drawn as one.
      if (b === SUN) b.vis = 1 - sunStar;
      else if (!b.parent) b.vis = smooth(0.5, 1.4, fromSun(b)) * (b.craft && !b.away ? 0 : 1);
      else b.vis *= b.parent.vis;
      // a marker is thousands of times the size of its world. Crossing the face
      // of the Sun it would be a black hole in it, where the truth is a speck:
      // let it fade while it crosses
      if (b !== SUN && SUN.shown && b.fill > 0.3 && b.dd < SUN.dd) {
        const over = smooth(SUN.pr + b.pr, SUN.pr * 0.6, Math.hypot(b.px - SUN.px, b.py - SUN.py));
        b.vis *= 1 - 0.85 * over * b.fill;
      }
      if (b.vis > 0.003) order.push(b);
    }
    order.sort((a, b) => b.dd - a.dd);
  }

  // --- drawing -----------------------------------------------------------
  const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _d = [0, 0, 0];
  const _occ = new Float32Array(16);
  let realT = 0;

  function common(b) {
    const rd = b.rd;
    u3('uC', b.v); u1('uR', rd);
    u3('uCn', [b.v[0] / rd, b.v[1] / rd, b.v[2] / rd]);
    u3('uX', turn(b.X, _a)); u3('uY', turn(b.Y, _a)); u3('uZ', turn(b.Z, _a));
    u1('uPx', (b.dd / (cam.F * RES)) / rd);
    u1('uRpx', b.pr * RES);
    u1('uTime', realT);
  }
  // the square must hold the whole silhouette: a near sphere looks wider
  // than its radius, and wider still away from the middle of the view
  const reach = (b, extra) => b.rd * (b.dd / Math.sqrt(Math.max(b.dd * b.dd - b.rd * b.rd, 1e-30))) * (b.dd / b.v[2]) * (1 + extra) + 2 * b.dd / (cam.F * RES);

  function drawGlobe(b) {
    const L = b.look;
    use(PR[L.kind]);
    common(b);
    u1('uHalf', reach(b, (L.halo || 0) * 7));
    // from here, the way to the Sun
    unit([-b.pos[0], -b.pos[1], -b.pos[2]], _b);
    u3('uL', turn(_b, _a));
    u1('uSq', 1 / (1 - b.flat));
    u1('uFill', b.fill);
    u1('uAlpha', b.vis);
    u1('uSolid', skyOn ? 1 - SKY.day : 1);
    u1('uSunAng', SUN.r / Math.max(b.helio, 0.01));
    u1('uHalo', b.fill > 0.6 ? 0 : (L.halo || 0));
    u3('uFar', b.c);
    const at = L.atmo || [0, 0, 0, 0], rim = L.rim || [5, 0.3, 0.5];
    u4('uAtmo', at[0], at[1], at[2], at[3] * (1 - b.fill));
    u3('uRim', rim);
    // whatever can stand between it and the Sun: its moons, or for a moon its planet
    const occ = PR[L.kind].u.uOcc;
    if (occ) {
      const o = _occ;
      o.fill(0);
      if (b.fill < 0.5) {
        const list = b.parent ? [b.parent] : b.moons;
        // (in its own radii: from the ground the Moon is drawn larger than it is, and the Earth's shadow must not shrink for it)
        const ru = skyOn ? b.r : b.rd;
        let k = 0;
        for (const m of list) {
          if (k >= 4) break;
          if (!b.parent && m.rkm < 200) continue;
          o[k * 4] = (m.v[0] - b.v[0]) / ru; o[k * 4 + 1] = (m.v[1] - b.v[1]) / ru; o[k * 4 + 2] = (m.v[2] - b.v[2]) / ru;
          o[k * 4 + 3] = m.r / ru;
          k++;
        }
      }
      gl.uniform4fv(occ, o);
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, b.ring ? b.ring.tex : TX.none);
    ui('uRingTex', 3);
    if (b.ring) u4('uRing', b.ring.in, b.ring.out, 1, 0); else u4('uRing', 0, 0, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, L.tex || TX.none);
    if (L.kind === 'tex') {
      ui('uMap0', 0);
      // (in a night sky the Moon is the brightest thing there is, not the grey rock it is beside the Earth)
      u3('uTint', L.tint); u4('uLook', L.gain * (skyOn ? 1.7 : 1), L.gamma, L.rough, L.detail);
      u1('uLon0', (L.lon0 || 0) / 360); u1('uLimb', L.limb || 0);
      u3('uEmber', b.key === 'moon' ? [0.20, 0.035, 0.012] : [0, 0, 0]);
    } else if (L.kind === 'earth') {
      ui('uMap0', 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L.tex1); ui('uMap1', 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, L.tex2); ui('uMap2', 2);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, L.tex3); ui('uMap3', 4);
      // the weather drifts east over the ground, a turn in about three weeks
      u1('uCloud', -((jd - J2000) % 21) / 21 * TAU);
      u1('uLimb', L.limb || 0);
    } else if (L.kind === 'band') {
      ui('uBand', 0);
      u4('uBP', L.turb, L.streak, L.swirl, L.spot || 0);
      u4('uLook', 1, 1, 0, 0); u1('uLimb', L.limb);
      u3('uEmber', [0, 0, 0]);
    } else {
      u3('uA', L.a); u3('uB', L.b);
      u4('uRP', L.freq, L.contrast, L.craters, L.style);
      u4('uLook', 1, 1, 1, 0); u1('uLimb', L.limb === undefined ? 0.3 : L.limb);
      u3('uEmber', [0, 0, 0]);
    }
    quad1();
  }

  function drawRing(b) {
    const R = b.ring;
    use(PR.ring);
    // any two directions that lie in the ring plane
    turn(b.Z, _c);
    unit(cross(b.Z, Math.abs(b.Z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], _a), _a);
    cross(b.Z, _a, _b);
    const rd = b.rd;
    u3('uC', b.v); u1('uR', rd); u1('uOut', R.out);
    u3('uCn', [b.v[0] / rd, b.v[1] / rd, b.v[2] / rd]);
    u3('uU', turn(_a, _d)); u3('uV', turn(_b, _d)); u3('uZ', _c);
    unit([-b.pos[0], -b.pos[1], -b.pos[2]], _b);
    u3('uL', turn(_b, _a));
    u1('uSq', 1 / (1 - b.flat));
    u1('uPx', (b.dd / (cam.F * RES)) / rd);
    u1('uSunAng', SUN.r / Math.max(b.helio, 0.01));
    u1('uAlpha', b.vis * (R.key === 'saturn' ? 1 : 1 - b.fill));     // Uranus's threads are not seen from afar
    u1('uGain', R.key === 'saturn' ? 1.25 : 0.5);
    u4('uRing', R.in, R.out, 1, 0);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.tex); ui('uRingTex', 3);
    quad1();
  }

  function drawGlow(b, size, strength, colour) {
    use(PR.glow);
    const r = b.rd * size;
    u3('uC', b.v); u1('uR', r); u1('uHalf', r);
    u3('uColor', colour || b.c); u1('uGlow', strength);
    quad1();
  }

  function drawSun(b) {
    use(PR.sun);
    common(b);
    const far = mix(5.0, 7.0, b.fill);
    u1('uHalf', b.rd * far * (b.dd / b.v[2]));
    u1('uReach', far);
    u1('uGlow', mix(0.8, 0.62, b.fill) * (1 + BG.glow));
    u1('uAlpha', b.vis);
    quad1();
  }

  function drawShell(k) {
    const R = mapR(HELIOPAUSE), v = SUN.v, dd = SUN.dd;
    use(PR.shell);
    u3('uC', v); u1('uR', R);
    u1('uHalf', R * (dd / Math.sqrt(Math.max(dd * dd - R * R, 1e-30))) * (dd / v[2]) * 1.02 + 2 * dd / (cam.F * RES));
    u3('uCn', [v[0] / R, v[1] / R, v[2] / R]);
    u3('uNose', turn(NOSE, _a));
    u1('uPx', (dd / (cam.F * RES)) / R);
    u3('uColor', [0.50, 0.62, 1.0]); u1('uAlpha', 0.0062 * k);
    quad1();
  }
  // the edge of the wind shows from outside it, and while it is more than a few pixels across
  const shellK = () => SUN.shown
    ? smooth(lg(140), lg(260), lg(dist)) * smooth(1.08, 1.5, SUN.dd / mapR(HELIOPAUSE)) * smooth(3, 9, cam.F * mapR(HELIOPAUSE) / Math.max(SUN.dd, 1e-9))
    : 0;
  const oortK = () => smooth(lg(1500), lg(7000), lg(dist)) * (1 - smooth(lg(1.5 * LY), lg(5 * LY), lg(dist)));
  const OORT_THICK = 8000;                  // au: half of it is reckoned to lie within this

  function comet(b) {
    // it wakes as it nears the Sun
    const act = 1 - smooth(0.9, 3.4, b.helio);
    b.act = act;
    if (act < 0.01 || !b.shown) return;
    const away = unit(b.pos, _a);
    const lenTrue = 1.1 * act;
    const lenDrawn = mapR(b.helio + lenTrue) - mapR(b.helio);
    // which way it is travelling: the dust lags behind along the orbit
    b.orb.at(b.orb.E + 0.002, _b);
    _b[0] -= b.pos[0]; _b[1] -= b.pos[1]; _b[2] -= b.pos[2];
    unit(_b, _b);
    use(PR.tail);
    const tail = (dir, length, colour, spread, glow) => {
      turn(dir, _c);
      _c[0] *= length; _c[1] *= length; _c[2] *= length;
      // across the tail, flat to the eye
      const vx = b.v[0] / b.dd, vy = b.v[1] / b.dd, vz = b.v[2] / b.dd;
      _d[0] = _c[1] * vz - _c[2] * vy; _d[1] = _c[2] * vx - _c[0] * vz; _d[2] = _c[0] * vy - _c[1] * vx;
      const l = len(_d);
      if (l < length * 0.02) return;
      const k = length / l;
      _d[0] *= k; _d[1] *= k; _d[2] *= k;
      u3('uC', b.v); u3('uU', _c); u3('uV', _d);
      u3('uColor', colour); u1('uGlow', glow * act * b.vis); u1('uSpread', spread);
      quad1();
    };
    tail(away, lenDrawn, [0.45, 0.70, 1.0], 0.05, 0.55);
    const dust = unit([away[0] - 0.42 * _b[0], away[1] - 0.42 * _b[1], away[2] - 0.42 * _b[2]], [0, 0, 0]);
    tail(dust, lenDrawn * 0.72, [1.0, 0.90, 0.70], 0.22, 0.42);
  }

  function drawOrbit(b, base, trail) {
    const o = b.orb, p = b.parent;
    u1('uE', o.E); u1('uA', o.a); u1('uBb', o.a * Math.sqrt(1 - o.e * o.e)); u1('uEcc', o.e);
    u3('uP', o.P); u3('uQ', o.Q);
    if (p) { u3('uOrigin', [p.dp[0] - cam.pos[0], p.dp[1] - cam.pos[1], p.dp[2] - cam.pos[2]]); u1('uMapOn', 0); }
    else { u3('uOrigin', [-cam.pos[0], -cam.pos[1], -cam.pos[2]]); u1('uMapOn', 1); }
    u3('uTrailColor', b.c);
    u1('uBase', base); u1('uTrail', trail);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, ORBIT_N * 2);
  }

  function draw() {
    gl.viewport(0, 0, cv.width, cv.height);
    const px = cam.F * RES;
    const projX = 2 * px / cv.width, projY = 2 * px / cv.height;
    const lens = p => { use(p); u2('uProj', projX, projY); u1('uNear', cam.near); };

    // the sky
    gl.disable(gl.BLEND);
    use(PR.sky);
    u3('uRt', cam.rt); u3('uUp', cam.up); u3('uFw', cam.fw);
    u2('uTan', 1 / projX, 1 / projY);
    // (from the ground, the dusk and the Moon take the Milky Way away)
    const skyDim = skyOn ? SKY.dim : 1;
    u1('uDim', skyDim); u2('uTilt', CE, SE);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, TX.sky); ui('uSky', 5);
    quad1();
    gl.enable(gl.BLEND);

    // the galaxies: light added to the sky, under the stars
    use(PR.galaxy);
    u3('uRt', cam.rt); u3('uUp', cam.up); u3('uFw', cam.fw);
    u2('uProj', projX, projY);
    for (const g of GALAXIES) {
      if (dot(g.c, cam.fw) < -0.2) continue;
      const ax = g.size[0] / 2 * D2R, bx = g.size[1] / 2 * D2R;
      u3('uC', g.c); u3('uA', g.a); u3('uB', g.b);
      u2('uAxes', ax, bx); u2('uHalf', ax * 2, bx * 2);
      u2('uHeart', g.heart[0] * D2R, g.heart[1] * D2R);
      u4('uAmp', g.disc * skyDim, g.fall, g.heart[2] * skyDim, g.mottle);
      if (g.bar) u4('uBar', g.barTurn, g.bar[1] * D2R, g.bar[2] * D2R, g.bar[3]); else u4('uBar', 0, 0, 0, 0);
      if (g.knot) u4('uKnot', g.knotAt[0], g.knotAt[1], g.knot[2] * D2R, g.knot[3]); else u4('uKnot', 0, 0, 0, 0);
      u3('uTint', g.tint); u1('uSeed', g.seed);
      quad1();
    }

    use(PR.star);
    u3('uRt', cam.rt); u3('uUp', cam.up); u3('uFw', cam.fw); u3('uEye', cam.pos);
    // (from the ground the view is twice as wide as in space and the stars would thin out: they are given a little more)
    u2('uProj', projX, projY); u1('uDpr', skyOn ? RES * 1.15 : RES); u1('uDim', skyOn ? 1.3 : 1); u1('uMark', 0.42 * starsK);
    u3('uZen', skyOn ? SKY.U : NOWHERE); u2('uAir', skyOn ? SKY.sunUp : -2, skyOn ? SKY.moonWash : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.drawArrays(gl.POINTS, 0, starN);
    // and the Sun among them, once the eye is far enough out
    // (never so faint that home cannot be found)
    if (sunStar > 0.003) { u1('uDim', sunStar); u1('uMark', 0.62); gl.drawArrays(gl.POINTS, sunAt, 1); }
    gl.disableVertexAttribArray(1);

    // from the ground: the air, the Sun, the Moon and the planets as lights, the ground. Nothing else is to be seen
    if (skyOn) { drawSky(lens); return; }

    // the edge of the Sun's wind
    const shell = shellK();
    if (shell > 0.003) { lens(PR.shell); drawShell(shell); }

    // the small bodies
    lens(PR.belt);
    gl.enableVertexAttribArray(1);
    u3('uRt', cam.rt); u3('uUp', cam.up); u3('uFw', cam.fw); u3('uCam', cam.pos);
    u3('uMap', [MAP_K, MAP_R0, mapM]);
    u1('uT', jd - JD0); u1('uDpr', RES);
    const swarm = (buf, n, size, alpha, colour) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
      u1('uSize', size); u1('uAlpha', alpha); u3('uColor', colour);
      gl.drawArrays(gl.POINTS, 0, n);
    };
    // a swarm seen small is the same grains on fewer pixels: thin it, or it burns white
    // (and seen smaller than a few pixels it is let go, as the worlds are)
    const across = au => cam.F * mapR(au) / Math.max(SUN.dd, 1e-9);
    const thin = au => clamp(Math.pow(across(au) / 90, 1.6), 0.03, 1) * smooth(1.5, 6, across(au));
    swarm(beltBuf, beltN, 1.25, 0.62 * thin(2.7), [0.80, 0.75, 0.68]);
    swarm(kuiperBuf, kuiperN, 1.15, 0.42 * thin(44) , [0.68, 0.72, 0.84]);
    const oort = oortK();
    if (oort > 0.003) swarm(oortBuf, oortN, 1.1, 0.26 * oort * clamp(Math.pow(across(OORT_THICK) / 260, 1.3), 0.04, 1), [0.62, 0.70, 0.86]);
    gl.disableVertexAttribArray(1);

    // the lines the bodies travel on
    lens(PR.orbit);
    u3('uRt', cam.rt); u3('uUp', cam.up); u3('uFw', cam.fw);
    u3('uMap', [MAP_K, MAP_R0, mapM]);
    u1('uF', px); u2('uInv', 2 / cv.width, 2 / cv.height);
    u1('uHalfW', 1.15 * RES);
    u3('uColor', [0.59, 0.59, 0.80]);
    gl.bindBuffer(gl.ARRAY_BUFFER, orbitBuf);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    // beside a world the lines of the others are scaffolding: let them go quiet.
    // On the journey they go altogether: a closed ring is what an orbit looks
    // like only to someone riding with the Sun.
    const quiet = mix(0.3, 1, smooth(Math.log(0.02), Math.log(3), Math.log(dist))) * (1 - journeyK);
    // a ring a few pixels across is a smudge: past the planets each line goes as its ring closes
    const leaving = smooth(lg(160), lg(400), lg(dist));
    for (const b of B) {
      if (b === SUN || b.craft) continue;
      if (b.parent) {
        if (b.vis > 0.01 && b.parent.shown) drawOrbit(b, 0.10 * b.vis, 0.34 * b.vis);
        continue;
      }
      // and its own line would be a bar across the view
      const close = (b === focus ? smooth(12, 120, dist / b.r) : 1) * quiet * mix(1, smooth(2, 7, fromSun(b)), leaving);
      if (close < 0.003) continue;
      if (b.faint) drawOrbit(b, (b === picked || b === focus ? 0.11 : 0.0) * close, 0.26 * close);
      else drawOrbit(b, 0.125 * close, 0.46 * close);
    }

    // the ways. On the journey: the way each has come through the galaxy, and
    // a little of the way the Sun is going. At any time: the way out that each
    // spacecraft has taken, since the last world it passed.
    let ships = 0;
    for (const b of SHIPS) if (b.shown && b.vis > 0.01) ships++;
    if (jK > 0.003 || ships) {
      lens(PR.trail);
      u3('uRt', cam.rt); u3('uUp', cam.up); u3('uFw', cam.fw);
      u1('uF', px); u2('uInv', 2 / cv.width, 2 / cv.height);
      u1('uHalfW', 1.15 * RES);
      u3('uMap', [MAP_K, MAP_R0, mapM]);
      u3('uOrigin', [-cam.pos[0], -cam.pos[1], -cam.pos[2]]);
      gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      const days = trailDays();
      const line = (b, span, go, colour, glow) => {
        const o = b.orb, e = b === SUN ? 0 : o.e;
        u1('uM', b === SUN ? 0 : o.mean()); u1('uN', b.n); u1('uSpan', span);
        u1('uA', b === SUN ? 0 : o.a); u1('uBb', b === SUN ? 0 : o.a * Math.sqrt(Math.abs(1 - e * e))); u1('uEcc', e);
        u3('uP', o.P); u3('uQ', o.Q);
        u3('uGo', go ? GO : NOWHERE);
        u3('uColor', colour); u1('uGlow', glow);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, TRAIL_N * 2);
      };
      if (jK > 0.003) for (const b of B) {
        if (b.parent) continue;
        if (b === SUN) { line(b, days, true, [1.0, 0.86, 0.62], 0.55 * jK); line(b, -0.22 * days, true, [1.0, 0.86, 0.62], 0.2 * jK); }
        else if (b.vis > 0.01) line(b, b.craft ? Math.min(days, jd - CRAFT[b.craft][6]) : days, true, b.c, (b.faint ? 0.22 : 0.6) * jK * b.vis);
      }
      if (jK < 0.997) for (const b of SHIPS) {
        if (b.shown && b.vis > 0.01) line(b, jd - CRAFT[b.craft][6], false, b.c, 0.30 * (1 - jK) * b.vis);
      }
    }

    // the bodies, farthest first
    for (const p of [PR.tex, PR.earth, PR.band, PR.rock, PR.sun, PR.glow, PR.ring, PR.tail]) lens(p);
    for (const b of order) {
      if (b === SUN) { drawSun(b); continue; }
      if (b.kind === 'comet') {
        comet(b);
        if (b.act > 0.01) drawGlow(b, 4 + 9 * b.act, 0.5 * b.act * b.vis, [0.62, 0.86, 0.92]);
      }
      if (b.fill > 0.02) drawGlow(b, 5, (b.faint ? 0.2 : 0.35) * b.fill * b.vis);
      drawGlobe(b);
      if (b.ring) drawRing(b);
    }
  }

  // --- without WebGL ------------------------------------------------------
  // the same sky, the same places, drawn the way the first version of this
  // page drew them: discs and light.
  let ctx = null, stars2d = null;
  function draw2d() {
    const F = cam.F;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#03030a';
    ctx.fillRect(0, 0, W, H);
    if (!stars2d) {
      const raw = atob(STARS), n = Math.min(1400, raw.length / 8);
      stars2d = [];
      for (let i = 0; i < n; i++) {
        const c = j => raw.charCodeAt(i * 8 + j);
        const lon = (c(0) | c(1) << 8) / 65536 * TAU, lat = ((c(2) | c(3) << 8) / 65535 - 0.5) * PI;
        stars2d.push({ d: toScene(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), [0, 0, 0]), I: Math.pow(10, -0.18 * (c(4) / 30 - 2.5)) });
      }
    }
    for (const s of stars2d) {
      turn(s.d, _a);
      if (_a[2] <= 0.05) continue;
      const x = W / 2 + F * _a[0] / _a[2], y = H / 2 - F * _a[1] / _a[2];
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.fillStyle = 'rgba(232,230,245,' + Math.min(1, s.I * 1.2).toFixed(3) + ')';
      const z = Math.min(2.2, 0.9 + 0.6 * s.I);
      ctx.fillRect(x - z / 2, y - z / 2, z, z);
    }
    ctx.lineWidth = 1;
    const way = (b, days, still, glow) => {
      const N = 200;
      let was = null;
      for (let i = 0; i <= N; i++) {
        toView(wasAt(b, days * Math.pow(i / N, 1.6), _b, still), _a);
        const here = _a[2] > cam.near ? [W / 2 + F * _a[0] / _a[2], H / 2 - F * _a[1] / _a[2]] : null;
        if (was && here) {
          ctx.strokeStyle = 'rgba(' + b.c.map(v => Math.round(v * 255)).join(',') + ',' + (glow * Math.pow(1 - i / N, 1.2)).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(was[0], was[1]); ctx.lineTo(here[0], here[1]); ctx.stroke();
        }
        was = here;
      }
    };
    if (jK > 0.003) {
      const days = trailDays();
      for (const b of B) {
        if (b.parent || (b !== SUN && b.vis < 0.01)) continue;
        way(b, b.craft ? Math.min(days, jd - CRAFT[b.craft][6]) : days, false, (b.faint ? 0.2 : 0.55) * jK);
      }
    }
    if (jK < 0.997) for (const b of SHIPS) if (b.shown && b.vis > 0.01) way(b, jd - CRAFT[b.craft][6], true, 0.3 * (1 - jK) * b.vis);
    const shell = shellK();
    if (shell > 0.003 && SUN.v[2] > cam.near) {
      ctx.strokeStyle = 'rgba(128,158,255,' + (0.16 * shell).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(SUN.px, SUN.py, F * mapR(HELIOPAUSE) / Math.sqrt(Math.max(SUN.dd * SUN.dd - mapR(HELIOPAUSE) * mapR(HELIOPAUSE), 1e-9)), 0, TAU); ctx.stroke();
    }
    for (const b of B) {
      if (b === SUN || b.craft || b.parent && b.vis < 0.05) continue;
      if (!b.parent && journeyK > 0.997) continue;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 128; i++) {
        b.orb.at(i / 128 * TAU, _b);
        if (b.parent) { _b[0] += b.parent.dp[0]; _b[1] += b.parent.dp[1]; _b[2] += b.parent.dp[2]; }
        else { const r = len(_b), k = mapR(r) / r; _b[0] *= k; _b[1] *= k; _b[2] *= k; }
        toView(_b, _a);
        if (_a[2] <= cam.near) { pen = false; continue; }
        const x = W / 2 + F * _a[0] / _a[2], y = H / 2 - F * _a[1] / _a[2];
        pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        pen = true;
      }
      ctx.strokeStyle = 'rgba(150,150,200,' + (b.faint ? 0.05 : 0.1) * (b.parent ? b.vis : 1 - journeyK) + ')';
      ctx.stroke();
    }
    for (const b of order) {
      const rgb = b.c.map(v => Math.round(v * 255)).join(',');
      ctx.globalCompositeOperation = 'lighter';
      const gr = b.pr * (b === SUN ? 7 : 5) * (b === SUN ? 1 : b.fill);
      if (gr > 1) {
        const g = ctx.createRadialGradient(b.px, b.py, 0, b.px, b.py, gr);
        g.addColorStop(0, 'rgba(' + rgb + ',' + (b === SUN ? 0.9 : 0.4 * b.vis) + ')');
        g.addColorStop(0.35, 'rgba(' + rgb + ',' + (b === SUN ? 0.22 : 0.14 * b.vis) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.px, b.py, gr, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = b.vis;
      if (b === SUN) { ctx.fillStyle = '#fff2d8'; ctx.beginPath(); ctx.arc(b.px, b.py, b.pr, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; continue; }
      // the lit side faces the Sun
      unit([-b.pos[0], -b.pos[1], -b.pos[2]], _b); turn(_b, _a);
      const lx = b.px + _a[0] * b.pr * 0.75, ly = b.py - _a[1] * b.pr * 0.75;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, b.pr * 1.75);
      g.addColorStop(0, 'rgb(' + rgb + ')');
      g.addColorStop(0.55, 'rgb(' + b.c.map(v => Math.round(v * 150)).join(',') + ')');
      g.addColorStop(1, 'rgb(' + b.c.map(v => Math.round(v * 22)).join(',') + ')');
      if (b.ring && b.ring.key === 'saturn') {
        turn(b.Z, _c);
        ctx.save();
        ctx.translate(b.px, b.py);
        ctx.rotate(Math.atan2(-_c[0], _c[1]));
        ctx.scale(1, Math.max(0.04, Math.abs(_c[2])));
        ctx.beginPath(); ctx.arc(0, 0, b.pr * 1.9, 0, TAU);
        ctx.strokeStyle = 'rgba(227,203,154,0.5)'; ctx.lineWidth = b.pr * 0.62; ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.px, b.py, b.pr, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // --- the screen ---------------------------------------------------------
  // a phone renders at up to three times its points; past a budget of pixels
  // the extra sharpness costs frames and shows nothing
  let cv2 = null, gov = 1, needResize = true;
  // how tall the pills stand: on a phone they take two rows or three, and the words keep clear of them
  let barH = 34;
  function barRows() {
    barH = $('bar').offsetHeight || 34;
  }
  function resize() {
    needResize = false;
    W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, BG.dpr);
    const fit = Math.sqrt(BG.pixels / Math.max(1, W * H));
    RES = Math.max(1, Math.min(DPR, fit)) * gov;
    barRows();
    const t = ctx ? cv2 : cv;
    const w = Math.max(1, Math.round(W * RES)), h = Math.max(1, Math.round(H * RES));
    if (t.width !== w || t.height !== h) { t.width = w; t.height = h; }
    RES = w / W;
  }
  window.addEventListener('resize', () => { needResize = true; });
  window.addEventListener('orientationchange', () => { needResize = true; });

  // if the frames come late, give up sharpness before smoothness: two steps, never below 70%
  const watch = { t0: 0, n: 0, slow: 0 };
  function govern(now, gap) {
    return; // off on purpose: checked on a phone, full resolution stays smooth
    if (gap > 250 || fly) { watch.t0 = now; watch.n = watch.slow = 0; return; }
    watch.n++; if (gap > 24) watch.slow++;
    if (now - watch.t0 < 1500) return;
    if (watch.n > 20 && watch.slow / watch.n > 0.4 && gov > 0.71) { gov = Math.max(0.7, gov - 0.15); needResize = true; }
    watch.t0 = now; watch.n = watch.slow = 0;
  }

  // --- input ----------------------------------------------------------------
  // one finger turns, two fingers come closer. Every pointer is kept by its
  // own id, so a pinch never ends as a tap and the finger that stays behind
  // takes the turning back up where it is.
  const pts = new Map();
  let dragging = false, moved = 0, downAt = 0, many = false, spread0 = 0, lastMove = 0;
  let lastTap = 0, lastTapOn = null;
  const spread = () => { const p = Array.from(pts.values()); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
  const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function zoomBy(f) {
    // on the ground there is no coming closer: the view narrows, as through a glass
    if (skyOn) { skyTanTo = clamp(skyTanTo * f, SKY_TAN_MIN, skyTanWide() * 1.2); fadeHint(); return; }
    if (fly) return;
    distTo = clamp(distTo * f, nearest(focus), FAR);
    fadeHint();
  }

  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { dragging = true; moved = 0; many = false; downAt = e.timeStamp; vAz = vEl = 0; cv.classList.add('dragging'); }
    else if (pts.size === 2) { many = true; spread0 = spread(); vAz = vEl = 0; }
    fadeHint();
  });
  cv.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const q = local(e), dx = q.x - p.x, dy = q.y - p.y;
    p.x = q.x; p.y = q.y;
    if (pts.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 4) return;
      // in space the hand turns the eye round what it looks at. On the ground it takes hold of the sky
      const a = skyOn ? -dx / cam.F / Math.max(Math.cos(skyAlt), 0.3) : -dx * 0.005, b = skyOn ? dy / cam.F : dy * 0.004;
      if (skyOn) { skyAz += a; skyAlt = clamp(skyAlt + b, SKY_LOW, SKY_HIGH); }
      else { az += a; el = clamp(el + b, -1.5, 1.5); }
      if (fly) fly.turn = false;
      // what the hand was doing when it let go, in radians per millisecond
      const gap = Math.max(4, e.timeStamp - lastMove);
      vAz = mix(vAz, a / gap, 0.5); vEl = mix(vEl, b / gap, 0.5);
      lastMove = e.timeStamp;
    } else if (pts.size === 2) {
      const s = spread();
      if (spread0 > 8 && s > 8) zoomBy(spread0 / s);
      spread0 = s;
    }
  });
  function lift(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      dragging = false; cv.classList.remove('dragging');
      if (e.timeStamp - lastMove > 90 || REDUCED) vAz = vEl = 0;
      if (e.type === 'pointerup' && !many && moved < 8 && e.timeStamp - downAt < 700) { const q = local(e); tap(q.x, q.y); }
      many = false;
    } else if (pts.size === 1) {
      moved = 99; vAz = vEl = 0;
    }
  }
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);
  cv.addEventListener('lostpointercapture', lift);

  // a wheel says how far it turned; a trackpad says it sixty or a hundred and
  // twenty times a second. Zoom by what was said, not by how often.
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= H;
    zoomBy(Math.exp(clamp(d, -150, 150) * (e.ctrlKey ? 0.011 : 0.0022)));
  }, { passive: false });
  // Safari on a Mac sends its trackpad pinch this way
  let gesture0 = 1;
  cv.addEventListener('gesturestart', e => { e.preventDefault(); gesture0 = e.scale || 1; });
  cv.addEventListener('gesturechange', e => { e.preventDefault(); if (pts.size < 2 && e.scale > 0) { zoomBy(gesture0 / e.scale); gesture0 = e.scale; } });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  cv.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (skyOn && k.indexOf('Arrow') === 0) {
      const by = 0.22 * skyTan;
      if (k === 'ArrowLeft') skyAz -= by; else if (k === 'ArrowRight') skyAz += by;
      else skyAlt = clamp(skyAlt + (k === 'ArrowUp' ? by : -by), SKY_LOW, SKY_HIGH);
    }
    else if (k === 'ArrowLeft') az += 0.08; else if (k === 'ArrowRight') az -= 0.08;
    else if (k === 'ArrowUp') el = clamp(el + 0.06, -1.5, 1.5); else if (k === 'ArrowDown') el = clamp(el - 0.06, -1.5, 1.5);
    else if (k === '+' || k === '=') zoomBy(0.8); else if (k === '-' || k === '_') zoomBy(1.25);
    else if (k === ' ') setPaused(!paused);
    else if (k === 'Escape') { goHome(); choose(null); }
    else if (k === 'g' || k === 'G') elJourney.click();
    else if (k === 'e' || k === 'E') $('eclipse').click();
    else if (k === 'n' || k === 'N') elOut.click();
    else if (k === 's' || k === 'S') elSky.click();
    else if (k >= '0' && k <= '8') { const b = k === '0' ? SUN : PLANETS[+k - 1]; choose(b); visit(b); }
    else return;
    e.preventDefault(); fadeHint();
  });

  // --- touching a world ---------------------------------------------------------
  function pick(x, y) {
    const near = COARSE ? 24 : 14;
    let best = null, bestD = near;
    // farthest first, so the nearest globe under the finger wins
    for (const b of order) {
      if (b.vis < 0.3) continue;
      const d = Math.hypot(b.px - x, b.py - y) - b.pr;
      if (d < 0) { best = b; bestD = -1e9; } else if (d < bestD) { best = b; bestD = d; }
    }
    // and whatever keeps its name beside it, by the point or by the name
    for (const m of MARKS) {
      if (m.vis < 0.3) continue;
      const word = m.on > 0.3 && x >= m.lx - 5 && x <= m.lx + m.w + 5 && y >= m.ly - 7 && y <= m.ly + m.h + 7;
      const d = word ? 0 : m.body ? 1e9 : Math.hypot(m.px - x, m.py - y) - m.pr;
      if (d < bestD) { best = m.body || m; bestD = d; }
    }
    return best;
  }
  function tap(x, y) {
    const b = pick(x, y), now = performance.now();
    if (b && !b.fixed && b === lastTapOn && now - lastTap < 400) { choose(b); visit(b); lastTapOn = null; return; }
    lastTap = now; lastTapOn = b;
    choose(b);
  }

  const label = $('label'), lbName = $('lbName'), lbKind = $('lbKind'), lbFacts = $('lbFacts'), lbGo = $('lbGo');
  let labelW = 0, labelH = 0, factsAt = 0, goes = null, goesAt = '';
  function choose(b) {
    picked = b;
    if (!b) { label.classList.remove('on'); return; }
    lbName.textContent = T(b.en, b.es).replace(/^(the|el|la) /, m => m.charAt(0).toUpperCase() + m.slice(1));
    lbKind.textContent = T(KIND[b.kind][0], KIND[b.kind][1]);
    factsAt = 0;
    facts(performance.now());
    label.classList.add('on');
  }
  const span = days => {
    if (days < 1.5) return T(NUM(days * 24, 1) + ' hours', NUM(days * 24, 1) + ' horas');
    if (days < 800) return T(NUM(days, days < 100 ? 1 : 0) + ' days', NUM(days, days < 100 ? 1 : 0) + ' días');
    const y = days / 365.25;
    return T(NUM(y, y < 100 ? 1 : 0) + ' years', NUM(y, y < 100 ? 1 : 0) + ' años');
  };
  function facts(now) {
    const b = picked;
    if (!b || now - factsAt < 300) return;
    factsAt = now;
    const out = [];
    const spinDays = b.parent || !ROT[b.key] ? null : 360 / Math.abs(ROT[b.key][5]);
    if (skyOn && !b.fixed) {
      // from the ground: where it stands, when it goes, how it looks, how old its light is
      const high = Math.round(Math.asin(clamp(b.up, -1, 1)) / D2R);
      out.push(T(high + '° up, in the ' + compass(b.azm), 'a ' + high + '° de altura, hacia el ' + compass(b.azm)));
      const stamp = b.key + PLACE.key + PLACE.lat + Math.floor(jd * 288);
      if (stamp !== goesAt) { goesAt = stamp; goes = nextCross(b, jd, horizonOf(b), 24); }
      out.push(!goes ? T('it does not set today', 'hoy no se pone') : (goes.rising ? T('rises ', 'sale ') : T('sets ', 'se pone ')) + atClock(goes.at));
      if (b.key === 'moon') { const ph = moonPhase(jd), lit = Math.round(ph.lit * 100); out.push(ph.name.replace(/^a /, '') + T(', ' + lit + '% lit', ', iluminada al ' + lit + ' %')); }
      else if (b !== SUN) out.push(brightness(b.mag));
      out.push(T('its light left it ' + lightAgo(b.dd) + ' ago', 'su luz salió hace ' + lightAgo(b.dd)));
    } else if (b.says) {
      for (const line of b.says()) out.push(line);
    } else if (b.craft) {
      const far = Math.hypot(b.pos[0] - EARTH.pos[0], b.pos[1] - EARTH.pos[1], b.pos[2] - EARTH.pos[2]);
      const kms = Math.sqrt(GAUSS_K * GAUSS_K * (2 / b.helio + 1 / b.orb.a)) * AU / 86400;
      out.push(T(NUM(b.helio, 1) + ' au from the Sun', 'a ' + NUM(b.helio, 1) + ' ua del Sol'));
      out.push(T('a word from the Earth takes ' + span(far * LIGHT_DAYS) + ' to reach it', 'una palabra desde la Tierra tarda ' + span(far * LIGHT_DAYS) + ' en llegarle'));
      out.push(T('leaving at ' + NUM(kms, 1) + ' km/s', 'se aleja a ' + NUM(kms, 1) + ' km/s'));
      out.push(T(b.note[0], b.note[1]));
    } else if (b === SUN) {
      out.push(T('1.39 million km across', '1,39 millones de km de diámetro'));
      out.push(T('turns once in ', 'gira una vez cada ') + span(spinDays));
      if (journey) out.push(T('heading for Cygnus at 230 km/s', 'rumbo al Cisne a 230 km/s'));
    } else if (b.parent) {
      const d = len(b.rel) * AU, p = b.parent;
      out.push(T(NUM(d, 0) + ' km from ' + p.en.replace(/^The /, 'the '), 'a ' + NUM(d, 0) + ' km de ' + p.es.replace(/^La /, 'la ').replace(/^El /, 'el ')));
      const k = b.key === 'moon' ? 27.321661 : TAU / MOON_FIT[b.key][1];
      out.push(T('circles it every ', 'le da una vuelta cada ') + span(k));
      if (b.key === 'triton') out.push(T('backwards', 'al revés'));
    } else {
      out.push(T(NUM(b.helio, b.helio < 10 ? 2 : 1) + ' au from the Sun', 'a ' + NUM(b.helio, b.helio < 10 ? 2 : 1) + ' ua del Sol'));
      const year = b.small ? 360 / SMALL[b.small][6] : 36525 * 360 / EL[b.key][9];
      out.push(T('circles the Sun in ', 'da la vuelta al Sol en ') + span(year));
      if (b.kind !== 'comet') out.push(T('turns once in ', 'gira una vez cada ') + span(spinDays) + (ROT[b.key][5] < 0 ? T(', backwards', ', al revés') : ''));
      else {
        // when it next rounds the Sun
        const k = SMALL[b.small], M = ((k[5] + k[6] * (jd - JD0)) % 360 + 360) % 360;
        const when = new Date(msOf(jd + (360 - M) / k[6]));
        out.push(T('next rounds the Sun in ', 'vuelve a rodear el Sol en ') + when.toLocaleDateString(LANG, { month: 'long', year: 'numeric' }));
      }
    }
    lbFacts.textContent = out.join(' · ');
    const there = b.fixed || (focus === b && !fly && dist < visitDist(b) * 4);
    lbGo.hidden = there;
    lbGo.textContent = T('go there →', 'ir allí →');
    labelW = label.offsetWidth; labelH = label.offsetHeight;
  }
  lbGo.addEventListener('click', () => { if (picked && !picked.fixed) { visit(picked); lbGo.hidden = true; fadeHint(); } });

  // --- the names that stay on ---------------------------------------------------
  // Out here there is no telling a spacecraft from a star by looking at it.
  // The craft, the edge of the Sun's wind, the cloud of comets and the
  // neighbours each keep a small name beside them, once the eye is far enough
  // out for them to be what the view is about. A name gives way to a name
  // that matters more, and all of them to the label of whatever is touched.
  const MARKS = [];
  function mark(o) {
    Object.assign(o, { v: [0, 0, 0], px: 0, py: 0, pr: 2.5, shown: false, vis: 0, on: 0, lx: 0, ly: 0, w: 0, h: 0, fixed: true, at: '', op: '0', ringAt: '', ringOp: '0' });
    const el = document.createElement('span');
    el.className = 'tag';
    el.textContent = T(o.en, o.es);
    if (o.far) { const i = document.createElement('i'); i.textContent = NUM(o.far, 1) + ' ' + T('ly', 'al'); el.appendChild(i); }
    $('names').appendChild(el);
    o.tag = el;
    if (o.star) {
      o.ring = document.createElement('span');
      o.ring.className = o.key === 'sol' ? 'ring home' : 'ring';
      $('names').appendChild(o.ring);
      o.pr = o.key === 'sol' ? 7.5 : 5.5;
    }
    MARKS.push(o);
    return o;
  }
  const yearNow = () => 2000 + (jd - J2000) / 365.25;
  // how a star of this brightness is met with, from the Earth
  const seen = V => V <= 1.5 ? T('among the brightest stars of our sky', 'entre las más brillantes de nuestro cielo')
    : V <= 6 ? T('seen by eye from the Earth', 'visible a simple vista desde la Tierra')
    : V <= 9 ? T('seen from the Earth with binoculars', 'visible desde la Tierra con prismáticos')
    : T('from the Earth it takes a telescope to see it', 'desde la Tierra hace falta un telescopio para verla');
  // what the Sun is as bright as, from this far: by the stars of our own sky
  function sunLike(au) {
    const m = sunMag(au);
    if (m < -4.9) return T('from here the Sun still outshines Venus', 'desde aquí el Sol aún brilla más que Venus');
    if (m < -1.9) return T('from here the Sun outshines every star of our sky', 'desde aquí el Sol brilla más que cualquier estrella de nuestro cielo');
    if (m > 2.4) return T('from here the Sun is a faint star among thousands', 'desde aquí el Sol es una estrella tenue entre miles');
    const like = [[-1.46, 'Sirius', 'Sirio'], [-0.05, 'Arcturus', 'Arturo'], [0.76, 'Altair', 'Altair'], [1.39, 'Regulus', 'Régulo'], [1.98, 'the Pole Star', 'la Estrella Polar']];
    let best = like[0];
    for (const l of like) if (Math.abs(l[0] - m) < Math.abs(best[0] - m)) best = l;
    return T('from here the Sun shines as ' + best[1] + ' does in our sky', 'desde aquí el Sol brilla como ' + best[2] + ' en nuestro cielo');
  }

  // the Sun first: among the stars it is the one that has to be found
  mark({ key: 'sol', en: 'the Sun', es: 'el Sol', kind: 'star', pos: [0, 0, 0], star: true,
    says: () => [T('its worlds are lost in its light', 'sus mundos se pierden en su luz'),
      T('4.6 billion years old, and about halfway through its life', 'tiene 4600 millones de años, y va más o menos por la mitad de su vida')] });
  mark({ key: 'heliopause', en: 'the edge of the Sun\'s wind', es: 'el borde del viento solar', kind: 'edge', round: HELIOPAUSE, show: () => shellK(),
    says: () => [T('here the wind of the Sun gives out against the thin gas between the stars', 'aquí el viento del Sol se agota contra el gas tenue que hay entre las estrellas'),
      T('Voyager 1 crossed it in 2012, Voyager 2 in 2018', 'la Voyager 1 lo cruzó en 2012, la Voyager 2 en 2018'),
      T('the far side is left open: nobody has been there', 'el lado opuesto queda abierto: nadie ha estado allí')] });
  mark({ key: 'oort', en: 'the Oort cloud', es: 'la nube de Oort', kind: 'cloud', round: OORT_THICK, show: () => oortK(),
    says: () => [T('reckoned, not seen: the comets that take thousands of years to come round fall from out here, from every side', 'calculada, no vista: los cometas que tardan miles de años en volver caen desde aquí, de todas partes'),
      T('it may reach a third of the way to the nearest star', 'puede llegar a un tercio del camino hasta la estrella más cercana')] });
  for (const b of SHIPS) mark({ key: b.key + '-name', en: b.en, es: b.es, body: b });
  // and from the ground, the Moon and the five planets the eye can find
  for (const k of ['moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    const b = byKey[k];
    mark({ key: k + '-sky', en: b.en.replace(/^The /, 'the '), es: b.es.replace(/^La /, 'la '), body: b, sky: true });
  }
  // with north, east, south and west written on the horizon
  const CARDS = [['N', 'N', 0], ['E', 'E', PI / 2], ['S', 'S', PI], ['W', 'O', 3 * PI / 2]].map(c => {
    const el = document.createElement('span');
    el.className = 'tag card';
    el.textContent = T(c[0], c[1]);
    $('names').appendChild(el);
    return { el, a: c[2], w: 0, h: 0, at: '', op: '0' };
  });

  // the neighbours, in this page's own words
  const NEIGHBOUR = {
    proxima: ['Proxima Centauri', 'Próxima Centauri', 'red', 'the nearest star to the Sun', 'la estrella más cercana al Sol'],
    alfcen: ['Alpha Centauri', 'Alfa Centauri', 'double', 'two stars much like the Sun, circling each other every 80 years', 'dos estrellas muy parecidas al Sol, que giran una en torno a la otra cada 80 años'],
    barnard: ['Barnard\'s Star', 'Estrella de Barnard', 'red', 'it crosses our sky faster than any other star', 'cruza nuestro cielo más deprisa que ninguna otra estrella'],
    luhman16: ['Luhman 16', 'Luhman 16', 'browns', 'too small to shine as stars do · found in 2013', 'demasiado pequeñas para brillar como las estrellas · halladas en 2013'],
    wise0855: ['WISE 0855−0714', 'WISE 0855−0714', 'brown', 'as cold as the Arctic, hardly more than a planet adrift · found in 2014', 'tan fría como el Ártico, poco más que un planeta a la deriva · hallada en 2014'],
    wolf359: ['Wolf 359', 'Wolf 359', 'red', 'one of the smallest and faintest stars this close', 'una de las estrellas más pequeñas y tenues de las cercanías'],
    lalande21185: ['Lalande 21185', 'Lalande 21185', 'red', 'the brightest red dwarf of the northern sky', 'la enana roja más brillante del cielo del norte'],
    sirius: ['Sirius', 'Sirio', 'double', 'the brightest star of our sky · a white dwarf circles it every 50 years', 'la estrella más brillante de nuestro cielo · una enana blanca gira a su alrededor cada 50 años'],
    luyten7268: ['Luyten 726-8', 'Luyten 726-8', 'reds', 'one of the two, UV Ceti, flares without warning', 'una de las dos, UV Ceti, lanza destellos sin aviso'],
    ross154: ['Ross 154', 'Ross 154', 'red', 'it flares', 'lanza destellos'],
    ross248: ['Ross 248', 'Ross 248', 'red', 'in 40,000 years Voyager 2 will pass 1.7 light-years from it', 'dentro de 40 000 años la Voyager 2 pasará a 1,7 años luz de ella'],
    epseri: ['Epsilon Eridani', 'Épsilon Eridani', 'star', 'a young star with a belt of dust and at least one planet', 'una estrella joven con un cinturón de polvo y al menos un planeta'],
    lacaille9352: ['Lacaille 9352', 'Lacaille 9352', 'red', 'in the Southern Fish', 'en el Pez Austral'],
    ross128: ['Ross 128', 'Ross 128', 'red', 'a quiet one, with a planet about as heavy as the Earth', 'tranquila, con un planeta de masa parecida a la de la Tierra'],
    ezaqr: ['EZ Aquarii', 'EZ Aquarii', 'reds', 'three of them together', 'tres de ellas juntas'],
    cyg61: ['61 Cygni', '61 Cygni', 'double', 'two orange stars · the first whose distance was ever measured, in 1838', 'dos estrellas anaranjadas · la primera cuya distancia se midió, en 1838'],
    procyon: ['Procyon', 'Proción', 'double', 'the star of the Little Dog · a white dwarf circles it every 41 years', 'la estrella del Can Menor · una enana blanca gira a su alrededor cada 41 años'],
    struve2398: ['Struve 2398', 'Struve 2398', 'reds', 'a pair, in the Dragon', 'un par, en el Dragón'],
    groombridge34: ['Groombridge 34', 'Groombridge 34', 'reds', 'a pair, in Andromeda', 'un par, en Andrómeda'],
    dxcnc: ['DX Cancri', 'DX Cancri', 'red', 'barely a tenth as wide as the Sun', 'de apenas una décima parte del ancho del Sol'],
    epsind: ['Epsilon Indi', 'Épsilon Indi', 'star', 'an orange star with a giant planet and two brown dwarfs', 'una estrella anaranjada con un planeta gigante y dos enanas marrones'],
    tauceti: ['Tau Ceti', 'Tau Ceti', 'star', 'the nearest star like the Sun that travels alone', 'la estrella parecida al Sol más cercana que viaja sola'],
    gj1061: ['GJ 1061', 'GJ 1061', 'red', 'it has three small planets', 'tiene tres planetas pequeños'],
    altair: ['Altair', 'Altair', 'star', 'it turns once in about nine hours, and is flattened by it', 'gira sobre sí misma en unas nueve horas, y eso la achata'],
    vega: ['Vega', 'Vega', 'star', 'it was the pole star 14,000 years ago, and will be again', 'fue la estrella polar hace 14 000 años, y volverá a serlo'],
    fomalhaut: ['Fomalhaut', 'Fomalhaut', 'star', 'a young star inside a ring of dust', 'una estrella joven dentro de un anillo de polvo']
  };
  // (nearest first, but Alpha Centauri before Proxima beside it: where there
  // is room for one name only, that is the one that is looked for)
  const first = k => k === 'alfcen' ? 1e6 : NEAR[k][2];
  Object.keys(NEAR).filter(k => NEIGHBOUR[k]).sort((a, b) => first(b) - first(a)).forEach(key => {
    const q = NEAR[key], w = NEIGHBOUR[key], au = 1000 * PARSEC / q[2], far = au / LY;
    const pos = raDec(q[0], q[1], [0, 0, 0]);
    pos[0] *= au; pos[1] *= au; pos[2] *= au;
    mark({ key, en: w[0], es: w[1], kind: w[2], pos, far, star: true,
      says: () => [T(NUM(far, 2) + ' light-years from the Sun', 'a ' + NUM(far, 2) + ' años luz del Sol'),
        T('the light now arriving left it in ' + Math.floor(yearNow() - far), 'la luz que llega ahora salió de ella en ' + Math.floor(yearNow() - far)),
        seen(q[3]), T(w[3], w[4])] });
  });

  const taken = [];
  let farBox = null;
  function placeMarks() {
    const F = cam.F;
    starsK = FAR > 1000 ? smooth(lg(0.25 * LY), lg(0.8 * LY), lg(dist)) : 0;
    const shipsK = smooth(lg(140), lg(230), lg(dist));
    const L = 8 + inset.l, R = W - 8 - inset.r, Tp = 52 + inset.t, Bt = H - Math.max(100, barH + 26) - inset.b;
    taken.length = 0;
    if (farBox) taken.push(farBox);
    if (labelBox) taken.push(labelBox);
    for (const c of CARDS) {
      let on = false, x = 0, y = 0;
      if (skyOn) {
        const ca = Math.cos(c.a), sa = Math.sin(c.a);
        for (let i = 0; i < 3; i++) _c[i] = ca * SKY.N[i] + sa * SKY.E[i];
        turn(_c, _d);
        if (_d[2] > 0.2) {
          if (!c.w) { c.w = c.el.offsetWidth; c.h = c.el.offsetHeight; }
          x = W / 2 + F * _d[0] / _d[2] - c.w / 2; y = H / 2 - F * _d[1] / _d[2] + 5;
          on = x >= L && x + c.w <= R && y >= Tp && y + c.h <= Bt;
        }
      }
      if (on) {
        taken.push([x - 4, y - 2, x + c.w + 4, y + c.h + 2]);
        const at = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        if (at !== c.at) c.el.style.transform = c.at = at;
      }
      const op = on ? '0.9' : '0';
      if (op !== c.op) c.el.style.opacity = c.op = op;
    }
    // first where each is, and whether it is to be seen; then the names, which keep off each other and off every ring
    for (const m of MARKS) {
      let a = 0;
      if (m.body) {
        const b = m.body;
        m.px = b.px; m.py = b.py; m.pr = b.pr;
        if (m.sky) a = skyOn && b.shown ? smooth(0.2, 0.6, b.vis) : 0;
        else a = b.shown && !skyOn ? b.vis * Math.max(shipsK * smooth(14, 40, fromSun(b)), focus === b ? 1 : 0) : 0;
      } else if (m.round) {
        // a place with no middle to point at: its name sits on its rim, over the Sun
        const wide = F * mapR(m.round) / Math.max(SUN.dd, 1e-9), k = m.show() * smooth(26, 60, wide);
        if (k > 0.003 && SUN.v[2] > cam.near) {
          m.px = SUN.px; m.py = SUN.py - Math.min(wide, Math.max(40, SUN.py - Tp - 26));
          m.pr = 4;
          a = k;
        }
      } else {
        toView(m.pos, m.v);
        if (starsK > 0.003 && m.v[2] > 0.1 * len(m.v)) {
          m.px = W / 2 + F * m.v[0] / m.v[2]; m.py = H / 2 - F * m.v[1] / m.v[2];
          a = starsK;
        }
      }
      m.vis = a;
      m.shown = a > 0.05 && m.px > -20 && m.px < W + 20 && m.py > -20 && m.py < H + 20;
      if (!m.shown) m.vis = 0;
      if (m.ring) {
        if (m.py < Tp + 4 || m.py > Bt + 8 || (farBox && m.px > farBox[0] - 8 && m.py < farBox[3] + 8)) m.shown = false, m.vis = 0;
        if (m.shown) {
          taken.push([m.px - 7, m.py - 7, m.px + 7, m.py + 7]);
          const at = 'translate3d(' + m.px.toFixed(1) + 'px,' + m.py.toFixed(1) + 'px,0)';
          if (at !== m.ringAt) m.ring.style.transform = m.ringAt = at;
        }
        const op = m.shown ? m.vis.toFixed(2) : '0';
        if (op !== m.ringOp) m.ring.style.opacity = m.ringOp = op;
      }
    }
    for (const m of MARKS) {
      let a = m.vis;
      if (m === picked || (m.body && m.body === picked)) a = 0;      // the label proper is speaking for it
      if (a > 0.02) {
        if (!m.w) { m.w = m.tag.offsetWidth; m.h = m.tag.offsetHeight; }
        const gap = m.pr + 6;
        let x = 0, y = 0, ok = false;
        for (let side = 0; side < (m.round ? 1 : 4) && !ok; side++) {
          if (m.round) { x = m.px - m.w / 2; y = m.py - m.h - 6; }
          else if (side < 2) { x = side ? m.px - gap - m.w : m.px + gap; y = m.py - m.h / 2; }
          else { x = m.px - m.w / 2; y = side === 2 ? m.py + gap - 2 : m.py - gap + 2 - m.h; }
          ok = x >= L && x + m.w <= R && y >= Tp && y + m.h <= Bt;
          for (let i = 0; ok && i < taken.length; i++) { const t = taken[i]; if (x < t[2] && x + m.w > t[0] && y + 2 < t[3] && y + m.h - 2 > t[1]) ok = false; }
        }
        if (ok) { taken.push([x - 5, y - 3, x + m.w + 5, y + m.h + 3]); m.lx = x; m.ly = y; } else a = 0;
      }
      m.on = a;
      if (a > 0.02) {
        const at = 'translate3d(' + m.lx.toFixed(1) + 'px,' + m.ly.toFixed(1) + 'px,0)';
        if (at !== m.at) m.tag.style.transform = m.at = at;
      }
      const op = a > 0.02 ? (0.92 * a).toFixed(2) : '0';
      if (op !== m.op) m.tag.style.opacity = m.op = op;
    }
  }

  const inset = { t: 0, b: 0, l: 0, r: 0 };
  function readInsets() {
    const s = { getPropertyValue: () => '' };
    inset.t = parseFloat(s.getPropertyValue('--sat')) || 0; inset.b = parseFloat(s.getPropertyValue('--sab')) || 0;
    inset.l = parseFloat(s.getPropertyValue('--sal')) || 0; inset.r = parseFloat(s.getPropertyValue('--sar')) || 0;
  }
  let labelBox = null;
  function placeLabel(now) {
    const b = picked;
    labelBox = null;
    if (!b) return;
    if (!b.shown || b.vis < 0.05) { label.style.opacity = 0; return; }
    label.style.opacity = '';
    facts(now);
    // beside it if there is room, else under it, else over it: never on it
    const r = Math.min(b.pr * (b.ring && b.fill < 0.5 ? b.ring.out * 0.9 : 1), Math.min(W, H) * 0.45);
    const L = 10 + inset.l, R = W - 10 - inset.r, Tp = 56 + inset.t, Bt = H - Math.max(104, barH + 30) - inset.b;
    let x = b.px + r + 14, y = b.py - 12;
    if (x + labelW > R) x = b.px - r - 14 - labelW;
    // (beside a spacecraft the words go under it: what it has left is over and around it)
    if (x < L || W < 560 || (b.craft && focus === b)) {
      x = b.px - labelW / 2;
      y = b.py + r + 14;
      if (y + labelH > Bt) y = b.py - r - 14 - labelH;
    }
    x = clamp(x, L, Math.max(L, R - labelW));
    y = clamp(y, Tp, Math.max(Tp, Bt - labelH));
    label.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    labelBox = [x - 8, y - 6, x + labelW + 8, y + labelH + 6];
  }

  // --- the pills --------------------------------------------------------------------
  const elDate = $('date'), elPace = $('paceLabel'), elScale = $('scale'), elJourney = $('journey'), elHome = $('home'), hint = $('hint');
  const elOut = $('out'), elFar = $('far'), elFarA = $('farA'), elFarB = $('farB');
  let wordsAt = 0, dateWas = '', paceWas = '', farWas = '';
  // a number that can be read while it changes: three figures of it, no more
  const round3 = v => { const k = Math.pow(10, Math.floor(Math.log10(v)) - 2); return Math.round(v / k) * k; };
  // how far the eye has come: said only once it has left the planets behind
  function farWords() {
    // on the ground: where the ground is, and which way the eye is turned
    if (skyOn) {
      const high = Math.round(skyAlt / D2R);
      return [PLACE.key === 'asked' ? PLACE.name : PLACE.name + ' · ' + placeCoords(),
        T('looking ' + compass(skyAz) + ', ' + high + '° up', 'mirando al ' + compass(skyAz) + ', a ' + high + '° de altura')];
    }
    const d = SUN.dd;
    if (!(dist > 150) || !(d > 100)) return ['', ''];
    if (d < 0.2 * LY) return [T(NUM(round3(d), 0) + ' au from the Sun', 'a ' + NUM(round3(d), 0) + ' ua del Sol'),
      T('sunlight takes ' + span(d * LIGHT_DAYS) + ' to come this far', 'la luz del Sol tarda ' + span(d * LIGHT_DAYS) + ' en llegar hasta aquí')];
    const ly = d / LY;
    return [T(NUM(ly, ly < 10 ? 2 : 1) + ' light-years from the Sun', 'a ' + NUM(ly, ly < 10 ? 2 : 1) + ' años luz del Sol'), sunLike(d)];
  }
  function setPaused(p) { paused = p; wordsAt = 0; }
  function paceWords() {
    if (paused) return T('paused', 'en pausa');
    const s = rate() * 86400;
    // to the half below ten, to the whole above: a number that can be read while it changes
    const n = v => (v >= 9.5 ? Math.round(v) : Math.max(0.5, Math.round(v * 2) / 2)).toLocaleString(LANG === 'es' ? 'es' : 'en-US');
    const one = (v, en, es) => Math.abs(v - 1) < 0.26 ? T(en[0], es[0]) : T(en[1], es[1]);
    if (s < 1.5) return T('as it happens', 'en tiempo real');
    if (s < 90) return '1 s = ' + n(s) + ' s';
    if (s < 5400) return '1 s = ' + n(s / 60) + ' min';
    if (s < 129600) return '1 s = ' + n(s / 3600) + ' h';
    const d = s / 86400;
    if (d < 45) return '1 s = ' + n(d) + one(d, [' day', ' days'], [' día', ' días']);
    if (d < 600) return '1 s = ' + n(d / 30.44) + one(d / 30.44, [' month', ' months'], [' mes', ' meses']);
    return '1 s = ' + n(d / 365.25) + one(d / 365.25, [' year', ' years'], [' año', ' años']);
  }
  function dateWords() {
    const r = paused ? 0 : rate(), d = new Date(msOf(jd));
    const o = r > 1500 ? { year: 'numeric' } : r > 40 ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' };
    // (on the ground, by the clock of the place: it may not be the clock of this screen)
    if (skyOn && PLACE.tz) o.timeZone = PLACE.tz;
    let s;
    try { s = d.toLocaleDateString(LANG, o); } catch (e) { delete o.timeZone; s = d.toLocaleDateString(LANG, o); }
    if (r < 0.2) s += ' · ' + (skyOn ? clock(jd) : d.toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' }));
    return s;
  }
  function words(now) {
    if (now - wordsAt < 120) return;
    wordsAt = now;
    const d = dateWords(), p = paceWords();
    // (longer words can send a pill to the next row: the bar is measured again)
    const rows = d !== dateWas || p !== paceWas;
    if (d !== dateWas) elDate.textContent = dateWas = d;
    if (p !== paceWas) elPace.textContent = paceWas = p;
    if (rows) barRows();
    const away = focus !== SUN || Math.abs(Math.log(dist / HOME)) > 0.6;
    elHome.classList.toggle('on', away);
    elOut.classList.toggle('on', FAR > 1000 && (fly ? fly.to : dist) < 0.5 * LY);
    const f = farWords();
    if (f[0] + f[1] !== farWas) {
      farWas = f[0] + f[1];
      // (the words stay as they were while they fade)
      if (f[0]) { elFarA.textContent = f[0]; elFarB.textContent = f[1]; }
      elFar.classList.toggle('on', !!f[0]);
      const r = f[0] ? elFar.getBoundingClientRect() : null;
      farBox = r ? [r.left - 6, r.top - 4, r.right + 6, r.bottom + 4] : null;
    }
  }
  elDate.addEventListener('click', () => { jd = jdOf(Date.now()); atNow = true; wordsAt = 0; });
  $('slower').addEventListener('click', () => {
    if (factor === 0) return;
    factor = factor <= 1 / 256 ? 0 : factor / STEPS;
    atNow = factor === 0 && Math.abs(jd - jdOf(Date.now())) < 0.01;
    setPaused(false);
  });
  $('faster').addEventListener('click', () => { factor = factor === 0 ? 1 / 256 : Math.min(256, factor * STEPS); atNow = false; setPaused(false); });
  elPace.addEventListener('click', () => setPaused(!paused));
  elScale.addEventListener('click', () => {
    mapTo = mapTo ? 0 : 1;
    elScale.setAttribute('aria-pressed', mapTo ? 'true' : 'false');
  });
  elScale.setAttribute('aria-pressed', mapTo ? 'true' : 'false');
  // the two switches are separate. The road is always true, 48.5 au a year;
  // how far each world stands from the Sun, and so how wide its corkscrew is
  // drawn, is eased or true as the other pill says.
  function showJourney() {
    elJourney.setAttribute('aria-pressed', journey ? 'true' : 'false');
    factsAt = 0;
  }
  elJourney.addEventListener('click', () => {
    setJourney(!journey);
    showJourney();
    if (journey && dist > 4000) say(T('out here the road is put away · the stars nearby are travelling it too, nearly abreast of the Sun',
      'aquí fuera el camino se guarda · las estrellas cercanas también lo recorren, casi a la par del Sol'), 9000);
    else if (journey) say(T('the Sun carries them round the galaxy at 230 km/s · every world keeps circling it',
      'el Sol los lleva por la galaxia a 230 km/s · cada mundo sigue girando a su alrededor'), 9000);
    else fadeHint(true);
  });
  showJourney();
  $('eclipse').addEventListener('click', () => {
    const e = goToEclipse();
    if (!e) return;
    choose(e.of === 'sun' ? EARTH : byKey.moon);
    wordsAt = 0;
    const day = new Date(msOf(e.at)).toLocaleDateString(LANG, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const what = e.of === 'sun'
      ? (e.kind === 'total' ? T('total eclipse of the Sun', 'eclipse total de Sol') : T('annular eclipse of the Sun', 'eclipse anular de Sol'))
      : (e.kind === 'total' ? T('total eclipse of the Moon', 'eclipse total de Luna') : T('partial eclipse of the Moon', 'eclipse parcial de Luna'));
    const how = e.of === 'sun'
      ? T('the shadow of the Moon crosses the Earth', 'la sombra de la Luna cruza la Tierra')
      : T('the Moon goes through the shadow of the Earth', 'la Luna atraviesa la sombra de la Tierra');
    say(day + ' · ' + what + ' · ' + how, 14000);
  });
  elSky.addEventListener('click', () => {
    // down to the ground; or back up, to hang beside the Earth
    if (skyOn) leaveSky(() => visit(EARTH));
    else if (skyPending) visit(EARTH);
    else enterSky();
  });
  elPlace.addEventListener('change', () => {
    const v = elPlace.value;
    if (v === 'here') { askWhere(true); return; }
    const c = CITIES.find(c => c.en === v);
    if (!c) return;
    setPlace(c.en, T(c.en, c.es), c.lat, c.lon, c.tz, true);
    if (skyOn) rearrive();
  });
  elHome.addEventListener('click', () => { goHome(); choose(null); });
  elOut.addEventListener('click', () => {
    if (FAR < 1000) return;
    goFar(); choose(null);
    say(T('every one of them is a sun · the nearest is four light-years away', 'cada una de ellas es un sol · la más cercana está a cuatro años luz'), 10000);
  });

  hint.textContent = COARSE
    ? T('drag to turn · pinch to come closer · tap a world', 'arrastra para girar · pellizca para acercarte · toca un mundo')
    : T('drag to turn · scroll to come closer · click a world', 'arrastra para girar · desplaza para acercarte · haz clic en un mundo');
  let hintGone = false, sayT = 0;
  function fadeHint(now) { if (hintGone && !now) return; hintGone = true; hint.classList.add('gone'); }
  // a line of words where the hint was, for a while
  function say(words, ms) {
    // (hintGone stays true: a drag must not wipe these words away as it does the first hint)
    hint.textContent = words; hint.classList.remove('gone'); hintGone = true;
    clearTimeout(sayT); sayT = setTimeout(() => fadeHint(true), ms);
  }
  sayT = setTimeout(fadeHint, 9000);

  // --- the frame -----------------------------------------------------------------------
  // everything that moves is multiplied by the time that really passed, so a
  // 120 Hz screen shows the same sky as a 60 Hz one, only more smoothly
  let last = performance.now(), mapT = mapM, drawn = 0;
  const veil = $('veil');
  function step(now, dt) {
    // between space and the ground the eye goes through a moment of dark:
    // it gathers over the end of the way down, and the ground is under it when it lifts
    if (skyPending) nightTo = !fly || (now - fly.t0) / fly.ms > 0.72 ? 1 : 0;
    if (nightA !== nightTo) {
      nightA = REDUCED ? nightTo : nightA + clamp(nightTo - nightA, -dt / 420, dt / 420);
      elNight.style.opacity = nightA.toFixed(3);
    }
    if (skyPending && !fly && nightA >= 1) land();
    if (leaving && nightA >= 1) takeOff();
    if (waiting && !fly) waiting = false;
    if (!paused && !waiting) {
      if (factor === 0 && atNow) jd = jdOf(Date.now());
      else jd += rate() * dt / 1000;
      if (jd < JD_MIN || jd > JD_MAX) { jd = clamp(jd, JD_MIN, JD_MAX); setPaused(true); }
    }
    if (mapT !== mapTo) mapT = REDUCED ? mapTo : clamp(mapT + Math.sign(mapTo - mapT) * dt / 2400, 0, 1);
    // (beside a spacecraft, and not once the eye has drawn back from it to look at the whole)
    const sTo = focus.craft ? 1 - smooth(lg(30), lg(100), lg(fly ? fly.to : distTo)) : 0;
    if (shipT !== sTo) shipT = REDUCED ? sTo : shipT + clamp(sTo - shipT, -dt / 2400, dt / 2400);
    farK = smooth(lg(150), lg(1200), lg(dist));
    // (from the ground the worlds are where they are, whatever the pill says: eased, every one would be in the wrong part of the sky)
    mapM = Math.max(ease(mapT), ease(shipT), farK, skyOn ? 1 : 0);
    const jTo = journey ? 1 : 0;
    if (journeyT !== jTo) {
      journeyT = REDUCED ? jTo : clamp(journeyT + Math.sign(jTo - journeyT) * dt / 2000, 0, 1);
      journeyK = ease(journeyT);
    }
    jK = journeyK * (1 - smooth(lg(1200), lg(5000), lg(dist)));
    place(jd);
    if (!dragging) {
      if (skyOn) { skyAz += vAz * dt; skyAlt = clamp(skyAlt + vEl * dt, SKY_LOW, SKY_HIGH); }
      else { az += vAz * dt; el = clamp(el + vEl * dt, -1.5, 1.5); }
      const k = Math.exp(-dt / 320);
      vAz *= k; vEl *= k;
      if (!REDUCED && !paused && !skyOn) az -= dt * 0.000018 * BG.turn;         // the slow idle turn
    }
    if (skyOn) {
      skyTanTo = clamp(skyTanTo, SKY_TAN_MIN, skyTanWide() * 1.2);
      skyTan = Math.exp(mix(Math.log(skyTan), Math.log(skyTanTo), 1 - Math.exp(-dt / 110)));
    } else if (!fly) {
      distTo = clamp(distTo, nearest(focus), FAR);
      dist = Math.exp(mix(Math.log(dist), Math.log(distTo), 1 - Math.exp(-dt / 110)));
    }
    placeCamera(now);
    measure();
    placeMarks();
  }
  function frame(now) {
    const gap = now - last, dt = Math.min(gap, 64);
    last = now;
    realT += dt / 1000;
    if (needResize) { resize(); readInsets(); }
    step(now, dt);
    if (GLOK) draw(); else if (ctx) draw2d();
    govern(now, gap);
    if (++drawn === 2) setTimeout(liftVeil, mapsWaiting ? 350 : 0);
  }
  let veilUp = true;
  function liftVeil() {
    if (!veilUp) return;
    veilUp = false;
    veil.classList.add('lift');
    setTimeout(() => { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 1300);
  }
  setTimeout(liftVeil, 3000);

  // --- DATA ---------------------------------------------------------------
  // Everything below is measurement, packed small. scripts/solar_data.py
  // rebuilds it from the sources.
  //
  // STARS: the Yale Bright Star Catalogue (5th ed., Hoffleit & Warren), every
  // star to magnitude 5.6. Eight bytes each: ecliptic longitude and latitude
  // (16 bits each), magnitude, colour index B-V, and how far it is (16 bits,
  // on a scale of logarithms from one light-year to 15,849; 0 where it is not
  // known). The distances are parallaxes as SIMBAD holds them (CDS,
  // Strasbourg): most were measured by Hipparcos and by Gaia (ESA).
  //
  // (NEAR and CRAFT, near the top of the script, are rebuilt with these: the
  // neighbours from SIMBAD, the spacecraft from JPL Horizons.)
  //
  // MAPS: public-domain imagery, reduced to 2048 or 1024 pixels across.
  //   earth, land, clouds, night  NASA Earth Observatory: Blue Marble Next
  //                         Generation (R. Stockli), Blue Marble clouds, Black
  //                         Marble 2016 (NASA/NOAA Suomi NPP)
  //   moon     NASA Goddard / Lunar Reconnaissance Orbiter, LROC colour mosaic
  //   mars     NASA / JPL / USGS, Viking MDIM 2.1 colour mosaic
  //   jupiter  NASA / JPL / Space Science Institute, Cassini, PIA07782
  //   mercury  NASA / JHUAPL / Carnegie, MESSENGER global mosaic
  //   pluto    NASA / JHUAPL / SwRI, New Horizons. South of about 40 S the
  //            spacecraft saw only winter night: that part is a plain fill.
  //   io, europa, ganymede, callisto
  //            USGS Astrogeology, global mosaics of Voyager and Galileo
  //            pictures (NASA / JPL / USGS). Unseen ground near the poles
  //            is a plain fill.
  //   milkyway NASA/Goddard Space Flight Center Scientific Visualization
  //            Studio, Deep Star Maps 2020. Gaia DR2: ESA/Gaia/DPAC.
  const STARS = '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';
  const MAPS = {
    earth: 'UklGRhYxAABXRUJQVlA4IAoxAAAQ2gCdASoAAgABPmEskkckIiGhJRHL2IAMCWduwaqw8n+AZ8J5daJqfHz1Nsj/uLCalH7N3odH0b9h/9j6IvIXGt0o/UZQXiLqWeCeOP/d8KfmzqHflP9S/4X909UiFx0M/D9BH3O++/9T0k566ujQA8mD/d8q/2L7Bf7C78N+6zZLokXLeA0bURykydo3Qodv8aqKmnQOjntXnR81pNHyOnShqs4JIq1OgpMdPbWlPPZ2WXgutHJS0ZgnxAEF19WYF1TKVUmNhPICx8fhvdHiRsoyGtyp5cZDlsnPagmaCQhrnqtXd3HtMLdPP5q+Tt1tQFahIUkw1J7Qvn3CgR43UEbN97KsD4UINcH3HUuNHl8mTg3Tdm+Bth4OCuUzaC5UVWOHFfBc1+gJO8H74Dk3+FPv6MDpkM1X2DsZ7D6hKoTyPoG6YCdK3y8cDisB2C6Ohdn2Lt+TVIccl+tI68ez0EoDUb0QJv/hfJ/6TuKxZDRHpL+o0t0FaP/Y6D7rgjPWSOu5hb7pmwBdmcjtd1SBXC30uFv+eQcUYfhUuaUGD6qnyqKqQjaqg5eVv7sBc4saTua/30ocih82cU9f/eztf4faPYWEyd65vBynOMCXO1GcDFSzpjzPBOpu9XR8BrgUedrBYSqj06m2vhCaNakCoNXTqJAy2TgAXczpQUjFT6rtvo58WzJWkwsRzn20myguaev1bcOQONzy6kpYHBt/yO7+dFleTVYUzg0aNr9lpky/Gh9VFD3VAckHztl+KrWKkbqKUXy0T4CeLQHr+NBCkQLyivOMxrcCCJwj5N4O8fOYM24vX5M/IVoJDQlQrkhtz7CoF7kx0aUu7uSwrheaOGBqaxMEEPNuQDc79dC4jUGNiGoNJTKNEGtuePWeUkE/mH6/pqglkQfBgPixzbz40jX/7qFWPPu79lOik2NMeWNkK8Ehj+cn8SCKPdswrh0Vg+WSKidtUxgJ9xTJGXd2UfsfNPu/0iAc/yp5LwtYOie1x1qSNZcxDtAjc5WItRKC8Jcpvp60pSW8bLt+nEooEsHxjc60CeXvFXEeO4mvW8Xou4UIrL9NWKFp5nP0c3uhoE/EK0M5LglctzIYSn7I+WlYG0svia2wtpWRdgInOAEF0ixbGZ4zcuR/uCILssneHsDgi7lsXmeUcZLlb/wCGsu7iP7bOlx7HO/biyMwdUjYaxZRqg4MjuT7FrAUcoX/s2fSyacWCECgv1AJd29L7Y0xQ1uyPcPd5iHztYrLQ0Ht9dN/Kppi2631V5x4kLgyhK88KIy3M4xUj1UereZizYf14C9DyZ2loadjVHy2AczfZ23wnzkDcsVqI7R/I/n7oNLYo8qGwHf6GWjPVWVihY/eZyzdDQNuwnOEo5+Y3v79a8sNmJ3aZB21L7Pj0s067wr8n/hYSfvjXYjf9BOreFewQBsvUtJxg60SM3OK4SSvrWzTxyKKg6VbC5ceoY9NbyPV01QuXMkZYSxDB5RHAZXzFlCSzvHl4emL5ylOVmPTLUw0pGe7REsEvf7olzlhn6bxHI1ugds5SDvcxRhsvAU0zL+Do4I9mV35p0qibSOeqbbwbHGYfSRxhlIatm2fjyDZYWM0Q7u+9i/ZnjJB3GCedNYTstTDUDbkXfqTGkLmqv4GvwU1BH52+OJCgtVuEl8z+g4BPmfpanTUJnv+pr+o6+gYe1IZ7Jn7YwdiE6uARAXwLbE5mKBko0lm1U6dhMqtkhLDTPKIc7ob/4td97Bv49W1/9e2a6MJtJ3F4ZYMeZeZxbraIwPDSKoY8Nv2b57ruCVzbit3ICb8LdvnRijdzKtTW1/NFdvePz3CEk8leOpyviJ4b8atnuJJBA2ZAtfQCx6GIRiOzas5Efi1Nn/5pHNaOnuZ0uh8YFXMxNgWkcJcNV8UH8n9kBUM/+50tDLIF4aovEdGUm9YfI9VQgyTc3tLSzC7i60QXZuiKqZIkbOroX6Ku/iubcVd5/MSr8JG1CpOWuVg7DNzir5ZC5WmQ9VScItMxw+uimqNZ7hMkemPMJyk2WhQszGe4mQ+AbfGWD6JF1uJN/KbLAR14rs3imqt2GubyduPPWcZPGBImDFxXCXFktSiOEoEGSxQQEYZ56f3mJkbfn8Lo/ZtaRWOHIQnTmEZhYes1jfovOIi4Be9u8xCWt90yFGB6TuiR0vN+fr+7tfUnv9Zn7E7KoYcUq/b9blW8iDTNTCehLFdpJOJcXE45Eq45VRomw1scFKZJFg7b5Fh30YkmVNmB/USYpm/ZXtTm7dSZbw4GfrcB49QqppWJJuW3VZbzVQcvpdSwjWe3j490LEYY/+hU3WNQP9dz56AAP7f9/NBFVCnJ//5O2p/v+3B/cD4dzfZACYlxpXLWm1KWzh+j81g/C2Vvl/XCRmEQRdEM/KOiGEgVCs5t/ftERNa1OfjbYCVmb/HbtFNXHmeJWt55rGKLHaoJgQPrdNg6NpsL2SmyGZOX0KUc9RAKI9twS0mi2Wc00/lYkV589OyjuDDZKkMqWZsm/fJEHOIukSifAonCnaZyKg9wOO+VQhq1W8drsmYGwuVuNIEBCPW+xAwezwyskRsiuw/k15zGdgJCUQMCTRSP3TkVlb0kSynCc4v8+NbCWo9T3boQNJsJfSId7k1MQyN/4xHUogWCV5TBB6VXHLzaeM6F9VgdnQJhDyOcR9skAbXPBTtL4Maoh4WWB2oD2zSdOcEALhLoi+Lz3pQRflAok6F++hJhBvTCQqcfuMFe+1BTDsth6/D7bVSrqQPYh1eWHW3emKNMMZSWwfKDpUvOe0ATJ9ZIwqeYo6nVHBc0t7YiUr7EqNLHG7U3mkHc9CEFu+a332tdq45SyKqzH0hUecfadCIsURKfIt/4cV9CYtfBr0u9xNm6jnmdhmSiSgL0UTPOSWkUgrMzUuwhU8sbWaU9nolOT7sXYGvBnZ2lIXF+MWwNwdXb9TFiZltkJt3Fx6uxHltto/tn1grKzOmOvfckkegllNHrtezeUIzdXdWawOXOfyFSXw+avT1uCM6Hp9/k3SZb9KiJfJsoPRT6iweZsES/MxZL+FOaA66oGul+yLqGPqGy1Om/egKqQynHdv2k0Hj/TuNYC5/Lt30MJSo5WhsgNKAKk6Y7/zr5qo528t05QblHvBscjinn2D4V7hZtX+iKoDBgyUxDFEyEi/dOj6GNCOqtfmCzGfcT96WID6yngmTDG3TEM7eh5Zyr3HvUsHcT7r4BVewcNMhF7ocayP/UyAjVAj0kSxd9gC40Nt6ucsFO/7erbf1BLKE3PwZQ326WszSVRocwkIlgTz81bb+eWYCtcRhwdN7W9EnL46en1ZH+6TCB5v5RL36HrKxwRrTEhvGmro9chzoTPOcpkBNhizPHO/cO1200tTEgl+SETCpDUi2SfY0fWcQRHtjnY5o0kHk4UGNv+kRmOo09yel/FX1+8j3dX6LXHuP8AD5l6aJX5lS5GhV3pJs2JuTrzmY9Uoe5K3IymoqkxP/cC1p01l4Z3g9cgF527LSIuKdxg3hixIJk9VgU9JTfw1v+bpuDzEoRHW/95rSp4TPz7Ko1BYCGfbYS9KBNzxwgN7iEXH8oQlxuwds049+HwWUDIqcR2zByVBxmgmBXd2GXEEYU/SOQcQPj60u82N6NuoDonPZYhRnvXmcDu/SNPyV9XGfdh0Qy33A/jWFeX+M32NIDDuMkxyOQls6A58l7xi14Xb6D9+Zja5wA/idcq05HV3eqHT5FvI1143mkoZhPXIwAzOHBgXfAWUlVE6+p1R6DlkcpFoJ4SBjo23hsPo2gyrjhEfUPg7MJfnBvmTXW9evFTK55yfpbFany9mCBLFCj+fh+DDH7KKNSB+ftfZwdndteMwerBPYo2FAQiL3rBtZGOacdTu0mX6od7M6u3MvsQFzJJVmnhJqhsVTRa4oaNVZbJgPIywGN5A+l5qrcEBR9O0MmrUT29qGhxt4Lv6NjOKT+JgHedMjW4Mz45wgOsX3RkbrYqu5ZvPbRr4rbcFQIagvX2gCxRneTZomALR3vHgC/9hycGL7jdpWDHNlVoZZLamQ4m8TmknLqHYYuMq5X1lnP/7ANhymLgyhQ12n20D3B0nK59N9YoYJHSSnpoXDYnVSDq+/Gaosm2paFSCQYSVGvanKECaVWymZi7ZynEIuxia6GXbjXPiqX80w8gPKmzr470W4v/UcxOzv3jWB/+giFXoHpeWQmBBs5913X6GDvH6u6/4FhDkqlOnjPsqcNw0qu0ybwK73YogMKAwxeXoEo9Mib46Oc03N0PANRIGOp7ZPiLIMsm74sVxnLb6Q6uUiHjF7L/WQ9t1x2j7Xn3+i0aQgtEeMlpmHroCfBxmO55y9kqYlSbv8IBjb4OpUC27Msi5K/PA30+I2KHhzuuM6SpKwT4wWVDTx/X3OCJTAtR+nRimPfnw4e/iEGQAcnEl/0K5dq6/36bQ+wHFKJ2K69uBPhMq4Z38u6I1IVuIwpk1OkThoW/xx3vbkxT7ULJiUX1L53DrTrQn+/eeWV5pOniZYGFqiszycEglCVwXu0rgPq5qq86bB2h/jC8yew6odm7CA7EYLEbhvqnpbmMQLiWmqMQ73lyt82U85BQj6ixNrOnXp8YLeUvwe7mIxffPUuJrfsT39rWWLdmYRBn9sSfYBEG9o25roox84z8NN/RWwXIKDOV4/KuOPr2U7/wOSfBUEae5ysd9MONJjsZtshaExmHJ8XPb/Hu4ACGoHRJozz3pMBnjUbwVxmseRQcBzVgVXnwjbkQNDOEwZVMU2FVVwKOqXYtYAYXvcX++dfAsJY5jlkOYVVHl/Y+oGPkTnP9wXrLa7y90ndOsv49qEBby9rZ9mGHqd8C1xvXJW/9dLZfPlBWogUNGc79CKurU96bIF4GMnD0+Tw4MdmlBBWT8viikyp9VjSeQKthj2y2AvECrl2OF1rV+7e0k7QIQRvStYtvfrQDl+6FcmueBvic7std7ss9SuQDgrAfOR1t8MdsBQ7SHXPt0iJZdZ2M0KffQo+PCKV6eOfZKGbPQG7tpqYLnxjdDVZBY1xIc/uKhr3eNR62KDBDHLxsGOyiDV50HU0cnHq/3gdntkhvlKPTFdD8AkewBdgP0u7ECQd6nQALpkaou79XJOtjxy6lJKNKTE/CK9yTE6a17Q5MYpy77b2bIwmvqf4QQM4YFY2MdOYjdgxwx6gPfnWfhIhDVPo0Wxl21lJBqFMk7q6c2h3zwSQ6dCALDeAr46fCBQThuRMaWYtV5s3zGwfwh2j4wuKMWs77nfroOYolIu5anIZaA7jCT2QuIr7KklEpvX8ixibfWi0kPlvgeQ7R8p6ZdJtlyZAb0wQD6GScOrC62t/6bqC8EZiPxmU2IZt5Zf4ibDJijoP21soFgRlscNllgaj5TL2JgMK9UrQdwkG4zEoyTQgLTWn+9J6IEaKg6Sbip77A25ALJ9P0nbexvsTsjkKBhWOteGO6xUXMZmJH5nF3i+sU+8P1MrbOOwPgeutJuI+1vSeCIOKcEBZCLJvwP8TnOLLgjxmIRHOs6CvqHXamDrxrKKfkPd6nNKxCJfoNDGyE2greEvJOgozYdd3qJikfzNt4PAe2sipHSa3RZv/xrY/T694b/jF52MTGg4VHueP+zY/6oJAPUIaAqJeVacf2KbVFzUPKqxTh66gVvyo8nLYC7Qgq6jPulTQ81DACXd+oC/haT5fVRalGPIC8WrAH4b31I/1a07O9IGcnfvSE2rDKEYXnbak2LWumTJTad38LSbNqeiuqaDD3jEFmMSsLuzYTcVfZVFDAUC7ipCai9bElPbMSUmzfbXVGn6wtg4i5eh9YEbo0fkh9bh7jk0EmvkDKM5hajAwuWzjtKYj5LECsML5cLAsFW2LbAVTxXopA2Rc4uHVu/PXaURX5ByPafW5JvKVcNgcf0k8CTxCdr6rm0EFVs1vGfybIzss2vh+AF+iGRTl5OH51XFyrJGmuzN/Zy1gh4exiiZlxOYpCexuoqSoByfSLkLKlIG51XxhnwRUfPMeBsYGqw7qpXHAX5IvY6C6BUnQieo3u7uFAf6fcnfT4l4dwuN1z1xtNwf45opWWXpi8zD3jKfCj58S30t1wK78lLgYPNQZOeBh8ET4aioY6ig2z68fGHVHid8azGGn6qIVtpDrJB0MSlwSXG7aiXOzFi8uwD3kqQnDmm7hJwcrXLMw9qeZ8rhkam1/lgvHEw+2hI3YaVKfI+I1e5aHIHti5jmZmwZ4QGo5ES2B7+IpbYx/R3aWvyRlw6AywULWD4J19HeuD+Ea1JyrxJUM5w4haN5ECWLbK8iPWm9vSO2qc69CgJa5fmlht/udq0PE3RMPkqG+DFhyW4SLChc8wk9fi1L1ekY5FSVn5jFBfDYq/4RrmKxpoTNWLZyXK83lfs0eD5n+//eAnvLKqloW64ykDxd/m6CpDQOEcYOjFZl2Bl45rJHN4or4vdGOGh09JWYOTg7R/faAPoVUZkAhaZSORqe+keQPLpIEUXA5rgUdeid0EZMk/xrdgLfwkTHVO0UlznO+wToZxjifCuqOAykCT7OWRb/uY27Lp9hodXTnnv4mQYd5UJ8dU0IDqP84RJmlXnnZT6fwxacqBc/J+BmWJ5sclCUceo93tomWcbovl0RJaqsnwqEM3c858LuuiiGYp5Lkip7OiGHAAp8hI8TzNKXZ+G3FNBXvIljz4Jz/TNMiEAY8pi35vbHeuaLoOatLV1vwsW7/wBCpzCiDpcxFnBJAlgNDX6jKx4K+ev7LW+5kyak9j1cZJiV1ybOj2t7dVH5j3CTjZHWfMlx4564207bIWvQgQ7ul6GZ3cFqATYk/Fmcliqug2IGw8ivgLAOIfkN4KTQQS22aUpH0F8x2lDoWGR9udSbj560pvbraHd4j1K61SHMy7Gp+mdOuGOOpu2PyXvVLpeK3EoB8UpXiSJFUySjab9phzOSEeS3zM2EI3zmB2nloGFVIPmeWcjJ57Lf46VbRiXrjlhSK+R9iXsvUOhd4d05xtl6lA54qERse4Ba+q79CRITWSQaOIGIx6wzO/EAwIPTKDyeq9wvYP8yxyWLZn1i8HBmYLbyYMFq0CCQqcj/gwpjGEi5ckEEAflWJG6AJufaueBVGRZ7ZGkrqpFcaN/me3eZEUfAJTD9M5iHhvA815F60OMuDNVLTxoSkcWUEXZrNuH7x0libEyWDAaihRHrzC3Zp+ej7DieONpxsZIBNqsBPY8zbOw0UYba+hglQndQzEnT4js6byRPxZzDGG5aUehfWRZWdgKQwdqUB6LbalnjWBNosl2Bjqe6eG3ATngcSy8IZKTj3u0URj+mkIwuiay3Y89OL3nRUU33wjA0245YON2WiF7cnaabyobOk67dVkNeHYqgOPVEhw8Pp9W8CigOB6iFMI1PeXfIJ0LimUNfylWGMPlZZscuKd4GRVy2vNoOk0Ms9WhasVve4SsV6SBNILfWPtg+pt69uoeY4gryPFSvmktPbCqmol83nKFIrWMj+Xzkkxv72XBpMlxugVpwlM8INtW9TlKumey4J+9FLpjsLBOfwir+OUZ93N9Hvyj55KClNQAbfDFP9PF9+SN2f69C5XMJgxrMEHwm0qFnAYk9wljNXPzvelDRqjnCxxpclQXGkz/2JdGM2bUOIcjxzdxzosmB8A9AQF+ucAvbOR/Q90CCF/sP6F03EOvq/DCj40blo0JyVPAT/m++wiCgDBgCKrKxOadYezshmgvwdjOvoEcCBkKCJpFTUdUzf8qfZaF3RQE7rjYfI9FVh+Jn3gLcX/N+HNIJdu1YAKJeynMmitw1ovomGxWFbSs0W6D+OruOYjCvYP6c1+R07rPpBoQ7LbIHG6LrG7sRL84MB0jDL6CkE61jctxQy46O9HT7gG3cupRFXkjYM2B/E9Rsfq/oExcWSeYODbA1ActXZ3U6CrfLNclV00WNkyCy8zv1wyuJ7KVp/soU6zmQ9jRBSO1O/Oj5Y9uJHi2c4MbprdUgYYmSfNA4YV4sGWzagrOGki5ed7nXe9UCYHl9jtYjRxvm4Q9sKgKZTde07yplKUZoakLN5A4X+AAAnToLsry/Mnf79tqciG5DelYUlt5rPOgStA6W+KeIQsTW5QlviJ+n9HmiNHqQtpOLkW9quVAiA4c547NRoEuRtJGzcvFI0a3N/Tx0smQt57HvjDW8ifDFojSaO0Rw+jAfPG/lXkfS//22eELf6kaYlN8quOmLzWbxAmQ4hV0pKSYbRkqeWOb+8MqCySgaW+R7Qq3I2YDNMbH+mfZXf65g3aTE4bzIzeRLis+AoD5L4JToA0o3Aed+ftywbol47FgpG25KRiAinFiY0TbLhQaqQCrQdcQURYpId/BF/ZXP4OXvJmHRgRao1qlnKu+QJizyVqDbUks5COGoNsmxkOs5rGK2b+41nqxz+RM3rE9npGQgwtjpTEmJu7CRfO4dWTsjs1NWZaQ6vPrX28s/oPaHuDp/V2CzqME30FfHHcp3Gi25WKfCY5W0HIN87HDJD19PZw3ktbyUJ2SbGFkHsdwfgAVtps02jKfFhSp1z70G7RBCsBljhbLbovuKQTZK1xWruMuPc08qMP/oSqUNPkZbvQJVWEIbohXWIXEuHEB4BdzjzZeQAFb8UNK0luJRtkQnnMuAUB3Ma2ybPALoKTn9kt7t3H9kfcDEH/snV8RG33bD6e4MBCohNMhgQKlXKiJctk9qyaOahX/Zqj9DtnRYRCoDyBouxvq0/G3IJGXV6xbn4QFa1O1twHmB5SO7z9cvJ1XVyVGc6w4anKb9xSAVtYFd9BcV3ZLowCM63KfMQ4+9dSqt9TsCjLMnK/agPH/WtxNedsj3V70fP0C+mkp6zg3jcw+gYqTRpI/WfO7hYGv+VALT+A7z6tC2NgpLpEV+TfdECPo3ABEjyE2kq3ah2kmTiEqsh/rMtUysLIAoSGQ3KgwCABIOh6OyA/9RNksSzfmZlJZ4WDaiPKXhdH4qg3t9cM5aB5/9cy/Gxz4+AGumA8hh6MXDME7jC/uSf0CU9a0Fy2F6gcjroPuyw5YUIj8yIphRdkiqwUfv+SkRGRfPYkgVrz/hoGMRrXf2kTGD+LL1dXmOHfC2E1xwgDzcLPt8efHgtWoSGm+YZpmxsLAt+33AiF7qaHjEiXHbDx+Gq7RtJSWWtsefSXLHc4wX3v1Np44Gjx1Iq4/qeympWILLebxJKRDIBpc1VhdtQ32OMeEmhO5Shw02Z9wwIS/BfgXWGnkZ9cswSag8MygE17vjgAjVz4Jb3X4JuZZvwDTRDR8foQmpNFYBEbkfplHaa3oSW4NtgglvrDy12LYDmPjI7RkuOClvFXH+ckMKywOOTBqMcmaZBFVuxcwWcTypJT9A3PHYdrwfy0LmI5Rl/pRyzWNfw4ADtpzkF4ZIXalGQNLhApKZbwq/YUByIiqNcx/HQlnQ7FfdQ0tMR3ti4wJd3yIr42tIAvHLf2Q/DblaREVQImqVjbQH/uCBkm/GyG9tGoKr1F4VzvGhnPRTAj2Y0zyBJgKNLsNiyn1eCmTuZZvwBHxJJVN1NHrGzALr1LwbRizPQZTSR6x/GtRzDDhTT8yOvlHH44oqXgfpRNLI5KE1FIMtpmXbNuHEI3OpreXRZRgpg2/uodfHyzlpAxYe1AoVhAzIEID0j/4febwFwVj0xm8Onz0AxDQKSl0fQwj9z7/9chtTT3n7Jn88QsuWX4ApM2Maq3Ay8TStc/rDPZkkfSePqwCjv81jnM2AeEp/oSn4GssemSnfDt8nMdlSDQqayoCWzQfh/D2K7zCLd3HyC0+3q7H0RVd0sqxjF+xtoM0YqdWo9z+OrjX4TUvfPUeIUbuRWnahEEaNP6vmSmd0+NmYoP/3Azd9jh/445Mu8J4V0Ct74joXxOnxgUDWPTfJ6T8tPo7aMEwfamzOp7Hj7QIadrRmUSVC1Tv3E9HLy72hxVHFbzr/37GJpU7Gj+agSpBk2W+WUat1uz98Oncp5PUIfYvEm7531xxXBifGJyZayXYWRa1/+jjJ674QOdKwei3T7US/SMS97zYUuzQnSLDru+AnBchQBkNNq2cEtXJI4akbdpvA4JHZa4JqqHOqtRW1XcjXkC5TkXOwTeCj31x9IgJ1tp3/RgOVR+e5c/yy3/XQi4lcHOafeBRBEFk1kRWFYX8jp1/HvxGdhq7ZcM9RXD6Q0tap7kT0unLbQ8gR9Qw4EKgTl+QyVTE8GGBKMOHBPGD2s/Z4/RaYvj1YOlXRoXlVrVnoL50g9WD7K4XQ2KI5xF1mAqnVJzDKobTMT1ImlLtHApfl1uqyMH8bQWxJTUODF4lbKHOT0AaAsyW7AD8QL8sHQqv2Dg/idGR4XC2/iVDJoclqiTUZfqrtF6IhroYAI31AHOgkg04SsgQ/URD2hi2GI/5oGjwRnI0AQP/b2sAF3cfWGmRlDOTrPgWuk9LO7ps0b/Jl7UGysk1LkvTasJrxLS0kXJwVbA3fhKa64LAXt5GaZK1DL9NcpOCPmLZEYb6AABC7H9sOS9kOILJcBy1wie6OfLoexsH5LQKPRhcVvoJUxD1r/nzfNjm2BP2mvzhRGnWo8hhbdT1fYKvcxbUCX+/SyUKsyYNeGToDoMchjDVHi8QaflsPlnulKdLprxfjX6AWYhGz16hnt6BLEiGuOXElc0u+axJ/ybQtds39NZmT6KLRTngC5BZ76q6pQKXF2xgvx2TpjM+NLmNzHJsZWKCvlFnQyvBlUyTgOn5dqSUZeuGcO8Ydi5j5PkcwZdesXOmmL+SRpS55gCHVtZzB58PVX1j2Bsit7VHeb0fl83aNZcgRyrn9U2h4/NFDjToGRE+eX/o6yVwSrhMv/oduw0KAgsR10pN6LSWLSyYZVnvjG7O+4/E3IfjxLqkAK7Z9GozH8zvGxosaohNqTlozibZ9yNZLEM6d+tIE6chywSxPP9aZ/BR5VAjKXLgfOTIdTmwckhZdCKnuPnXsuXwPeEOilbgPB8ooizAkQGpGKBUk9+fG7PqRmSCFNtq2BtHmAy4B6xd9afGwZ3Ujq5igsp6G5JZv4mg0MbFpEGJ8fu0SdF0orabXUXcpTj1aG3iRgOEUaBQ5pgKsqxY+6l8M7nZ42Fic8V1g9zQk0n+Ri73SNDf0tQxcQxdVa8LhvYz7jdZZcQoqP6SqdgKSC0H0p10IIG9O/yXmZe7CPIE61w/Gn8z5+FwvXI3fCsmAgFQ9KTdYKHxCYt9nACFq+Fo4AuhvSXSRKnErXj/rdXcglsc0qumgBicYzU5HMv9MtBbznEnVU30YVMYMgq7t+nlRri1JEGh3NVb9syPFPk2lMWIs01Yf5divwqWmcyCgMRaq0+ACR4OyAAOe7Bc9mA2UuGdjr0YJp9swIZE5tsZep0UQ7fQosa/3r5zv/sLocnui0eqt85z31jebr9xIgLWtPfBH6vFR47YlyprIgNQLjE4c1v58OskkbrV8FFFx/vxbQFvNNlnPvbU/TS09f3FMj6vtjW8fNHKaJgaTevlDn/C4g9tXm2IPp+xJpcnTTAJZZ2BnMHldcJi/9+knLxB87SaTTaGBC0YCt2St9VD3AnCaqqv0DOIS3ywM3uNTY6JcJsmszvooEWMAp5UL/fxkQHggKjPLZLrxk8Q1wcokRMOa0AH5yBF+UZZGSmQCGWxzUyMaLYHer2sF1Fd/qzJ5lBcz03K0XPNzTNAnrTLnOnUrqu8bnIUTKant/CY0+RNh0/zAipdzmv1Ag38hrV7wzWFBXLRojG/XyDsvsub0fosB/BNjR0HxXoirAPsVe2NA3Xk+ySN9yv/77A5JCGQ8To/J6ieSaprMBCO+skuBoq9hq+R0uPj+iVmmzcmLDUByMZdedwNiQCDn2GSKu+Ja0aD5RlQtoGD+IJn0x4iEALC8vV4n1kG8dTeN2YRZeUVZ/D4e92ziTBkCJgJuuV5jveeYKXd/Ur6dN6wVJcLI6bNK3X0oIfoadCYwbHpnq8gsNdP66c8IHp471NuoVxABrXDm+F5cvaq+7o/6D7xF4Op/DzopF0eNvNN7mQHOtxhzDkpCe7JBjcpBj+A+PCqm7j6cIdaE1pM2lKmaiaHevcbMjT2VuI4bW1LRw23LpFYCDrZ13TNrM779xzE645vLimJL0QNsgVlAHfR3mA2m+kA1yGZnlWbXKtQABOAQR0MG31kNAZmPb99hkvLeOYJ0JMvEodCArJH8/fHQDyb6sO1iqoHxB5U8C89QfVHaqErvvJgNIJiyrxQovrrJ9uoqx3jnKdFh6wci0Wyjxz0vjmd+HnrBXgx2c0jccXGXWisCk2YK6w3AJnPKfPZ1Xlj/YX6CzrMdePc2HgwDY3pVWbK0KqpUTt82rySUOqzlco+bnR6Dz25lAThHgE6o5Hnd/6Vp7Pua7QbJC2IbeIOfNgMqzhtePfDHw5XA01fKmlbnvYC+FYQMnt4WxHCgoVznWDWbkJFsdUsuJl0m3GlwAiSJaZK/5nHCBQMEldklXeuiyPBSu3i75nWf7DNCuyvPlyLAPwj9whhBNzn1wIoGiY7aEYXHVgri3nkSMXXRrvySZDaSGZV43LJOjHl+w7q7MlQVf/EMu6s9ZVERWnh+wyxdmhv1+FSOgGdxQsdjw4jHI0kr8Np6IwZginB1QANA/SX3ZxN/7Mjl386X7a7CqCM4s4BpYhXuGgbe0DdL7/nOXuTz0ZdPfXvWVnW52ophAD0fz6RFiy1v8ewhZ2vQmr3FJa/n7I5HS75md/AHm9nWXs+TOn2B1p4rDtijPU6PgIGTSSoZmBwGjEO7Bt36jXGXrhHtiIr8CMCbtEqdLA1ySaDVd0/hNzU25vJi4icCyhTRhEbLs5JmsANMkMdf6QuCfSjkIX39467cE7FS8BNVyfxhEq9AD8HF1YbDWSXQga7A7l9Qhc/khCaCA13JixqGJYQSQ0ooevtUeWr9N8yCW3EaajQSy/H2/Lhpz/zhG87rVHTlYfkRIeVdpK2oJ7I+lLOu4NhWLEL457XqvOXEkoXeItChmttGy5w4tQTusXdnHP+wj7ibhT8fzkk6yD07GlS/w4mOJMIXABTdAAqsGQqVsei4YAaFklk1lo/sy5aPYDPAOgy+cIOpKvL7NziFyX397YS5sXlqHY7Pnzu7OFFJYkSmPiw0+bKC3GlLHDGbMH4t97cbwCniwQ1N283ivXvUlQZ4E7uFs4+7GteZf1ES4Q1bPpL1iWb55eu3RhFrNfpL2uhxgYTtcnsc147eJL7SjsAMMej5jud2SX1EyTlGUkeH017HYZ0Plq0PXjpKj7HedNespmJ/Bb67dtLOjJ6kJ2DMWrG/RnyLZR+tCRJgACfTHLwxDe+d037Af0bbNzQuMebqiX5kVhv9wV264uVXODwBRiZZU8T2ffFGw7Fzto+bLEqr27nvAU5lm9BnOuxKixi9Q2/yiwwjQf+VU4WGpL5IGKyY3cBL61+6LVwAIIrFqRNowBTQ6DIO0OWQng8Kie/JDMABZdf3U38Cgim9HcOMDp2YoLjBgEWkB80BANXLS3iIHCRVkxynDrY4ugOQhG/XK/8985dv3R/esMvCAORL9rLxfMZpo64oTDs6TXnnMO4I2ek1QkeRiz6s+tbolWpeUdpEG00AoakERuhZliNBXs8NhneOW6pICV3sFC3A1ZT79RFAsfj1nohfh2nm+9Dr62r8dU1Nb+De0sTsuIg3m537Kw9qAOCYUlFQgUBipXZigGtPT0NBKySNYptRELpsocZt5seJwjpmaRvbCPNe91oo6Z3SRc2iByTun1q4psG3VGMPJMPv6HaDA8uyCmvk6xsKnBtGlKKMm0BPgGJXVsV2gIyYK9P/ejZXKMdA/Er+DoiLTuNuXCbBvUIuICLeSz3T5PUABWjNkXlSo+5+gPBfV2z96M/c44vMKydZ21eL+l/WhLDlD43bXc+0TeJQ7tQ2aqWNqFt7OsEN/QbczWoxL4opc6yzMtEloteTSO3ZTJ69InyWdqXAe1Ix4YDX4gMnfMfEsqckc9N8PaEfjdqAcCdIhDPvF5Ifvo6BhlKOwQBFQAAEEzlfjJcJPgTwypNNLloWlku8/UsE1zR4Xqwz5QVJCsLfHEUMdgzqIgDO2u/X+sCNxwbJntLGc3prYCDsYe9/T22cTf12x4pPN0uAQ9oknoHFdPcOhbr9XkzifVtw76UMEqQrG5iWLkEDUzYLqFu7nIvZtoLkLfH1JWZ+SsiwX4qAAErnhxtzEkzTagrpoWJjckXpHwQ38IO3Dy8QfsiV6PySwCRkXd7Aw4nQfn3uUPhlBvDAbV881d7wzocPxccbY3q+TjbCCSxMdSpIrUswNJRyk4h4xIoeDq3AAWN1SEOjxNsoHvry1F2vTXQR/ksxlhRQEQbQpf/uNKTOh4qm+CGEpiN6BW4PCZxQL4+AghirYklE4CD3XFhYUq8deGDWl8mPH6FYa6kAAADvhk/0s9g0WUFASeCkMLZvws3IHU1NgAADN7g46KMGdKigy3t38XCJmdaANUzTi0MLL8qck2o9G0Y0JLcHgWZ8Wa6YdH5IhqSjQNIddaR9juLQzIluRth+xB319iCznGbcp/ld8xuH0eAqfMQkvt1yrE4Pb7MoJzAZTzavf56RDzn5XLdUgzd1KamCYkLcQAEVevxZmeBUehti3pSSAXlxkPFdHHrK1H8hiqTouXLVmrb3iNI0mqPyVQx48vXlwHVgUOIvYUVI9PHk7AJVwu4bo+SFdSJjbhkhY4USJ2KTFb8vPGE9d9l2sV+76z5NQIiGPyB3NkfaX/PhwG6V5e05FUx72Kmycs5tJlplVe3QRa/ra8jx6QDmkMQo/+9nPNQOa8ROw8pF8/Ayg2LZVdA5VsPrnCeed7zyNjApCLyKtH9gNqSLPszymgpe+Fso5XxkAdjFk3jcE9OX6SUJ6Rb7iMWGLgj9lZwgZpqmRTDWu4ffe6usFkR3PcUaJz3UBSH3UEeR8WS+G8xlO/s9Q7h2tePaHENIALCZ1A4qOkticbBv9wj5xDzR995gNcKKqL+cT2tAkE5QH/SpG0nRfLZn0AThxD9juRohFeuu+Oc3P+GqZOKZX8nDRehYP7C70EtNthNRcdw5YqWOL5uUyOrslSMU0IHMaRCnKL/bxdMkeOC690zO6E0fL7dqtzYOs+xn9xvoATuAR0LSsnUeRtbLYW59vTUAIhVL0bQ4IzT8aVN7lQEDQs7CTTd5+CWW6tHrh1vzHV19n1U7pbUVydA/TYsroXeA5719DJyTSknvWA6Kc0P/UziT1N3477817UGLBf9iypUdnPfrSGGyg9+r0cqrET9804SLn5CrTo9M4oRcvsbHb3gas59SxbogRGwUX8dtD1ZrfQWu7194f2XYX/hwvg22ky4GwPGbxsn3Fx6RtN29AYGM5Uk6wb6pQFP/Isw4DdUolBPxGLJId45xpP/fX6ehzOOBZmSBK1Q9/H5+fjNT7QoshNLziVR6Bwv1faudF7MRGqqSBNWqV+3jVDbILzsS8D9w4iWlx7rw0cIYFSqiNKLEY53xsQ1DvfboIQCDppMc8hSbzhWLWv0ns1kADUgYkKvKmLD7ZBfaj6a2cmusX31Rm9/Y7RM+yfVGLpLAAKSV/1QCTSOEq1TdVPgFXGlym2MbAayZhUYcnNx1BYT0foy4L77Z3I+xHYQnWy6So5a2Xzj7HFpNBXnuWVvenOaziHpn2k6ij/xP5iAZ5QxCHmJ3Y7IXeoEHqwy5HOOlLKubm1X6wbhMdohf5JHa5YWm/yqbBCxUsXHhSk1fkwM3LtPPOHXcu4lICoAODC6DBC/3m+E3b/dvjon0Dyf1WF+qmJuNvU5mjbJV0oMHOLqT/3I9STFQlyP00y4ESKD0jlQDwTSdrDcDSPQVpDGBs2JHTCkVQyD8DhaVaaTLz1b5YgABubgt/35ouWVPDAaswA7AdKEBk4FbmsdBrZ4DtLUcYXlI/HvesOM1cZhV3txemkxkpi0iFgwH6DlkblQaMCMEI5iDoQ3tVUsHxvSeElq52ufwn6ZEDtQt4nSgkbGW1wh2jcEqUZ0XrblkyfBMr5aYGE9OAMZxZ/wBjInW7/txyPJCsQkG/wKujgMJfSgbWdnr/GAedKJ1vGFox+6V4f+s3iG8OnNXQVD3NMdkkqyzkCOibrunjggyvl0+JbzmCgyGUl7hnkQzf+FKR7L1JvUIj+W7XBtwAstcYpW42XEVO96uU790Ed7OMjCOO20pMZyDpTo+di73+cGSvQCLqe3Bl+CAbvaq2IQDdvmzFBu7WhBYem5spTjBRusW+idGiH1GhaRMsoT7fZerWKgfJppMHBjIxjAis5sj/lJFOlufeg6Gjo0LNO30bjUgAUa4UqIsPUhqQV5dQ8S0jOAAhwbYBgIil/GxHaBlcUOPWYlJSnA264iJWSFS2o2oBtnhJb620nS3JwnHK3LOqvsNBmx41ShcVuU1L561aoPpXAtok0n5L3+uyy46UAAbI0CoPO8S0oe+MFtTXGLJ6Og3MFDgz5rXOgWvBomEIDr1ZooUQXiZT+mdMUchJdegktnqkm8H59iX66OgTWNKMP9Xz/F2rZvyTSgB+VEbzy0Su4QptajJnRkCtHHmNbh3xZ6kSm6mCN6lZNX0Fg0v9pwnsu44R+X8POYXHMTMx2WJOzYgDqLwfCFNzF7f7mIhqy2OZx8BZ0xEeKxQCmnsrPPFcPnoAAAAAA==',
    land: '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',
    clouds: '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',
    night: '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',
    moon: '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',
    mars: 'UklGRppNAABXRUJQVlA4II5NAABQ4gCdASoAAgABPmEuk0ekIiGjo3E6sIAMCWdiiK4GO3Y9a1VdNf2r/s+gdkX/1dR9JnwL5De/KPx46ciHTuUoq1Ng3j3HWBXrj8zcojmP9B/4Hf7+ef4bxBuqH8v9iP+Zf4n07P4DuCOefzv2AP55/Vv9/92/UBzzf9n6AX0x05P7L9wvNx+r/5/9sfcR/QuqE/bjZtrpW32Arj+zFFryU/L8Dwqh5R+jmvLn0qsa+lFee9derQvj/F+CP9g/nOc/s94AvtTziYeHXWgf9D/vv/K+5f5FZun1xqA8GxQA8b3Rn+weoeNYAwLYuBOKddjTeWTpRfc+xD36J+UKmbKsPiNlL+73mpBII/YaefJwJ0GeOUM4AL6V2OMjyQskfjsIMq6uXSpP0PFZqWJMefB8/cI9/J3EdiCC0PpoCOvUJhTk8rwUK0/qxD6Y0qsbuUKhxYvNaAyzcJMtnZHnN66fHnUcfQp3BPjlg72fiw8DPQLlO0OCmnw3bONfwJyYu5CX+ieKv2vKNTnfSYZLYmrw+c1W7BH6VGyjWNgefTKr1rJqBMkbAccqrP7C9Y3XOnkELnsnfbv3n9ZSusEpHPNxA78nkrHGIY5nNUfC1WiF85i3ZxlArdsnLMSZ6GFwUCHg7TP0HRPae2kKSSZi/mCJAH6eXs62oxVvncQl5oiLhcQ0jkYQBYAxerCqxqbdqi1lukuLAcU8m9x8kQc4mzJa/1cc1WA3FJOwuKeWDaE/ft8TOPN+8pt7K7ekrJT+48LM4K/F7RWu60QB5tnFiyMQeIF6+vhKF28GzyUSILp/9MAAU3Jehoxhd1ZR9v84WTwapu7a73eMxGxNN86tZBj9Ev5KBqKWApKEZmWMV3Jh2Ms0+qA10M6PEhGSuGEPWPLdFqE6igpSeiXDidP9FCRUz9k0ZEwrVHno5xzu9uoSZbnyWM9PjQnEyARYhHCbs9RqlwuwDkBMKLYuOBl4qmrAy2kIISgSr7wUfUtTZmcWmyhQ0ZdvSjlZns2K7tvA369A7et/qnfyql5LV1OXhd+w1ds1CYwJ1hNnG89KhASDe9hw15FoU3zlosWCC7OIsbJTLZqyoKdLPxFNNOqucXifBSaApY5tjmDpxnUckIXCt/HhZnXr+RtyxzBrx4sp2ep+f8ksmyKuKVjYNzABjgezDe8y24tfvwaMo2D8ztyitYD/oLEkP1hO3tCv8plC+EuMs96W3zPTLqMN5Ni1lpX50JNWsPsTIUHDDDTdI0rUi1civTNSQR76KtNd4r9xqIXqO9ud+5l4E9Eo4G2yilUYmbG0Ghl2tZqrnBIzVklxtJEfnwPJFR+kclEV+fal4n1Oqn0Y8TJoTLVnqqKIbXcMswcg+ygFEKAPLi0agoDArKFSLEbeRusJiqyJGHvDRP+T/tmy2XXjydP4uNoqpFiF5mDazi1vVKm2N8OUucDR9wGuA3PgoX07zPIfYO9Ki3q8xRmMaGrRcx8shPwRuyr4sLLyJL8/EjOKWw+ReJ+PpKDhIaXqisQmQQWUxI121Eq5YMveI7evdH401HPznbXIPxOQqULGP7ADpW1a2Q1ZQl2NSwZMAGqgPbgkx8ivBXYjQh4/Qk1qlylUZ5KWLmJLRWHlbkFnU+8WrJzc+LIo/1E1VO9EGv9XF5NV2hkNMkIzZXfg20ZqM61WjQ5e44IF3HIrnh3X15gQV59jRbitOtAcEUtqnQ5ClL4OJrdP2slNNu7Z+lycO9RClMaEbDmazGg4QRNkuFW617ZOXaawg9xUwx9q49MkLjSmHqRIAJnNa0I3YIkUOoFm023IWM/isDmVJbnqy1jvCql5oDBsr91lyDKCgRnDgvgRay69uN4vSD56BIlygWcWMXrR2zEve2hXI9iz3LTwKmWvYZPZb9CjgnuHgM8NVyyympkNcV3MPqkK+J939IIpI+teVfwnVnedbHqwQOBKeeWbOvgyl5z/I85+A1+ISbRMcj+5IMnTIECjuDAfkHHEIhcCBwIM792nLUMKPPkTBdH9tHMdPvnQFP63lbrbSYkFqwGwtk6Vn7MKkbdk4i0FM2i4p03XvXipXC4wtsF/DkFCS6FLvWB0jJYC8Y+/k9viPTv2Mea+qf0G2CbPInkDJgQjp/StUNewzjM4H6BaCjCGnxtSttYWRQ8dLGI21MnwX1nKUhxY6a2vyiIJgsOzDoNQslepY0JLevbnQ6wp/BDnGkGIBijYWNXIYVwxQ5Oz3k5K8B4AbjK5umTn7p+dkehse9VatuhHlZ9OB9r8MMMgXr1xpyMI35cWtysExLQC3f/jEmmeQdQR4qwpgNJJLM7CwD5LSi1RgB3n0WVFA008tKRDEP3bCqLt1V77bY/SJqNWDRLUcnXgOsUya6KDrKfWpeGD7lpCj94NR3cVyjQwgqA7BeN9FPYImFGFWj4AAP6Zrz/rnq7EWAnH/NvOIZpyfXI5vc7xeU0LfXHMDEMC/BMsUOWwze0mt4r16woDrNYbWct4+mZDt1e7Uk0gf83s5d42wDaYgoQcSaj2/M2N4KbA/jVIZ2rS5RkQeOvaXWRmBxA9tpqEBCmWYfgAgxlUJLC887rZ94FNAmNPlf7ddFVUqNNNh7N4IkQ3avbC0YHNopPd1a2b51lBgotY/MqVfGGQqn0AGekIMHIlLVVAJPud2uqoYkYgY3xqFJZ1SNUm55DXW2b35yE5oIEvYZCbI4+MdONII+ejnfYFuLC5aCJo5sr36ZTwxvNzlV5l6gEPk27KSAUhMGHLCVGqcq5VALbQNP2Iuu1/EPYGZ71n28tiYIVvM4Y2hxXJXqg0azwGV7psBbRkjYE+j7Y8Nrn+SbIpCmfei9eIGkx1HHq3tEd9ZJXgb4myGzuCzcAEfwMHDGBkgHx9fPM0JQOFIh14ZWSxnN5TVi5Co9e7k/Hv8nxAo6JvLRRcRCyPUx+zjVVySEXfmi8v7aOpuBzYaYdtC2d7Q+BggftS5LnJAGXH2GdvVNL7TCgciZwVrw7QgK0aM2NwVmr8cRbHwRuRepjLHZlt0WLxf0JgxZpaLoRn41fc47xEtGA2f0HiODXABBcxiuh2PsCsIkHbgHBY+KP8czDsCfgBLLaoZX9PZZk1wIrP73nDFt8ckoRJg+X7LSfRumZfCm1O8EOxNOb0yTQCQoQ0BFdkeUAdv5qyKJsbDQwD0eX0lS/rwZmPd5j1awdwv06igLjb6aHHnLBqE3kwBl8sOY+F2za3RO2MhlnT3NVUSenUll9TObVGIdhYprv/SS2PZwd5gaFZDZoc70+pu0ZGbY5eONjDygCHzVAX5WFri26qGlCTtJ7WFBhk4Ueyo0uvpJ8kkJU0mLTsnraF6YUTtql+0ipzBQk7m5H/1ppweajmc5fF4grqU+rbDq49pRRk6n4Q3g5FXcTubygmTVBBVcP0Z3R+xMf9uAGRmDtiwZOC1dfgQ1mBnh+Lovslsycr7NRaW203sW/6kX/qq5HwY8hETHKYo/mj3cGMT51z39i1sdnHHoxDdj/h8dltLnQG8YX7qflno2d+euqp1h1o5bo7XEXFAen8cruhHxuBBOwPR4D6CW/aEI0hJmqHlAvJWVCf/EhblilOfixnVSFSa6N+/jYt1LegJYwbrjUVVroItgCnJ+Ku/P4RdYj2i6X0I4UXmEC9+l2TWqyGNTWDHuL6Js0bGYxiuM7uGi+UAsoTNtDkG+qe3vFmNZ1xdT+w6dfHdMS3Nqb8ndrI9fBZp0UJEFP261Mnvu8zoVHIYKGkPPlm52MQoBgfd1jsqXAuGs/wAXyD38MgYd7pKfTKdOS8pBKA4ZuXbPyZH6320gf0GrBQWHcmlLvK5Zpj39Fjm/AkUZABZ7tt4VJNJzAYrgM8ZTtAtTLq0nTeHXcip/LGFx5OvgYTUzUL3gGl8nmbDdFiRD5+a4LxPXY0D23P/FhsscGInaCX5FaTDA3/Wk2K69pI61RrMavn14yI4Vmotcy/lm7ndxkdsdFXaSjY22CTF+y+ESsYoRJgI5s8ACjPA8W7o/dXkz0X95dpba/bkwCFvzkZXkAYzFWHjq1fr45gYQVWMgdws4I0bTaR+qsOlPeTMqOCjqYINnB5GcQKnqwNs6TCWnkimdIYlgu11DdR9EyALaqNQ3rK8PGznu4yTbz3UaYFL+AwoA1aGaZyyG59iMO7Q4J5Z1rUwJevxZct5JQwr5FUUyId/HnRPez79FKdHlT+nJx48Y4dTP/V4T7AHWwFmfjdu6PHCqJE/Mj/9Zorypf4Oa09Py2v21PjLFZUs946P/iwnV4s11WnpNGTx/uvHtqWpToCVSAAo55j/RDqE8WOq45xVim5ezBeahmahcivPkVWTV8T1HC6/DuGgx5tWqDMpnR0R3KlYCAu99hmXvK7ise/wyZwV98QKEE/MdEOQ0MAVgSgM9QW0aQBsndexu14fA8ZPRGuuX8sJAOxPEnceRaS72LUa0C32lCsn0cRwLE1Ik6EshxnSry7vo9NSrbSUFWep2illyV7Y3+0YCvUPe7wkvUDoE43izOWtWeYZ006e3ZwSoeIWQy4L31OxegDULf6abIZ0QU+Ss3S4/fYrdj3NOjKr0vZlNhzKTtCiGrcEhHMozrZtH0E7luOSZko/rksxU8b28eKuQUYvGuGlhqjSQA3D5TF9LeKULNX7/2ULXuKlcLaGpGVoNjIF9pOZMiFr1Jg9l3Yan/k5rIYjaUXmdLZqzS+bxfn3biq9zerD/vnqSkDg7y0WkycaCn93Bilk6P0AR2EyMItRmRU0RDsbosWvOjBe3UKC8i419/fU7gQQNX7hrNtjk5H5yr+3bNeg84ZoNr8Dv7CuanL+GEzCvZtmDxGNFHmIcAGSNBbki1dtfxfg82e5w9P8fsfmkl4MBMD5UYI66y0yHo3wjygM/X+zjZQA/lHXjXilYmtxIjmXmPuVV59C8ZLFOYFRK0ICrLAHMh/6jdg6VeXgy7/i65qiQIaU1kv+dh9cyYiymW1N4qZCafLHkTqCKlt9d+fDiv5NrdSckV09h+jkwfnRfNyYQ4xEGkvnCWl65bQTESp6wRbVPXyFfwwW+0o93qkKg3UTr/l3D0T0q8YA+Zz2Jt7CySmfIJlgbwWBDgY1LOT8MY4D3/yLSQ+VV5YEc6t/WPs26tbhqFnhpxD0h+f1Qh2LbjXOORHDS6Qm1+mN7f50P7b6jCfaVfoaUQ8q+IaUkhsbmRYLXTtzKKaGT0PzUXnyzu7kuTvDitt8MP1/MKb/95oAAs4sWhU8r8zMa8Aip/G96fBJfe0xvSzFlxydb9p0HabC3Wsl7LfbMqq3wkcRnwjK5dNiBoO3UM+qft+1k4ASyccH7xHdAQ6BOXht4PQbM66NqbJaIHyYsSxKTWC7pziFtMxDetCQC6YjmMnOjy16vvyu78xnjBHJ/gf0/95iRDGRt/pzz//bzoNfdyZFYw6gq59m1pDRxqiUlYhkw6rHnwRJN4SY8PXeOFet8bDj/6clG2lh79pKuUgZRq79WGvTxrk5DsiwUB2SoJCA1/PlkP18rlCPabGU00uuqaujQDiWLPl3ZaLrCLO4jR8w4doI4kCpfg4O4geZjGOrzRfa4+M5fz1g5RRk7iLNcMszjj6xqkbz/r/DsyJ0rGZWuz3wgCL+dXwDPPkwNER19opvRrdOAzILTkSD4UPyVDAC9QTIOcaOoLgi7VkRdcvp1HDV61t1RYBsVAeVI4mIwovAadeJ13+XpY5YE2NME8b8gDLdH7oCKcQJnC3zQEJEddILaTjMoY4tMkDS6ccwOvS2muAI1aWLLltMdbQWzLOtTBO/RR82mJJUSJmCTM4vtUG9xHIKGhqJoWLKCHZfvftrU/8iYF/nuIOETJ2LNWS5GlKq9JsnJPnMXXVG+B572HLmB1D/q5CFrqaJddhIPIDaFsDZoETMhJvgCkqwMUC1pIryVoLmd5go4UWLnR5TqaIrODDbAfXCaWmbE4rKmTCXTosgiFz4dzEKWADIzW1yMfGmbO/1XIZlxg3fU1xQFgl41QVfR3TknmrqrhSfwn1D7EqRPqsTIfpGyVOUl5lsOaROx/lesMA4D/nmuKUgSRZmSKDalas1C7FwT+7e8FQalRnbRkr5kIkhlgYre9P2SGNZwHnhgrIO3TBJ9mieMzAdCrgWR/8IwoqlnUMul3JQOx43lNYwvgd2824d4fbY3qULvbMvnwkqR7Bg2symT1y8r/ikhAZPndKTWXyHekKATyxCgyFCzzTP7VUem6QE6+LFgTRaUFXhb7fFeQy1vM6Xu31yxx4EFyuDNipnjqFsmfWOVmrpYBPqL/snwka4NMHQYADcweF+P10hIeW8TFElJe0w57FDXTi2y/1PNJzORUV5jVMkUPlLgIijlmzZlGMWO2vpf0UDqsCf9Lr+6AQEZDMrfqoKwdQVzT/Pa62pDmHq52Q0Cqq6dD1LOJKJNd8UMp+zJaiBd63ktRjkG+SgOZfXy/q9t0jxKBaQrQASC+rWTIeUJBwOQUB9Pj2nT/DX3p1XLUFxPswy0/c055P7u5FsHb/9A4BSDSPpbqjlcY27S6Q2pRIA8m62oghaADFYEsEm1DmlILE0M6L/5ywHpT+3Rzz7nxByTIKzlYM3uqfcxravpghi/+TWJoyAsRlXTymS26AKWFhOaVJgHmdZ8sARFPREgJHuLtzSgXFFd2/FeNnfAXpyAXGhZo8Rl241JHnRbY5ZUbwTZsz4O2X7/LNt4vcbOcY1nGzHiEC/Ykj1z//1lO+LusZWZh0YpeILirs0Y+vekafErmXvAGNbzml4WUYTy6IAuk4JwZeNnMkLDRVU65tciIKBifnVO3rdlZeH3K7RvnXp0mKBHVw6Uc1BcIn0ZswSXGYkrYll3S4368TY19hE630MArD4o1fdYxHW9KF2qIwJRidiQXp5n2RKfMBN6Mgc4fzXnuEoVXKZ91pxyb/otLc8XA2+k4ZH7YRWrw3KoGEM5JIoqZwLGFfNPX3gg+m1cFBmBRB/J/KRJUaXMZIbonXlmGbcDtYfejHgQAsSp7omVzzP9ZV+8bWYH7JbJ5q4TcSM0xvIBZWz5DCd7RHP/kMIjdYkMpcCz4kAQIN/fjW+v3trgf4nrGVVd73x39KayoYQBP5h6PeqLkJL0UL7H5jDedzufcm3BtYdezFmL+wgG9rY0DpdYuZdfJ4YgjijAR/LI+W1Gm6m+kKwrxfFQptO6ZygajOsTNabXj5vTB8S4kqCra81O+BvkLIcTlUkFjmzsAlJNLKR5wc6qCCFYTKsoDeQn1Xdzu+WgiwLwT43Ovk1654shwOHxTXL2mQT1oqKo9Id0+JXUZssh2bELLbZNXOX+4Zp3gU5UEFDud+5Xg2jDQzwdY+WV1igvWkb4Oh2XFeqgOVSnIn4aAu7dYrx8JaMbMDJfzHjVW3jZhDD7RFACT2UEswjKpuQfdHy/Bj45Ks7AUh/Tpqzj+/y+nvTxkzwpsqllFiOJmV+12f/6/GyN5m10TFjb0rVjmd6yxOl9XITJ+p/KY7VDxBxQ6G7oAwARKDkm1/HA6/XZHEryIzPLDf1GeBasGBU/vdK0c3iP2lIHRC0JBwC2xLd5uRvWLi3R7E22DxmrU9/B73WUit7L9wIM+Qrc6FnfkgjCKrvi/bb6eeGsxCufAhokfKH/cvIu/w/F0BPDqdUGHY0beEv+v3raTXiXggjIRg/pwrJiU/xAUEBVeL3/fqrDJrsaumSTRJC8Sv2fwvybznvYeBEf5sEhd+0iZiteqR/1U0Q+7akwi5dylmlWu/4wD6KPH9rvKRxw3p6Dh7xKxCX7zix8G0W0bysA3gLXzPa/rgrfPKjGsQ9qMYF1Fn/7tLvqmKhIaiOXFWv8jnGOplxvzQf0M2xoBC65pUvkteFlDSD+PTpakAHfpImx0siYJlBiyjVMlT/KJpWlJ8zT8zJe4kw7dESGiFy7+pZPPidJBLcPiHKi3SloG6dzBRwEs+fubbYqZ1d04hChn2u3wVUrSLfh3UWa7G3Q0dzjmrxjR4StA5Ijq4Zhah6b236ycWYXZKrzbiSbVFgkcELkiUER4G9C+MbTHixizgJya8wzffDi5vyQQgN6jALtjkeLxStGkRde17ZJW7X/cFgoFvyDPTQHUyattFyeu2ttYvS6zWyJdjDVrHmSlCV9azpoqTK1y1uL+mLWfD6PXbQ/09u54ls5m7B7MS9TeEyXQ3mq7YRcv2I3Anb9xkZdZnaMjkaxxd2czPZ1z8v9qdzzpBLwIVhjuC8hb375o3XoO7Nj+J4O3vs6GKE789bbuaJ7NIIptNAvxpKrnbfDcv4RdkbBoYy7qfUDV/E3df3WqYqDkpcnwr4xXkhtE3rYG5G0AZtLxkLJmK6Wibmvq7oKonlT0UhaSC2uKL2jSinxGrvNpVaegjYGABnePIFOMxpXv+KnATwW+YeQY+tYrYudoJuyPJpSvmff1eTyVZnovlB7kTN36NVlm6cFhZ2halSIocYs30GfN13wOxD17rYNXLb+ScEPZrAF/EfCT/bX8d071j/n70s8JHanNJJsyFarHxB08kr46NgsAoinwJOwoxqAHrgkHrfvo+mhyEq0liSuz4124v8nFOrOhDuCksL/7eVHkq0DrUbTrisMAXUx8TR2pdy/nUiBQPjgV68VE/0QAHR8YeIF6rUlTTAF3ayXtxuqRy8jUt/RgrymaR8+2VaQjq+wOShpE87L48vM19qIZr0F3I2mu2YSpJNO1wyv2Pqa8q9NXF6Nbe2Xo8vM9jst4xfJp6eeQw8G5fn01xtENG/QHq2PNEjVVSCWVmKhQzKKAtmaFa/MstITL2WmVR5R1ZkzwSv4SMqmJOcY/sgKmNff244ci965vl1BCtWa7WSm5k4ZhlNQaXr28+qL0y1BfBfUbwkusD6hy3trWZwcGWO8k/EB6/L0Dw/BpDzrR+t1TJwcYi1EAAdJjQzp65BGxtpES+oOdvc00HYJRbUoG7PR0rfGI4i6pvAVuQ15AAul4NnyP19ChzEh0Qhx/qE36KKIfSRxyqo/M1x5Kx2UhbDac4fvDjeTn6A/NxTHJ+MVZIDf7C65wFE+deLcK8jUv6Zdinc70T/dFEZu/R2Ud46+WKJQkW/QL9LnDzTQ14o6P7o/15c/M79cqlruty1h+HYphy6l62LvioinmCnpX0v5m1fS6xC8hkC1tCV6ck9dJzG+4P4bcr0ErsZqXzmn7OlbKRLAaLkMZig02XRNm8HznvddyrLGYkxfeuRathLZA0Xdsx/x5d0COmGtmswche5T9sK6U6M6zlrkQaOcko0X1mIfJPdI97HO7Z9fcIcP/2qXa2lJ01CJgDXa2MADy6UAcL8kH5Wm+An08GWc2YZRxFxQmTpY+qYsLJ0SLfe2A1OAKffzwVxZcR7svjJvMdjjAHMAXiydXdzox366NZjzPwCiPcj8HyP1ahAKxGK7+4T0T1+SMxRfkqouBnmx3BFbD6y21xGWay+MIby35sM5Nrq0LlBSmaUEp8veuw+0HmbAbVXWPNbpvEuKFUd8UvV3Oq6g025stAMVgwDXI7YHE9gpgF5G0IbNDbrtZo9NJ+2VKEtn9rGAx54kTQzNDPXIF//mJd61P7k8FHSRDrXacm2/VCGnfDFbRHiC696mjeeJ7SMzKFIJoTk2IWVQkU0MfXYN1YcgfEosfHv9wWoIoEQUef8n0Un/zjozzkxNUtVeT/IXpaW4H2Fy8licI8cCHd3cQCEwDtJoYBVCrJiwFYDiwCngurmoQARYj8K0EOItE23VYldHVoAullHAMMg2eeOQ6Qho/HPPGnlbZMfir4Fpvvq5L/i8Naf8Epg2kED3mMjcTRKbgFKUSn3q6h96NYgge7NwIds9XWCv7o3DrVtB04YBylAnyu5ys8YqbQ0RCdZ9SK8IJcmncor6OVnKraEmitEuxNI7f8/g4LKygiDxpB7A1EJAhQJoFHraobq+nx+L/gwaJP8t5wX16z7We/YSBDZBmtLH/XaTUIqy6CPb69f8Cp3c9j7Ycs+2weDl7eYN/7Xr7InrecGcrYTyYuIO+MrpDCNV6J7oHcNErTIuoFD+AlsF1FcD6AG5sSmoDrVGO6p03KvtLYG+7ROcW6WZo7xH9L51gFovVWpBx4VQSHqYtnh3fPnliQwq+LVN+FyzxCdtgL00y6+8aAIo5fFrIxFNxDMwh/EGHNV3/W6N8yMjosnTR4gBE8zL7fCcxyuYaU1mstgtGjyZbWFAIDIZ9KkdInMDgMKRdK3719k9Ph1fo9/vcfo/29wWF4lumQvMAQ3V6rqq2fA2ajTHtkkOw5DQ9u9Lk9kBZsdzUKSp0+u8WFwAokU/ddqM0x5S0MukXU5IbnMX62bqf1vcZ02IBuWUqTBya9AMGsWSYx4DwqUWcFs2+dnuDQYiiVE6dzt6sTwR5Qe6OxSRByBkKwtgDH2jjFaC+vNrxSfLoEWI8zJaQ5QKziaQQo+QDgJNl6B6Uz8qgM74r1sCelRRPA4E6So/98oh7LLnYnvHOh+uOZhDfZRxQEDRXXiPs/7j5mEnBKAWK7ZysCFbzoZykgwzr0USPkjO1u1Akl6tNRD+oH5Z8iN3glNxacsu9QC5KzTGwxFZ9nKSMcFf+esCytpfexKJFvZmA+N4WuGHrWGmX+3h+ogQIjsBAvAMQi6lAYWJyJKxWxv4bkaN/eogjtWw2o51rwhL5DjQQh1WYAN+ODit67ftRwcma8iUip1rr68EcQmoXBCaQrnnvAEGgLPT/toE8zZ82rVSrxy3KyDJM1FQpRKN2ba06OS7+o8E7/UpyoCITPPBAw8xixO8dy5xLh9by+CsSgENbllAXWMxTw0xQyqeFjFJqg/B2yfy0Rp3C0Kd6STFgCNzwEgiiEOJDqms5BCyfbPYoDpq2XqiNjc0IhB05UXN+emVHY46Xe1nHGWSrwTF1TdqgFsYINHunqy6uPm9oLIkKlg+sDQyQkmBrhuwVK/VZSqU2RXGXAiRfw4J186Z6MBg71W9mW4ZNeQYp6udr7GsMhusOZpET4h+MILXfKohCa2wePgquBmKt+IVv1IqvzT/v7zz+AWJ9qAIG4Rpk02U40vjJ3mp7lEA/scQZ5+O+vzXM8QiWfubsds+EM9T4Twk9MXokp/MbgbT/diLal98xUj+xpcPghZchgBs0ChRxGRafggbQS77YA/MWLgcNiDpCnyfuBAYL5ejJ/TLdfMYWb2ifSm4LKGQj046oP8a5jr+78IlVKTCqfrLf3W83URuGOIn/6rfEjqcmbHxFOwDnTKnKpf0RznKtonWsoCeYy9ov+50DUg+d69TD2PSRjNiTgdEZ+mIjSr00eM5KTMymwKa3XfHIOQroAC3V8Xhm73Cect2TBj/UeOk9qFPCrtb3MqxbIxYaPucFeRCmKJpmdaBLKXk1pdOLOikn0SnWyOscY/heMmEpuraK5ptoaF0oX+c6lJf2mWxKALQCt/gFit9xffo05ONpAWTgGAxGoLAuMbGjeZbvkxINwFbdy4HlLNyfcLmWs+X3z0vS/WYY4PYMhI45QM97sccFttC8Rhtlu9NqTahAMO9eG9YqoveVsnmGneU5DEeicrwuMtcwLKMKbZmaVDtDpR3szc9czfSqhAmKlrmA+dXACosSHH4gGcmmO80rG4MAShL/vChV7i2tIwNmv2QxoAECKKwAGfWnEbfpFVjO32D/t7VOeNkIkWvD+eFthZtvlO2IgYNivxor02r3eKD/kRFHo3lYYowm8M9cbmSenZhRatrSQ5a6Jp/F5Xv/ryxcPl4f5DUayJ9hYSf2PYvRgLBq5/NCYsL6TglSOSXcPKNUZk7+16nP6uFfnHHPvFFoghYewfJrH6sb9eObhDiSPWSKa3C8kQwj4lzHShNNk8FBomAhorIMfAn/285xo26CvF5PWFtXr9dyBaQbpLIb1IGbRDQTkfOQqai3+IVaxtyKNP30DOf0ShMmNpAXZQsLYxzdjIPn3hSanTP+lR3opgZxqxBzTWSxTUHvATyduzY3C4FuH/tY/wAtxTWW616gzv12FjtCR9ovIB1K7aPgW94gxcMWf2Iz+G5O2tn+/sranPf6g89ROowFxGR1rNws0qaa/Cw74yJrfU4dwAoOY8Qw2VRV+yrRQrEbGlQrmoTe1dYTP/FWIa4E7OSVvEzogaciWdE93GyguGNAQXKxmK9xeFljb0aqlbtRVVLcP9qFpNpA81nvD2iV5VY8ruY/lU+KnETzPxYLZSp3kxnNtbAAAAmjzCQVXW+VA4LNxc531JCDTcrwwIaZ/18BvnuZQ9iddVyj3NC+MvKnE7lQIbIrbMGB27YAtb2/nNyM0uTFMq2f6MLAs7bqIn1azCm3sKvzkYHSep9/AqNlHeHTda2CrrvIfAnpJQh6oIxGAJixSsMt7x2iReUF9wWRneSvRsFkPdfSG705eEGPOewYW4qnAD/mWQUS8o9OjMw8q6XAqcntSvF8u3YQp97VUzJwbCckx0N2EG1gC+MCiwFGtbFpQFmPlQrxtiQJBn0vBbCIC2CjNL1VzwwHc+OT6o9Pr/PQXPVwZDlchuJe0QxqTJPU8SMmk5WFw92CuONUI9bBAockBhDjFsmXu9bMNLf+kA8OdOnSuwfd7ebNXzqmbd0Yl5Iq4XKNY2mArmKhtyFjq9NQOsioa7Veav0otF3dFWr8fJFJRRnSTlcRGB39cCO7ze+KD22ZyQBwziV9m3wo2amQWweVUCvFT1ZlByJmiM/qEOgsaJentUnfWIy29l9WEhiV48wKyBFAxV46akRP93BoKygQx6YAfechLVnnJIGHTWCy2/7U7Kdi5dlSaLdV2kukkBjwiIO40KEGQbvAXvrx6gUHqx0jd5y1sMxMsSEN8e3XPFj8oh2d0IYc1dieend+of3MM0mhlJzuqzvtzQZZS2wgB0Q3hzIUXEbOYPXlf66Mzgz4TY1nwUvMfATJM4Mi0L89PozQtucH9C4Gz6K1S/goMnw7soBc2zaj3BFtda2LTMp0Re46LPfUCx32a8r8L1tsUCyxL95o6Yaf8zbR5r9xoWU6iRvt2Vh7WzSQTMTgcieZnCNUPXB7B4W9KbKogWLmaWJzpNCcgkGqdtU2236GRdaMPh69UBVV46jy/AHcYv31E83AZQpZ7y9pG7R/NnkKcBpf3j94S6MNbabLZ95c74BtEmeosE8tgDRL6Q1+jA5Fge8DmpyMOm+a+VKRyl91Isph7v4d659Js6U0ILZXU+rvmJxk6TolQ45fMfxzmivVBE7b19Rc5DhPX81rDoSZDfMmq2CUJufav4HLAolNVE10gtlmv/ENfckR+Ch7NPDrDl2Lv98pQcMYN6LSthmBlBmn0IfKjG9tljANe2gCXJ4uL6ZxJdGQFu3tGmUQ+hqkDNjNFCKn2akdnD1SpGZ75yU/OQoNvUIM99gRL048CAEle5sRh7esV/kuwUGlfJAOfgVC/Or3zXbM4FmdmcvEXIGtsFLP6BJ69f+U1ruHGVKvZKIkOM8bypaVh1PEsaf8TJG3tf89Osoq458D9qMsZLVgiUyRmVQ2MmjUZieAMJOGGtU18BH6kJOgWU4R98V8Cw+CN3/ifExQ2/Sc+o+vu5hDAc+8xsdSZ1FLCMrIJMzHQna/f5DsMoFX+4CBtJTUL03aY5H9dIaxktxfKNJBlQ0C0XhsUmkzzJr9fjTvs179C0MXcncPlVgzLBydjXlw3ixjKEG4ryWwGUMhNySOro18y2JnVFgAq/Gbov9nmulIWqpr0Ki4LmSi3Zwy+K+JFJOg7ZZnZF0kNfso6C7L+TAqp4rCzA0LFLK6eYV5tpcJmoIb9NywT09k6N9CjQZ0FemY3zy06y/N/ah//+TLMP1WlNwaUkj0bS+tklGCE6lS/rNKj8MDP+1CnJzxlXrpoc+BPk5lHL2otzI+XX8w7Es4jNiKVgNs4dbF7vO1Vt9Ru0zkAvPWjLRL9b7b6jN91yVbAnWmidACGtIdPaEXN4zq+vJuHCuWbMTvk1saMe9dWMME21I/fyFlcelJkfE8rZe4BdlWtU4lKB4nip7EtgfHd1E538RtXPxyBovgR23LJukqzpxxboYzZnyLyKKZ88Zti1z6fiRaAl7yN50yEOGspZ/A3ZBdefBxICQtFg07AEghj3P/eslv+2pn9eErpgWOmGQ81Tf7Pusc8iJ016XfhBusGu6OBsFh/E09mCGmfEBwuHvVmlCrSAkSchk7LWII4bhZGCUHY+GO28yqX6iUDOvAQkrMOWMcPLJqpj8YQ/vnz8RN5wA8T3E7NruLsu+7uhvh8Qv6LI8l1VKtTZF+ijVBPfwENCChy4sSgTFupy1YBLl8bHfk+Iol70J7G8AQfLdT8vt+Mu+YHYphtxjTfYCp/mpcphQCcMzZdrRo2skauSGI/FbZny9Y/gufNeOhSSWrrqWhIk11ZKzDrJV8WycWtYwC4jUD/S5y1g6u/DvZK1IZNM9FN5r4velR8K637/smvANAA35E+8UtIk2SbeClMlw0ub2WNblfJM+a6YGu3qopgpgZIFZDv8M9F2XEQgr1ZseLG2yYgg+TbKsFoS4+fBRn+lCSwbFo/l1oQyMAz+GCCbuBT8EMJwJY43UoCRHHHAZK65Hk7btWCE/J/23UhWy9wuZHHXPm3XcqFLOmrExeOgwzv6w/YuXRqZaBWknY8woRQsEdqEdXA+pmYsatuBKxEmJWP2MIBhPsWUf/m8CtyeNWDAzkCDaJhGDPYLx9LM4tghLjqNABdtas5lj6cFqchQkLT/FIubvTlS87jCAhkb1ewtNXzGA/Wa3gB0byh30is9D2t02yAnTTe/Eu9hWknZyKfzseD2ASx7CWV8/OqzhRERL1kLrGzYf4n9YMhDA71gAIcKi+63becXYT6hPagTDzALspIU5s33DNUNO2luieNClIRrqLAuAsB1WfcYQjNJNz6Os2GeKlTw9HH10nqpVYRF2J1BFMNCWY5zyw36UKz/53cXMOH2ijhFX7RkYbYRjrPkrNJZ01oJgJVkjNbMx1Yw/LMDxEuzmN1gd0facySIJ6gkcwzan0ybCoqRvJGc0fwk2M8jpltili1sECJx9BGAfClNl9SG/yEGMA3ULexLpf4n07n2anHVkV2WdnoELx5P+CTt58OQkqsTe+OrQ5G3nP2EXQ5UwVPGpnB5GTpQULVz+qp2ytmFgmN5mla/qzkTZR0b/2draVRJoDqK9JKBe/QvURVm8RHNgRLNsupyCQNxBoEgYk5gx9CaTmo/ObHycCG/sCDqHYWvkBGAjLBENE0POYgxjOcDJrdA7UpNG1Zm9ZEizQShgMjrzF+CpNVeD123wywxJ5QDv6gemov6y+4ddFwT9S8O2w9iOQdTYl7+Nr80xficIRb26onGtDucJm5OkAiLEiPcAjKsprMCwxDE0Eo3vxheKNtXM3qaMU9FhnggOd3yw3ZatNC5Wf9JcK4IIMDYTs8vrSTuct62GffPT9La4BjH2c9LT1xBo4sroKr/ncXk4huGf6sIubd/sQO+I27GLhnMZUcraEKTkS7MBYXNONaE6ObrslUCKc3zk691/IMZ2dzzpF3ddkK/FbLC/B/l7J8/Cj6aozWb18eQreA9rx0OGn61kbRIWmJ6PBV21o2Myby8PTaYdYLu+PzHjmH0VxzaHOK6wouqr6JGpOTImQD4zuzMgUeiGIChZolL5EngpcPrQCLmY5UNrLrB//kaW9lVTAyHS5fU1eT1qqTjqYJSfVXmoBbeAd/CpMIW/zgFwSk3FAI9gto5KWGwZeUF8idx7vPPWr/A7M2hc0lptkm0Ii+eHgKUYM1JNftiEWk3eqSQzwlUp2UUYz4IqCXYgyXwBUyWdbuVvwMrFuzRmRX0LbBBQ+xK3XfsLgsdJ8WOIsG7OXGDJhqFfl32h+3aRRLyCBN9j01HT03eFp2deGZ27imxOLO2kffJijpeyCLlMXQcxAiILZDLqDYEhr7BcmeHEe+UXikC8TzNU+ckputcZ9HlonHhIdL4pbJe2tfzDpUL7hwarS2cn/0RL9sOc8Cy7pHhAEly2BWHJQxXKevg/yAnzrjSgHVCHyU8UHdeFrCVWjchvaC1OdC62E4ex+SMEX/PvkPnLd6P9pXc0mr4l+uj/JCXguReWrdzIEGLEBThN9rBnzYDlG4l2kYqtPfiUfeWOsbeBY01MvevpS0+14yDEPnsq9DzUQS04EfvzucqXJ4Ux6GtBqEEYoB+GkQukNEM0RB+sjKAT+l7ZHHJfMtXFXWNNj5NLWmIOyEQlAbz2lL1rQSCgUvibRyvYpqo4XaMyXt5pxzkVkszST2vBuD1YgB12Q8FR+iyKcDvJ+duliJhVXvZl6GrfqZm3BVxqN91WsQkL3kHFyMR4Lku+bWHBwhMX7ukDrUUx9Rh2KzaVvXtOkY1yQnEPn93lTxCqh3orjcKeyH3GDvY/DrosjcMflNntMeY9Tes+gv/wv5UnDLyYXFw5Csu8XhlBRFcNb9Ib36BWNZqSaIA2DHlWUqSexJj2tpBwQ7P1sAPNG7boM3ihm87EtVCu8WSmQz2QRinHKdNnzSGxfUYpaOOJV6p2jZxgAMjGF1pvWRu1rhV95PGePiqbzniB4KQ5+5HELasNTuvuUAoGYE0f/BgsyAzNDIMMksA3qj2kxwrGzLAq8MDlmbxNDyQ3rWp5n/oXTGcedQXPZW4o76ns5PziJfcmeoWQRzVK9Wd9Rf5ZI8vwzmGa9duXVSsy0+X6KYyYJarQmaue0yksKhWhlFXL+lUHhaSo4cAWQ8KKfvigcoc2PiHYTF8YrxbLdppCYpq93EkU0LmXd51mJI3sb0ENOfvaYIVSqb79r0X2LHOa3+UqpOofyknzb13FmXW5rQlxRrow+1ZTtULrZYwMyKXVPNOkAngE6FJ7TnC1owPtnD26QHpg6dRzCefoA4JASXXNEv5HkOQ4jpWhFyaCxkqf6z97nwIsLxg3UQ1XgI82e2dIdekUSMgJrOQ5hWW8IKM9z2nGQzxQD/sE06ajGMysd8QDdMRxhMDPFWldVAmCbkzFESi5Bq50wu0w0DxqjHcWNFqrQXQwj0a59vqSc+J/UOvKRF5IMNxutkpM7ALFB8TuUzoeDGpypshVQh+gwkoqDnMjKL/tUjdvwRYeNRxdKgWN5+1R0uiMn471Mk6pBXRDHD5AdivB6UxnfMMzzA0zrlkaGihwp6uxj3DNM5xGrZxFWV1jbqQ8EWd4xvuOnVMlXY7yeEMy6tBENA7KXwUsiEy0U1bii+dmJy352Iqfwk5R069nFyY4SdloqoGpX0heKR6B2SIh9D+jb8wgmnUFNfoAkvVHk5WkF6AUvp26GKPGIbMwkE/ETnA+97SqtefGsvEevQ6NBPW79IZASJ/6sIZVLL1ptkQOqdQ+bkYg8ODYgn8YAdTjTUHXV5c3zyNfziOaHa+5KDA0xoZ6SpKXw7yUrtS6EVxFjiINqCtAMulKzbNdAK660ALZzSUZn9hpNH5WjFEuD7WvPTz/cD6zb4KiVDpJorcI/wnzkmqFTWDdWRTastzG1qhiR0gTKM631RWQb1oxQT/HAq7k9bfRvf77aJ7XtjO+L3q/sGKa0EsxHmpVHfvgfJTFMFQpZnprJdXau4XSA58eo29yqNjz+wCcieRfY4jRbqNcbxqTnZWfmRFWa6Y+ksAeOIHs96Crgc8+XtfrhuD/iL+ccdvSYfPkXHyAC9hu3SO1FKUB2OghrNSRfKQXcyNwjXFLrbAWYpEd/vy1y4gD3Lv15cWa5bqZy76xAklmjvTcSSVXtZ7OnBNgc2YjrAdwVjhR5Zt+/bmsirXoISuARuvLhWDvnvMfVI3P5hv65fhO0mGbrZR8z/Nv2iQgir3gmOBa1vXBhFIMvz6/K5d7nJPzRAhSH9IHQgbFqYi1p2VBiIIiDxql6GT/VuznZ/tGkyVpKejGCTgQCSftM+2m3eV9/MFFA1gjxMB5bPhXw/jsM3YXeTZuwCwM0I4wnVbGqYFwEeKbknrYC42ij78FlxOSo13BpI4CC5aMraVCUNcm3CnpghjAMl1nsAqlJ10jLZPUv7fbDDWiCRUJu5sVhWSTf7nfaY1W0Epvt+/wLdmiVTBkU+FEzDP2Atp/tgDtAVf+wzO3zK6/pJ7hUgG4XUg2crzxTqOYhqJXs6dTL11NirxQSJQv3TqK9LW9KVgohIz4swUnqq/7r+ZLM2Lk2YDY/OmUeeNlI6E2A+AutuloZfy1QH4MCwQfId83seVAGZS5BiVJEcbSA6blvFcE/2X6mJFWfhpRmVhYsjllBAGRbcnFrsB1VjYKmxNer3hOy0b4Sz2bP0ffitCUDgMFfRwrbx5NBmEVNJFXfZsmYMLzsRfvhoXayTAxKxYPOc0optGmEqHMIeoRT5kxVfpOGgWu3ZL9RoiTvpBjanPb0FVN/8I5NVa1Kc2U/sdMJQouuAi+JVjYPao11KpgITcoGYTyhHvSY4o23W4v0X9VdooNWVb5rG35kCcwFZVzdj+sD/bRa4FCBabDUQL4NvsI8HD7BhrYbBNEbZwjF65uAFSgnpQiY4dSbDG3eE+roHHFTh2d9/YW1GXnBxPbBQDTXDxjtCKk4/b6PlltBeRFw7kheNxrau+Jf1KwMTSJT6hp/qgrdibwM6gDUY2hT0O/togLSzjV0DJkhy0FWhYcwJ+qKummDpH1LbbXWwgMK050I3moeu5SJRLpeGZWUQRz/qnzJOq7kAm/4E9SLVsATCV84wN8JdQ8Bd6cV+sBoGR30McBkZ6nt1FkQDweVz/BXnce30mNw4RldPTLXDFcUDWP7FfGTCQrGQpDAt9WBp7exfrnnCbl3bpQsqigUwmYnl7oDWtgvIQBOQfGxU92pbM5o78ccJQDxjs1N5KGSlfBmPAXq61Mqtr71Mtcq5b75yQ4KMZ+JMR7Ul9352+Bt/7kpwoYB87JLN+gOEK4FRgsRYBVCLK/rxLjhU2cCt6C9mc2JaUzAYNZrBK1xzDMkuHwyRiz3BJFpYwS0Pi0fVNjfCLW81d8ue9WUiu81w+kko5DmEcwxbFi0QQKpAw68QbORJ0J1Zl1FwGWUtdEVRKWF51Gz0yO8VazSrqHJKC+NSevISYCQDzt0hhxWIDY2Cx4u+Cfg/oSxQRBUV8MmJ9tH2jm8fkkQYAHv+cM4GNg+uOzOou4+GdoPfg32Y0EjSV8f5uS72shnPae1Bw7CtIwHrHfilp9IiE6WvZmhmLyMT7Gj/EqVBsv8VDUmbVJlz0grPAFT0b97qV1Y2gB7oDObnqFmrQRZfCIjtQeiCTINX+VhZ7ZjpmjAbC3aPaMSQ0LAavbs1wcQD4jLqBtjLhAdAhtUdnPYixUaoWxcBMSRVuXl+R3vYl47r0CeIHr5CHIooq3Lad3mi83410t/WSWauP2cs6WBZGL/knjr4XyVM0DUn/rLhjPcrz0e1w+LyC2nUt7SUHYHuPV+Sa9IAFwI5xQCaYIRGj0WXbwYa79bwdsRl1vz75nkDm0WnrwIz/1KnZUABPISEON96pK49wcE58AonOoIJE6R8GY9tj7BBxLzIgxpgC61BgjYW74+d9VeOJTk91NXy3y8reZ5xWLH1FS3QlZWMrMVRb8utIeelfHRuF68Z5KwXnfZ/o/jpJcrzzN1oW5n96R0g9RUfqDPelcOE24BebhMwRtYXsrbl78TW8ArcXDHvMdjWMDhryUt5pIuFba56u47ZKS4cr62imoEJShpBIqqexGcnznOZkM1By4Z73nRtdib4viLFLGQOWDOXr2j/2vvQivPUWyimhSXHG6WEkXF7fDjsjeQBvhtYROGD5ls68vPu9vLmhag4DgAl6PplXUK+iWG2PwcSABDmoBWy3fyOsdWvkLV0Xkmx66CjwzxOqH5d4ejyw64VnuCx/LJbHfaIVgRzGBylkay2whLCuXS1w41s1YbaXvlYOOm8VMo+bj73JcFRJkAVICzcuxxw9MqN2R+eQeeVhekoBCGZaWd/2UDyqLcoaWksi3nYt37s7kEWxX0TR7xYYL3k8qPA/c/9F49J123E1bqeyYSPoQ1rU94WqUNgLrbiLOy/YtR5j0dIjZk/u/5U2f9jaUMKNgRVgXyZfWXOAyEkaYMDCuKkDAGn5cDSVYTkBe+aW0WGhtg2qoYooD3dOeDxxv9YwVI1BfpRrK7JPwHsvFFia4jpN7xMN/8KQR4ViupCx47ep5gTeyKgPNsvCfKCHUV9uYW7Tx6xHrmVmtUgjaJATwtV2jyhiLGTxK0xZxfuD/WM04R3hRD2J79+CZPfnj2BUzVzPV4N+M3SaR8i6AJyVDjD/xqK1eakd7wJIYbMP7mFsyfrEdwQjZgPqnlrO/usxREwTYKPhk+TgYmNONQJoic+M0LI1ac2uS8nwNvitetCXtkHAzrZNeVOrw1R+yRohH6Qt7K3mDu03GKdSrDPBejbvKS0aixRpgexpbyLMaAYOPICvj++LffcI017PnteJW8T3qaoBU73qaredaMW/cmkHJcrBVStMDrWC5b8/6YUVyQ0Lwl1R862f+uQTgxhPQrKWkjkxaEok4rHyeVpWQphG9Oh2ZIvMqLG80K+lgaQe4plD9dhCHtZnnA6K1TfYfQjfQjHFAINJV8yog9iWcWCaXmHTVEqeR1R46MNjyha6abW0JPCWwipIFIkcDfYQ1vvOna+TJYJACjeHSAgIHFoqqDPEH3XaNCTMohFKmE4E104YXyAnfUs2L6MhhThpdBOOASzNTL6wQAK9DShYGsMq+76UnBvZyuLA0WUAegpc05Y+pLSCsZ4IfmfKc/5fyTFjp+hk2OTBqnIrhpvceWsIrD21Nb/dchOPFfYca1U+FDO3m+26wf5bGFA3Dwg/+RiYDLgWZp1acKsJiDY/dJIBo08gM1PCHmjhBsq+FFZxhB+g9iOE5Q0WP3fNJosPDUBZdheTGzXsFZb9uBmjCaz9+S0ucNNWkvQbhBhO348Qt2mG1tJsvHPDJRCKzNv3LTyLxPSK5qmgEIhQdkXW8mzY/nckyjWdQJ5mGsH4sLyIe+GHUXKHaLanBeFlVy1f8y0Jxb1rvwybXVxnkcQ4hdZ0xg2oVa80sfkzYxHRwCsEzm1uwmTbvrOoaPJOHjtXr6m+NNW/icPu7cXAU5Z3AkQKkvcY7pDZ9QaHmMzbPUoQRp84cHZVE0EPsKqfOFFgvbsnkA6RyYAb0CQJF8e5J+kcMOWAmzPX21S8GVIwFFi2hSef9ETp5Y1oBXKG3qCwIk+lojw+VkcPriXji2vtI1cpd1oVvWANTDKrrWHImWx934fckGh+8MotchQ2EVoVpLChZxEsgxIXsyFzMRsrxcbQG7q+8GHZ8aoNXhEoeabunorK/2J9bwjmt/6+PbsQxm0FyE+e2dlklGSiA6EhLd951X8mH4/blSzZbCVUbGJWqmeV7ZgxPfd37oRx08hmMGxfTBSyM4h9kNk4dHvhl0kxNxkhsbjZc/BKlhpVt5P7NH2mMFke8ssgkgfLM77rqSkEhJu1sRsUPe4OBZJ0uaJLdjmkxIucoDAvYEpXFozg/4OvHh9HJXdtTPLYsV4M7re9M0JPkcIH/jt3of3ZDImVZRSLjoOifaFKGtv05QhmrEmKza8hLr7AYXHYscGM+S3jBHxMqQY0HMW1HM9UyEmcgaXyBgcANlhuCCdzWj9ncv+1b4vhrweYrew8Uaf+miPYfTvuUkgAZlv3Zqmct5m2J2M6YXx6XFxbwBVGo5Uh3hTleOgwmNcznweNuBXgvdeRXV/7PLBo8rohHwfB4mu7zDxcqofjBErZtvdagY6l2aNSc+o/9Qj8V18lT2QuipHJH9PYoiCzVF8cIhp3/YRF2Yl25jTzKiYWHQTDEjQLX1hXHue39Zdq6P8gNEZX2WdjshQgZHMc8ycXKREZlKOfsGEsCHysBsArXnYwj8Uf4ni7IKTEn9hZ5qPlWJSSWxxDkKCMpH0y0vDYgyJDXTkwfjFYWYM5h5aa7uCr7a2PQbvywuguwuGKe1iqdiXXw8hZCj1i7cw+IR2E5K/7Cu32aQkf0G2g7urxXaimZ9zkQMcGCYWlRG9IToS4cKXuvobdGFkHkth18ICTbgahQD9/RxM8BbY2R251fjfUXZMZo2wZnIjYjkMnhZe7Xfat2gpZun00hJibwCQZyqDKO5s6W/pg7cO1K6AYtdC6WyEj7ALVZIYNnpqWuMwEeeOO8oIj8RpDrBmqspauI92ONlKqLJuKxsNXbuVrvn1GuAUus4x38gDKwtq/Wh4lXKsWG4HSwxrn+dnOvmFmyas6cVmvWxudZdkz8PdKfGZylXkrZQRea75zYH7vD4RKNPRV99sp4kjJkUa+PGJM5o0EkLx8tBHK9Prkvu5q3xie2OKgMJiwzuwNfUgnvA+kAUF1iFLFC50FdZJDJgVx00udy+CdNjy0hO67WTFi3HktRSgEGDI9Ko7OSEmy6hxC+Z2BfwgSB3+PY+qY/gH+5ZSaSnxhy1wgOwtSvGE/GJFJZWV2cqjyfIEB1F4cXTAWhEaPIdJd43QbcDdY3x/2t8etPXoknq0uI05uwJTT1LiJkE3lpVbEN+lhqrh2F6Q2v4oGlLKJGPR5r9u1pS7GYAUe4zvRW9y4uFFphTUQyg9Yx6yuTitmUMNTZMgHQ/prWx6Ryq2nhXYeJu5XymqKI+fzeZlQ6ewngR9ovzV6x0eGpYcrq6biweJ2STVxmNYN5haM+DWG3XlbGY6z75zu9iOCPfrXgtCTD+GBoiF31biceA44Yh2eDjEG3P7Kl1aMDzoyvdweHGs6sMAbXqsUvOsidVwS7mS4GFXHla+451dHdQhZGA5pFI0K3e28Uqp0fL87Rr2FdqzunOJN+YGavk2qFs6D7zHVA3cvVHlMsnax6dIYDU4RGwS+BG98VF16xtEA+IAjzKS79biSAe5Zmo21T1TqrAl/HfUEX1oht4c4L5za8lTaGA5cULpzl2txP4Ftdm9vWynE5UVVrH6vDjo/MpHHA+Po3KDWzEjUhdhuafHfouCe4A2fTGC8cLGTw6I2xJT3cwVybmNSm4vH1T5YQ1ST7EJ1rUmr2AbFYIB/b8BxL9L/Xsf7a8RWtFwnOz8V9ls6za4kynxzpGPcxLT+cxSiNYUbsBE4+vD+PoJJWPLpkfqsLvDu1PHS7U/yV/dAbEAdEFtqL9q0ZPnEXEEt+NkPplgMxLGBh3dOIQBrCeaNiQtjIfSe3k4h76hcre37ZG+/w0bnrv7SdTv+eUaiv2b0oBgRGz4yrrMJwQtqd5HEnn5iTxb6dgO4ttiawQgimoY7lZCkibauTWBshQlkl1XxUteEpAbpqEpJH5elJOPmi7Sty+5/2VJJw7XgI5zAgqZDLa7ij02c/hXaMMSjUHFUlPNjX17jjUMdHCNUZKH3tcMx3uH8Ee61d/boQ/LuLLSs5Sxh2iwGXMHQ59tTr1eTycdwaY+kUtzxLjhFpWV0CQgGaUE8NOg7aPmYC5fX2oKoZC0DE4Ka8zkU162Ik4d9FupqaW2738wX3QlsvEmICgIHYH2MLu240aqtcQEL8F8xpt1o1eqpH5iMAwywDjl0rB8EysYEU14tYqeBh/5A2Ni1zgYFh4hOM3BtCul/0S4USbv5MDX+ozQrOn2BIR38Gzfco9bChroD41BxAGeNtFcPVkVJV20v/DNNUFDxQ8nxHtflm7qAEnKcbc6tld3xfA05IJEwox03nsh9YwmAu50BdOxWmBXPIsofvXSCUHR4SkqT6PK0yx9mxfcuEofnZvnq6Cl8sS70CvBm+FL494DiNChdW9ilmZDtiwOLXdleOcdcCf0FGR1eV7DbcKE2ucOP4fpDgKIK1Hsq6bbStBcaoKsRoRz2eiPG44M/MdxM7SuJbIjPOxFLXsiGbJKZ5nW9EhhBXaI7XYZg3LyWaLZptabMnPW3912+D+2eb1tgc/0kBSKnkJOUFOgplnZs0eWs2KsUsyAqBIXRJCEgWaEblGJMSe+PH25vgqE0jhowQzA1K5XHmgib9OysZNDOjcU6Rxok3NBIp1z4+7yPlJklzj2JZ/ggikbNTw7TEt52oJY26+3Ls2iH5OR8Q0j9h1Di742FbirzQP5Yf3Y0K07y4ciWdgRPvQz9PXq8Eja+LD8TfijpoAD3bR77znxaPqUbjFD18D/WKGIQ6oOC43hHJGOG/+PImTQGUFMJHUVOMMNM5a7DW0qT0afPkW5u8D6OP1H9NqkWsqPdKvP7mUqzaKfFI/VaIdAUiLqBPCVb72Rgi8dYTSP2sh68YMB2Z0tMFhlJO4LCpbMkulC/fBR+9DskSGDxowugKuupUIfl+oq0gAlTf1wDmFQQP5bwsz+JJmo3wwi27awGfb1mzsFqWwzLxXucj7o/Ldg6Ffy/krJ2h2uZRLorJtS9RtymudiysngT4J6CsM+FKIAZaV60bPSvzlZme8zTKagtYcyh03kdoREX3Cq6i6tX4sjcYsWRhjVC+oE6zT1z+BTAbdJzNbwIgAGCb2gFX3ILQcvQZZNMlWSD/l5PrCRbeOAAUKuzFyVtS+9sRNa05DtlTAn7V3j4sgLlMNChXs+j2b2qPdsdfVjgY+SzxZZSqlbqTvsLI1BM5zV+Xb3OB62DPeu30yUP8QkN5uMBZg2WN7ABQr+fis//7yk2j4hRHZbwlcFLDUeFBVkImHiO7QymeonOyEsrBWSaIfjc9F8vCJfPuuawk/kw+lbxtQgkuJW2k1CqBde5poQvLob2wenJCHg0eKiv1cC1zUfHzGT8rafLeZ1yBrAxd3JvzkCvH5HBt/xUnOa9RBfgmF1c8/N0uNZ/VTlyIjfFlSYg8JA8pFhdYwtO5GqzTu/XtHtI4YQ3kB7b6/VMJIbKsggT1lewe3yH+pSKfcFcFofe2a5zKWyN0zM1r8LfE8N0eIfhulwtQ3HP6u3OGUteVFfIhCQ7wB00lv46IQsib/1AXucFQYnTbye+4Yjx2DlyC5Q3GyMoPfZlBcRv0czTRaCyFr+6EUrnWJVrpSUoiy5TifUjRLKUvMAoJsUDDMQcJ+plHDEpcMkjEhBifu5MKJ4ulvEidOj2ULPmSXe1GYdeVPF6MYN5rZQ45EHr8GQtuKCEbHiPZwEX92gBE3NXyegLuD8+QCoiE2ATzZQZk2COfEqHckkUdPc2JoxZa1TDpLd3XODGkOyS6k+fHJgNYzp8KprTFn/uoT6hwfnvho+QNwX1UeFeMx0i5B1lEYhxaPS1Rk+QsU1UPfqAWeRMq1v3w3aY8aCfylE+jNm/TnoUT0KAedWIHYo0gWgpTZsq0+FNhu59ZYWwuwIN7QaEf9V5PX7l7wuhuaTwlnvqehd529u3NApMdMLIkab6gMiv+HR2gWsVb+lIbRJmD4BNijAREq7rZ+5sPOzAsIPp/QAITYdTgNfTjUQh+Do2/qtM0yH1BoOzrs3ozBBdfI9b7lyTW/ChZ5f+oawuoPSabHmyoamfdT01yNxDF3w6HhfgM2I0Gc4dD2VyV0XFrcCUwhOR0DrNWJPKkdmjcuZ8qVfCo9jZmvFs9B+H/Fy9w6v44MKeuSPqJcI7WCSMbejWHf0yw5tR/zzg9wQgBD4+9Tb8b2JVp10x0gnyPxf/dxt4ELD69dmDWMopcOi5xh68Xqej6P1TiO26xfNwEEZwyjnf+OomAPm9QtnjNBaY/qmsJ2lIYTZUlfdCKwhDo1liC2N8HXk9JWo2W9Dxz7fBJPIA9SLZtxrVKbwJVPTMVcs0u8+cdOotcdA5bd4YqhhPPXsbHd8cM7yWdWWGYaNMSbLe/S3nS7yGOzC3Pcp0beTOKa3AIjj9SEXrFTT3ZCN/CUfjnUJFqtq4U8tgyZvvNQlDwSGkJhZFjcDFsKQJAXeKM96wUltPStkU2GxRP6Rp0S8nuWgDamA567aQzZgA6eYjyShk0UV8ASCCjDL8i7U3joInaT4RiTKpFFjU6QLrMooVhReCvqpnWJeXWuwZNCorCDvwh/9/+N8MSlx7huEZbA9kcIyqILSeHZkZiNxBv7srcMzJ9OSkWe0lpq1L1fW+QVxLQ/nRLqOfCMPTPAzx9hxxHtqklpf8EV7UQ28KRQLD+l9ozCtSUUl9tdM4HcIefeiXYdvTsJXzjL6ZzROy3LWtwSCAwpq06PVNjWRL0EU0p1/10xvZsUM8I3iZNg6BF/lGPKNT+/2Nr+xOYj7j27B2av3ZQEGg1/UmenRrqrRwWHf9AUUcN0Xa7vbcrp/FFt/eL6Wh6+dVoKL2BQZQcohZ6K+Y0nNWz0R0AADsxvLVKg/GAwlDA1cU9GoUuf0B3g7FhZa1KE6BKBidWjzV7+tunUsdXSrS16xcKhTCi6R3wLrG5e5RoAQpL4N2E7LnO0sBbicZsenUCwjCgRDrG8dtwwmNr1fxTFSYl9aZdJvGYVvszP9dm9rEgxEhXUiKJLFOveqiPUcSGlsDQR99k3UFROAAAA=',
    jupiter: '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',
    mercury: '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',
    pluto: 'UklGRiQyAABXRUJQVlA4IBgyAABw4gCdASoAAgABPmEskkckIiGjJhRKgIAMCWluUMtWL5PDW/Q5o+XMai+M3smwZxc/nmzqrxmg+mTrAeQBvLs5c8gweaptl/WuQQN758fYXCZhefnfXb6HZ1/7flv+A8COsvv/4C+FXdIbL5kd9fhvplf8P1DPJo/5PLZ9y+wUQc9bzYg02lomhMj8Y+F31CHZXdqClXz4puptVC0oRkVdqs/NZ0Oq052bl4OwqiRWZB+G+h1ZcLkHR++qxFqA5kLa1STVi7WtFrpAgEnsUBiTDuF0DqEHZhj95biEBviGb9wItRHu+H3AXc7tEdyql+pJMUWdkvner6lpG7eBl7PyzWewERWZAGaqYn22g9lpP87faipr2AL+BRFfNKeQ8obAHykG9OafAGddBdklID2Un6hXYRHYzIaBM7cdIPMo/4NS+eoQh1iNXG4B+ss656sBhtyzJcPK4e2Lbn3szk3bFPP2t/PbDop8rMOni5haKoFVycXXEo9fzai9bx+E9kaUFswsA2cSJrlvRQWGArEve9+zSq25/T/GbLC2jLdOpWU+srRFYXTNC+LlQUKEe4aWFnJus3loR33et2uDVU6Uy8x4DDaIoQ0Y1GBgOrKxrCy1MjMlGt42eFtXCkUWOFdrkEBbeLtjM9Skbjy3mVOsn1xB+mSZlEuE8FWkrMrYg66p41if4PYQO82kHIVE9FuV5GyhcsXxnrLmUiddEF04NJFOQf7rXA2l7tI5ublQ/VPkPnNLYyjxMMX2hG2pfqdG29KZIQqzyEm3uzFlzyrNj4kGgAz8xFESZXfd79of+tqBXY85uDEH/82wdyChVadoipMyfMeP46ZfgGJwTaw7T2tDzzQJ2959nTYlDLdr6yocv2loIkTQogCkG2XkfwtzxLTJQZCIHeC6hDkwLgvncbn1kQA8eQKGIGT79lbjJoJtbk75uLTQwnXk+iPuthakC/YQmjC+BYQlb1u89ysJbAhYUPFJfPlp0GloR/3VzD9E8mVK4NRQ8UewzSY7ixk9t36pTiMH0J/cxgJcqnaddvCEvGMY1ORHxcNFNRv32lzT46So6+DAYZ5C8cR9JKIIM0xG4EBJ/M0N8jfGcn796TecGYGL5XpBIvMI+5psKkNRu/zDqVs/iqyJ6tDOw/QJYnXulwZ2L6+nJUcgh4XZtcBbZ2rJsWvZu11GqhwjnmukxVxv6JJmRDIs0D88AHzvcC6Py6jOw5cpneZX9gE4nyMuCDL7FzGGQNd3AuHBEkcVgSPq4TPFQ1U4hYDknoMFjy6MROAlXcEfMNzIIZNsgX/4VzVcSxEb95hMzEv3WxDyKwHsbsE08xbUepCL5R2WitmOjYlE8501zSn7vtqtCjMYvW+k3DkdhNGzqejhZK7rdAwHHKK+roJqnRVCH73tv/Gwa/tEjhJa1weDkFWgCaJ4JHq0bCnikd4RpjBys86PdFfQQu9NYVXOONxSw0h5DXLtnZttMWGk1zb68hl0HRbR3UtVqsq5AnDO6jMKBLVOB78SKVeyW6slMSTJCUo42ZUK06mo0l2TQBtM9Y+UoZFGPwlsAYq2c6j/OgbQV0y7ktHTLK/SyM0H1eTA/qX3qy8eG8bD6X7CPXWBQOtLBUQKqMR4euK/oIXolstFW3UyToiEhkgUp4LrGy5aL19EQX/wdHzJuyRgjEeC7E6m1ToaD55lUKWLL0FMUlvlFjF+YY+Pi8DLRL9jsTIdRvM5i/eot5NaEQERH51TcDhXL0VmeMzf2uLVYLnK9ne3MreNwgJwCluxuBsXMRi6+7x9v7VXYfhtO28pTB746ZgHSkOTQxGg+yqQXmGYK9/DU68LPg7+kjBj+PASPcleIXckYpOvAf+cZgnIHXOMVlcbEKaFDnmolgzAzw40v984yJkdtmiLrgK/HDwUM7tRQsV4oCJ4Gpkuc2hyWTTXxrUHJfO+DTeE1tMxjDhbM7HS2dbj5y/FiBtxWYzP95tmW+RA7O00dqj1qdOvcHDwXBLMvjzFAOxE5VzMLfdtn0CDomtqL1HQu4mFh1E7SxMrJ3y/EjqNWkMAikqP+rr1SW9tHh7bZPhNiHb6iTFceusXLOQ9zBVAAVBvw1FgklhsCLh8Y3oh4OM7wW+6a3IJhrW5kZLmo0iUb2NQhY0tZnudJFslLfuEeGnnq4OpHY1voxuCCQAKA4IQ7UTONfrm2CKJGTsMCMn5r/ZzerOfcZpc8qxcw5cTy5Suwi6OnlHMMZegcO0V+B82VOUCw9Aw5uQWCiH9AEiZ69amqYeXBolfWAPveXR5U2lvqbA5rPbNOWpqFUh8jGSg47iLPyRiz3Yrzlc8uRbTD8T1LJTrCLEHfo5/4Sg5loFM9OWIyBRatDOCgI4Sg5loFM9OaAEg79HP/CUHMtApnpzQAkHfo5/4Sg5loFM9OaAEg78cAAD+j90BzoZNjzCnwrQ/ZfkTZZNOUkT/yOtFn3UsbyaagBHTifdrEBof8FdwVqKzkNsE0KlR1x5r6E9as/iAYhADPvjkfltEDtd57mOyK5dMeYzDFjG+cnnO5vvAybqoYPoL4tnJtY/s+rujQUM+hEdhm3vFfLSmdTC4IP+OdXkRuzCqecEkYHDKsUR8GcIHfFSVatQSc/1sobBx2x9//7xfDQoVsmp9AvXauBhYafuideaxPVlWguGuvFYwIqqYXVE+xbd3sCm6xfFZQmjwJeR82njuOd20PYgmATw3Gb0HaEog8wy76Mb465sofgzQlNKhFsTAdQ2vplCX4kc4k+SpW3m94e1o8zwxS6BefLKqdIV7eu5B+3ABSrwD/hzMUKGmgDV5W3DmaO5acvtua1sCCcHCtfwwMgT9wapcNfpjvIj53yc1yX4r+EPTUszkhO7Ptya24O1dqpFM7mYFROCRddWZxzolryqwTLKTpMDsiITwYzIH6ZbK1J8LyacpGJdxXkrSf7DoKEU2ougcVUNYrdYsjwUqUedxWteF1Xb3NjrFTVaiMITSRINEVLeitZVoDpZsrzwIXjr7Pvv6gRyX/qirb3ZAxbDsqD6HP1EovvJeduvsnJUyEtKIMja8cdC6/PRlPHAM55PMKfyFis701UCiZIdTpVWf+U4sl7aheYYWxicbiOPMv1DzwA1G1KitwRBzB/egaFX4eUmOtvptEnAo8s2/zeydkVs0+mkBiiBfVOxeja3YgmWa7H91FkeWTKZP7ZxJvf/ftbhSEWHD0TH6qY9JDGB6sQb3qpVNNk4RNBDsexXNkTl83OZ/6lYFz2xREp+U7MN/KbpnLxv9fuqQOUO2132wq9VqTmrh/sO4mB6OFF6z0R3RIDjwNStn5A8BGfTzfgFJxRdqKeu0q/Wt4q6j52jWM/viVfZ6vZ6jQ0atmLG6TcmldPJ0szsxcduiqCFq0wMkiz7lzFAmjA2bOEi8nr4egP11wwUVJNEhd9XHUNZu//KUAC3TkXLNy1CtkDFdEIzT3ntjK6uPfzAkvNPjBs5Z+9g/cwGUl2Bc82gZlzBlymaMI6UyVoBDZ3MQg/FHBNEx5yC4WD65I382FhL/QesXuZ+W8Cs0eMDc7oK/MjXnT3q8BYZsrHGQBt+3LBfRtO/uPtahW+Ql3K9LWWeh7VLcTaR4gXIoDJ9GyzM6voN49pHfg4lTLQEbKufSSwqB4wxQPjUCbFXWAtTPT3OfJSAFzSV/uiLC/M4t7QbufmGHd7ve90g6Yld6nGN1sglfrAF7F8mqQWZ93Nl3S50W6C+T8B+lQSy6qaRg7xeFGSS1fQaSjYKhYKmXstbjHpooqIPvOnisJCUNpEY8s147VeDxiqd5pgAO1grLU1DqMvLXbLoW8WytelaM1Srq+iO9nlRwTTBdxHzSA+pEfNSL5TbOoZcvhwWITorIpGyatU0uHIx23bjSmTESRzse+PqjSP7N0ePf/OGqfVVL/uVkrQNt+pLuYqVdOtEm9bO450V+DUuTzIfyUso1D+2RK2TiafTt2Z/q7RbRpTjD3ZGbmwAw+xUrlFsWm9vzEI8DAbSPVGrn3EDdohffYSto3TmfjP5+MDCcRufLlG9bj4JU20KE2q9ecdzDWlzbvpohQm8OmHqXbuhb07zQ3+HG6i/UOXyTdF9N3sZe3s4vhYCIfr5RaReJ9kQZdiGGixZEJEaTPHn2JQaQEbLQ6bwuMjcDgNnfAdxnD1cKggkUY5SDr8fRgk4dJrzhRvaS7XMt2mTwudejQU3p25fJUVCErS2IptZ/gh277uzzputzCUP1LSMs3TVHt0QCQ3mLm8/+rROc8LDz15ENLtF12bmWqYwX6Q8UxS5+oKgFY7g/029tzwregCBm4T7tRxiWlXVzm+nCWYqPDnpWGz73BwunX+PqnLVBBwHbODkjT+BgVMWrzcsVBBdiJXsQ/oKWpzhaTQYlDA7d/CHTX+68LtV1F/3nqWS4ZWkNlL0IIfL9PkznlA75xoeSbK+VKwwkfpBrkTYLZmSibyS1QbPZxYuxl2Jt/0tArMDcLVxiHWxvLMac7oAsrfrcOhzTy7jJFGjj3iebd9YJZ2R3ymuVpBoetTcdpD89gC/XBJSy+qMehWqPUCZ6HQMRUf6VcBDfZcYazv2ku9Mc9bumYYGP3oNYTZJbMwFmFOZGzB9WKhDdL+KXClT22m+aszA+a3dp/0XtLy8wtPN3rqcsaxH26va0YqZpwZt+lNtWIl/2VTqgPFCH9NPzKX/TkOGveu7HYX0hNNFcQHrfWDkk4rQrmCOF86R8KwWOq3VPi7Hz1lNZwORCTxQmJDsW/gffGv6jet0zzlAVKO3i6N1FcfFny3g3yWqDiycppKSc7omBsG7XQgn+zYiU/m7QztO/nLRNGi2ZMUftm6bHNBxHnSuatN2Eb4y5nzpG8BkQphVSN4xpfoHCXXIAElb8CbiHR/CVHiOr4Rs23ah+W68v7FlkpiYcmqRjqMS2L4MYVw+vMdCDqTbHL0yuZkHTm3oZMzHkh67mfxUdKMppmbiD6oftynDIXZpXtYaeJFexa0Lzr4q35t6S2K3VHzCTbdb2ijyzjb17GybSp4eK1swAzldg5NLRQnjBdacpf+3a4/koqQkKcIV/4uZpSjZAfOrzRnmFZXUHwEUaSUfP+G9F/C8fTSzrDJ5Fsq4UDttMBRS3W5KwH79IJhR3AM6EcenLMppjc2LagrFGNtwUNX6cBOwhULT9RzRKuMR9KfRWvtTFm7C32w0Z7MCNL1KdBqLq5tOnHzEu/53N3ycD0mfqMAe63M2EuCh4H10QAp6glMtWc9V8zvdyTMkvoXMop/UVnC0psEZ/Kvt4qTXRASRigs/kJIAKzsPX+4RAUDxR/i8yG1AUv0RgU2JoOVv2ggUmMKi+jU7YRCPAxkCgjqS1prQJXFc6FjeIGc0onJey9S2sw7cDODj4N7va5BRP33qgwMLd3QLJ29GakXtAzvx2uywqa8zyu2U1B42sZpkIr39DCzK1TGM02iACaKdpKNZedti5gbR6SjVw1PXZbGc7GK59WapOVq/lM2YmHUDL7s3+eigBBUIM+npIRmXVFoMVZbxbRFqhSyiHSvlBQBixLOy9SfaBc9Ouh+v7iaCY3qbDhOM9HVzMXoUosGRm6MJByXnB07PdS+8pG4KbklZoBvcPaNIurwN8OgBs22LYEm4esP2D4j5Q1ZYsqP+6hTRE3FjblEmbLdbRb1BTUXBDVB94A1Vk1GbEBMbnbAjO06sU0B89EEkCtuMCvHD+KSjwLpm7P1jOqPd7qbbmcfUFS/6UnzSz6sgFUSVB4BRIGy0EUbEJMa/SwftkrgXfDdPYsgz+D94dHKBBwlPxus7p3sugz2DDNZchuHRX+OpB8HIhYctUOtniW2sHBaZIcJ4zoRk3F7GkS8Vsl8qtcegXeaT6YF4btDq1GySHW3XaZMbg0QPclHfFm2CHpx9EfITkf7l90cZ+4p3rxRkIZWArtztfaVUHDx6xeLlnBEEAu1nBpvEuFEn1TQd+D7zmci7MAJQDnGFluratUDKKZ2mAXv9QwRFR7V45Ar7gJjiQPgBCzLPwR80ZjkrlCbAwZZJIaRqo4ESFiA8auqMNaTDkyyF2E5NtYOn6qz/pL22YOlZDrKXBj9SVJCgNcj2TKfRkH/0OWLF4XKmM6DPY6AgKcySesysthDdereqsHHcREylm12yZzHwqQk6Kf27r6Pz0D/zNo9nxvqBkVFB1g5iEdt+voVGmdt3Jr8zbTDgkCQWoGB6QS3oj5g43/1HeunAVhXbcpYJ+6jUGiH85ZT7/jaGicvhzTeYVrM6zY7FPj/Mei58+K1YV7jImGw5W2MyqJnqom2umHtOiFiuSn44gV09/uNlcHJBWjOrMXpCll3n6kHzGIfheB45v+XgFJLt98HMnwWgs+lWKMIWCcEvMMw8BTdV/WQ0bYtDvWvKwO1N/mkK1paRaTki4KQu0yGvxOsj8caTuI13/UMjV6osuRx3SF336A4cY9M+hsM14NG3EawaAsa0fAIB8WdF5NaV8Kfm0X3j2EqPpy+5ZR0vWNSJQTrR4QKz7akY1lXBTTlKaohqgb8bftzSAvlnJhuDRjDBtqAGfLpLGfFPAC0ZaewY5yz7RnNADl9cr0qj4xlbP6ZeewP9mXTHaP+uRI3aCeH//IHhX8nddlOIKSbPKvOrWXVSNmalWYP9z9xOMnpgSf4eex7dZvx8sYHfKDKZf1RZ1nFdbhkhKnFJNLmLnXsrnYkiLg803fqdY6nktbtG2XQcd9QBRiB87+58+pLFP04MyQDjwH3RhaQZm6+4DIg1NkCzFcv5F+BPWOKV25BN7IX0BMdRqBmihu0coIB7l4rTbPail+bKaExm0EwcPIrKnmRxqMD1F/Zs2RkvTrnQlyWJ6wtyCilgDgbkQODX8Sd8LteATq9twx2wUACKmM0iWfS9M/XIG29lOEacp0hn9lns+m3NMLw45fDgEXNHwr+Ya7rin+qSvPv5j5PwcgOxDqIj4mCKLL6a5g1+nQlzlInt2mpBtIG0FpAxBMCrjflm+rs+6D0LhJt5MTx2ZofM3tNqFZDCFNWSzyJaqNYydKzsRT9g43ukuvYiuZHGqH76Jn1b4LkCXiYcl6o78xLPZ8hzYerMH5v1aUUAyCFZQAhkY+CZUCuvA9zY2ze/4H90mvbNNnH1LKWLgCGXeg6QmcUBrQGiAOzKt4wgCk2Zzl/jZcg9dHmfQBYOC5nUmAfDCOU1283tJdBtDD2EbMxL7QeJ0OBUPFB/Z0ly49FuKZ4manfH6T4TF0tawK0iKb0qUU4q882nuZTGjp29T++LBiBh0Fx6ksP7rkj6RD5t6TV0XAM61A97mBHnK33AuCtAct+M1wCS3y5sRNxq11lU73bvRaCzR1UgF55l5c353VuO9JSvr5lbC9L8UrbNM7ylBGiXOalPpsoNhhESbBYzT/EcA0hXkYMAqf9Srs7Vp6FnwvIu57XSnyYnzmEXAvRhrVJnKcfQs/QAczk2EflcKl8lqemyGJc2C8MtpenhLbVnBsG/QvJY0VFODRS9+GNJ8PidtY3y/hpg7gIfPwHIapw+W/CIai1PVsoYtQnLVtaoTlBYgvDoC8fRFCO/2puTRUvCMzJyoAKYqlgnIhwRJ4WVIdi7Uuy7ezmR3YDSnQyKLncGpV66mJk8mayCMXOt6Ff6Lig4AiZpgEWeI/WkGVKUsSQu7J1lS4dCYmE8oE7DIsn3eC6gUw1WQhns8EkUy26bOVhgPIJwY22/5oHeT6LsbjtU+ssxf926cQwoKuiTszGjoazs/9uz6w4uY5LEzPu7nunyfoPfgb+2KZ/4DeZTyZgrPCBnbmuN8/GX1xidOjNdzi26rj214klvQ/ZYM4VuSFj9MM69tHQz9vVQpFL298LEABbgbv+BhAQnJcV3MlUiL6NVp+ULC7T+xfITNtHtzrKJmO5Rs5WDn7ykMhNw7O67AsaGPNyt0CFPd+1j9XSR3vjZr82qRO+JoJLTjNeUfOVqpnd96RIY4u9PXFgpPf5iX/IKrY0ejOcPG7XmDxZ+p6g2FH+M8DhXM42CNCgpHHDJz+lh0zhi/5F+Khi093v0uEADRkKBNkuL3G2CxbMxL2YhPOze4sRwpjY3w37qgyhwFGwL9EH7W57z6WfiwFu+JSfqldrf3a5a9yOeJ8k2A3U7vkHanD9yBRYqWkMan5w5mzk6z5CrLBlF1XyOZGgtX7PFktxiFGdBmJw+snXgV3CY2MGLZ61R0g9Vx4N2TpKlUSrEeKxQuk8XFQh2zGFkyBiJQuVM54PgM1yvUlkGB5eAzDum1OlZg0BqjSPaS+1e5KnIGgmoRvEWO+InwXPrnAkZFswd49mMac4lai9g6CezB1EFKc1wDXoZGGGreUlLPNNCf3QBpROkr1vIKYcdDFr+GQ9G+tRxCd8yNIvvSRvjiEiAPsidYwh7sm3RrkQyfyZVlcSi6UiucW27Dwf7ht3g0leDGPTjdJMK2oXy/rcaxtU5qkrfnZUUluWSH7zwmQrQiJ8l8FhF20K4ZDWl5N8m5UnyTyuLpZs6Myloj+PZNbK4jUzCK9jIwne0GODqslsjUPxfrsw12ClUWDRQ6LGSYbKgRs4ePIXOpWWMnY65P21kz8ElJdrbsU6rsvZMIUda0fSXRaI26f5GJXyRnydNPearvJ3vhdciz/Et2YwPxn3WScsFuiA6SqBr2Zw+n2utpQ9zCZ79BQiEAjSDrgdYJrjce87/Vy7Jmg6vwVfvrWbvXBfmUkGrXyQeH525FtD+JymhXEXsBfciaRWDlnMVZnIC3eTVFKw7JEaHIzhVFEzijhIB3Q9Zp4SuOLRhg9PqJ8dKmPdTQbHuYkzaN2FosWC71dvyekt+Sko+2NITd1du1tgobGHfHFJMKpKtoNUF4zvYQXhSFlWYYPjmLu8661XsvgvIWImpxNrWJPPm0UUIpEw+ugsO9oXU7dGIwhNsHDHxDhCAKlK78GJpA2+f0Guydx3D4TJGWVM2o20RUDQpYN5TxQLPn6K6y/yXGyomK4oxSjL4vdkWTJgDNRUpYt5MqutB5w9sGI7JGySD4g/psIl2nwDkhjMJmXJ576rNIVI+2C/e0A2DM3yzZFYc/IAZO8RXiW2Noys1DSPFPjaTJmQ/y0s84v7RkGm3MHltfQgAXPYPpMgtShZ7Nf52rx+vXW/qaF3yRq22ZfcSIvmlpTJEdDbo+X7j+tuoJxG7NSJUyuBHK7Vp2TDnnJDHoIPAoUK98/MCNMGUyM+joI1PeZYxx77MBMq2EFjWRozipbL5x5eIv78ADgTcR0qvluI1sbVHNAjzDYsfc7yrYF+jxQtwmertW636OMv1ePmlzDPUg3id6mzkA/Op1euWGM7ZWeWik1GryxgvQ7X2CEKubGVbOrmTYGGw/kbiAhDqxCB94l49IIzrMN28gkMvto7GiS3kXG4OzR+RbYWuJd9zMKQ3cbqazqOLAK/57jVxfg4BSDm5f93iaz4/WadU3IOdQKLhPeghtjZK3sFxPMAAUv8DOt2+Npsj15iWvBHgxH5JSqpSau9dj0hP5grJEKYiYV1XsMSHAhsQdv2ArVYJgiMnO8kpUUOfm1Y8vCcJYw6wuq1omXWpIKx6KgsYaTjGnmGn1EmAGUeUt1J1WibHwdhGawAxgPNkN97nOzUR1dhMV+Hz3yyvVGkOHgZHkiuBuCpGQ6PMQDs37nVRuVG4InbfWEZpt/Y/kvFcyRXhJfrxR5HaB1Q28Xd62bxQ6TFsTVaThx67tFUoiPPkpQR5zIFh8rfTyHBamkEtssNzVwQgQRjI1My+nEqhtID4k0oI9UhBwYUZIXfNZOYRO74ayLR41SQpq3WGuXWjHLZNsGbE3FTG34W5ozH2cgTC7nIsTRZu+MLNvk86QticsXxtHLSwxXll+GjxayvOEducKN0PxbIL+oFJ2V7MmEyXrnXUL4EReDcWdVlBaksifeBSkSLdZXmFg0rdzGcmG4wn5uCWLUVU8EEEnrkPiEsL6jKJvukR9rsB4eBRx1sHRNmE4O8JQeSF+L6uGt6JrkyJgnlMxdtt7D6nQ2CN5d9Upr6PK1lZupZ38MlzLuU4GyQMhup11fRetC9/Slj3Q7un9Skw4Hj1TrLtJsOjo0Z1/PxMassnodecrgF/IaMiurncu3j+P8/E1pi6KxX3eaVtohPiAhnlLhdOUHAqeOvOeeL90GtLy/Q2OFhN8LDiKGfX+sJlz+0UqxAyK45+sjlcFoC01+KnPfCeN25MqeJnaiSq0YcfkDUCe0/U7PgmgZRAR/6SVQGxX5ZKlVVdEgXlpknTj6v6sSqKhxk654qc1nOXofh/PR+YI0n78+ZOJ8WcWcr/RahHt0FqpR2rGMgn656vgM19+/Bq5eRtgNWV77XohH0kFLGQR83ZD885Z6C8Li4uhKROyvQpRUCzCipIj7vOXZ01ENvDA6CA4SdtbE9bcUR30ZXuk4g1/ksa5Yf0v8U9ULpCdk0W2h6ZSgpXdmeelkjVC/p11P2cWc1fGUQ9ImOCqBK5yO09LOzg8J62Vx5JUq3byk/EmzcqqjgMAVJST/CloJ6vBZGwfTkpJ/d8LZ3dk8GzGki5hkClxP8A4rY8n1VuugK/GLcnOYbwb60hMl035WTjUW57hBo75ptq/Mvol56g9hIwvw2IBVZeuo+Ihsz9qTuPUZ+M8my9sel29+I+k2FretByyww5zMjqD7UQvcoGPXirSTmONO7PdJbMbo41zm4dQ/QYYJ6qC63kqHEklZu/isW3/2CLdF/rztjJpMe1IUE+rMAVeuivs2gBNaw2Xn7OeRw9vT+orBF6f5XanvAbz8MITZ1OihLPFnJEC1kibneFgE/yDw2zsxqqx5WflFUPNo4xhaPTASp2gc+F0Z9xweS3E+C6s45S1RkM4ga9mssctbUGsW9Xh9codXCI4QLOZ6FgwRVIrDQbuCcY9vFL5br1leWm6DWkCIiY56wM4o93UZzq79XQg0GqNisYr6CmUDYlqcTzhjVA5fEEaoyMo79iyeISXuAnFS2AK2W0Mqwro29Bhx4HvYgxTCMie0rauulmxXixvMAe04mYCVJMdL86hMDBCKpGR10zgMFBTNmXA51xI58y7Nskf74QBGoVsKOW7JaxeKH/T3FgMZ97QtFZr97Z6VXT2/xcQOEzYSff+FMIR0BuoYLvASpxNh0z8bUgy45nP9bpjqg+XbYvqeDE4lbrfRL/0F/NEjsYZv526+27jMB+np0PzYrIhus8fPYrpYjJA8GvSxwigDHgBxPVrVlqBNQsxEzIEayCRc9hWpspW9tbCLwJphIx814Zj4AC6yNHxJuaPr8dTzYQIIiPxgmmP2tgO285jLq1UQrn5SJtKwi7jNsi4Qyj2d4KF2sKEVdAVYLJ+X0KuIe9PjQsb/hcjQ6+sCqlLjKWt40PosS3C3AxbfzWeMhr0vr2iD/OQ8uJ2/AYSjCP6QnKEU+yOmt4XnMe1Dyz4W7tsiD5PZtj2zn0zm7GKs2PNqI0StLOWrRqN1Vaqiogh+h8RIDx96rfzV3HjCQ57lsLqd9z4TTAhL7M3KTEgDLCdq3rBCtzAJSu3NohHvwQ5gGTkmN3agpfIE3EY5ngmp9k+WqMP5ZiTB5M5HE1epVqx+dTtoA9x2nmdYVnIA4e1SUC8hghFMG1tUlE65N1Fk0A8CbN+7uPFWLw1jHImhVvCkuBgo/bL+WScC5NwxrdFPepNbHTFayV0FVXEdsOuTZNIPFe0W1T7gp7AnDOY97HrZLRAnWCdqLW0VgZ/T3koQtTDNEBfaEa7h2ta5O3s8VtMnbE/d3Yj4p0DTwJZAMgMHb+9JF2vaFW5JIcV06oYllhdlPJARDVnTHN26meEObQnuwkfqKO/KpHaSFO4Ji1DJTloFY3tE2v3UggZkuGHVS3nlG1WIgIV3U28+tsadwJA9dB2EjgLMS5uc7sEb5TjYxljF3rUQLbseyMJKsXuh3WO509ZcIYXp/v+IXm41eXlWtLmXEUD2dmPgP8cI/QkNPQVGM7p2V8nvZnbjAUvsSjVWeicfVVZnevtrBRwqbhm+fsgwqzgXh3E87ARUshQFDAtkG/+qK54dEzQtLPKcsHKKdDEfD8Bovf+0wXE2UhkfX3G14nf04K0yUwVs2mZimB9NLgkq41/BdTpqENb0tfqsaXd74lsjsSz8Bkamt2irMlWPLWFgX7n3eiIc4YH7oE4L0kl80t5ONtiZpuTLZvOHnmgSq8idgQ6o3Sfj9OoxrZhTg+H9nL5EbFqeViJZsobBRyvWCiQztwoLfk6sakoTyUCA7ANnzXoEARiOtcvRS+rU6gdxXyBN63n8lVx1R1/X8itCD+n5qf6ug9mLzxAM0nkwS9dBfskIpZkGoqBMEl+xcyBEACzgfNbug+6tjXPRgSv6xEADMFUd3nwOrRpHPQe3l8dDMhXZvuocOiLFfRFFLxVPZi6SLgUJg4aQMdZaaMwDteIVa7TV6OsAw51v+rR7BGT/9matX97MWDkeRJh2bua5JFd+kCprTfd1GkA9D/vaxMvP43NGBg3K99yoFHQTzJe2tc0lYjv4lXIgHsPqeUhBGoZhT2UULRkrM72EBvnf27SsPKEa1GXfSeM0VrCcNPX3eEteBJtidH7j5Ef0n38KEWcFHVqvTigTfdFgUP8jZm94Ibt+9oedRKdq/Rb9Mc6MIwN1VEpyptvVavfRZlPTejR1x0iHzbMkLtmBGEWn366lmTTa9HAti1W9lDwDFubXPpzc0hQY3/kFXgfhK4QTYFzrHW78Gd4zlrdbnQhr3ikwhgm155/hNgOWOpXo7IfoXTjYdhvPwXIZgQeXa7So6lU/eFZ+ZUCEQ9ebo3qP3sDeflPGgsPUekAf5jNbJoDGORUs0GHGKUIu3NSpTtesALuI8Q4MbrhyEQ9bXUP0bWb3pjgRSYynYfCyyUF1++ToS9JPR7aLDbgLGAggLRoflomcvsux3QUCuA4Iw05Y1pCRXSiYhmAWTgMeR9jILPW+VkHZHBju8n0ztkzvtkb3Gz+Ykr4k0AqKAQl1ckBcm2v5IJGK2mvCYgDu6cVJUmAyaDA8QsesYkgtaFiyPI9+SRj4xC9fLUvqhSn0GmhvHEumPZoATrVlXas03IDXwGnUmj475FXduKZWJHCn4IdDh0BJFT9tOUvslqkl/Ifv91/ZTKSzpMH7fB8mu+NYzYb0JkTZoAbnrIG5ytPGppuszylzY3zYCAVUkTgQUvvFzkIe2GV7GV/oeElk+klKOIEVuQlhdn2s/AdtiXxLqA98dnc6AIOLKVVJi5IiNO3B0FadjnY2W9y6ATg3UH5kgaz0CnYv72zkNN0LNuYZChw74haqcb6DinIt/6ctkeCfllncKBwR2G8tffqOS6IdqPXPtZIG5fZiZSxXUgiAbb6jrONdxl+WEqh2TT0DZi+u9fX3Vhg12wrqCdpvtEJyds3qNIfm4ck7IrrxzcuvK3mRSBuWlmR0pXi0v96On2gDeiE1f6+uLB6+HZBK8t0Kq3/+t1nT3GNdkvVTZMqUtMRG7N29cPf0yK8D++w4vOiJqn/pgjwKkxyRoQ1RSoyu+xqYftiGg0Cm9BwD6uSXosHcSUUQ9fqVUwgvrlaovqIt5bqGrLJrhaAImpQFjvpAlTkvax7i/wT2+io19teXch/ruIHSCmcjf/onW2YGXAqOX3O/A6+zxgsyJga2jNTeO25mteJMe7Fb6sxcwsa3lEUwRzZ+4cfeQLgJ1J5z3WpVfzwSEreLY74hC3I4EhbJj63W3HoxCP4MuGPr+yHW544P0UPS1l9Once++cR4pRU+u2nYoXQ+9sB63CGDu3rY2XU6L+NoYMlOgFUee1JKizUt0NkZYCQceWYhVcIKc5BA5dXKU7tDgvs3iLuk1fGb9IsjX5NwKd47WkGvq6QH2Nuga/+v/6SvI2aiXMdleA3IPx5mGoulF56mQ/H7swIAWnkU9F2wOiglSZUiIFzgjCaKgEVGJgf8UMv6k4W+1yzqCr15ebij8b+WgA8q9HaSej7ATL7R4bnuiayiXeQLw0w0CkZa+Z0D/Pv8cepVvyrLu35PySBgbOwn9s1KPAqcUMgMeW4B28UyjWJTFSbyyiJHIkPXN1G0tLvk62k8V9EXiirXyc4pA5+I3PBfpssEHgmkfwiRYmBDqLbjg9O0BsJkS+WRCaQA0/nLq9cXh9YxqvZiCiba3ZZOJUGsfSGkhZg7nD3XP7xvAfcCUvXRXdkwwhGlZeIQvsK9a0WN+FufsVQgacW0ALRiDebw0zKRDfVUCZ7Yqtlhb2BXjsX4Zl9vtC+YdG2Hrbmf+QbzV39uh6wG2NQZDUD9oCyBXUm2TUEswS+uKj37+mpHNtKdr3YFUfnOk3aKf+fph7nhD4rFWe93yktJFacBor4MJS5C4vH4txWRM2/P58LJMBQxO3a6FM/fOb3dKzKncywbj4RJ4XB8MxlvOT6IRZppaAAgSd8N6ZHjST58rQAOQz5WnuryW07nplfafJq+IT6qLdPWk3hQCRZ+p+xPLxMpKY0P1TwgemZH8YnnJUKBOmD4TS8yFOjE6wDHNoedu5+eeejBA8z+2roX1vimOER0rNWB5o17T02Q1vPsvOOTDL7A4dCnLRUyBhOwqVC2GbiAVVFZqKXTSisb3hXBsQAQzLMsl3PghpITVfGulXZQpmHBq4azpEdWdNzqlNJPtADJ0HLBCtn43kraiCllMuuHQDL8pTSa7TXJ5zhVLw93BJC3508VsV7khArLocK2/YeGRjQWvdXghBGGxXauWrJKA0tUjWGCEG5CeoBjQ8mcurvmMYIOUGOkva9ov0RPYJwAE5wD3vpSZB7ej3gestqmG+eH9MeU3HnRm1/31RyFKDBst83tjEjVsOwUWNohMziXcoINWtBjBxO/cPCI09hJbtAEqEVFXXk0cp4zy106VXEwAICtTxDWfzuE8ma3H13mR/Fb25SnrORRaPCdyXtGv6h3Pe/kwIVzx91muWdXgyYZWsSEUupTcQFr454b6yH0gIcXhJ+BjplsWHkxZzPkRrWceCMs2xCNzKlmi84tri0BuLSOMye+uVvYogBKcNQEqs8VBpUXPDn47Cf0BRGr1+TI1NXf8OowczqHBnMysg/ecaA3Abzq/QDjNYpn8phFqnzGhS9TqQhZw2nAFlWmZEqUtcdGhpwDWqSnKLCXZtA9Q7Is2r72uYV+JllOUBb198QRo6iqsrLkoOaKVvO+OmWgxp9n5ko134sopCqKn72eVxfXtEfIJ9ZvsvzLSt1u17js1YE1RAadjC7jweECq43R1qqgadQiMZCIJ9R04TkATRtIDlat399qCz/MewfS/29T8jCcz+z0zjnscIHjK117d3YscqQiHyUBKRQZVUyANmgtELEe+dMq9mC1jV3FA0lARmlc+UNU2L18D4gPyyj+OGzYYTMGQv7getcOwwBWY0Og27kEBVaSRK323VaAvFrIWraPK90pXamDttkmmmlW1uk3H7LHDBdJfuKLLtKyhvW3pZ7wdAlNYwJWnzEUmK+b1FPDVVFY6HWcFvp/3eyekhQitbg0prijJVmMTHIxCdj+QEiHY9tpEy7OsBvJOQ0it2DQr550J9MJYEmkV+EtMUYTBFZ7nLVn0oIHhiELoWvkMYW91NPdaQpMdT2tbeTYKNn2gKvuLJio5G36vk4LbjCMaTHJg2QOvLV7w1HMihRa+/AmobGKFowS7/Opinm+x6toM5tDdbhQlhlUzCCD2eLZ9NfjtlGR7mw3P0vnPt/SmqfEUEfZ2LdatDKkfrOAg9AFIiTh11NYj48kamkODjgbcY1nxN/mGcubnKjlM96IQzcL80kNmIWpzZWQBJrwxvfnMyiDL4RRxXo+Ouhl0MmLB/1VCpH2w2N39WhuEC9JgJlMJjHl7bJoBtAeyvJtbZzlZE1qoq/6KKHstxVT/kdK0v0MYLAfyappfiHqzqblJRsjBtvDgQgOqgBpwfcEDECbkOsWL1n2f7IyS1XAymTJev+uPztZkvHlfjyk11Ez28pvoBPhLRtnmbAWdgVGEsiZRQn0/7G/FBt2siD8c27hEE0N3PYnahs2xDJDGfD+YFqPjWi7RPYSuNwijfnPZcc0vi3qvR6+fIT961gTAg5vkMKlOwYtptRwyzAP2IKNsAhRUMvVEEgBj9QX1zlx443a7nMSPp3/b+BKV8TaAo3nHn8JTas51jj7ZLdjeugt1bVwK3KqyOrnbzBVJ8qYTxSkIBdCTk6p53VSLEi4gnhEiWYhhZxWGaybdyjkoMCE+CB9FLf0EMM4xF1bo0nzAsz+3ZVdwFTg2vdx2OGebD1VRAVoGsk28e6q/VjNERZKcjOrOJ/BFZ64ubM6GRuH/JAYhGCgAAAAAAADAioCeJvuug5gW5dZhgAYFgzSnabnuwMCCKTmCmKJbFZUX9DAWxUbtS9k2AcHbVy7u2IGwpWZ1uXmBZysp/KuPOfT4K/Jb5NWcQRr0AbJNmD1x4u8t0NySoDwtTOrOn067zh15f/Jv2HEbKq9TTizE+5MsDQuUWCufCt5q6Eq2BsWSsnKpCYP4nV0pMEu+LmynR9OsT2OBLtuKq3o1IyG1tUFD/ANK7AA2yaRSZCg0RqQaiylfE81DJrIFgnSXT2u4tR0FCd81nBKJb+rXpGGSKCKo23dRQCqoegbXQpczlNNOFH60oBG0KkkMk77oTP0Q9zlyGTNIMJlcjziWwlLU8tBwkzsSvRNkTRJCxPeC/iBtYryHjJ0zdY1LvBHngwUfHQsKtpV81eIPIQ5bfiOhAiArxQFFVC2ICZYOSEov9r+KHSDSWiXCAAASZqYNoAAAAAAAAAAGe5uaxdqcr8rz5KHT0AweYyqNAdHBOYpIx1qjWnp/HumVqjhb684Z+vx4ITv9Z1MNLIys2xU1FmalKkrKOc51JwHM2Y3DkjiggRdy4BF1Oz110nGv7j942B77VszhPIEZAAfrJs+nH32PgbefKU4kg+zMW58X/sHmCXRtCiYx2BpJNjvOJpHH9A+hznF7oUtBof1wAAAAAAAAAAAAkAAVyVQdpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    io: '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',
    europa: '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',
    ganymede: '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',
    callisto: 'UklGRlAwAABXRUJQVlA4IEQwAABwAgGdASoAAgABPmEskkakIqGjKNUqoIAMCWlqVJSaHNLzMzpXQxL69uTr3+8hFY2PJDBGOEiEcBqg/Xico+Ov9a/3WToM14mbMvzT3w9qnAf8H4M/mcQmkJ7yWPn0pk2OOH/s9DF/5ecz7m9hQtNZDFF+ZAuBHdSE0P9Qt2e8n2WfXUaSfqulxICE+EMSH10OA+9tuPVX4nq4Fo5CgYhB72dTS6A4ZInniTwcqeIrpTG8JcMUjm7NKHlQ1PijyVx13rN2DFsoxHdeaLLUhRc/3gwZPxoSmC1fbawAUP79cizllS4Ru6zbkv/hKbh/9TImpMvnYmCw0LgR7Se11q5uRHWIIQp2Zzia3n7T2STWDPUWx0i0Vx6e4wkhl1pcKcUDrbuB4bD5wiL77mghoS2gES+Yup4eSZn9ynFp5X/X5Hv2nz1FQspB5EK+nS5u1Qn/asO1VzzkEYifqkpgdoDKKAFHr8Bf8wRA2HAcQc9XSivynPMITTdC/jsQomGEt6BbPaDeGWD/WDuLCdcJnp9r1Kt21N/6l2OkhhziJE6XESbNCVr6e27PAQeOh8bHEKJUMDooar5XcM/Q/5ChwipRDZPFii4iX/ebe7tc6PlT6EsTxzUJuze5DM625bRcomDbotdBFiGA3960Y2MrRxg7MIm/Urh6HBuuPU0UuoC8ANLqjB8WJ1RoL57q7vszD++aS1Stfdc3hMBoDxJdAzRl0DjpIgPG5V7w0+SWySVCP0FpYJZo4T8qTbPqgJJyWluFd7Kcpcgb/+1AatG33hsue1d5JeivpoNZctXwFy8iayT/CpYNL6Jpjao/o583s3RvA2B1/7k8+pOs9zezZ0HqYCUXam42rsFglOJkm5T1w8T6ObzmloKPgROCXuIupcUEtvNazYWAJdR1E33b86FZ8VXrG8M5nKfjdjO9eAjEdhja4Rnk2Jy4xKvvEY9jzBIIHw9Wt1grCaob4PvC/0NnpdOsOKVOYAmHm4DgCx+olSVoHKyHrwO0xcdIkeqHGkLrtF+4P47GK+xVgHSB4PnVKSSqGVDCgl3OMLqdwTyXHZgsHnylcO8ISyImgCLJKpVq2I2WjNd43bR4qkf7U2eXcZ0cEEtBmg2Rs7NqGUUREVCKYxy+B3/UXvFR6fbQ4ekMriWNPEB6Y7Fc/7UhqeeX/IQuwdvPWY7FFC+cHtfies7c27YbjEF1rNp4J0WShE6jF1Ro9PDX/cVJWgCtovjPDWw7zaS1HIuwYfQN6qJfADvpfX/ugkPm/JOzEYMJ8qx9kzq9NvO/9Ce7O81Muy1h+DdBJaQsYMBTu/N1ZfU4JSfsTtmQHjmOgT0wdkmAKNQRMpTxqSIIXb8/+8KqWhukW9Z3UGSEgZV1L/F9B66eMauPFVkfqgneJ/+HE0U8NFpDSj2iKC4vqxPpAODpdehQkknqoSs9nUB3v4NnwL31iUxqH0/r8nCixuxvhRt9wcAX1SoS4vr0o9jAtnWt4sRHyD+RbqKef6m5g0rJGI/5ojUi3rYY6JWvZfNLI8yb5JywNepnp6Vj7zXHMNkSVQC1OImLoN02eU+88DCZobZJX894mZalY/jRJwce/zAVfYnP4tGQGmYVrl7/wrSXwgpvzMz/70R2e+GXRogMmitYJhS/Szs5XDSVnmViuQDOGPzyhCIv8RrxAKNwuXHLgrrlLujT8NzOdL2L/5WZyud6Jpr7XmBnLTv88n6kOVPhlOztzWXbn4Xm6IJBJaSc47NGfcTszL/L4cyr9ruv/lVNROO9PjNR0stVr2GLfY2jsUrBzQQpL0RtJdlnvEkRKZj6S66gtwfbFYESLI9WDMCT0y0uQGIOrRdPdth30ob1YWIN1XIDbcpW9H5xzELFkDgO0mjFX78QIDhILIhF2BHa1vDch8Km0klrz8RK0y9HXhXg/m5ommb+2YWmPHhXNTdTl0Oy3jWa2PcQBNkM75hFxHd/9huFLNUql+4ORPuDrizMU19uDsD8u8B1vLpg1rLUET32W84bAXGlSl1eJg15hOiZmKYcVfAQ9KB6BBGq7Mlp5HxQi2xxE+rFkRHDonQj+cdKtj68a6/yS8ETL6uZyRqsZ5WlH4VCgblYre8aMAW8tXG0cuF87aaUQveMz5iXB1niJFo/QsthK+WxwYqVaIhe2FvUCJzh4c0Cbbl5UYbHirqGgnFZ8VjaytRUB0Z/P3dkx/6qqQRpsLhEoXdakQ/ZxdSj1LdcasK3beA7D87RmfVNNk1GI2UqHNqy+z8j7X+zILx8FJgTTXHoil7NnjdKu4ouWSsGBUoYA1GXwtEz3tvV/H9RbiPwXS0qXyEBWUAshSIFkOcNGetrrHXNSQXz9kpw9FvYlnTngDfvUcTdF6rdO3y9pJZkOVFg7hmN5pBs2+1dP2OvftFzRSEFVoRaav7ioQvOPXC55s5/bgpl/enaUNhtkCIDTHLiu/FCzr4/4Y0sGaYwIQzO3geGgBOk6v6L98OHC0UxWk9ZZBPV3XNTL2irvkngWLhUjs1bq6kkY3gUf7xAGbtSUl34lUHsfrjqaW7qw5jCEm/e8KQ0XH7C/fsQrt8bJfb8JGg17OJgL5nC4USnzIRu9jMZXZ4rbzAJHOL+g+OOgoXBrKlMqlL7GSNtUUU4KWpD/NF+QNl1IZ2pfsm25nKIUP3Ztf/Mk2Ml7L2PTHZfPFvOqdO8ZhGEK5WWXS7SVVXQkFHBU84zOpA6W+flx/ees5ZPxL+Hf4Cl3CxtbZim8fOkHBOX0tssl2ANT2ZnW6QA/tgTkJTIlPih8m1Vgzua+Bc2cqOzrilTB/Sib+S+W69jLGi7CX17e2b2n41Sy9rgADq9z7dwkFE6nLuGZXhrg9WAqPFvV+dYislrZc8/T0hediUAgSyK8nt108G0tRgsBlFvMDpe+CwErYJKBgLkPpW1MkK9itCcHQnOLEzkJoSr7XzKDKEBrd1gr2q8NaBXzLC5NfKwwesFgUw7iySkMstOQ8rGI8VyEY5JuUuCvVd80OjuHbHyVZG9DvSWs70PR4wnpQfmsvQtSG6fbj2NWXhXk1qrxryVYZh5b3o90GTW2TqN6LZKz/qROXYxtNLsBBfDX9gY2feN0j3pPB2/N3zMVX9PASsvEElHfcsz0cc8qRmznoivd2Yo225fM/vqk2XmrojwCO1UUGAtPUvDlx3GhpEG6I/+8wV0h03YBcx0fWiio55ncsGoPsY0fPYUU+n2s8qcdl1pOpr2nlOIXq5fgvL19l5koxxHaYI2zYZm0dzbVSUGgg6oLrpwXUQ6ZMhxOfymb0GCjRj7RYFrM1EHiMFyWnTzHbnCQ7jKcgtRsCiniRiWKSZoGimziIlh2OhQhWqDcVjDT9jI2NhshRQKcgbz9pY7kJpK4KqyDeCPysotAIjoigdb7Xt+3dEWHTwv7uuEJTqJpkrcpUfnlvMDr6Sqjm3ufxGcCw6ZOzxM53186cNaua9/lGR/poBdvBtZ3ktKdaGdX0mkpJOS9neZmv/LHBchK322lOncnamFODqNEaCdrHiS2iBqyfzAnBy53Ch4Z5/O1cYUFakPBpSNowxcnjEmncTZTameqFI1pPVoyGGCTndOQiB2Yfzmem+KvSl2VJRzFRtgp6mxCerYOCH/B0s6A4kRlYOYoAfuDDoI9flSaz7dPB0/0rjftZFdwNBa30bxoqKNWiftz7234WAt7J9v1LsLWLfvvi6Kp2BdZgMyyv4m/Yx5JzlDy1weHzp+ne5zaD2lfQhCKVhF0cDMmQbpvtfzZyUswe+pGTT3HyxvLlcJM00BFU3/LZWjksE4fbXIQOkMwuZB/PwzG8N37v3CpDsvvQRuF32PP/f5KH0U5qRDRQinKQ4hWB8zVEWsIT4dxBkJyRSLHDz8p3KMyXwr3U/kFdNxBEz/ADaWcD10SplnxdymTR0m+xMxwXWzCNG870HGIlzLbTST77tw4JQ0HO9VcYqT33Ji+dGKe9WY7nig/HH5PIy+JfWd/IvnvvzseTDwEJ0y/8+zkSkJzAVI8RFO4ki3IEX1+6Yc3t6fd3vUjYcYKIpFNZ61tWpopKgOB8DCK3pFWrI3Du2WErzX4x8jYMbt3mJWG6j5NfjLfEP7c309hu50WUY1/SIDOuA6NNdjbN9WFXODYoySUR1nenZ4TG1/+lyAXAvsP0sIFpciaYAZepW8ZLlVrmZBhFHdGyOrKMfoMCh/a5PZ2mAzxNHzUG5U7qb1G83S/IUhJx+1mEi8o4Q73XznM+nZ/daSRVZfpgLUcY7a+tq8RjJBFrHpyNvNG6fiURVWH/IqeBUf5Ts6JeZQiyk5wMqmdmwOly2K6EIgha3/HKS+9GDQQA758LqOlHCUmD8PFeXD8cBAbkf5+qMgdvyxAdbt9sJuAZ9noFAWL1HlhB02LIApc0SuEUPB6LFEf39gGSiWAg/8lolq8pWWeKa5RP5CUUZjOVlew1hCOqgiCLb6EEU2fT+mdWcZY0UtE+I/lq1UzOudyezfvEW8DQ8oc1aoYCgtv7E4+BQd7F4jRwr6BAJ+wSH50LKrlmU2tFVkQfXe1aQze+ji04ZXllnEdEPEBFlN8u76YNxnb9a7N6BIIhDDO3/v1+Wtilak5sJPzKgqoI+fbr7vnHcs9zhQ1wfXMEyQ2OTuDubQZd8remKeWiaymf1BK/sQxcSUvyjW2nOyktoJoGDByw2VX3kbG74h8QVU70SdGx9cNe6CZFv3MZ6c1m5CJGZrLnYCCT4/9UTF3mm7ZindTvXxesAo95kWI/RNxE+cP5+InQBLgv9YocA5TrRWbLYHMuwIe1DcXFl1OGpXo7yrt+Lk5Po4LNwLLqgHlNLmCzGZXdmW+vpr8njiz3OwGG/DPzWxW9Uz0jmY58kIfYSbXxsqCjQnz1rRKwY+DnvLIVU3kUG8eH9Vs/SP5JktXf+4+ccNZBhrxG/53hmfOJYnGiY94+0JERBzzzF/z5Gh2HlofqGwOOFbxoKPNWhFO95d7gQr16c1WnfEhmfnV1ETctf/P5P2VI/nostDbuTjM7wDd+fZ0PuBq5guVas+XYzCKMnfZggl9cOeSRX5QvjKUtj+T/j27bIxGeBLHmlv6bJZmlUZdHisg1SmQsCwkmhUyKoQt2PjTu8jLg0Epj/9n4YHy5feQGMACSuwPiXlFoflJZ/fVMK4cGdhQ7wDvwTXJbIvImdSJ4qERmtGG0/NF1shUPJDDjDD6P0EPtVa8vGsDniBF/Tcx9iloO5coO6FfsrtAZ21Zm8R7wd68SklKJozmE2QB8MbEQjq5vcNK1hNd5FFJlj2+UXQGqUEeTaGT6mTcuOPo3bIRJNFBq0YH1ty3Pt1/jZH2J9gTu5611M0lUJYhuoCxSho0xxj00Q7KifgGZUN5iyS578CUpszv8QTeM3fRK7g7hg3W1ID/TCXwoae3tV2yODyg3NwaKLA0w+m18dyq20p7/qVuG3yI+kaOpzbsTMa3LPjkwWg6ohrkN0PkAo44TQKAzrPNdjeXecIMSbO+LSxEWX6iImDlcQCWH2jzRx5gOD+5AmtYgVeqHVOf7JPPN9b4LvjNREjxm0WAGPVXFa3AdpGktlyQQzQ1Aw/xyPfnovmx/2TosBRfjTep+FCZzxHeUMcabnZND16mqPzlaaFyg5RRppDlCJ5crSiPKz+3eMsMGdXn3bGrqQtSuCpwKlX2NJOv4kypAh75SuyO3+QGN8KUltSHo+XcXWWqeNNY+LCTzWh1X61ny6ZOF/3MsfcmMWERADd9kNXRdpEXey2RFKM6EPnYIFmMEKPa8+NIXc7awq6GqNU7YxNC12CARwp5Hlgvn85sKR5ACxiqSxlRQ8TqqbAetWHwezmX5QqBD3YUNstRvIJJdC3nP9GDSx3FMhJL1LrupvCd/7eXDBrLvUl1qoViQc6bAlgHm/i8rg5zhGcQ/C9jgmdEA1qL+31ef+szlefwttcWlnAqkI8CU321zg5nSkIRtR3VNYscM6eFlxNys/v6EudhbZJD/blOm3avwmgVzcmI5ztyNosOaAgv4TwKw3bcenZh4kmRrNea9XKlf+DJI4jYPLwk5lJMAxjFU3f1UGSmDjTra9r0Lo5ASQWiYjaS8mAaZ5Scl852dGDARJL5IWmideTBKGNCH5WJJnWX4Mxw8SuVaCPXgS8VPaZ7EGPj8I7GZUNvpfWhT575jCj9Skn3URef8RXs2WcUNXuFY+hJsYgbZnJdey7WqsDhTrctn6v9aNmQbubqa7+GQQKZGKcDNvypgNDSKuxD3Lt07/kxLSLRBdkGVFXJ1Zd/yMdLsTvjfvHvgwyfKm5NGFY2aJphQyLhsuXV7nh+JOcyI3fXkuQ5v9Wlu+Bpj9WyzFSg68bQJC4ZPgxpMAQlbHyPbnZqxCGx+/8dBgP8CRgH3BGTmZRJS5wPgPW7vaarUznIbMtCO0fJzCnwjWrDbL99BOcQ5GvmzOaHkKfto2GTKLHUTE3k7T/71RTru3IAzLwCmO4B0lxTg8hFymfxHNVx4B+ru5bORFlPilrCIi66sOfW1YF4hZnaDZQtp6/IpxAmys8R+UUTabhxYWwO0jOf3EDIUV8eJAybOHVoZatoE2w8ikxu9JSSTphSwAvpNjXPlFJKjS0HoNB595129RYlpzbvaqzPzm1lbQ5k8du+LO3NvUkXkiGraLqKRmRg/OOtGxOGYjfW8bsjt8ZZAEJwAJog6RvNMHaLO7bkcEOGHfNuate6JPtGlbw4hX+5EMoMu3gDxNWEsR4ATvTA0jRg4/oDWKMjQtGPveABtRu+Mh7Wac/UWAYer+2EwUewIWPKtPxhzndHR08K92+crvx8Q01eBy1WUkEdLOnKx1hlkNtGZOVqdrmW3rj5CkXKSxi+E9sVwXlHQDi1mQ3VLQ4h5/lYrr0/peOvPEomYxXpZacjBPJwTnMtSPNsvvTOIZ7CxJm91qWm8kt6rCCA2fTBl9S8Fhc63DTA4jUVYAtfzGzFzal32VkMPSDTovNuXwPpuo75uYi4QJQJCmoQMZZ/p4F714oSOgsaTVi6r0mAB1vVFsCInuysQEL23Ubk090y2Q963loCqcDQocPJScM+GHBDvrdl70EkaFVbGhNbdwt4P8XMyCPpZ0BKtr125zWPqYFCH+GNmP2KJgktd5FQfvl3eOhJBtWSHcUxYp8cKTTFSlGY8TMqVp6UUTghj+X0PpDP3ZgxBx7XdByK+9yPBCFsSvUHAs/rFLXeZDJ5a8kYD9P/kTngmgRA0hzI3/Ls0LNtfK+J2+qCRTmVla7x1+8B7t0E++ISm9FHaY3ifrR1ZfKCO+s6g75y1goZY8aar5I+ZmBO2HPIDxqE1B1BZp2IEFIxrrP6ddHB0MTUdc2Q1cmowA+kna8LZli7RHR40HjZXwAo87AIKjTQI+Lqj0F+MvfeBLFjbn89c2YsXSweo6UzgBUMbRwXl3kBF29AnNNecVRct0OObBPQymGE88ziailgDyDlLJX1XyEh9FoVF+JAd52iss6A4NhWMBGciUpUnt7Xte4GeygtYZ7MiGU3oTefLrKMJzZAelbqdzLSiO8GnWgOoVWA0FB9CNIInJcQ48zEOT1t/cElFgwPUfj6b93Ugqr8Vn71YuYpmbkCX25hoMbXhuTE6FzipleTZdYNvgXfJyAOWDB8Azg/JUaGMUUfkhH+HlZjd0AXaapwSArU12Fm2T6JwV9Tsujs6pkRpfpINwPMPoDhJyUYMCSzhHVvJpNspaj/qQrwsPEjFF8b4KdqUR6/3hoQ2uQukLM8rXjJswLOXePX4ItOnF0klYQz574Si0DALopOl+ZcpNQfUywaKBUIJhq5C3xPj63xQJgSlE/ApJoBAYCCgXhwNBMU5HbOrTV9Aodw27QdJb8fdOyfPpbGIqCCv4gInIWKh+uZKRqdjn86SCa/aggElHvvAZQIxWUFErYuWjAjLjCwgJt11Ji3YRQMtkRiDAyOh6/uMJ+Cd5/xahqJ6YwaTBfJnr/TgeSSrLcfUYWbcYQ2HFVH+0s0jDopIyLCosbITWhm1oqROQlIYDtvzEXxnijkhQ9pvGPTj7KCG5uoDMgMIwN6AsnUhy/vsDeRBoq/MQEzvuN/cbYYfkmYMpKQisQjJ9SYWFv8dPPeruG8nR7D4UFvWiQk8f5KI8VwlDFEB6GTaB/r6S4L0I1wMw61Yvu63MODZjh0sS/zOXm/VHVkxjLWdRg0p0C5PsUkixxstYzEpCOFDFO6BSZ33Z3U+KH540F1a0W1rYld/hNstiLU36ma6/MCGPTYj5B6+dmZL7giH/h4gekuuLQA9+xsatC8y8Ci6lgIOCTFZIKpVPY7HX6wc3tvZQ9MX1LB4i+Kuqw6YUON8QNkbW2UuIh8EROpbdxmIdUuim6UPtsG5i1Dt7ZSDxijvUYbwIF4QPb2/t/McC1d5EmXdx2acz0S0ZHRjy/fFQRuXJcR8ltwuXPcz+xP2dStyoqtRE46cz/WBM15T4kVGs9lhR3mDcniRBDNEM3BYolPM1VD7aFiziAO/cOYjI4Z88Qfgl4Wd2aqoF07AHyUlN+uYUpOmLI8PI0kMMXk85BNMM2PVNsjgBlVzeLVcmoXy9ERuO2v4oi00oS/Rh/5x07Civ6VK/ghO2laHSDoMqvWTj8IfXB8jHlQnaaHAq0xfQXjn3z23ElEsZuXuK1g0vVQWPIIHII8VTyQKNTxRjdhRcnZYvWDj+PdpvvLC9atIdJ5OuLdgMixyZO+6fJwkr2TkLG51aRkliocEQr4XcbU7vPSKn527PjYiyKJDfV0TrIAB/gzTtTq7TGEB0hHcdGaH60Y9X7nXZj4JH5yZo8I0PdgmzOz8OCVKnvKr5oi8xfj9mPL572h2ZLXLRCqnVR7gAxY98VBCE6PdJcKL9YBHUouONU1clgP/XKEDZlEETO2sENRw19MMC3ruvPH/FN1pI3VB5+UEAlu2SaKF/2gZb0fI6uV9rPNmqG2r/KAbK6bUlFVRA3tL84qt0Mnk5uWfRMYYP0y58WNZowl4lWWg7VD3S8STj6B1Gclp4S4op2mdpTzf4v1hj4LjzMsAsdwRPWUfPxI2B7tK52zd5FcAKZwl0z3pXtPwKfgN9jAlCEKd7LITqOynW30NN+ZR7yUgl72f9GI8EDbReKFJzdOze5wTsadmlpe4+R70zHxVH+P+rahh4kq7vayl4EG/JD4r0HTZVllwklwgCJuH527sPiDUZSYcGEYz8M5ds97CjnDmRX9BC+a1AcL9X+0f4mE1FI5/egUPHnrQOttIpb81M+mrEdE3usbBg2zz2aOuiKfwkBkH2oLIYThVMRsfJEtRpumQs3A6NzlLwKJRqdqdIIcs5g9bSYT5f9uSbGLk5sVsdQgAq+9crpcWDnxvSb2JoJ4czJIOQACXIms9DcBwANiK8FLn9kjXFP3Y/sfrQupraM521t+dpauVIMFqioLay+9FD63qlNCZCZdOp8OrJpXH0EhuxYeKdJZ+wiLAX0Wg6QA6ZCcMx8dI9l3PWjIJQQOOl3B6gptSO8J4zNlOR1qQW93hXP89Qw5UWL/FO1p0CaQdz9EOc5yHfaXBXdnmybqlONxisO3TvERPBlhbqeD9AEZWGc1tBdCcqfWVt22I6NuTOf2t0sfgTYN2sNf6FQQT5MIlSfwmHFLn7HIM+5AsqEFDybbXOXWht5Bdj7u1h/eUBGrPCORmWN7Fg59GT7OYFr/N/0U0T6ZaVpOAoIXgpqQEKQDOiFqNn1QzMJezy+hcMWx2ON8G5ee339/y34GdpowBRifeR9YJlV+8+LinK0rS0qHx9FBThXwWSh+wD+Ht0XMbnz7Vefmw/9li1a2uE+XgRddArj6//VNxRgnNZ0oB6RPAo8kO6yxoCRsjztYtgj/KENcEeAkOYsAV75COu3Lz1PWoKOukvA+K3fqIRlaTengoS1Qt0diSW0gNKA7rnudWteoMKyj+pDkukURYpIuFEMQ+YPv1VeCj5fN76gramNw6giHRsFXtyUPy9/bParZ8LwXNky+st+Ee80ChgxDo/q6xHNRH0qnp8RDho9/BCRIqU+jNhBvmlfSM6gv/kzicM5Ai4S9fsRAeDvYs1r/+08P+pv6db53+UyqbWDC6nFwHRsTWv1yGofppdAGpA9+oV/pF/QXXa2hit4wvtCnHUUsHFGsBZrNVaH8e0r2ccXXTSjk14uTYKcivNCVUSTS16gD6OrrJ956S0Gsb0SBbc2A+hA4sXOJcartQiQdtCOr0DBuf2PutmVYe+ClrWTURnSubbq0vCynEUjzTeX9PtyYiCR61bC7DbdCyR0saqIyPZcMmc8zJcKeBIsKr3AruSVUCcs3N+dIli4r5X9DnjaA2OUhbctdwi3Qp/XK4qjGiXzSuvOlzcyiKCDKGZeM1fVWf6NfG7fheAcLTt6NJ3p+l0OdCcmVfb0lVmHQgRZznPNxKdcCpkfH+N5AdEV8J40My+E9CF+jV0H4+Q0GIMqGOOmE4MFo61IXh0vMqlZxp5K9LqUEcSNTd9ORdyFuqiUtsHL6WUr8Uxc+TYDfJQq7CUoNCi/DXa03hGdq5BLiu4VeO81n+UxPexT63hOYflQPPyVMHM3MQ2Jeo7g9VVnhEbm+fPsJqBXDp4Kn2CU1ehlcJnygKXqK1M8ExaijDWOQlUimcY4rEmf6MjeqsSOrmfQmE3zTM4srE4uigA7+Znuol7OcJhh3hkUQAtjsqXV4QWqELx/ERb23frPv24yhCQM08muW/lz+DqB0qb4ZEsirTjmbOucuRqyXtXyD+ZoTOGZTsLvuAlssjRGEvUBzk6VaWJKih52r1E7qR1Aik5d2MdBJJK858Opp2BPsh27eAz4UxGradt61e0G5QmwR59w2RSeZ5HF86yd+ncoANww37KdRigvS7u0r+T0DPV6nft3j5Usrc4PdG+AEYoTo3Ku8o55d0o3UmyYg2u4bRIPqZcD5Bnn84hy4IBGjxYAKzosso/KuSf/PP1SQ3JvBV4Ep5uv+CLHY4Y2Z2G8f0U+yeNgM7rsWYZ8haVIFF4G4ndwL7skol6v5h3R/KytnKjlfWuW/nmeiCvtCde1SrWtdY4z0OyLtSYOqXEOEK4EcnEEjsI8t6yXHXan5abqH5GRA/E7qLxBLho3xeI+y5woBumcCzPsoF+kG9HKGs/wBIa3ygkB+pnF1oBs8WRdQeU8X2B+IQ7czmtS2EuS0H8jxujqUc3PGcwXBHjLXR2bui+kFbFqCPl50aN5upvur8Q5jtDVaRupJDsrZ8Il+6bZqKwPNQrSghJHiOmfpJShG7MOgrIk8m5wSPbf/ZwWpWHYEf4vng9KmNjIdi99FJ4joIVuJyulG3B5bKVk++Zoreprsae4ebS/P2974qf26+uSUDPOCr8oPeFflojek+6/R3thEy1rDIPpxo0OgXLEB5TRRdlevnfwsACY9Os7H3DAeigcfKWLftogimm9EZzCb2QAIB3wIy/WXBU2zU1WslDVZZ/lr6+U589mjrL/XwUisYVWTYvYRk+eG400q+pGMVH5NKEzxDQ8tQDEWceQy1qFrtwCo93a/JYhgKZk9zWgtJbdY/Al1MV269eSxtHjBhAGLCGjZuKLn6YKOR1Q1OIIXlt13SkTW3OKNBNAqxiaNHIVHqquSoF4lHTchMg06V4ZmPkAdler8BC4K0+uO+0dXicmtMygs8sWPh/j8s5uBioA0Eno8RYhT6TNfmhhBNhcv/GZu52RCjc/Q0ea6cC35AnrFF4pQXXQryNagT2TuvL2xh0KhCZG3FNT29UExqRtYF4TTupz1efaBO9yP+31K5UN0RYukhKFoKMuMtoP0wFSGzQsDbgW7BXCvJSh4m/5eC5RW4pbVqIpjKwdDhWcjiHXLFA9u5rcc6ZWduwHCl7rAI/JUM6GioxcPbwSLoP+NNXVSFENO2Ikk69ZJqbXCAX+sssU80zqUICi4SYsVBfz+wwgVBWqECeS5FkM52z33rvmLGmHN63Dvsc5AvHmtJpxgxYkIJ9jord8SBZdRqWcJzQDQ/vbtVgYOQ3zmKRnAp25u44+eTnfMsHMbkilr7NfERb7p/8RM+1+AeVW+rS1Bk8VfsGqRbaMc6Pgha55YFlJwLt37lZCTHzEc0goDNgdtuCtv7lUC3nzW7koDSZNWm+flzPazwfHhCKGPzwHD1ReGxzUqpY8P1Baxiw0ZSjU7DSxcVcyzbfno0K8NiX++xmmTLzFJYZsqk/zkdUiImcnE54P9UI2Zezw4zPXQ8v1VuD9CZL05i2NQH0meF7RYbK8mq82/mGAX8Z1cWwTpKjO5qQSNduoATypM49aCIdXyMOaFLRx6QjNw/gOKO8RedY4t1EXSvKfqKpRyJSTK+1skNbeegDPDXvEZQxKXc1qW0losaUrH67252mIFASUkj72xs50XYjHRz899X0hxsX+oMfXfG0UOqPTpxFPXtGBSuCbv+NQ4er7gCpzlpdFvurwryyaJT6zk4/t5YoIB3kNgtxLhfYhQyfQL00WWVdg7FwWuNwKWInxTybiFNEXy9nAw89hsT7YoreFOpkCn8XkP6xRlinAKXmTzv3gShMNpjzbwxyHs4T6vpgbZC6ySQI1Z0pttuPGfpESqJHNeHqQgXRABpMaPfDpJ8SWwpjoFCtSy5FhVPFUpQgXvFnLEmmOF+hJlWHohd4ZW8rNW3k8xMQlC5inOu5RHhvAAObzBAxabM8rFIFPKB8FIXzV0MFoue7bAKOttXyNnvFU2bDRfV/GWsUETSjYDq19m36iVheKkfmihgic+EP55nGiNeZhr0DAlNjor7UHMzuch+USk4YxwVj1mv7WgjSv4oy5vM4oXidc1CJAdXZkLXL3/0rZ2WebeyZ337KvJLFrT945dpx8g5O62nM85aQUefPWLpKAdrQ4Zs0J16XkvJhxcLyDV0FrOljOKxE2NrqC8wRt/MXv8lz4nm8cRcguwFi1nPQZSx25MH1ma8G4T9EtGDcOhOzUSjvjyYEiYtbYrMnmyHuA94qdXuFpOpLt/eX1bHyJ3S7tB8VsEJGt7FTkUExtr3LqzW/VF9btyvIhM/M7+obV9YDka8bTqy+NInxixx1bnKbS5JGQWD72YXd7RNyjOiIaEXHuvhVTrE4N2AzeTy2wGc6R4e/C/JvvwmfEW6wLGoSi8jAQ0zMhYdqbm7+AT3ieavLNT3MGlbnIOhQfo9AnDDPWPxr0wRgujPDL2CdUkB6a4wf6Wrjw6hNDidHHrcWB1Dslyy0ZC1lKZylAQL1oTnfAp38/aW9QvdocXfUdJgWqCPRYIH/23RvFqgk6N/EDffUCLPxSEZDXSxLQ78v3i3O0T1Gm3VMa/ou1kAjlseRfx99GutSXJdFgCZUiOQ8F11+lSMRA+ocnKwv4CWmaa4oWXEgjIg6l34VlNdvcaHR90hXt21JH2CMNaQDvshsi5FXW+2OfkE+S+WDaTYo2yNJjUfPTbm2XJpzK8RKAjZh8XrnkG1LcuWwDzaqGMB/7NIUUHB5svthEmHKkV0abDb34bvB8GJLF1D++LEC1H+1QjGNKvSLNsUUpSPzLSZvwcMGBh6BW8C/HyhAb5diIjkBBaCVF5NJcEVV3+838ycNhfzzoU3IxaDtPt5nNoDfoBbAFAY86X2SqtWvW8WD1laAlNvIAieDo7olNuxXItguCV9QrxRFM0Uf2+YhS6/7sfWuQcN3kot8e2XNti+y6pk2SePOKzRO4z1VloobMjlBs26Eu25l4pNEcSyAxoFMg7JvIVftMjmiDemnDVeO2JXfLWF2XvVjhX836HbX6cjlGQjRQFsMmIEQunnE+SwJ1lG0IlC2iQ/JOww+FaneLLm4XFmmYbArMlOeALvrYGK5Cvz0OWpae263+QflAgKonjiORl7b1yy/UraSniVne5qRe1LvFrzs4bIBqfCjzFtt9n2G2sYBho3MGmGaU+1U1REPic5JNTN1eWcvEpqTRNaOixsc/8gSfpFgD1P1D8KEp+YH0D0jRgGamy1JDWfpynCVBE3bf65vrX9+UZvWYog1dQ0VJOQ17MJBj/7WcdRtKKQL5oGBncyNHXy4GXMGK/KZ86R3AKN3+4c+z2TdycuBm2LskCqdvZYWczB2mYBqCUfNl7JJ0aF9uC5/xBmIIQoQ6ui4T+/SIYhCB6vZWVfWOBdf5Hugl9dGBAxtSOI6A6EemfDvxEyAuoTL0c6jd4fcjgZA1BAJuSTLyOszwEFmgNLRvwhtS6GNLbmBTPnUP4fh/X/u6vmuaPHg38pzDhkATm/djiMsvdxAPQ/nsLckyC1wfAV6Tns81v3mlrmNIBU60xaf6RzUK2/rhTY9G+YpvvYtuzfFcscipNhIZfjIOtxlRANZl6eGvC12NP62Vu9ZNwc+7eFEoDxlSr4eHZzkV0/vtsF15RhLDJmN/0gM1oIvO5od5Atl/F0gW8Y4/ZT34TNpEbEWGmpQJOppKK0daDZblQNLr7GfgpFJvHotKilB+RGrthKSuMtiyI730pqXHznFOhG3h0+70efJWoBHHXN6+9cHeKxt2otgFjOSzQp6E//oT7Ypg51hfCxOkGq6chALvcuk/0ealEUdtSWA95mylO2m9QeXUFXDqHhy5wblVtZbzWv66vGmWniN1BXY7vEubm+pay5rasM7k7MNp53R4lwkPoExrPiOXrq0hViyCUnD/JPSplZaRrcYk2lWyNJbCHCeWZBq0g7Zf5uVZW052xB8SdCFPFZm99t1Ui1YqeW67QX3EnTHoEDXDhf8uYFXpBDR+oPzDBHDIuOLfKxbtXYJd7/FoyLhB2XYyvlWrCqCZrZ54Jo9OLWftbWxiVQQu5Myeu2Qp9Ulfi0OHtbxYaZ8XD7YL28LfUhxbx4lsvHcNvpry50i1cpthL+Zs/8wuDeGtd3WhuQ59Fmw1lAwMXoR8RFE6Vpzx8qVylQORLruuxrrE//+YBr2xssETrWAyyh6z+sVV8uPTP/sKz1oLKghpnhgY/s/o9ZqiSYlUi5sbAY+6awx6Zpfg1yjIbKYTDbqHMYkjoceFGwuMU4C0hguvwYoeuJoV3ilHlcrAt5VCFpJ7Xf/MEqXcAAuylTxHKsjj04hEN9PVzyb0Vex1yvNtBoBFY0rwjqNtY0qcFI/FipmYrDr8PUQmhgF9881Z8PKmJe51I3YsBMVKyGtiAjWrBjAkNSc19Cl96bCYHsesIbK04cpfEcFe/1GHiKf1rkOp9nWOpn0oDSejGMeCdjsCcIgFoe4OPqvOBLo5d9Is/8UGVSA/BP1xOjBa5fCaDmNYx8Hpp2j+XOjeAnTquTtaIfBgUMYESvIbKgV/MU+/Gb8ETxtyD3sBoTvHJArxUi851vGcEY9k/CpqpApakcksKJj9AkIoj+1BMP8IhwmzCGLL+ruAR3MP961Uku8PsbD5DhOemEEL+FyGFIVq7qKFpYTzjD9GJzn9uAZOyu7DLpfbQNuFVU6NH2yqoa+FwOzySqvzxG+BM1goTMfEnkiWK8DdOQsuVKS47HPFH45eiZnKJWXq7misxxJuOlSXZw0gh+Sj/zeG7HDR6PY3bLYUCb/YkteLxM0NPQC5BqNWYPnKQHqeEbJujJ/vQerhiod3coIkJ86rMwKEoOsaGzV0LxWWx7llcQozZn+wCmXHZ6misJ4r9Y1rxmahi3l6KorzNdDpHNHikUvbebcJmW5wtDpsw6QD8/jTuXIS3CMyWqF5blMpbAq+qstTTF0YUrgM1KFxjsuq3wDP9UdVPBEqr4iO0JIKF2epr1uc2+8b1k8Stc/oEuaEKEZUzLRzDMjGHdoFrKXbjPm+JfTddaG5iyHPho40w5MkWE3ozIqvnp9+EspT2ye3VXmtcuB5pmfm36URu6D1r+Ukpy1vDfEF8ybpSXkRAZOd+WsMxAgOnqmBJIuB/gdz8Rhlil3737WcNjuqJJan6py4Uzz5d8rrtMPSwT577vUZpA6tZG7ZhKJUIFFHUN/4jl2Pm7t1+C+XHCTDBUKdu+hwWRRMPLnYASN/j6YJgh8BJf8CHKgAAAAB1mHC6DnxLUTWUEeK6ejCWmm3CIKkR5b18nliih94Qf2uHmcPe+UfjeCX3HL67AZs9ssH5z770NPaFXnbmp26H4fZSQNU6QamB/ihq1p1j0nuwF1hqBcYdvsf0t5fap1wHPRDOK/BrC72f1qNjARdnySyjt1HrdeemDu03mThPWhxv/KX9sGlkNO5hl4ywyStH86W7u1tLdpSHoTk67VNhfPLb2K9nP/XVLwXGx5tkGdPZvmdsVN+06JMWdbOFmbjyMt5Uko/dwGHY/C2/5aSVVEs/nRfPOjk/ws5uVDRGRgOHtO06Rqtk5stwEQPiHNHAE/U0/0yZnlV5qIFgiSap5uQ322pJYE+iBuO1hEHcWmcDvhrC5EiZUiENMqv9GGHFKL0UdQzaLbWvdDLon1zE5PPcgY+ScMkckGFWq/HZ/DWcWXjblN1tEAAAA==',
    milkyway: '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'
  };

  // --- begin ----------------------------------------------------------------------------
  if (!initGL()) return null;
  if (false) {
    // no WebGL: a second canvas above the first, which keeps the listening
    FAR = 900;
    cv2 = document.createElement('canvas');
    cv2.style.pointerEvents = 'none';
    cv2.setAttribute('aria-hidden', 'true');
    cv.parentNode.insertBefore(cv2, cv.nextSibling);
    ctx = cv2.getContext('2d');
  }
  resize(); readInsets();
  place(jd);
  placeCamera(last);
  if (QS.get('visit') && byKey[QS.get('visit')]) { const b = byKey[QS.get('visit')]; visit(b, true); choose(b); if (b.craft) shipT = 1; }
  if (QS.get('dist')) dist = distTo = clamp(parseFloat(QS.get('dist')) || HOME, nearest(focus), FAR);
  if (QS.get('ly')) dist = distTo = clamp((parseFloat(QS.get('ly')) || 18) * LY, nearest(focus), FAR);

  // (the ground needs the air and the air needs WebGL)
  if (!GLOK) elSky.style.display = 'none';
  else if (QS.get('sky') === '1') enterSky(!!QS.get('date'), true);

  // for scripts, and for the curious
  const DEBUG = {
    visit: k => { const b = byKey[k]; if (b) { choose(b); visit(b); } return !!b; },
    home: () => goHome(),
    // out among the stars: so many light-years from the Sun (18, if not said)
    far: ly => goFar(false, ly ? ly * LY : 0),
    // whatever keeps its name beside it: where it is on the screen, and whether its name is showing
    marks: () => MARKS.map(m => ({ key: m.key, x: m.px, y: m.py, seen: m.vis, named: m.on, at: m.on > 0.02 ? [m.lx, m.ly, m.w, m.h] : null, ly: m.far || 0 })),
    date: d => { if (d !== undefined) { const t = typeof d === 'number' ? d : Date.parse(d); if (isFinite(t)) { jd = jdOf(t); atNow = false; } } return new Date(msOf(jd)); },
    pause: p => { setPaused(p !== false); return paused; },
    trueDistances: on => { mapTo = on ? 1 : 0; elScale.setAttribute('aria-pressed', on ? 'true' : 'false'); },
    journey: on => { setJourney(on !== false); showJourney(); return journey; },
    // the eclipses this page finds, from a date on: for checking them against an almanac
    eclipses: (from, n) => { const out = []; let t = jdOf(typeof from === 'number' ? from : Date.parse(from)); for (let i = 0; i < (n || 6); i++) { const e = nextEclipse(t); if (!e) break; out.push({ when: new Date(msOf(e.at)).toISOString(), of: e.of, kind: e.kind }); t = e.at + 1; } return out; },
    // where a body was, days ago, as the screen shows it now
    // (with `still`, where it was round the Sun, the Sun taken as standing still: the way out of a spacecraft)
    trail: (k, days, still) => { const b = byKey[k]; if (!b || b.parent) return null; const v = toView(wasAt(b, days, [0, 0, 0], still), [0, 0, 0]); return { x: W / 2 + cam.F * v[0] / v[2], y: H / 2 - cam.F * v[1] / v[2], ahead: v[2] > cam.near, span: trailDays() }; },
    // (on the ground: which way from north, how high, and the tangent of half the view)
    look: (a, e, d) => {
      if (skyOn) { if (a !== undefined) skyAz = a; if (e !== undefined) skyAlt = clamp(e, SKY_LOW, SKY_HIGH); if (d !== undefined) skyTan = skyTanTo = clamp(d, SKY_TAN_MIN, 2); return; }
      if (a !== undefined) az = a; if (e !== undefined) el = clamp(e, -1.5, 1.5); if (d !== undefined) dist = distTo = clamp(d, nearest(focus), FAR);
    },
    // down to the ground and back: sky() tonight, sky(true, true) at the date the page is showing, sky(false) up again
    sky: (on, keep) => { if (on === false) { if (skyOn) leaveSky(null); } else enterSky(!!keep, true); return skyOn; },
    // where the ground is: place(29.76, -95.37) sets it, in degrees north and east
    place: (lat, lon, name) => {
      if (lat !== undefined) { setPlace('asked', name || '', lat, lon); PLACE.sure = true; if (skyOn) arrive(true); }
      return { name: PLACE.name, lat: PLACE.lat / D2R, lon: PLACE.lon / D2R, zone: PLACE.tz || null };
    },
    // a body over the place: how high, which way from north through east (degrees), how bright
    above: k => { const b = byKey[k]; return b && skyOn && b.up !== undefined ? { alt: Math.asin(clamp(b.up, -1, 1)) / D2R, az: (b.azm / D2R + 360) % 360, mag: b.mag, seen: b.vis, x: b.px, y: b.py, r: b.pr, shown: b.shown } : null; },
    // when it next rises or sets there
    crosses: k => { const b = byKey[k], x = b && nextCross(b, jd, horizonOf(b), 24); return x ? { when: new Date(msOf(x.at)).toISOString(), rising: x.rising } : null; },
    where: k => { const b = byKey[k]; return b ? { x: b.px, y: b.py, r: b.pr, shown: b.shown, seen: b.vis, au: b.helio, pos: b.pos.slice(), axis: b.Z.slice(), meridian: b.X.slice() } : null; },
    state: () => ({ webgl: GLOK, focus: focus.key, picked: picked && picked.key, dist, az, el, jd, daysPerSecond: paused ? 0 : rate(), trueDistances: mapM, journey: journeyK, resolution: RES, flying: !!fly,
      eye: SUN.dd, lightYears: SUN.dd / LY, sunAsStar: sunStar,
      sky: skyOn, landing: skyPending, dark: nightA, skyAz, skyAlt, view: 2 * Math.atan(skyTan) / D2R, sunAlt: Math.asin(clamp(SKY.sunUp, -1, 1)) / D2R, moonlight: SKY.moonWash, when: skyWhen }),
    bodies: () => B.map(b => b.key),
    // what one frame costs, in milliseconds: reading a pixel back makes the GPU finish its work
    cost: (n) => { if (!GLOK) return null; n = n || 40; const px = new Uint8Array(4), t0 = performance.now(); for (let i = 0; i < n; i++) { step(performance.now(), 0); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / n; }
  };

  return {
    canvas: cv,
    tick: now => frame(now),
    set: o => { Object.assign(BG, o); if ('pixels' in o || 'dpr' in o) needResize = true; },
    resize: () => { needResize = true; },
    ok: () => GLOK,
    debug: DEBUG,
  };
})();
