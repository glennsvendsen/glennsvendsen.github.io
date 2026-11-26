/* The 404 page: fishing for the lost page in the Oslofjord, and a terminal that explains.
   Each cast tugs the line and reels up a catch (a few tech things that sank before it); the seventh is the
   page itself, folded into a paper boat. Language follows main.js (the html lang it sets). */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const no = () => document.documentElement.lang === 'nb';
  const t = (en, nb) => (no() ? nb : en);

  // What comes up, drawn hanging from the hook at 0,0 (about 36 units tall).
  const CATCHES = [
    { svg: '<path class="lost-fill" d="M-6 2 L-6 22 C-6 27, 0 30, 10 30 L22 30 C25 30, 25 24, 20 23 L4 19 L4 2 Z"/><path d="M-6 2 L-6 22 C-6 27, 0 30, 10 30 L22 30 C25 30, 25 24, 20 23 L4 19 L4 2 Z M-6 2 L4 2 M-3 8 L2 8 M-3 12 L2 12 M-3 16 L2 16"/>',
      en: 'An old boot. A classic.', nb: 'En gammel støvel. En klassiker.' },
    { svg: '<path class="lost-fill" d="M-14 24 C-16 35, 14 37, 17 25 C18 19, 10 17, 6 19 C10 13, 8 5, 0 5 C-8 5, -10 13, -6 19 C-12 17, -14 19, -14 24 Z"/><path d="M-14 24 C-16 35, 14 37, 17 25 C18 19, 10 17, 6 19 C10 13, 8 5, 0 5 C-8 5, -10 13, -6 19 C-12 17, -14 19, -14 24 Z M7 10 L14 11 L7 13"/><circle class="lost-dot" cx="2" cy="10" r="1.2"/>',
      en: 'A rubber duck. I explained the bug to it. Still 404.', nb: 'En gummiand. Jeg forklarte feilen for den. Fortsatt 404.' },
    { svg: '<circle class="lost-dot" cx="0" cy="12" r="3.4"/><circle class="lost-dot" cx="0" cy="25" r="3.4"/><path d="M2.6 26 C3 31, 0 35, -3 37"/>',
      en: 'A missing semicolon. Somewhere, a build just went green.', nb: 'Et semikolon som manglet. Et sted ble nettopp et bygg grønt.' },
    { svg: '<path class="lost-fill" d="M-15 4 L12 4 L15 7 L15 34 L-15 34 Z"/><path d="M-15 4 L12 4 L15 7 L15 34 L-15 34 Z M-8 4 L-8 13 L8 13 L8 4 M3 6 L3 11 M-10 20 L10 20 L10 34 M-10 20 L-10 34"/><text class="lost-label" x="0" y="29">FINAL_v2</text>',
      en: 'A floppy disk labelled FINAL_final_v2.html.', nb: 'En diskett merket FINAL_final_v2.html.' },
    { svg: '<path class="lost-fill" d="M-4 2 L4 2 L4 9 C10 12, 11 16, 11 20 L11 36 L-11 36 L-11 20 C-11 16, -10 12, -4 9 Z"/><path d="M-4 2 L4 2 L4 9 C10 12, 11 16, 11 20 L11 36 L-11 36 L-11 20 C-11 16, -10 12, -4 9 Z M-6 2 L6 2"/><text class="lost-label" x="0" y="29">200 OK</text>',
      en: 'A message in a bottle. It says “200 OK”. It lies.', nb: 'En flaskepost. Den sier «200 OK». Den lyver.' },
    { svg: '<text class="lost-word" x="0" y="24">null</text>',
      en: 'null. Not even undefined. Just null.', nb: 'null. Ikke engang undefined. Bare null.' },
    { svg: '<text class="lost-code" x="0" y="24">$(…)</text>',
      en: 'A jQuery plugin from 2012. Throwing it back.', nb: 'En jQuery-plugin fra 2012. Kaster den tilbake.' },
  ];
  const FOUND = {
    svg: '<path class="lost-fill" d="M-20 16 L20 16 L13 28 L-13 28 Z"/><path d="M-20 16 L20 16 L13 28 L-13 28 Z M-11 16 L0 0 L11 16 M-4 20 L5 20"/>',
    en: 'Found it! Your page, folded into a paper boat. <a href="/">Sail home →</a>',
    nb: 'Fant den! Siden din, brettet til en papirbåt. <a href="/">Seil hjem →</a>',
  };

  const scene = document.querySelector('.lost-scene svg');
  const hook = document.querySelector('.lost-hook');
  const catchEl = document.querySelector('.lost-catch');
  const line = document.querySelector('.lost-line');
  const splash = document.querySelector('.lost-splash');
  const cast = document.querySelector('.lost-cast');
  const log = document.querySelector('.lost-log');
  if (!scene || !hook || !cast) return;

  // A shuffled run of catches, then the page itself.
  const run = CATCHES.map((c) => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c).slice(0, 5);
  run.push(FOUND);
  let n = 0;
  let current = null;
  let y = 262;
  const TIP = { x: 300, y: 72 };
  const place = (ny) => {
    y = ny;
    hook.setAttribute('transform', `translate(${TIP.x} ${y.toFixed(1)})`);
    line.setAttribute('d', `M${TIP.x} ${TIP.y} L${TIP.x} ${(y - 6).toFixed(1)}`);
  };
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  const tween = (to, ms, fn = ease) => new Promise((done) => {
    if (reduceMotion) { place(to); done(); return; }
    const from = y;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      place(from + (to - from) * fn(k));
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));
  const splashOnce = () => {
    if (reduceMotion) return;
    splash.classList.remove('is-on');
    void splash.getBBox();
    splash.classList.add('is-on');
  };
  const say = (c) => { log.innerHTML = t(c.en, c.nb); };

  // Idle: the hook sways a little under water.
  let idle = 0;
  const sway = (now) => { if (!busy && !current) place(262 + Math.sin(now / 700) * 3); idle = requestAnimationFrame(sway); };
  let busy = false;
  if (!reduceMotion) idle = requestAnimationFrame(sway);

  cast.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    cast.disabled = true;
    hook.classList.remove('is-dangling');
    if (current) {                                   // throw the last one back
      await tween(262, 500, (k) => k * k);
      splashOnce();
      catchEl.innerHTML = '';
      current = null;
    }
    if (n >= run.length) n = 0;
    const c = run[n++];
    // a bite: three tugs, then reel in
    log.textContent = t('Something is biting…', 'Det napper…');
    scene.classList.add('is-biting');
    for (const d of [14, -6, 18, -4, 10, 0]) { await tween(262 + d, 110); }
    scene.classList.remove('is-biting');
    catchEl.innerHTML = c.svg;
    current = c;
    await tween(150, 520);
    splashOnce();
    await tween(104, 700);
    hook.classList.add('is-dangling');
    say(c);
    if (c === FOUND) {
      cast.textContent = t('Fish again', 'Fisk igjen');
      if (window.thumbsUp) setTimeout(() => window.thumbsUp('egg.found', 'Found it!'), reduceMotion ? 0 : 600);
    } else {
      cast.textContent = t('Throw it back, cast again', 'Kast den ut, prøv igjen');
    }
    await wait(200);
    busy = false;
    cast.disabled = false;
  });

  // The terminal: the request, its answer, and what's in the fjord.
  const term = document.querySelector('.terminal');
  if (term) {
    const raw = decodeURIComponent(location.pathname || '/');
    const path = raw.length > 42 ? `${raw.slice(0, 40)}…` : raw;
    const file = (path.split('/').filter(Boolean).pop() || 'index.html');
    const lines = () => [
      ['cmd', `curl -I https://www.glennsvendsen.com${path}`],
      ['out', 'HTTP/2 404'],
      ['out', 'x-fjord: deep'],
      ['out', `x-reason: ${t('probably a typo (maybe mine)', 'sannsynligvis en skrivefeil (kanskje min)')}`],
      ['cmd', 'ls ./oslofjord'],
      ['out', `ferry  gulls  sailboat  tram  ${file} ${t('(sunk)', '(sunket)')}`],
      ['home', `cd ~   # ${t('take me home', 'ta meg hjem')}`],
    ];
    const render = (upto, chars) => {
      term.textContent = '';
      lines().forEach(([kind, text], i) => {
        if (i > upto) return;
        const row = document.createElement('span');
        row.className = `t-${kind}`;
        const shown = i === upto && chars !== null ? text.slice(0, chars) : text;
        if (kind === 'home' && (i < upto || chars === null || chars >= text.length)) {
          const a = document.createElement('a');
          a.href = '/';
          a.textContent = shown;
          row.append('$ ', a);
        } else {
          row.textContent = (kind === 'out' ? '' : '$ ') + shown;
        }
        term.append(row, '\n');
      });
      const cursor = document.createElement('span');
      cursor.className = 't-cursor';
      cursor.textContent = '▍';
      term.lastChild.before(cursor);
    };
    const total = lines().length;
    if (reduceMotion) render(total - 1, null);
    else {
      let i = 0;
      let c = 0;
      const typeOn = () => {
        const [kind, text] = lines()[i];
        if (kind === 'out') { render(i, null); i += 1; c = 0; if (i < total) setTimeout(typeOn, 260); else term.dataset.done = '1'; return; }
        c += 1;
        render(i, c);
        if (c < text.length) setTimeout(typeOn, 28 + Math.random() * 40);
        else { i += 1; c = 0; if (i < total) setTimeout(typeOn, 420); else term.dataset.done = '1'; }
      };
      new IntersectionObserver(([e], obs) => { if (e.isIntersecting) { obs.disconnect(); setTimeout(typeOn, 600); } }).observe(term);
    }
    // a language switch re-renders it in place
    new MutationObserver(() => { if (reduceMotion || term.dataset.done) render(total - 1, null); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  // the button and the log follow the language too
  new MutationObserver(() => { if (current) say(current); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
