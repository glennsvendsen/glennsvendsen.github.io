/* Progressive enhancement only: the page reads fine without any of this. */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const scrollTimelines = CSS.supports('animation-timeline: view()');

  /* Custom events. Visit stats are Cloudflare Web Analytics (page views only), so this is a no-op unless an
     event-capable analytics script (window.umami) is added again. data-umami-event-* attributes are kept for that. */
  const track = (name, data) => {
    try { if (window.umami) window.umami.track(name, data); } catch (e) { /* ignore */ }
  };

  /* Run a callback once, when an element is far enough into view. */
  const onceVisible = (els, cb, threshold = 0.3) => {
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      cb(entry.target);
    }), { threshold });
    [...els].forEach((el) => io.observe(el));
  };

  /* ── LANGUAGE (EN / NO) ──────────────────── */
  // English is the page itself. Norwegian strings come from i18n.js; elements say what to swap with
  // data-i18n="key" (innerHTML) or data-i18n-attr="attr:key". The choice is saved; first visits
  // follow the browser's languages. Switching cross-fades through a View Transition.
  const NO = (window.I18N && window.I18N.no) || {};
  let lang = 'en';
  const tr = (key, english) => (lang === 'no' && NO[key] !== undefined ? NO[key] : english);
  const langListeners = [];
  const originals = new Map();   // el -> { html, attrs: { name: value } }
  const remember = (el) => {
    if (!originals.has(el)) originals.set(el, { html: el.innerHTML, attrs: {} });
    return originals.get(el);
  };
  const applyLang = (next) => {
    lang = next;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const o = remember(el);
      el.innerHTML = tr(el.dataset.i18n, o.html);
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      const o = remember(el);
      el.dataset.i18nAttr.split(',').forEach((pair) => {
        const [name, key] = pair.split(':').map((x) => x.trim());
        if (!(name in o.attrs)) o.attrs[name] = el.getAttribute(name);
        el.setAttribute(name, tr(key, o.attrs[name]));
      });
    });
    if (document.querySelector('[data-i18n]')) root.lang = lang === 'no' ? 'nb' : 'en';
    document.querySelectorAll('.lang-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    langListeners.forEach((fn) => fn());
  };
  const langSwitch = document.querySelector('.lang-switch');
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) { /* private mode */ }
  const prefersNo = (navigator.languages || [navigator.language]).some((l) => /^(nb|nn|no)\b/i.test(l || ''));
  const initialLang = saved === 'en' || saved === 'no' ? saved : (prefersNo ? 'no' : 'en');
  if (initialLang === 'no') applyLang('no');
  if (langSwitch) langSwitch.hidden = false;
  if (langSwitch) langSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-lang]');
    if (!btn || btn.dataset.lang === lang) return;
    const next = btn.dataset.lang;
    try { localStorage.setItem('lang', next); } catch (err) { /* private mode */ }
    track('language', { lang: next });
    if (!document.startViewTransition || reduceMotion) applyLang(next);
    else document.startViewTransition(() => applyLang(next));
  });

  /* ── THEME ───────────────────────────────── */
  // The saved choice wins; otherwise follow the system. The switch is an ink wipe from the toggle.
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);
  const themeListeners = [];
  const syncTheme = () => {
    root.classList.toggle('is-dark', isDark());
    toggle.setAttribute('aria-label', isDark() ? tr('theme.light', 'Switch to light theme') : tr('theme.dark', 'Switch to dark theme'));
    themeListeners.forEach((fn) => fn());
  };
  const toggle = document.querySelector('.theme-toggle');
  toggle.hidden = false;
  syncTheme();
  langListeners.push(syncTheme);
  systemDark.addEventListener('change', () => { if (!root.dataset.theme) syncTheme(); });
  toggle.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
      syncTheme();
    };
    track('theme-toggle', { theme: next });
    if (!document.startViewTransition || reduceMotion) { apply(); return; }
    const r = toggle.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    root.style.setProperty('--wx', `${x}px`);
    root.style.setProperty('--wy', `${y}px`);
    root.style.setProperty('--wr', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    root.classList.add('theme-wipe');
    document.startViewTransition(apply).finished.finally(() => root.classList.remove('theme-wipe'));
  });

  /* ── HEADER ──────────────────────────────── */
  const top = document.querySelector('.top');
  const heroSig = document.querySelector('.signature--hero');
  if (heroSig) {
    new IntersectionObserver(([entry]) => {
      top.classList.toggle('is-scrolled', !entry.isIntersecting);
    }, { rootMargin: '-64px 0px 0px 0px' }).observe(heroSig);
  } else {
    // Pages without the big hero signature (Work): the header settles once you scroll.
    const settle = () => top.classList.toggle('is-scrolled', scrollY > 40);
    addEventListener('scroll', settle, { passive: true });
    settle();
  }

  /* ── SIGNATURE ───────────────────────────── */
  // Each stroke takes time in proportion to its length (a steady pen), with a short lift
  // between strokes. Paths carry pathLength="1", so CSS animates stroke-dashoffset 1 → 0.
  // maxTotal caps the whole signature: a long one simply gets a quicker pen.
  const write = (svg, { speed = 520, lift = 0.07, maxTotal = Infinity, onDone = () => {} } = {}) => {
    const ink = svg.querySelector('.sig-ink');
    const paths = [...svg.querySelectorAll('.pen path')];
    const lens = paths.map((p) => p.getTotalLength());
    const natural = lens.reduce((sum, len) => sum + Math.max(0.06, len / speed) + lift, 0);
    const k = natural > maxTotal ? maxTotal / natural : 1;
    let t = 0;
    paths.forEach((p, i) => {
      const dur = Math.max(0.06, lens[i] / speed) * k;
      p.style.setProperty('--delay', `${t.toFixed(3)}s`);
      p.style.setProperty('--dur', `${dur.toFixed(3)}s`);
      t += dur + lift * k;
    });
    ink.setAttribute('mask', ink.dataset.mask);
    svg.classList.add('is-writing');
    // Done: drop the mask so the exact outline shows (the pen strokes only approximate it).
    setTimeout(() => {
      ink.removeAttribute('mask');
      svg.classList.remove('is-writing');
      svg.classList.add('is-written');
      onDone();
    }, t * 1000 + 120);
    return t;
  };

  const hero = document.querySelector('.hero');
  let seen = false;
  try { seen = sessionStorage.getItem('signed') === '1'; sessionStorage.setItem('signed', '1'); } catch (e) { /* ignore */ }
  // The skyline draws itself in under the signature: ridge, then city, then water.
  const land = document.querySelector('.land');
  if (land) land.querySelectorAll('.ink path:not(.fill)').forEach((p) => p.setAttribute('pathLength', '1'));
  if (!land || !hero || !heroSig) {
    // no hero on this page
  } else if (reduceMotion || seen) {
    heroSig.classList.add('is-written');
    hero.classList.add('is-in');
    land.classList.add('is-drawn');
  } else {
    const total = write(heroSig, { speed: 520, lift: 0.04, maxTotal: 1.6 });
    const start = Math.min(total * 0.3, 0.8) * 1000;
    setTimeout(() => hero.classList.add('is-in'), Math.min(total * 0.5, 1) * 1000);
    setTimeout(() => land.classList.add('is-drawing'), start);
    setTimeout(() => { land.classList.add('is-drawn'); land.classList.remove('is-drawing'); }, start + 2100);
  }
  const signoff = document.querySelector('.signature--signoff');
  if (signoff && !reduceMotion) {
    const ink = signoff.querySelector('.sig-ink');
    ink.style.opacity = '0';
    onceVisible([signoff], () => { ink.style.opacity = ''; write(signoff, { speed: 600, lift: 0.04, maxTotal: 1.4 }); }, 0.8);
  }

  /* ── SKY OVER THE FJORD ──────────────────── */
  // The sun and the moon placed from real astronomy for Oslo (astro.js): sunrise and sunset, the moon's
  // phase, tilt, height, rise and set. Stars at night and an aurora on winter nights. The month table
  // below is only a fallback if astro.js is missing. Looking north from the fjord the arcs run east
  // (right) to west (left); the real azimuth would put them behind you, so only the timing is real.
  if (land) {
  const SUN = [[9.2, 15.5], [8.0, 17.0], [6.7, 18.3], [6.3, 20.4], [5.0, 21.6], [3.9, 22.7],
    [4.3, 22.4], [5.6, 21.0], [7.0, 19.4], [8.2, 17.7], [8.3, 15.8], [9.2, 15.2]];
  const osloNow = () => {
    const params = new URLSearchParams(location.search);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo', hour: 'numeric', minute: 'numeric', year: 'numeric', month: 'numeric', day: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    let hour = +parts.hour + parts.minute / 60;
    let year = +parts.year;
    let month = +parts.month;
    let date = +parts.day;
    let debug = false;
    let label = `${parts.hour}:${parts.minute}`;
    const dateParam = local && /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(params.get('date') || '');
    if (dateParam) { year = +dateParam[1]; month = +dateParam[2]; date = +dateParam[3]; debug = true; }   // debug: ?date=2026-11-24
    if (local && params.has('hour')) {   // debug: ?hour=22.5&month=1
      debug = true;
      hour = +params.get('hour');
      label = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
    }
    if (local && params.has('month')) { month = +params.get('month'); debug = true; }
    // The instant, and local midnight in Oslo (EU summer time: last Sunday of March to last Sunday of October).
    const lastSunday = (m) => { const last = new Date(Date.UTC(year, m, 0)); return last.getUTCDate() - last.getUTCDay(); };
    const summer = (month > 3 && month < 10) || (month === 3 && date >= lastSunday(3)) || (month === 10 && date < lastSunday(10));
    const mid = Date.UTC(year, month - 1, date) - (summer ? 2 : 1) * 3600000;
    const ms = debug ? mid + hour * 3600000 : Date.now();
    // Days of the year: 17 May, Christmas (1 Dec to 6 Jan), New Year's Eve night.
    let day = '';
    if (month === 5 && date === 17) day = '17mai';
    else if ((month === 12 && date === 31 && hour >= 20) || (month === 1 && date === 1 && hour < 2)) day = 'nyttar';
    else if (month === 12 || (month === 1 && date <= 6)) day = 'jul';
    if (local && params.has('day')) day = params.get('day');   // debug: ?day=17mai|jul|nyttar
    return { hour, month, label, day, ms, mid };
  };
  /* Weather in Oslo (Open-Meteo, free, no key, no cookies; CC BY 4.0, credited in the footer).
     One request per visit, cached for 30 minutes. Any failure leaves the clear sky as it is.
     Debug on localhost: ?wx=clear|cloud|fog|drizzle|rain|snow|storm&snow=0.3&ice=2&temp=-8&clouds=2 */
  let weather = null;
  const wxFrom = (data) => {
    const c = data.current || {};
    const code = c.weather_code ?? 0;
    const temp = c.temperature_2m;
    const depth = c.snow_depth ?? 0;
    const cover = c.cloud_cover ?? 0;
    let wx = 'clear';
    let intensity = 'normal';
    if ([1, 2, 3].includes(code)) wx = 'cloud';
    else if ([45, 48].includes(code)) wx = 'fog';
    else if (code >= 51 && code <= 57) { wx = 'rain'; intensity = 'light'; }
    else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) { wx = 'rain'; intensity = [65, 67, 82].includes(code) ? 'heavy' : ([61, 80].includes(code) ? 'light' : 'normal'); }
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { wx = 'snow'; intensity = [75, 86].includes(code) ? 'heavy' : ([71, 77, 85].includes(code) ? 'light' : 'normal'); }
    else if (code >= 95) wx = 'storm';
    let clouds = cover < 20 ? 0 : cover < 45 ? 1 : cover < 75 ? 2 : 3;
    if (code === 3 || !['clear', 'cloud'].includes(wx)) clouds = 3;
    if (wx === 'clear') clouds = Math.min(clouds, 1);
    // Lying snow: from the snow depth, or fresh while it's snowing below freezing.
    let snowCover = depth >= 0.15 ? 'deep' : depth >= 0.01 ? 'light' : 'none';
    if (snowCover === 'none' && wx === 'snow' && temp !== undefined && temp <= 0.5) snowCover = 'light';
    // Fjord ice: freezing degree-days over the last two weeks.
    const means = (data.daily && data.daily.temperature_2m_mean) || [];
    const fdd = means.reduce((sum, m) => sum + (m === null ? 0 : Math.max(0, -m)), 0);
    const ice = fdd >= 60 ? 2 : fdd >= 20 ? 1 : 0;
    return { wx, intensity, clouds, cover: snowCover, ice, temp };
  };
  const applyWeather = (w) => {
    weather = w;
    land.dataset.wx = w.wx;
    land.dataset.clouds = String(w.clouds);
    land.dataset.intensity = w.intensity;
    land.dataset.cover = w.cover;
    land.dataset.ice = String(w.ice);
    // Cold enough for a fire: smoke from the boathouse chimney.
    if (typeof w.temp === 'number' && w.temp <= 5) land.dataset.cold = ''; else delete land.dataset.cold;
    updateSky();
  };
  const loadWeather = async () => {
    const params = new URLSearchParams(location.search);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (local && ['wx', 'snow', 'ice', 'temp', 'clouds'].some((k) => params.has(k))) {
      const codes = { clear: 0, cloud: 2, fog: 45, drizzle: 53, rain: 63, snow: 73, storm: 95 };
      const w = wxFrom({
        current: {
          weather_code: codes[params.get('wx')] ?? 0,
          temperature_2m: params.has('temp') ? +params.get('temp') : -3,
          snow_depth: params.has('snow') ? +params.get('snow') : 0,
          cloud_cover: params.has('clouds') ? +params.get('clouds') * 30 : (params.get('wx') === 'cloud' ? 60 : 0),
        },
        daily: { temperature_2m_mean: Array(14).fill(({ 0: 0, 1: -2, 2: -6 })[params.get('ice')] ?? 0) },
      });
      applyWeather(w);
      return;
    }
    try {
      const cached = JSON.parse(sessionStorage.getItem('wx') || 'null');
      if (cached && Date.now() - cached.t < 30 * 60 * 1000) { applyWeather(wxFrom(cached.data)); return; }
    } catch (e) { /* ignore */ }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=59.91&longitude=10.75'
        + '&current=temperature_2m,weather_code,snow_depth,cloud_cover&daily=temperature_2m_mean'
        + '&past_days=14&forecast_days=1&timezone=Europe%2FOslo', { signal: ctrl.signal });
      if (!res.ok) return;
      const data = await res.json();
      try { sessionStorage.setItem('wx', JSON.stringify({ t: Date.now(), data })); } catch (e) { /* ignore */ }
      applyWeather(wxFrom(data));
    } catch (e) { /* offline or blocked: keep the clear sky */ } finally { clearTimeout(timer); }
  };
  const place = (sel, x, y) => land.querySelector(sel).setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  const clock = document.querySelector('.hero-clock');
  // The panorama is cropped to the middle on narrow screens, so the sun and moon travel a shorter arc there.
  const arcScale = () => {
    const w = land.clientWidth;
    const h = land.clientHeight;
    const visible = w / Math.max(w / 1200, h / 260);       // viewBox units on screen (xMidYMax slice)
    return Math.min(1, Math.max(0.2, (visible / 2 - 46) / 510));
  };
  /* The moon: real phase drawn into .lit (a half disc plus the terminator ellipse), tilted like the real one. */
  const PHASES = { new: 'new moon', 'wax-cres': 'waxing crescent', q1: 'first quarter', 'wax-gib': 'waxing gibbous', full: 'full moon',
    'wan-gib': 'waning gibbous', q3: 'last quarter', 'wan-cres': 'waning crescent' };
  const phaseOf = (p) => (p < 0.03 || p > 0.97 ? 'new' : p < 0.22 ? 'wax-cres' : p < 0.28 ? 'q1' : p < 0.47 ? 'wax-gib'
    : p < 0.53 ? 'full' : p < 0.72 ? 'wan-gib' : p < 0.78 ? 'q3' : 'wan-cres');
  const moonLit = land.querySelector('.moon .lit');
  const moonFace = land.querySelector('.moon .moon-face');
  let moonDrawn = '';
  const drawMoon = (m) => {
    const r = 16;
    const a = r * Math.abs(2 * m.fraction - 1);                    // the terminator's half-width
    const d = m.fraction < 0.02 ? '' : `M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${a.toFixed(2)} ${r} 0 0 ${m.fraction < 0.5 ? 0 : 1} 0 ${-r} Z`;
    const rot = (Math.atan2(-Math.cos(m.zenithAngle), -Math.sin(m.zenithAngle)) * 180) / Math.PI;   // lit side starts on the right
    const key = `${d}|${Math.round(rot)}`;
    if (key === moonDrawn) return;
    moonDrawn = key;
    moonLit.setAttribute('d', d);
    moonFace.setAttribute('transform', `rotate(${rot.toFixed(1)})`);
  };
  let sunCache = { mid: 0, times: null };
  const liveSun = document.querySelector('.hl-sun');
  const liveMoon = document.querySelector('.hl-moon');
  const liveOslo = document.querySelector('.hl-oslo');
  const updateSky = () => {
    const { hour, month, label, day, ms, mid } = osloNow();
    if (day) land.dataset.day = day; else delete land.dataset.day;
    // The City Hall clock shows the time in Oslo.
    const hourHand = land.querySelector('.hand--hour');
    const minHand = land.querySelector('.hand--min');
    const turn = (el, deg) => el && el.setAttribute('transform', `translate(${el.dataset.pivot}) rotate(${deg.toFixed(1)})`);
    turn(hourHand, (hour % 12) * 30);
    turn(minHand, (hour % 1) * 360);
    // Real sunrise and sunset for today (the month table is only a fallback).
    const Astro = window.Astro;
    if (sunCache.mid !== mid) sunCache = { mid, times: Astro ? Astro.sunTimes(mid) : null };
    const [rise, set] = sunCache.times ? [sunCache.times.rise, sunCache.times.set] : SUN[month - 1];
    // The real moon, whenever it is above the horizon: east (rising) on the right, west (setting) on the left.
    let moonX = null;
    let moonY = null;
    let phaseName = '';
    const moon = Astro ? Astro.moonInfo(ms) : null;
    const moonUp = !!moon && Astro.moonAlt(ms) > 0;
    const phaseKey = moon ? phaseOf(moon.phase) : '';
    if (moonUp) {
      const span = Astro.moonSpan(ms);
      const t = span.rise && span.set ? Math.min(1, Math.max(0, (ms - span.rise) / (span.set - span.rise))) : 0.5;
      moonX = 600 + (510 - 1020 * t) * arcScale();
      moonY = 92 - 62 * Math.min(1, Math.max(0, moon.alt) / 55);       // real height: a low summer full moon, a high winter one
      place('.moon', moonX, moonY);
      drawMoon(moon);
      phaseName = tr(`moon.${phaseKey}`, PHASES[phaseKey]);
      land.dataset.moon = '';
    } else delete land.dataset.moon;
    let sky;
    let note;
    let x = null;
    let y = null;
    if (hour >= rise && hour < set) {
      const t = (hour - rise) / (set - rise);
      // Looking north from the fjord: east (sunrise) is on the right, west (sunset) on the left.
      x = 600 + (510 - 1020 * t) * arcScale();
      y = 150 - Math.sin(Math.PI * t) * 112;
      place('.sun', x, y);
      sky = (hour - rise < 0.7 || set - hour < 0.7) ? 'dusk' : 'day';
      note = sky === 'dusk' ? tr('sky.dusk', 'golden hour') : tr('sky.day', "sun's up");
    } else {
      sky = 'night';
      note = phaseName || tr('sky.night', 'night');
      const winter = month >= 9 || month <= 3;
      const dark = ((hour - set + 24) % 24) > 1 && ((rise - hour + 24) % 24) > 1;
      const clearish = !weather || (weather.wx === 'clear' || (weather.wx === 'cloud' && weather.clouds < 2));
      // The aurora is a painted effect for clear, dark winter nights, not real aurora data, so the text only says that.
      if (winter && dark && clearish) { land.dataset.aurora = ''; if (!phaseName) note = tr('sky.clear', 'clear winter night'); } else delete land.dataset.aurora;
    }
    // The sun's or the moon's reflection in the water (none when neither is up).
    const gx = sky === 'night' ? moonX : x;
    const gy = sky === 'night' ? moonY : y;
    if (gx === null) land.dataset.noglint = '';
    else { delete land.dataset.noglint; place('.glint', gx, 206 + Math.max(0, 150 - gy) * 0.1); }
    land.dataset.sky = sky;
    // Golden hour: a warm glow on the horizon under the sun, unless the sky is grey.
    const glowWeather = !weather || weather.wx === 'clear' || (weather.wx === 'cloud' && weather.clouds < 3);
    if (sky === 'dusk' && glowWeather) { land.dataset.glow = ''; place('.glow-sun', Math.min(1080, Math.max(120, x)), 122); } else delete land.dataset.glow;
    // Windows light up after dark; after half past eleven most go out again.
    // On a grey, wet or snowy day a few windows are lit anyway, as they would be.
    const gloomy = weather && (weather.clouds >= 3 || ['rain', 'snow', 'storm', 'fog'].includes(weather.wx));
    if (sky === 'day') { if (gloomy) land.dataset.lights = 'dusk'; else delete land.dataset.lights; }
    else if (sky === 'dusk') land.dataset.lights = 'dusk';   // the first few, faint, as the light goes
    else land.dataset.lights = hour >= 23.5 || hour < 5.5 ? 'late' : 'on';
    clock.querySelector('.clock-time').textContent = label;
    if (weather) {
      const wxNote = {
        fog: tr('wx.fog', 'foggy'),
        rain: weather.intensity === 'light' ? tr('wx.drizzle', 'drizzle') : tr('wx.rain', 'raining'),
        snow: tr('wx.snow', 'snowing'),
        storm: tr('wx.storm', 'thunder'),
        cloud: weather.clouds >= 3 ? tr('wx.overcast', 'overcast') : '',
      }[weather.wx];
      if (wxNote) note = wxNote;
      else if (weather.ice === 2 && sky !== 'night') note = tr('wx.ice', 'ice on the fjord');
      if (typeof weather.temp === 'number') note = `${Math.round(weather.temp)}° · ${note}`;
    }
    clock.querySelector('.clock-sky').textContent = `· ${note}`;
    clock.hidden = false;
    // "How this page works": what is driving the sky right now.
    if (liveSun) {
      const hm = (h) => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
      liveSun.textContent = `↑ ${hm(rise)}  ↓ ${hm(set)}`;
      liveMoon.textContent = !moon ? '–' : `${tr(`moon.${phaseKey}`, PHASES[phaseKey])} · ${moonUp ? `${Math.round(moon.alt)}° ${tr('how.up', 'up')}` : tr('how.below', 'below the horizon')}`;
      const wxWord = !weather ? '' : {
        clear: tr('wx.clear', 'clear'),
        cloud: weather.clouds >= 3 ? tr('wx.overcast', 'overcast') : tr('wx.cloud', 'partly cloudy'),
        fog: tr('wx.fog', 'foggy'),
        rain: weather.intensity === 'light' ? tr('wx.drizzle', 'drizzle') : tr('wx.rain', 'raining'),
        snow: tr('wx.snow', 'snowing'),
        storm: tr('wx.storm', 'thunder'),
      }[weather.wx] || '';
      liveOslo.textContent = weather && typeof weather.temp === 'number' ? `${Math.round(weather.temp)}° · ${wxWord}` : '–';
    }
  };
  updateSky();
  let resizing = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(resizing); resizing = requestAnimationFrame(updateSky); });
  langListeners.push(updateSky);
  loadWeather();
  new IntersectionObserver(([e]) => land.classList.toggle('is-paused', !e.isIntersecting)).observe(land);
  setInterval(updateSky, 60 * 1000);
  }

  /* ── SCROLL REVEAL (fallback) ────────────── */
  // Where scroll-driven animations exist, CSS does this on its own.
  if (!scrollTimelines) {
    onceVisible(document.querySelectorAll('.reveal, .cards > li'), (el) => el.classList.add('is-visible'), 0.15);
  }

  /* ── PROJECT CARDS ───────────────────────── */
  // Ink bleed: each cover soaks into the paper as it arrives (once its image has decoded).
  if (!reduceMotion) {
    const plates = document.querySelectorAll('.plate');
    plates.forEach((p) => p.classList.add('will-bleed'));
    onceVisible(plates, (plate) => {
      const img = plate.querySelector('img');
      const go = () => {
        plate.classList.add('is-bleeding');
        plate.querySelector('.plate-art').addEventListener('animationend', () => {
          plate.classList.remove('will-bleed', 'is-bleeding');
        }, { once: true });
      };
      (img.decode ? img.decode() : Promise.resolve()).then(go, go);
    }, 0.35);
  }
  // A slight tilt toward the pointer.
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.card').forEach((card) => {
      let frame = 0;
      card.addEventListener('pointermove', (e) => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          card.classList.add('is-tilting');
          card.style.setProperty('--rx', `${(-py * 5).toFixed(2)}deg`);
          card.style.setProperty('--ry', `${(px * 6).toFixed(2)}deg`);
        });
      });
      card.addEventListener('pointerleave', () => {
        cancelAnimationFrame(frame);
        frame = 0;
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  // Clips: a card with <video class="clip" data-src> plays a short silent loop over its plate, on hover or
  // keyboard focus with a mouse, or while it is mostly in view on touch screens (one at a time, no
  // "tap to play": a tap still opens the project). Nothing is downloaded until a clip is first wanted,
  // and nothing at all with reduced motion or Save-Data. If the browser refuses to play, the cover stays.
  const clips = [...document.querySelectorAll('.plate .clip')];
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  if (clips.length && !reduceMotion && !saveData) {
    let current = null;
    const stop = (v) => {
      v.classList.remove('is-playing');
      v.pause();
      if (current === v) current = null;
    };
    const start = (v) => {
      if (current && current !== v) stop(current);
      current = v;
      if (!v.getAttribute('src')) v.src = v.dataset.src;
      const shown = () => { if (current === v) v.classList.add('is-playing'); };
      const p = v.play();
      if (p && p.then) p.then(shown, () => v.classList.remove('is-playing')); else shown();
      if (!v.dataset.tracked) {
        v.dataset.tracked = '1';
        track('card-clip', { project: v.closest('.card').dataset.umamiEventProject });
      }
    };
    if (finePointer) {
      clips.forEach((v) => {
        const card = v.closest('.card');
        card.addEventListener('pointerenter', () => start(v));
        card.addEventListener('pointerleave', () => stop(v));
        card.addEventListener('focusin', () => { if (card.matches(':focus-visible')) start(v); });
        card.addEventListener('focusout', () => stop(v));
      });
    } else if ('IntersectionObserver' in window) {
      const ratios = new Map();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => ratios.set(e.target.querySelector('.clip'), e.intersectionRatio));
        let best = null;
        ratios.forEach((r, v) => { if (r >= 0.6 && (!best || r > ratios.get(best))) best = v; });
        clips.forEach((v) => { if (v !== best && v.classList.contains('is-playing')) stop(v); });
        if (best && best !== current) start(best);
      }, { threshold: [0, 0.3, 0.6, 0.8, 1] });
      clips.forEach((v) => io.observe(v.closest('.plate')));
    }
    document.addEventListener('visibilitychange', () => {
      if (!current) return;
      if (document.hidden) current.pause(); else current.play().catch(() => {});
    });
  }

  /* ── NOTEBOOK SKETCHES ───────────────────── */
  // Double the main strokes with a faint offset copy, give every stroke pathLength="1" so CSS
  // can draw it, and mark each sketch as drawn once it's well into view (that starts the
  // looping detail and fades in the notes).
  const sketches = document.querySelectorAll('.sketch');
  sketches.forEach((sk) => {
    sk.querySelectorAll('.ink > :not(.thin):not(.accent)').forEach((el, i) => {
      const ghost = el.cloneNode();
      ghost.classList.add('ghost');
      ghost.setAttribute('transform', `translate(${i % 2 ? 0.9 : -0.7} ${i % 3 ? 0.6 : -0.5})`);
      el.after(ghost);
    });
    sk.querySelectorAll('.ink > *, .notes path').forEach((el) => el.setAttribute('pathLength', '1'));
  });
  onceVisible(sketches, (sk) => sk.classList.add('is-drawn'), reduceMotion ? 0 : 0.4);
  // Looping details pause while their sketch is off-screen.
  const pauser = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('is-paused', !e.isIntersecting)));
  sketches.forEach((sk) => pauser.observe(sk));


  /* ── PORTRAIT DOODLE ─────────────────────── */
  // The print develops once it's well in view; the speech bubble pops up after.
  onceVisible(document.querySelectorAll('.portrait'), (el) => {
    el.classList.add('is-developed');
  }, 0.5);

  /* ── CONTACT FORM ────────────────────────── */
  // The letter card posts to the Worker in worker/ (api.glennsvendsen.com), which mails hello@.
  // Cloudflare Turnstile (spam check) loads only once someone starts writing: nothing third-party on load.
  // On localhost it uses Turnstile's always-pass test key and a local `wrangler dev` (port 8787).
  const letter = document.querySelector('.letter');
  if (letter) {
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    const siteKey = local ? '1x00000000000000000000AA' : letter.dataset.sitekey;
    const endpoint = local ? 'http://localhost:8787/contact' : letter.action;
    const status = letter.querySelector('.letter-status');
    const sendBtn = letter.querySelector('.letter-send');
    const check = letter.querySelector('.letter-check');
    const say = (text, isError) => { status.innerHTML = text; status.classList.toggle('is-error', !!isError); };
    const failText = () => tr('hello.form.fail', 'That didn’t go through. Try again, or <a href="mailto:hello@glennsvendsen.com">email me</a>.');

    if (!siteKey || siteKey.startsWith('REPLACE')) {
      letter.hidden = true;   // not set up yet: the email link does the job
    } else {
      let widget = null;
      let token = '';
      let waiting = null;     // resolves when a token arrives
      let loading = null;
      const loadTurnstile = () => loading || (loading = new Promise((resolve, reject) => {
        window.onTurnstileLoad = resolve;
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
        s.async = true;
        s.onerror = reject;
        document.head.append(s);
      }).then(() => {
        widget = window.turnstile.render(check, {
          sitekey: siteKey,
          appearance: 'interaction-only',  // invisible unless Cloudflare wants a click
          theme: 'light',
          language: lang === 'no' ? 'nb' : 'en',
          'refresh-expired': 'auto',
          callback: (t) => { token = t; if (waiting) waiting(t); },
          'expired-callback': () => { token = ''; },
        });
      }));
      letter.addEventListener('focusin', () => { loadTurnstile().catch(() => {}); }, { once: true });

      const getToken = () => (token ? Promise.resolve(token) : new Promise((resolve) => {
        waiting = resolve;
        setTimeout(() => resolve(''), 15000);
      }));

      letter.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (letter.classList.contains('is-sent')) return;
        sendBtn.disabled = true;
        say(tr('hello.form.sending', 'Sending…'));
        let ok = false;
        try {
          await loadTurnstile();
          const t = await getToken();
          const fields = Object.fromEntries(new FormData(letter));
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...fields, 'cf-turnstile-response': t }),
          });
          ok = (await res.json()).ok === true;
        } catch (err) { /* network or Turnstile failed */ }
        if (ok) {
          letter.classList.add('is-sent');
          letter.querySelectorAll('textarea, input').forEach((el) => { el.readOnly = true; });
          sendBtn.hidden = true;
          say(tr('hello.form.sent', 'Sent. Thank you! I’ll write back soon.'));
          track('contact-form');
        } else {
          sendBtn.disabled = false;
          say(failText(), true);
          track('contact-form-failed');
        }
        token = '';
        if (widget !== null && window.turnstile) window.turnstile.reset(widget);
      });
    }

    // A no-JS post comes back to ?sent=1|0 (the form needs JS, so this is rare; still, say something).
    const sent = new URLSearchParams(location.search).get('sent');
    if (sent === '1' || sent === '0') {
      const line = document.createElement('p');
      line.className = 'letter-status mono';
      line.setAttribute('role', 'status');
      line.innerHTML = sent === '1' ? tr('hello.form.sent', 'Sent. Thank you! I’ll write back soon.') : failText();
      document.querySelector('.hello .intro')?.after(line);
    }
  }

  /* ── HELLO, DEVTOOLS ─────────────────────── */
  const GS = [
    '   ██████   ██████',
    '  ██       ██',
    '  ██  ████  █████',
    '  ██    ██      ██',
    '   ██████  ██████',
  ].join('\n');
  const CUP = [
    '       ( (',
    '        ) )',
    '     ........',
    '     |      |]',
    '     \\      /',
    "      `----'",
  ].join('\n');
  const MONO = 'font-family: ui-monospace, monospace; line-height: 1.15';
  console.log(`%c${GS}`, `color: #c2416b; ${MONO}`);
  console.log(
    '%cHi, engineer 👋\nNo framework. No build step.\n0 dependencies. View source is the docs.\n\n› try: coffee()',
    'color: #8f8a84; line-height: 1.5',
  );
  // Returns the sign-off so the console prints it instead of "undefined".
  window.coffee = () => {
    console.log(`%c${CUP}`, `color: #c2416b; ${MONO}`);
    track('console-coffee');
    return "Brewed. Let's talk → hello@glennsvendsen.com";
  };
})();
