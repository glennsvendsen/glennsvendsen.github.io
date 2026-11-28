/* Notes: the "Lately" list in the hero and the /notes/ page. Posts come from the notes Worker
   (notes-worker/), fetched once per visit. If it is slow, down or empty, nothing shows and the page is as before. */
(() => {
  const site = window.site || { lang: () => 'en', tr: (k, e) => e, onLang: () => {}, reduceMotion: true };
  const { tr } = site;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API = local ? 'http://localhost:8788' : 'https://notes.glennsvendsen.com';
  const lately = document.querySelector('.lately');
  const book = document.querySelector('#notebook');
  if (!lately && !book) return;

  /* ── fetching ─────────────────────────────── */
  const get = async (path) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);   // a slow service never holds the page up
    try {
      const res = await fetch(API + path, { signal: ctrl.signal });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  };
  // The first page is kept for the visit (5 minutes), like the weather.
  const firstPage = async () => {
    try {
      const c = JSON.parse(sessionStorage.getItem('notes') || 'null');
      if (c && Date.now() - c.t < 5 * 60e3) return c.data;
    } catch (e) { /* ignore */ }
    const data = await get('/posts?limit=20');
    try { sessionStorage.setItem('notes', JSON.stringify({ t: Date.now(), data })); } catch (e) { /* ignore */ }
    return data;
  };

  /* ── small helpers ────────────────────────── */
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const textOf = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); };
  const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const titleOf = (p) => p.title || short(textOf(p.html), 56) || `${tr('n.photos', 'Photos')} (${p.images.length})`;
  const fmtDate = (iso, withYear) => {
    const d = new Date(iso);
    const year = withYear || d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString(site.lang() === 'no' ? 'nb-NO' : 'en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }).replace('.', '');
  };
  const isNew = (iso) => Date.now() - new Date(iso) < 7 * 864e5;
  const imgSrc = (key) => `${API}/img/${key.split('/').map(encodeURIComponent).join('/')}`;
  const langLabel = (p) => {
    if (p.lang === 'no' && site.lang() !== 'no') return 'In Norwegian';
    if (p.lang === 'en' && site.lang() === 'no') return 'På engelsk';
    return '';
  };

  /* ── "Lately" in the hero ─────────────────── */
  const BULLET = '<svg class="lately-bullet" viewBox="0 0 12 12" aria-hidden="true"><path pathLength="1" d="M3.2 6.6C3.6 4.2 7.6 3.4 8.8 5.6C9.8 7.8 6.2 9.4 4.4 8.2C3.4 7.5 3.6 6 5 5.5"/></svg>';
  const UNDER = '<svg class="lately-under" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1 4.2C18 2.4 40 5 62 3.4S90 2.8 99 4"/></svg>';

  const renderLately = (posts) => {
    const list = lately.querySelector('.lately-list');
    list.replaceChildren(...posts.slice(0, 3).map((p, i) => {
      const li = el('li', isNew(p.date) ? 'is-new' : '');
      li.style.setProperty('--i', i);
      li.innerHTML = `<a href="notes/#${encodeURIComponent(p.slug)}">${BULLET}<span class="lately-text">${esc(titleOf(p))}${UNDER}</span>` +
        `<time class="mono" datetime="${esc(p.date)}">${esc(fmtDate(p.date))}</time></a>`;
      return li;
    }));
  };

  if (lately) {
    firstPage().then(({ posts }) => {
      if (!posts || !posts.length) return;
      renderLately(posts);
      site.onLang(() => renderLately(posts));
      lately.hidden = false;
      // Written in after the signature (once per session, like it); straight away if that is already done.
      const sig = document.querySelector('.signature--hero');
      const go = () => requestAnimationFrame(() => lately.classList.add('is-in'));
      if (site.reduceMotion || !sig || sig.classList.contains('is-written')) { lately.classList.add('is-in', 'no-anim'); return; }
      const mo = new MutationObserver(() => { if (sig.classList.contains('is-written')) { mo.disconnect(); go(); } });
      mo.observe(sig, { attributes: true, attributeFilter: ['class'] });
    }).catch(() => { /* stays hidden */ });
  }

  if (!book) return;

  /* ── the darkroom: prints on a line ────────── */
  let lightbox = null;
  const openLightbox = (images, start) => {
    if (!lightbox) {
      lightbox = el('dialog', 'lightbox');
      lightbox.innerHTML = `<figure><img alt=""><figcaption class="mono"></figcaption></figure>
        <button type="button" class="lb-btn lb-prev" aria-label="Previous photo">←</button>
        <button type="button" class="lb-btn lb-next" aria-label="Next photo">→</button>
        <button type="button" class="lb-btn lb-close" aria-label="Close">✕</button>`;
      document.body.append(lightbox);
      lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
      lightbox.querySelector('.lb-close').onclick = () => lightbox.close();
      lightbox.querySelector('.lb-prev').onclick = () => lightbox.step(-1);
      lightbox.querySelector('.lb-next').onclick = () => lightbox.step(1);
      lightbox.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') lightbox.step(-1);
        if (e.key === 'ArrowRight') lightbox.step(1);
      });
    }
    let i = start;
    const show = () => {
      const im = images[i];
      const img = lightbox.querySelector('img');
      img.src = imgSrc(im.key); img.alt = im.alt || ''; img.width = im.w; img.height = im.h;
      lightbox.querySelector('figcaption').textContent = `${im.alt ? `${im.alt} · ` : ''}${i + 1}/${images.length}`;
      lightbox.querySelector('.lb-prev').hidden = images.length < 2;
      lightbox.querySelector('.lb-next').hidden = images.length < 2;
    };
    lightbox.step = (d) => { i = (i + d + images.length) % images.length; show(); };
    lightbox.querySelector('.lb-prev').setAttribute('aria-label', tr('n.prev', 'Previous photo'));
    lightbox.querySelector('.lb-next').setAttribute('aria-label', tr('n.next', 'Next photo'));
    lightbox.querySelector('.lb-close').setAttribute('aria-label', tr('n.close', 'Close'));
    show();
    lightbox.showModal();
  };

  const PEG = '<svg class="peg" viewBox="0 0 14 30" aria-hidden="true"><path d="M4 1.5C3.6 9 3.8 19 4.6 28.5M10 1.5C10.4 9 10.2 19 9.4 28.5M3.4 2C6 0.8 8.4 0.8 10.6 2M3.6 12.5C6 13.4 8 13.4 10.4 12.5"/><circle class="peg-spring" cx="7" cy="12.9" r="1.6"/></svg>';

  // vector-effect keeps the stroke 1.3px however wide the segment is stretched.
  const ROPE = '<svg class="dr-rope" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="M0 1.5C30 9 70 9 100 1.5"/></svg>';
  const ROPE_IN = '<svg class="dr-rope dr-rope--in" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="M0 6C40 8 75 6 100 1.5"/></svg>';

  const darkroom = (images) => {
    const wrap = el('div', 'darkroom');
    const track = el('ul', 'dr-track');
    track.tabIndex = 0;
    track.setAttribute('aria-label', tr('n.photosLabel', 'Photos'));
    images.forEach((im, i) => {
      const li = el('li', 'dr-print');
      li.style.setProperty('--k', [1, -0.7, 0.85, -1.1, 0.6][i % 5]);
      li.innerHTML = `${i === 0 ? ROPE_IN : ''}${ROPE}${PEG}<button type="button" class="dr-paper" aria-label="${esc(tr('n.open', 'Open photo') + (im.alt ? `: ${im.alt}` : ''))}">` +
        `<img src="${imgSrc(im.key)}" alt="${esc(im.alt)}" width="${im.w}" height="${im.h}" loading="lazy" decoding="async"></button>` +
        (im.alt ? `<p class="dr-note">${esc(im.alt)}</p>` : '');
      li.querySelector('button').onclick = () => openLightbox(images, i);
      track.append(li);
    });
    wrap.append(track);
    if (images.length < 2) { track.firstChild.classList.add('is-developed'); return wrap; }

    const nav = el('div', 'dr-nav');
    nav.innerHTML = `<button type="button" class="dr-btn" data-d="-1" aria-label="${esc(tr('n.prev', 'Previous photo'))}">←</button>` +
      `<button type="button" class="dr-btn" data-d="1" aria-label="${esc(tr('n.next', 'Next photo'))}">→</button>`;
    wrap.append(nav);
    const stepBy = (d) => {
      const first = track.children[0], second = track.children[1];
      const w = second.offsetLeft - first.offsetLeft;
      track.scrollBy({ left: d * w, behavior: site.reduceMotion ? 'auto' : 'smooth' });
    };
    nav.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) stepBy(Number(b.dataset.d)); });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepBy(e.key === 'ArrowLeft' ? -1 : 1); }
    });

    if (site.reduceMotion) { [...track.children].forEach((li) => li.classList.add('is-developed')); return wrap; }

    // The print in the middle develops; the others stay pale.
    const io = new IntersectionObserver((entries) => entries.forEach((en) => en.target.classList.toggle('is-developed', en.isIntersecting)),
      { root: track, rootMargin: '0px -30% 0px -30%', threshold: 0 });
    [...track.children].forEach((li) => io.observe(li));

    // The prints swing with the scroll, harder the faster it goes, and settle (a small damped spring).
    let angle = 0, vel = 0, lastX = track.scrollLeft, lastT = performance.now(), raf = 0;
    const tick = () => {
      vel += (-0.06 * angle - 0.12 * vel);
      angle += vel;
      track.style.setProperty('--swing', `${angle.toFixed(2)}deg`);
      if (Math.abs(angle) < 0.02 && Math.abs(vel) < 0.02) { angle = vel = 0; track.style.setProperty('--swing', '0deg'); raf = 0; return; }
      raf = requestAnimationFrame(tick);
    };
    track.addEventListener('scroll', () => {
      const now = performance.now();
      const v = (track.scrollLeft - lastX) / Math.max(now - lastT, 8);
      lastX = track.scrollLeft; lastT = now;
      vel = Math.max(-1.2, Math.min(1.2, vel - v * 0.5));
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    return wrap;
  };

  /* ── the notebook (/notes/) ───────────────── */
  const entry = (p) => {
    const a = el('article', `entry entry--${p.kind}${isNew(p.date) ? ' is-new' : ''}`);
    a.id = p.slug;
    if (p.lang !== 'both') a.lang = p.lang === 'no' ? 'nb' : 'en';
    const label = langLabel(p);
    a.innerHTML = `<p class="entry-meta mono"><time datetime="${esc(p.date)}">${esc(fmtDate(p.date, true))}</time>` +
      (label ? `<span class="entry-lang">${label}</span>` : '') +
      `<a class="entry-link" href="#${encodeURIComponent(p.slug)}">${esc(tr('n.link', 'Link'))}</a>` +
      `<button type="button" class="entry-share">${esc(tr('n.share', 'Share'))}</button></p>` +
      (p.title ? `<h2 class="entry-title">${esc(p.title)}</h2>` : '') +
      (p.html ? `<div class="entry-body">${p.html}</div>` : '');   // html is built from escaped text by the Worker
    if (p.images.length) a.append(darkroom(p.images));
    a.querySelector('.entry-share').onclick = async (e) => {
      const url = `${API}/p/${encodeURIComponent(p.slug)}`;
      try {
        if (navigator.share) await navigator.share({ title: titleOf(p), url });
        else { await navigator.clipboard.writeText(url); e.target.textContent = tr('n.copied', 'Link copied'); }
      } catch (err) { /* cancelled */ }
    };
    return a;
  };

  const list = book.querySelector('.notebook-list');
  const status = book.querySelector('.notebook-status');
  const more = book.querySelector('.notebook-more');
  const back = book.querySelector('.notebook-back');
  let posts = [];
  let hasMore = false;

  const render = () => {
    const slug = decodeURIComponent(location.hash.slice(1));
    const one = slug && posts.find((p) => p.slug === slug);
    list.replaceChildren(...(one ? [one] : posts).map(entry));
    back.hidden = !one;
    more.hidden = !!one || !hasMore;
    status.hidden = posts.length > 0;
    if (!posts.length) status.textContent = tr('n.empty', 'Nothing here yet.');
    if (one) window.scrollTo({ top: 0 });
  };

  const showOne = async () => {
    const slug = decodeURIComponent(location.hash.slice(1));
    if (slug && !posts.some((p) => p.slug === slug)) {
      try { const { post } = await get(`/posts/${encodeURIComponent(slug)}`); posts.push(post); } catch (e) { /* not found: show all */ }
    }
    render();
  };

  firstPage().then((data) => {
    posts = data.posts || [];
    hasMore = !!data.more;
    showOne();
  }).catch(() => {
    status.textContent = tr('n.down', 'The notes could not be fetched right now. Try again in a while.');
  });

  window.addEventListener('hashchange', () => { if (posts.length) showOne(); });
  site.onLang(() => { if (posts.length) render(); });
  more.addEventListener('click', async () => {
    more.disabled = true;
    try {
      const data = await get(`/posts?limit=20&before=${encodeURIComponent(posts[posts.length - 1].date)}`);
      posts = posts.concat(data.posts);
      hasMore = !!data.more;
      render();
    } catch (e) { /* try again later */ }
    more.disabled = false;
  });
})();
