(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;

  /* Analytics (Umami). Safe no-op when the script is blocked or not loaded. */
  const track = (name, data) => {
    try { if (window.umami) window.umami.track(name, data); } catch (e) { /* ignore */ }
  };

  /* Pinned layers (see CURTAIN): the hero and the finale stay on screen underneath the flow
     sections, so "in the viewport" isn't the same as "showing". Paint order, top to bottom:
     flow sections (layer 0), the hero (1), the finale (2). */
  const main = document.getElementById('main');
  const hero = document.getElementById('hero');
  const finale = document.querySelector('.finale');
  const layerOf = (el) => ((finale && finale.contains(el)) ? 2 : (hero && hero.contains(el)) ? 1 : 0);
  const isPinned = (el) => layerOf(el) > 0;
  // Of the elements spanning some line, only those on the topmost layer are actually showing.
  const topmost = (els) => els.filter((el) => layerOf(el) === Math.min(...els.map(layerOf)));
  // Share of an element's height that's actually showing (0–1)
  const shownRatio = (el) => {
    const r = el.getBoundingClientRect();
    let top = Math.max(r.top, 0);
    let bottom = Math.min(r.bottom, window.innerHeight);
    if (finale && finale.contains(el)) top = Math.max(top, main.getBoundingClientRect().bottom);
    else if (hero && hero.contains(el) && hero.nextElementSibling) bottom = Math.min(bottom, hero.nextElementSibling.getBoundingClientRect().top);
    return r.height ? Math.max(0, bottom - top) / r.height : 0;
  };

  /* Fire a callback once when an element scrolls into view. An element in a pinned layer can
     intersect while still covered; it waits (re-checked on scroll) until it's really showing. */
  const covered = new Map();  // el -> { cb, threshold, io }
  const onceVisible = (els, cb, threshold = 0.3) => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (isPinned(entry.target) && shownRatio(entry.target) < threshold) {
          covered.set(entry.target, { cb, threshold, io });
          return;
        }
        covered.delete(entry.target);
        cb(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold });
    els.forEach((el) => io.observe(el));
  };
  const checkCovered = () => covered.forEach(({ cb, threshold, io }, el) => {
    if (shownRatio(el) < threshold) return;
    covered.delete(el);
    io.unobserve(el);
    cb(el);
  });

  /* Report elements as they start/stop spanning the middle of the viewport. Unlike a ratio
     threshold this works for sections of any height, including ones several screens tall. */
  const onCentreLine = (els, cb) => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => cb(entry.target, entry.isIntersecting));
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    els.forEach((el) => io.observe(el));
    return io;
  };

  /* Hand-drawn strokes (scribbles, sketches, chart annotations): hide each path behind its own
     dash, then draw it in once the element is in view. With reduced motion it's drawn at once. */
  const drawIn = (els, {
    paths = 'path', threshold = 0.4, delay = 0, stagger = 45, duration = 1.1,
    ease = 'cubic-bezier(0.4, 0, 0.2, 1)', onDraw = () => {},
  } = {}) => {
    els = [...els];
    els.forEach((el) => el.querySelectorAll(paths).forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = reduceMotion ? 0 : len;
    }));
    if (reduceMotion) { els.forEach(onDraw); return; }
    onceVisible(els, (el) => {
      el.querySelectorAll(paths).forEach((p, i) => {
        p.style.transition = `stroke-dashoffset ${duration}s ${ease} ${delay + i * stagger}ms`;
        p.style.strokeDashoffset = '0';
      });
      onDraw(el);
    }, threshold);
  };

  /* ── SCRIBBLE UNDERLINES ─────────────────── */
  const SCRIBBLE = `
    <svg class="scribble-svg" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 9 C55 5, 115 4, 185 6 S255 10, 296 12" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.8"/>
      <path d="M25 13 C72 9, 132 8, 198 10 S258 14, 282 16" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M250 11 L266 3 L258 18 L274 9" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const scribbles = document.querySelectorAll('.scribble');
  scribbles.forEach((el) => el.insertAdjacentHTML('beforeend', SCRIBBLE));
  drawIn(scribbles, { threshold: 0.6, delay: 300, stagger: 180, duration: 0.9, ease: 'cubic-bezier(0.16, 1, 0.3, 1)' });

  /* ── CHART ANNOTATIONS ───────────────────── */
  // Drawn after the chart's own bars have mostly landed; the note fades in after the stroke (CSS).
  drawIn(document.querySelectorAll('.annot'), {
    threshold: 0.9, delay: 900, stagger: 160, duration: 0.8,
    onDraw: (el) => el.classList.add('is-drawn'),
  });

  /* ── SPLIT-FLAP HERO NUMBERS ─────────────── */
  // The proof values arrive like a departure board: blank tiles, a few random glyphs, then the
  // value. Screen readers get a plain sr-only copy. Each cell is pinned to its final glyph's
  // width while it flips, so the line never jitters (Bebas glyph widths vary a lot).
  if (!reduceMotion) {
    const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const STEP = 45;
    const cells = [];
    document.querySelectorAll('.hero-proof dt').forEach((dt, d) => {
      const text = dt.textContent;
      const board = document.createElement('span');
      board.setAttribute('aria-hidden', 'true');
      let k = 0;
      [...text].forEach((ch) => {
        if (/[\s·]/.test(ch)) { board.append(ch); return; }
        const cell = document.createElement('span');
        cell.className = 'flap is-waiting';
        cell.textContent = ch;
        board.append(cell);
        cells.push({ cell, final: ch, delay: d * 150 + k++ * 50, steps: 6 + Math.floor(Math.random() * 5), step: -1 });
      });
      const label = document.createElement('span');
      label.className = 'sr-only';
      label.textContent = text;
      dt.replaceChildren(label, board);
    });

    const flip = (c, glyph) => {
      c.cell.textContent = glyph;
      c.cell.animate(
        [{ transform: 'perspective(6em) rotateX(-90deg)' }, { transform: 'none' }],
        { duration: STEP * 1.2, easing: 'ease-out' },
      );
    };
    const run = () => {
      if (!cells.length) return;
      const size = parseFloat(getComputedStyle(cells[0].cell).fontSize);
      cells.forEach((c) => { c.cell.style.width = `${c.cell.getBoundingClientRect().width / size}em`; });
      const t0 = performance.now();
      const tick = (now) => {
        let pending = false;
        cells.forEach((c) => {
          if (c.done) return;
          const step = Math.floor((now - t0 - c.delay) / STEP);
          pending = true;
          if (step < 0 || step === c.step) return;
          c.step = step;
          if (step < c.steps) {
            c.cell.classList.replace('is-waiting', 'is-flipping');
            flip(c, GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
            return;
          }
          flip(c, c.final);
          c.cell.classList.remove('is-flipping');
          c.cell.style.width = '';
          c.done = true;
        });
        if (pending) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    // Start once the font is in (widths depend on it) and the hero's fade-up has mostly landed.
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 3000))])
      .then(() => setTimeout(run, Math.max(0, 900 - performance.now())));
  }

  /* ── GENERATED VISUALS ───────────────────── */
  /* ── INTERACTIVE PRICE TESTING TOOL ──────── */
  // Dummy data: hourly rate per zone, plus the zone/holiday pairs that are (wrongly) still charging.
  const ptt = document.getElementById('ptt');
  if (ptt) {
    const ZONES = { 1042: 2.0, 1187: 3.5, 2210: 1.5, 2960: 1.75, 3318: 2.5, 4412: 2.0, 5023: 4.0, 6150: 3.0 };
    const CHARGING = new Set(['4412|Jul 4', '5023|Jul 4', '1187|Nov 27', '2960|Dec 25', '3318|Jan 1']);

    const chips = [...ptt.querySelectorAll('.ptt-chip')];
    const durBtns = [...ptt.querySelectorAll('.ptt-seg:not(.ptt-filter) button')];
    const filterBtns = [...ptt.querySelectorAll('.ptt-filter button')];
    const freeToggle = ptt.querySelector('.ptt-free');
    const runBtn = ptt.querySelector('.ptt-run');
    const state = ptt.querySelector('.ptt-state');
    const bar = ptt.querySelector('.ptt-progress-bar');
    const tbody = ptt.querySelector('.ptt-table tbody');
    const stat = (k) => ptt.querySelector(`[data-k="${k}"]`);
    const paidTile = ptt.querySelector('.ptt-stat--paid');

    let results = null;
    let filter = 'all';
    let running = false;

    const pressed = (btns) => btns.filter((b) => b.getAttribute('aria-pressed') === 'true');
    const pick = (btns, btn) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    const setState = (text, done = false) => { state.textContent = text; state.classList.toggle('is-done', done); };
    const markDirty = () => { if (results && !running) setState('Setup changed · run again to update'); };

    const syncChecking = () => ptt.classList.toggle('is-checking', freeToggle.checked);

    const countUp = (el, target) => {
      if (reduceMotion) { el.textContent = target; return; }
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / 600, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const renderTable = () => {
      if (!results) return;
      const rows = filter === 'paid' ? results.filter((r) => r.price > 0) : results;
      const check = freeToggle.checked;
      tbody.innerHTML = rows.map((r, k) => `
        <tr class="${r.price > 0 ? 'is-paid' : ''}" style="animation-delay:${Math.min(k, 12) * 30}ms">
          <td>${r.zone}</td>
          <td>${r.date}</td>
          <td class="ptt-col-win">${r.window}</td>
          <td>$${r.price.toFixed(2)}</td>
          <td><span class="ptt-tag">${check ? (r.price > 0 ? '⚑ Paid on free day' : 'Free ✓') : 'Success'}</span></td>
        </tr>`).join('');
      if (!rows.length) tbody.innerHTML = '<tr><td colspan="5" style="text-decoration:none;color:var(--app-muted)">No paid zones. Everything is free as it should be.</td></tr>';
    };

    const run = () => {
      if (running) return;
      const dates = pressed(chips).map((c) => c.dataset.date);
      if (!dates.length) { setState('Pick at least one holiday'); return; }
      const minutes = Number(pressed(durBtns)[0].dataset.min);
      const end = new Date(0, 0, 1, 12, minutes);
      const window = `12:00–${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

      running = true;
      runBtn.disabled = true;
      setState('Running price calls…');
      bar.classList.remove('is-running');
      void bar.offsetWidth;
      bar.classList.add('is-running');

      setTimeout(() => {
        results = [];
        dates.forEach((date) => Object.entries(ZONES).forEach(([zone, rate]) => {
          const price = CHARGING.has(`${zone}|${date}`) ? rate * minutes / 60 : 0;
          results.push({ zone, date, window, price });
        }));
        results.sort((a, b) => (b.price > 0) - (a.price > 0));
        const paid = results.filter((r) => r.price > 0).length;
        countUp(stat('total'), results.length);
        countUp(stat('free'), results.length - paid);
        countUp(stat('paid'), paid);
        paidTile.classList.toggle('has-paid', paid > 0);
        renderTable();
        setState(`✓ Completed · ${results.length} calls, ${paid} charging on a free day`, true);
        running = false;
        runBtn.disabled = false;
        bar.classList.remove('is-running');
      }, reduceMotion ? 0 : 1150);
    };

    chips.forEach((c) => c.addEventListener('click', () => {
      c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true'));
      markDirty();
    }));
    durBtns.forEach((b) => b.addEventListener('click', () => { pick(durBtns, b); markDirty(); }));
    filterBtns.forEach((b) => b.addEventListener('click', () => { pick(filterBtns, b); filter = b.dataset.f; renderTable(); }));
    freeToggle.addEventListener('change', () => { syncChecking(); renderTable(); });
    runBtn.addEventListener('click', run);

    syncChecking();
    onceVisible([ptt], run, 0.4);
  }

  /* ── INTERACTIVE VALIDATION DEMO ─────────── */
  // The HTML ships the finished state (for no-JS); here we reset it and play it out.
  const vd = document.getElementById('vd');
  if (vd) {
    const inputs = [...vd.querySelectorAll('.vd-input')];
    const saveBtn = vd.querySelector('.vd-save');
    const replayBtn = vd.querySelector('.vd-reset');
    const status = vd.querySelector('.vd-status');
    const shield = vd.querySelector('.vd-shield');
    const badge = vd.querySelector('.vd-badge');
    const fly = vd.querySelector('.vd-fly');
    const flyBody = vd.querySelector('.vd-fly-body');
    const chip = vd.querySelector('.vd-chip-count');
    const clean = ['2.50', '3.00', '2.50', '1.50'];
    const MESSAGES = {
      INVALID_PRICE: 'Price is not a valid number.',
      ZERO_PRICE: 'Price is zero during an active period.',
      PRICE_SPIKE_MEDIAN: 'Price is far above the median for this tariff.',
    };
    let issues = [];
    let timers = [];

    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const stopAuto = () => {
      timers.forEach(clearTimeout);
      timers = [];
      inputs.forEach((i) => i.parentElement.classList.remove('is-typing'));
      saveBtn.classList.remove('is-pressed');
    };
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const setStatus = (text) => { status.textContent = text; restart(status, 'is-shown'); };
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    const validate = () => {
      const prices = inputs.map((i) => parseFloat(i.value.replace(',', '.')));
      const valid = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
      const mid = valid.length >> 1;
      const median = !valid.length ? 0 : valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
      const found = [];
      prices.forEach((p, row) => {
        const n = row + 1;
        if (!Number.isFinite(p) || p < 0) found.push({ row, sev: 'err', code: 'INVALID_PRICE', ctx: `Period ${n}` });
        else if (p === 0) found.push({ row, sev: 'warn', code: 'ZERO_PRICE', ctx: `Period ${n} · free while parking is paid` });
        else if (median && p > median * 10) found.push({ row, sev: 'err', code: 'PRICE_SPIKE_MEDIAN', ctx: `Period ${n} · €${p.toFixed(2)} is ${Math.round(p / median)}× the median` });
      });
      return found;
    };

    const issueHTML = (x, k) => `
      <li class="vd-issue vd-issue--${x.sev}" data-row="${x.row}" style="animation-delay:${k * 90}ms">
        <span class="vd-sev" aria-hidden="true">!</span>
        <div class="vd-issue-text">
          <p class="vd-msg">${MESSAGES[x.code]}</p>
          <p class="vd-ctx">${x.ctx}</p>
          <code class="vd-code">${x.code}</code>
        </div>
        <button type="button" class="vd-ack" aria-label="Acknowledge">✓</button>
      </li>`;

    const render = ({ pop = false } = {}) => {
      const errs = issues.filter((x) => x.sev === 'err');
      const warns = issues.filter((x) => x.sev === 'warn');
      let html = '';
      if (errs.length) html += `<p class="vd-group vd-group--err">Errors (${errs.length})</p><ul class="vd-list">${errs.map(issueHTML).join('')}</ul>`;
      if (warns.length) html += `<p class="vd-group">Warnings (${warns.length})</p><ul class="vd-list">${warns.map(issueHTML).join('')}</ul>`;
      flyBody.innerHTML = html || '<p class="vd-clear">No open issues. All checks passed.</p>';

      const n = issues.length;
      chip.textContent = errs.length ? plural(errs.length, 'error') : warns.length ? plural(warns.length, 'warning') : 'All clear';
      chip.classList.toggle('is-clear', n === 0);
      badge.textContent = n;
      badge.hidden = n === 0;
      if (n && pop) restart(badge, 'is-pop');
      shield.setAttribute('aria-label', n ? `Validation: ${plural(n, 'issue')}` : 'Validation: no issues');
      inputs.forEach((inp, i) => inp.closest('tr').classList.toggle('is-flagged', issues.some((x) => x.row === i)));
    };

    const setOpen = (open) => {
      fly.hidden = !open;
      shield.setAttribute('aria-expanded', String(open));
    };

    const save = ({ openPanel = false } = {}) => {
      issues = validate();
      setStatus('✓ Saved · not blocked');
      later(() => {
        render({ pop: true });
        if (openPanel && issues.length) later(() => setOpen(true), 900);
      }, reduceMotion ? 0 : 350);
    };

    const reset = () => {
      inputs.forEach((inp, i) => { inp.value = clean[i]; });
      issues = [];
      render();
      setOpen(false);
      status.classList.remove('is-shown');
    };

    const autoplay = () => {
      stopAuto();
      reset();
      const target = inputs[2];
      if (reduceMotion) { target.value = '250.00'; save({ openPanel: true }); return; }
      const text = '250.00';
      later(() => { target.parentElement.classList.add('is-typing'); target.value = ''; }, 700);
      [...text].forEach((ch, k) => later(() => { target.value += ch; }, 950 + k * 110));
      const t = 950 + text.length * 110 + 350;
      later(() => { target.parentElement.classList.remove('is-typing'); saveBtn.classList.add('is-pressed'); }, t);
      later(() => { saveBtn.classList.remove('is-pressed'); save({ openPanel: true }); }, t + 180);
    };

    reset();
    inputs.forEach((inp) => {
      inp.addEventListener('focus', stopAuto);
      inp.addEventListener('input', () => { stopAuto(); setStatus('Unsaved changes'); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });
    saveBtn.addEventListener('click', () => { stopAuto(); save(); });
    replayBtn.addEventListener('click', autoplay);
    shield.addEventListener('click', () => { stopAuto(); setOpen(fly.hidden); });
    vd.querySelector('.vd-close').addEventListener('click', () => { setOpen(false); shield.focus(); });
    flyBody.addEventListener('click', (e) => {
      const ack = e.target.closest('.vd-ack');
      if (!ack) return;
      const li = ack.closest('.vd-issue');
      const row = Number(li.dataset.row);
      li.classList.add('is-leaving');
      setTimeout(() => { issues = issues.filter((x) => x.row !== row); render(); }, reduceMotion ? 0 : 230);
    });
    onceVisible([vd], autoplay, 0.45);
  }

  /* ── CONFIG RACE ─────────────────────────── */
  // Both lanes run on the same (sped-up) clock; the copy lane loops and counts finished configs.
  const race = document.getElementById('race');
  if (race) {
    const BEFORE = 105, AFTER = 27, SPEED = 30;
    const fill = (lane) => race.querySelector(`.race-fill[data-lane="${lane}"]`);
    const time = (lane) => race.querySelector(`.race-time[data-lane="${lane}"]`);
    const countEl = race.querySelector('.race-count');
    let raf = 0;

    const draw = (t) => {
      const before = Math.min(t / BEFORE, 1);
      const done = Math.min(t, BEFORE) / AFTER;
      const afterP = t >= BEFORE ? done % 1 || 1 : done % 1;
      fill('before').style.setProperty('--p', before);
      fill('after').style.setProperty('--p', t >= BEFORE ? 1 : afterP);
      time('before').textContent = `${Math.round(Math.min(t, BEFORE))} sec`;
      time('after').textContent = `${Math.round((done % 1) * AFTER) || (t > 0 ? AFTER : 0)} sec`;
      countEl.textContent = t >= BEFORE ? (BEFORE / AFTER).toFixed(1) : Math.floor(done);
      if (t >= BEFORE) time('after').textContent = '27 sec each';
    };

    const play = () => {
      cancelAnimationFrame(raf);
      if (reduceMotion) { draw(BEFORE); return; }
      const start = performance.now();
      const tick = (now) => {
        const t = ((now - start) / 1000) * SPEED;
        draw(t);
        if (t < BEFORE) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    draw(0);
    race.querySelector('.race-replay').addEventListener('click', play);
    onceVisible([race], play, 0.5);
  }

  /* ── NOTEBOOK SKETCHES ───────────────────── */
  // Double up the main strokes with a faint offset copy, then draw everything in on view.
  const sketches = document.querySelectorAll('.sketch');
  sketches.forEach((sk) => {
    sk.querySelectorAll('.ink > :not(.thin):not(.accent)').forEach((el, i) => {
      const ghost = el.cloneNode();
      ghost.classList.add('ghost');
      ghost.setAttribute('transform', `translate(${i % 2 ? 0.9 : -0.7} ${i % 3 ? 0.6 : -0.5})`);
      el.after(ghost);
    });
  });
  drawIn(sketches, { paths: '.ink > *, .notes path', onDraw: (sk) => sk.classList.add('is-drawn') });

  /* ── APP WINDOW SHEEN ────────────────────── */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.app').forEach((app) => {
      let frame = 0;
      let x = 0;
      let y = 0;
      app.addEventListener('pointermove', (e) => {
        x = e.clientX;
        y = e.clientY;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const r = app.getBoundingClientRect();
          app.style.setProperty('--mx', `${x - r.left}px`);
          app.style.setProperty('--my', `${y - r.top}px`);
        });
      });
    });
  }

  /* ── PLAY ANIMATIONS ON VIEW ─────────────── */
  const photo = document.querySelector('.about-photo-wrap');
  if (photo && noHover) photo.setAttribute('data-play', '');
  onceVisible(document.querySelectorAll('[data-play]'), (el) => el.classList.add('is-playing'), 0.35);

  /* ── METRIC COUNTERS ─────────────────────── */
  if (!reduceMotion) {
    onceVisible(document.querySelectorAll('[data-count]'), (el) => {
      const text = el.textContent;
      const match = text.match(/[\d,]+(\.\d+)?/);
      if (!match) return;
      const target = parseFloat(match[0].replace(/,/g, ''));
      const decimals = match[1] ? match[1].length - 1 : 0;
      const useCommas = match[0].includes(',');
      const [before, after] = [text.slice(0, match.index), text.slice(match.index + match[0].length)];
      const fmt = (n) => {
        const s = n.toFixed(decimals);
        return useCommas ? Number(s).toLocaleString('en-US') : s;
      };
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / 1400, 1);
        el.textContent = before + fmt(target * (1 - Math.pow(1 - p, 3))) + after;
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = text;
      };
      requestAnimationFrame(tick);
    }, 0.6);
  }

  /* ── SECTION DWELL TIME (analytics) ──────── */
  // How long each landmark section is actually in view, reported in chunks
  // (on tab hide/close and every 30s) so long or interrupted visits aren't lost.
  const DWELL_IDS = [
    'hero', 'about', 'skills',
    'case-validation', 'case-price-validator', 'case-self-service',
    'case-pricing-engine', 'case-config-copy', 'case-migration',
    'projects', 'outside', 'testimonials', 'contact',
  ];
  const dwellEls = DWELL_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  if (dwellEls.length) {
    const activeSince = new Map();   // id -> timestamp its timer started
    const accumulated = new Map();   // id -> ms banked, not yet reported
    const onLine = new Set();        // ids on the centre line (a pinned one may be covered)

    const startTimer = (id, now) => { if (!activeSince.has(id)) activeSince.set(id, now); };
    const stopTimer = (id, now) => {
      const start = activeSince.get(id);
      if (start == null) return;
      accumulated.set(id, (accumulated.get(id) || 0) + (now - start));
      activeSince.delete(id);
    };

    const flush = () => {
      const now = performance.now();
      [...activeSince.keys()].forEach((id) => stopTimer(id, now));
      accumulated.forEach((ms, id) => {
        const seconds = Math.round(ms / 1000);
        if (seconds >= 3) track('section-dwell', { section: id, seconds });
        accumulated.set(id, 0);
      });
      sync(now);
    };

    // Time whatever is showing on the line, not a pinned layer covered by it.
    const sync = (now) => {
      const els = [...onLine].map((id) => document.getElementById(id));
      const showing = document.visibilityState === 'visible' ? topmost(els).map((el) => el.id) : [];
      [...activeSince.keys()].forEach((id) => { if (!showing.includes(id)) stopTimer(id, now); });
      showing.forEach((id) => startTimer(id, now));
    };

    // A section is "in view" while it spans the middle of the viewport, so only one counts at a time.
    onCentreLine(dwellEls, (el, active) => {
      if (active) onLine.add(el.id);
      else onLine.delete(el.id);
      sync(performance.now());
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
      else sync(performance.now());
    });
    window.addEventListener('pagehide', flush);
    setInterval(() => { if (document.visibilityState === 'visible') flush(); }, 30000);
  }

  /* ── CASE VIEWS (analytics) ──────────────── */
  const caseViews = onCentreLine(document.querySelectorAll('article[id^="case-"]'), (el, active) => {
    if (!active) return;
    track('case-view', { case: el.id.replace('case-', '') });
    caseViews.unobserve(el);
  });

  /* ── COPY EMAIL ──────────────────────────── */
  // The button ships hidden; it only appears where the Clipboard API exists.
  const copyBtn = document.querySelector('.contact-copy');
  if (copyBtn && navigator.clipboard) {
    const row = copyBtn.parentElement;
    const label = copyBtn.querySelector('.contact-copy-label');
    const announce = row.querySelector('[role="status"]');
    const email = row.querySelector('a[href^="mailto:"]').getAttribute('href').slice(7);
    let resetTimer = 0;
    copyBtn.hidden = false;
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(email); } catch (e) { return; }
      label.textContent = 'Copied ✓';
      copyBtn.classList.add('is-copied');
      announce.textContent = 'Email address copied';
      track('contact-copy-email');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        label.textContent = 'Copy';
        copyBtn.classList.remove('is-copied');
        announce.textContent = '';
      }, 2000);
    });
  }

  /* ── SCROLL REVEAL ───────────────────────── */
  onceVisible(document.querySelectorAll('.reveal'), (el) => el.classList.add('visible'), 0.12);

  /* ── MORE CASE STUDIES ───────────────────── */
  const moreToggle = document.querySelector('.more-toggle');
  const morePanel = document.getElementById('more-panel');
  if (moreToggle && morePanel) {
    const title = moreToggle.querySelector('.more-toggle-title');
    const setOpen = (open) => {
      moreToggle.setAttribute('aria-expanded', String(open));
      morePanel.classList.toggle('is-open', open);
      morePanel.inert = !open;
      title.textContent = open ? 'Show fewer case studies' : 'See 3 more case studies';
    };
    setOpen(false);
    moreToggle.addEventListener('click', () => {
      const open = moreToggle.getAttribute('aria-expanded') !== 'true';
      setOpen(open);
      if (open) track('more-cases-open');
    });
    // Deep links / skill-proof links into a hidden case open the panel first
    const openFor = (hash) => {
      if (!hash || hash.length < 2) return;
      const target = document.getElementById(hash.slice(1));
      if (target && morePanel.contains(target)) {
        setOpen(true);
        setTimeout(() => target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }), 350);
      }
    };
    document.querySelectorAll('a[href^="#case-"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target && morePanel.contains(target)) {
          e.preventDefault();
          history.pushState(null, '', a.getAttribute('href'));
          openFor(a.getAttribute('href'));
        }
      });
    });
    openFor(location.hash);
  }

  /* ── NAV: THEME, SCROLLED STATE, ACTIVE LINK ─ */
  const nav = document.querySelector('.nav');
  const surfaces = [...document.querySelectorAll('[data-surface]')];
  const links = [...document.querySelectorAll('.nav-links a')];
  // Each link owns its own section; Projects also covers the "Outside work" section after it.
  const EXTRA = { '#projects': ['#outside'], '#contact': ['#testimonials'] };
  const sections = links.map((a) => {
    const href = a.getAttribute('href');
    return [href, ...(EXTRA[href] || [])].map((sel) => document.querySelector(sel)).filter(Boolean);
  });

  // Case rail: visible while #work is on the line; each track shows progress through its case.
  const rail = document.querySelector('.case-rail');
  const work = document.getElementById('work');
  const railWide = window.matchMedia('(min-width: 1200px)');
  const railItems = rail ? [...rail.querySelectorAll('a')].map((a) => [a, document.querySelector(a.getAttribute('href'))]) : [];
  if (rail) rail.inert = true;
  const updateRail = (line) => {
    if (!rail || !work || !railWide.matches) return;
    const w = work.getBoundingClientRect();
    const show = w.top <= line && w.bottom > line;
    if (show !== rail.classList.contains('is-visible')) {
      rail.classList.toggle('is-visible', show);
      rail.inert = !show;
    }
    if (!show) return;
    railItems.forEach(([a, el]) => {
      const r = el.getBoundingClientRect();
      a.style.setProperty('--p', Math.min(Math.max((line - r.top) / r.height, 0), 1).toFixed(3));
      const active = r.top <= line && r.bottom > line;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };

  // Pinned layers sit under flow sections, so "spans the line" isn't enough: only the topmost
  // layer at that line is showing.
  const spans = (el, y) => {
    const r = el.getBoundingClientRect();
    return r.top <= y && r.bottom > y;
  };
  const showingAt = (y) => topmost(surfaces.filter((s) => spans(s, y)));

  const updateNav = () => {
    const [under] = showingAt(nav.offsetHeight / 2);
    if (under) nav.dataset.theme = under.dataset.surface;
    nav.classList.toggle('is-scrolled', window.scrollY > 24);

    const line = window.innerHeight * 0.4;
    const layerHere = Math.min(...showingAt(line).map(layerOf));
    links.forEach((a, i) => {
      a.classList.toggle('is-active', sections[i].some((el) => spans(el, line) && layerOf(el) <= layerHere));
    });
    updateRail(line);
    checkCovered();
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateNav(); ticking = false; });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateNav();

  /* ── CURTAIN: PINNED HERO AND FINALE ─────── */
  // The pinning itself is CSS. Here: pin offsets, so a layer taller than the viewport scrolls
  // to its end before pinning (hero) or is revealed top-first (finale), plus the two things
  // sticky layers break natively: anchor links to them and keyboard focus inside them.
  if (main && hero && finale) {
    const navH = () => nav.offsetHeight;
    const setPins = () => {
      const vh = window.innerHeight;
      hero.style.setProperty('--hero-pin', `${Math.min(0, vh - hero.offsetHeight)}px`);
      // The finale pins with its top just under the nav, so its first lines never hide behind it.
      finale.style.setProperty('--finale-pin', `${Math.min(0, vh - navH() - finale.offsetHeight)}px`);
    };
    setPins();
    const ro = new ResizeObserver(setPins);
    ro.observe(hero);
    ro.observe(finale);
    window.addEventListener('resize', setPins);

    const mainBottom = () => main.getBoundingClientRect().bottom + window.scrollY;
    // Where an element in a pinned layer really sits in the document, as if nothing were pinned
    const realTop = (el) => {
      const layer = hero.contains(el) ? hero : finale;
      const layerTop = layer === hero ? main.getBoundingClientRect().top + window.scrollY : mainBottom();
      return layerTop + el.getBoundingClientRect().top - layer.getBoundingClientRect().top;
    };
    const scrollToY = (top, smooth) => {
      if (smooth && !reduceMotion) { window.scrollTo({ top, behavior: 'smooth' }); return; }
      const root = document.documentElement;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, top);
      root.style.scrollBehavior = '';
    };

    // Anchor links to a pinned layer do nothing natively: its stuck box is already "in view".
    const PINNED = ['#hero', '#testimonials', '#contact'];
    const goTo = (hash, smooth) => {
      const el = document.querySelector(hash);
      if (el) scrollToY(el === hero ? 0 : realTop(el) - navH(), smooth);
    };
    document.querySelectorAll(PINNED.map((h) => `a[href="${h}"]`).join(',')).forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        history.pushState(null, '', a.getAttribute('href'));
        goTo(a.getAttribute('href'), true);
      });
    });
    window.addEventListener('hashchange', () => { if (PINNED.includes(location.hash)) goTo(location.hash, true); });
    if (PINNED.includes(location.hash)) {
      // Again on load: late fonts and images move things, and the browser re-scrolls to the hash.
      requestAnimationFrame(() => goTo(location.hash, false));
      window.addEventListener('load', () => goTo(location.hash, false), { once: true });
    }

    // Keyboard focus must never sit behind another section (WCAG 2.4.11). If it lands in a
    // covered pinned layer, scroll that layer to its real position.
    const revealFocus = (e) => {
      const el = e.target;
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && el.contains(hit)) return;
        const top = realTop(el);
        const fit = top + r.height + 24 - window.innerHeight;  // scroll that puts el near the bottom
        if (hero.contains(el)) scrollToY(Math.max(0, Math.min(hero.offsetHeight - window.innerHeight, fit)));
        else scrollToY(Math.max(mainBottom() - navH(), fit));
      });
    };
    hero.addEventListener('focusin', revealFocus);
    finale.addEventListener('focusin', revealFocus);
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
  console.log(`%c${GS}`, `color: #FFB0C8; ${MONO}`);
  console.log(
    '%cHi, engineer 👋\nNo framework. No build step.\n0 dependencies. View source is the docs.\n\n› try: coffee()',
    'color: #8f8a84; line-height: 1.5',
  );
  // Returns the sign-off so the console prints it instead of "undefined".
  window.coffee = () => {
    console.log(`%c${CUP}`, `color: #FFB0C8; ${MONO}`);
    track('console-coffee');
    return "Brewed. Let's talk → gsvendsen@me.com";
  };
})();
