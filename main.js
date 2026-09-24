(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;

  /* Fire a callback once when an element scrolls into view */
  const onceVisible = (els, cb, threshold = 0.3) => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        cb(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold });
    els.forEach((el) => io.observe(el));
  };

  /* ── SCRIBBLE UNDERLINES ─────────────────── */
  const SCRIBBLE = `
    <svg class="scribble-svg" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true">
      <path d="M1 9 C55 5, 115 4, 185 6 S255 10, 296 12" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.8"/>
      <path d="M25 13 C72 9, 132 8, 198 10 S258 14, 282 16" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M250 11 L266 3 L258 18 L274 9" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const scribbles = document.querySelectorAll('.scribble');
  scribbles.forEach((el) => {
    el.insertAdjacentHTML('beforeend', SCRIBBLE);
    el.querySelectorAll('path').forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = reduceMotion ? 0 : len;
    });
  });
  if (!reduceMotion) {
    onceVisible(scribbles, (el) => {
      el.querySelectorAll('path').forEach((p, i) => {
        setTimeout(() => {
          p.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)';
          p.style.strokeDashoffset = '0';
        }, 300 + i * 180);
      });
    }, 0.6);
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
      if (!rows.length) tbody.innerHTML = '<tr><td colspan="5" style="text-decoration:none;color:rgba(245,242,236,.55)">No paid zones. Everything is free as it should be.</td></tr>';
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
      setOpen(moreToggle.getAttribute('aria-expanded') !== 'true');
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
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')));

  const updateNav = () => {
    const probe = nav.offsetHeight / 2;
    const under = surfaces.find((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= probe && r.bottom > probe;
    });
    if (under) nav.dataset.theme = under.dataset.surface;
    nav.classList.toggle('is-scrolled', window.scrollY > 24);

    const line = window.innerHeight * 0.4;
    links.forEach((a, i) => {
      const r = sections[i] && sections[i].getBoundingClientRect();
      a.classList.toggle('is-active', !!r && r.top <= line && r.bottom > line);
    });
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
})();
