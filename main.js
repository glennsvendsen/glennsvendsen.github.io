/* Progressive enhancement only: the page reads fine without any of this. */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const scrollTimelines = CSS.supports('animation-timeline: view()');

  /* Analytics (Umami). Safe no-op when the script is blocked or not loaded. */
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
  // Sun or moon placed by the actual time in Oslo, with stars at night and an aurora on winter
  // nights. Approximate Oslo sunrise / sunset (local hours) by month.
  if (land) {
  const SUN = [[9.2, 15.5], [8.0, 17.0], [6.7, 18.3], [6.3, 20.4], [5.0, 21.6], [3.9, 22.7],
    [4.3, 22.4], [5.6, 21.0], [7.0, 19.4], [8.2, 17.7], [8.3, 15.8], [9.2, 15.2]];
  const osloNow = () => {
    const params = new URLSearchParams(location.search);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Oslo', hour: 'numeric', minute: 'numeric', month: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    let hour = +parts.hour + parts.minute / 60;
    let month = +parts.month;
    let label = `${parts.hour}:${parts.minute}`;
    if (local && params.has('hour')) {   // debug: ?hour=22.5&month=1
      hour = +params.get('hour');
      label = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
    }
    if (local && params.has('month')) month = +params.get('month');
    return { hour, month, label };
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
  const updateSky = () => {
    const { hour, month, label } = osloNow();
    // The City Hall clock shows the time in Oslo.
    const hourHand = land.querySelector('.hand--hour');
    const minHand = land.querySelector('.hand--min');
    const turn = (el, deg) => el && el.setAttribute('transform', `translate(${el.dataset.pivot}) rotate(${deg.toFixed(1)})`);
    turn(hourHand, (hour % 12) * 30);
    turn(minHand, (hour % 1) * 360);
    const [rise, set] = SUN[month - 1];
    let sky;
    let note;
    let x;
    let y;
    if (hour >= rise && hour < set) {
      const t = (hour - rise) / (set - rise);
      x = 90 + 1020 * t;
      y = 150 - Math.sin(Math.PI * t) * 112;
      place('.sun', x, y);
      sky = (hour - rise < 0.7 || set - hour < 0.7) ? 'dusk' : 'day';
      note = sky === 'dusk' ? tr('sky.dusk', 'golden hour') : tr('sky.day', "sun's up");
    } else {
      const nightLen = 24 - (set - rise);
      const t = ((hour - set + 24) % 24) / nightLen;
      x = 90 + 1020 * t;
      y = 140 - Math.sin(Math.PI * t) * 98;
      place('.moon', x, y);
      sky = 'night';
      note = tr('sky.night', "moon's up");
      const winter = month >= 9 || month <= 3;
      const dark = ((hour - set + 24) % 24) > 1 && ((rise - hour + 24) % 24) > 1;
      const clearish = !weather || (weather.wx === 'clear' || (weather.wx === 'cloud' && weather.clouds < 2));
      if (winter && dark && clearish) { land.dataset.aurora = ''; note = tr('sky.aurora', 'aurora weather'); } else delete land.dataset.aurora;
    }
    place('.glint', x, 206 + Math.max(0, 150 - y) * 0.1);
    land.dataset.sky = sky;
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
  };
  updateSky();
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

  /* ── COPY EMAIL ──────────────────────────── */
  // The button ships hidden; it only appears where the Clipboard API exists.
  const copyBtn = document.querySelector('.copy');
  if (copyBtn && navigator.clipboard) {
    const row = copyBtn.parentElement;
    const label = copyBtn.querySelector('.copy-label');
    const announce = row.querySelector('[role="status"]');
    const email = row.querySelector('a[href^="mailto:"]').getAttribute('href').slice(7);
    let resetTimer = 0;
    copyBtn.hidden = false;
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(email); } catch (e) { return; }
      label.textContent = tr('copy.done', 'Copied ✓');
      copyBtn.classList.add('is-copied');
      announce.textContent = tr('copy.announce', 'Email address copied');
      track('contact-copy-email');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        label.textContent = tr('copy', 'Copy');
        copyBtn.classList.remove('is-copied');
        announce.textContent = '';
      }, 2000);
    });
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
    return "Brewed. Let's talk → gsvendsen@me.com";
  };
})();
