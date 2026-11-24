/* Sun and moon for Oslo: real sunrise and sunset, and the moon's phase, tilt, height, rise and set.
   Low-precision formulas (after Meeus, "Astronomical Algorithms", as popularised by the SunCalc library),
   good to a few minutes. Used by main.js for the sky in the hero; no network, no dependencies.
   Test it in Node:  node -e "const A=require('./astro.js'); console.log(A.moonInfo(Date.now()))" */
(() => {
  const RAD = Math.PI / 180;
  const LAT = 59.91 * RAD;          // Oslo
  const LON = 10.75;                // degrees east
  const OBL = 23.4397 * RAD;        // obliquity of the ecliptic
  const HOUR = 3600000;

  const days = (ms) => ms / 86400000 - 0.5 + 2440588 - 2451545;   // days since J2000
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
  const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
  const hourAngle = (d, alpha) => RAD * (280.16 + 360.9856235 * d + LON) - alpha;
  const altitude = (H, delta) => Math.asin(Math.sin(LAT) * Math.sin(delta) + Math.cos(LAT) * Math.cos(delta) * Math.cos(H));
  const refraction = (h) => { const x = Math.max(h, 0); return 0.0002967 / Math.tan(x + 0.00312536 / (x + 0.08901179)); };

  const sunCoords = (d) => {
    const M = RAD * (357.5291 + 0.98560028 * d);
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI;
    return { ra: ra(L, 0), dec: dec(L, 0) };
  };
  const moonCoords = (d) => {
    const L = RAD * (218.316 + 13.176396 * d);
    const M = RAD * (134.963 + 13.064993 * d);
    const F = RAD * (93.272 + 13.22935 * d);
    const l = L + RAD * 6.289 * Math.sin(M);
    const b = RAD * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
  };

  /** Sun height in degrees above the horizon, minus the horizon dip so that 0 means "rising or setting". */
  const sunAlt = (ms) => {
    const d = days(ms);
    const s = sunCoords(d);
    return altitude(hourAngle(d, s.ra), s.dec) / RAD + 0.833;
  };
  /** Moon height in degrees, with refraction and the moon's size and parallax: 0 means "rising or setting". */
  const moonAlt = (ms) => {
    const d = days(ms);
    const m = moonCoords(d);
    const h = altitude(hourAngle(d, m.ra), m.dec);
    return (h + refraction(h)) / RAD - 0.133 * 1;
  };

  /** Times where fn crosses zero between t0 and t1 (ms), found on a grid and interpolated. */
  const crossings = (fn, t0, t1, step) => {
    const out = [];
    let tp = t0;
    let vp = fn(t0);
    for (let t = t0 + step; t <= t1 + step; t += step) {
      const v = fn(t);
      if ((vp <= 0) !== (v <= 0)) out.push({ t: tp + (step * (0 - vp)) / (v - vp), up: v > 0 });
      tp = t;
      vp = v;
    }
    return out;
  };

  /** Sunrise and sunset in hours after `midnight` (an instant, ms), or null. */
  const sunTimes = (midnight) => {
    const c = crossings(sunAlt, midnight, midnight + 24 * HOUR, 5 * 60000);
    const rise = c.find((x) => x.up);
    const set = c.find((x) => !x.up);
    return rise && set ? { rise: (rise.t - midnight) / HOUR, set: (set.t - midnight) / HOUR } : null;
  };

  /** The moon at an instant: height (deg), illuminated fraction, phase 0..1 (0 new, .5 full), and the
   *  zenith angle of its bright limb (rad, eastward from up; about -90deg for a waxing moon high in the south). */
  const moonInfo = (ms) => {
    const d = days(ms);
    const s = sunCoords(d);
    const m = moonCoords(d);
    const H = hourAngle(d, m.ra);
    let h = altitude(H, m.dec);
    h += refraction(h);
    const q = Math.atan2(Math.sin(H), Math.tan(LAT) * Math.cos(m.dec) - Math.sin(m.dec) * Math.cos(H));   // parallactic angle
    const sunDist = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sunDist * Math.sin(phi), m.dist - sunDist * Math.cos(phi));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
      Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return {
      alt: h / RAD,
      fraction: (1 + Math.cos(inc)) / 2,
      phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
      zenithAngle: angle - q,
    };
  };

  /** When the moon that is up at `ms` rose and will set (instants in ms; null if not found within 26 h). */
  const moonSpan = (ms) => {
    const step = 6 * 60000;
    const limit = 26 * HOUR;
    let rise = null;
    let set = null;
    let prev = moonAlt(ms);
    for (let t = ms - step; t > ms - limit && rise === null; t -= step) {
      const a = moonAlt(t);
      if (a <= 0 && prev > 0) rise = t + (step * (0 - a)) / (prev - a);
      prev = a;
    }
    prev = moonAlt(ms);
    for (let t = ms + step; t < ms + limit && set === null; t += step) {
      const a = moonAlt(t);
      if (a <= 0 && prev > 0) set = t - step + (step * prev) / (prev - a);
      prev = a;
    }
    return { rise, set };
  };

  const Astro = { sunTimes, moonInfo, moonSpan, moonAlt, sunAlt };
  if (typeof module !== 'undefined' && module.exports) module.exports = Astro;
  else window.Astro = Astro;
})();
