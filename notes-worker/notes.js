/* Notes: the posts and photos on www.glennsvendsen.com/notes/, written from /admin on a phone.
   D1 holds the posts and the images (as blobs: no R2, so the free plan's hard limits apply and nothing is ever billed). Reading is open (CORS to the site only); everything under /admin is behind
   Cloudflare Access, and every /admin request is checked again here (Cf-Access-Jwt-Assertion). No dependencies. */
import ADMIN_HTML from './admin.html';

const SITE = 'https://www.glennsvendsen.com';
const ORIGINS = [SITE, 'http://localhost:8000', 'http://127.0.0.1:8000'];
const MAX_IMAGE = 1900 * 1000;   // a D1 row holds at most 2 MB; shrunk photos are ~200–400 KB
const MAX_IMAGES = 20;

export default {
  async fetch(req, env, ctx) {
    const res = await handle(req, env, ctx);
    // Never let a browser guess a type (an upload is only ever served as the image type it was checked as).
    const out = new Response(res.body, res);
    out.headers.set('X-Content-Type-Options', 'nosniff');
    out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return out;
  },
};

async function handle(req, env, ctx) {
  {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/admin' || path.startsWith('/admin/')) return await admin(req, env, url, path);
      if (req.method === 'OPTIONS') return cors(req, new Response(null, { status: 204 }));
      if (req.method !== 'GET' && req.method !== 'HEAD') return text('Method not allowed', 405);
      if (path === '/posts') return cors(req, await cached(req, ctx, () => listPosts(env, url)));
      if (path.startsWith('/posts/')) return cors(req, await cached(req, ctx, () => onePost(env, decodeURIComponent(path.slice(7)))));
      if (path.startsWith('/img/')) return cors(req, await cached(req, ctx, () => image(env, decodeURIComponent(path.slice(5))), 'public, max-age=86400'));
      if (path === '/feed.xml') return await cached(req, ctx, () => feed(env, url), 'public, max-age=600');
      if (path.startsWith('/p/')) return await cached(req, ctx, () => sharePage(env, url, decodeURIComponent(path.slice(3))));
      if (path === '/') return Response.redirect(`${SITE}/notes/`, 302);
      return text('Not found', 404);
    } catch (err) {
      console.error(err);
      return cors(req, json({ error: 'server' }, 500));
    }
  }
}

/* ── helpers ─────────────────────────────── */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const text = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

function cors(req, res) {
  const origin = req.headers.get('Origin');
  res = new Response(res.body, res);
  if (ORIGINS.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.headers.set('Vary', 'Origin');
  }
  return res;
}

// Edge cache (60 s, then served stale while it refreshes): a new post is out within a minute.
async function cached(req, ctx, build, cacheControl = 'public, max-age=60, stale-while-revalidate=600') {
  const cache = caches.default;
  const key = new Request(new URL(req.url).toString());
  let res = await cache.match(key);
  if (res) return res;
  res = await build();
  if (res.status === 200) {
    res = new Response(res.body, res);
    res.headers.set('Cache-Control', cacheControl);
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* Plain text → a little HTML: paragraphs, line breaks, [links](https://…), bare https links, **bold**, *italic*.
   Everything is escaped first, so a post can never carry markup or scripts of its own. */
export function render(src) {
  return String(src || '').replace(/\r/g, '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => {
    let h = esc(p);
    h = h.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" rel="noopener">${t}</a>`);
    h = h.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,!?;:])/g, (_, pre, u) => `${pre}<a href="${u}" rel="noopener">${u.replace(/^https?:\/\/(www\.)?/, '')}</a>`);
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    return `<p>${h.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

const plain = (src, n = 160) => {
  const t = String(src || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

const parseImages = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };

// What the site gets: never drafts, never the database id.
const publicPost = (row) => ({
  slug: row.slug, title: row.title, html: render(row.body), lang: row.lang, kind: row.kind,
  images: parseImages(row.images), date: row.published_at,
});

/* ── reading ─────────────────────────────── */
async function listPosts(env, url) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 20, 1), 50);
  const before = url.searchParams.get('before');
  const stmt = before
    ? env.DB.prepare("SELECT * FROM posts WHERE status = 'published' AND published_at < ? ORDER BY published_at DESC LIMIT ?").bind(before, limit + 1)
    : env.DB.prepare("SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT ?").bind(limit + 1);
  const { results } = await stmt.all();
  const more = results.length > limit;
  return json({ posts: results.slice(0, limit).map(publicPost), more });
}

async function getPublished(env, slug) {
  return env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'").bind(slug).first();
}

async function onePost(env, slug) {
  const row = await getPublished(env, slug);
  return row ? json({ post: publicPost(row) }) : json({ error: 'not found' }, 404);
}

async function image(env, key) {
  const row = await env.DB.prepare('SELECT type, data FROM images WHERE key = ?').bind(key).first();
  if (!row) return text('Not found', 404);
  return new Response(new Uint8Array(row.data), { headers: { 'Content-Type': row.type } });
}

const imgUrl = (url, key) => `${url.origin}/img/${key.split('/').map(encodeURIComponent).join('/')}`;
const postTitle = (row) => row.title || plain(row.body, 60) || 'Photos';

async function feed(env, url) {
  const { results } = await env.DB.prepare("SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 30").all();
  const items = results.map((row) => {
    const imgs = parseImages(row.images).map((i) => `<p><img src="${imgUrl(url, i.key)}" alt="${esc(i.alt)}" width="${i.w}" height="${i.h}"></p>`).join('');
    return `<item><title>${esc(postTitle(row))}</title><link>${SITE}/notes/#${row.slug}</link>` +
      `<guid isPermaLink="false">${esc(row.slug)}</guid><pubDate>${new Date(row.published_at).toUTCString()}</pubDate>` +
      `<description><![CDATA[${render(row.body)}${imgs}]]></description></item>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Glenn Svendsen — Notes</title><link>${SITE}/notes/</link><description>Notes and photos from Oslo.</description>
<atom:link href="${url.origin}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}

// A page for sharing links: real Open Graph tags for Threads, Slack and friends, then on to the site.
async function sharePage(env, url, slug) {
  const row = await getPublished(env, slug);
  const target = row ? `${SITE}/notes/#${encodeURIComponent(slug)}` : `${SITE}/notes/`;
  if (!row) return Response.redirect(target, 302);
  const first = parseImages(row.images)[0];
  const img = first ? imgUrl(url, first.key) : `${SITE}/og-image.png`;
  const title = postTitle(row);
  const html = `<!DOCTYPE html><html lang="${row.lang === 'en' ? 'en' : 'nb'}"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Glenn Svendsen</title>
<meta name="description" content="${esc(plain(row.body))}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Glenn Svendsen">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(plain(row.body))}">
<meta property="og:url" content="${url.origin}/p/${esc(slug)}"><meta property="og:image" content="${esc(img)}">
${first ? `<meta property="og:image:width" content="${first.w}"><meta property="og:image:height" content="${first.h}"><meta property="og:image:alt" content="${esc(first.alt)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}"><link rel="canonical" href="${esc(target)}">
</head><body><p><a href="${esc(target)}">${esc(title)}</a></p></body></html>`;
  return new Response(html, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; img-src https:; frame-ancestors 'none'",
  } });
}

/* ── writing (/admin) ────────────────────── */
let certs = null; // { keys, at }

const b64url = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

async function signedIn(req, env, url) {
  // Local development only: DEV=1 lives in .dev.vars, which `wrangler dev` reads and `wrangler deploy` never uploads.
  if (env.DEV === '1') return true;
  // The admin key (a Worker secret, ADMIN_TOKEN): sent as "Authorization: Bearer …", compared in constant time.
  const auth = req.headers.get('Authorization') || '';
  if (env.ADMIN_TOKEN && auth.startsWith('Bearer ')) {
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([auth.slice(7), env.ADMIN_TOKEN].map((t) => crypto.subtle.digest('SHA-256', enc.encode(t))));
    if (crypto.subtle.timingSafeEqual(a, b)) return true;
  }
  // Or Cloudflare Access, if it is ever put in front of /admin (ACCESS_TEAM and ACCESS_AUD set).
  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return false;
  try {
    const [h, p, s] = token.split('.');
    const header = JSON.parse(new TextDecoder().decode(b64url(h)));
    const claims = JSON.parse(new TextDecoder().decode(b64url(p)));
    if (!certs || Date.now() - certs.at > 3600e3) {
      const r = await fetch(`https://${env.ACCESS_TEAM}/cdn-cgi/access/certs`);
      certs = { keys: (await r.json()).keys, at: Date.now() };
    }
    const jwk = certs.keys.find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    const aud = [].concat(claims.aud);
    return ok && aud.includes(env.ACCESS_AUD) && claims.iss === `https://${env.ACCESS_TEAM}` && claims.exp * 1000 > Date.now();
  } catch (e) {
    return false;
  }
}

function adminPage() {
  return new Response(ADMIN_HTML, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'",
  } });
}

async function admin(req, env, url, path) {
  // The page itself holds no data (it asks for the key), so it is served to anyone; everything else needs the key.
  if (path === '/admin' && req.method === 'GET') return adminPage();
  if (!(await signedIn(req, env, url))) return text('Forbidden', 403);
  if (req.method !== 'GET') {
    // Same-origin only, and a gentle limit in case a session is ever misused.
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin && env.DEV !== '1') return text('Forbidden', 403);
    if (env.LIMIT) {
      const { success } = await env.LIMIT.limit({ key: 'admin' });
      if (!success) return json({ error: 'slow down' }, 429);
    }
  }
  const m = req.method;
  if (path === '/admin/posts' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 200').all();
    return json({ posts: results.map((r) => ({ ...r, images: parseImages(r.images) })) });
  }
  if (path === '/admin/posts' && m === 'POST') return savePost(env, null, await req.json());
  const idMatch = path.match(/^\/admin\/posts\/(\d+)$/);
  if (idMatch && m === 'PUT') return savePost(env, Number(idMatch[1]), await req.json());
  if (idMatch && m === 'DELETE') {
    const row = await env.DB.prepare('SELECT images FROM posts WHERE id = ?').bind(Number(idMatch[1])).first();
    if (!row) return json({ error: 'not found' }, 404);
    const keys = parseImages(row.images).map((i) => i.key);
    const cache = caches.default;
    await Promise.all(keys.map((k) => cache.delete(new Request(imgUrl(url, k)))));
    if (keys.length) await env.DB.batch(keys.map((k) => env.DB.prepare('DELETE FROM images WHERE key = ?').bind(k)));
    await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(Number(idMatch[1])).run();
    return json({ ok: true });
  }
  if (path === '/admin/render' && m === 'POST') return json({ html: render((await req.json()).body) });
  if (path === '/admin/upload' && m === 'POST') return upload(req, env);
  if (path === '/admin/upload' && m === 'DELETE') {
    const key = url.searchParams.get('key') || '';
    // Only images no post uses (removed in the editor before saving, or never saved).
    const used = await env.DB.prepare("SELECT 1 FROM posts WHERE images LIKE ? LIMIT 1").bind(`%"${key.replace(/[%_"]/g, '')}"%`).first();
    if (key && !used) await env.DB.prepare('DELETE FROM images WHERE key = ?').bind(key).run();
    return json({ ok: true });
  }
  return text('Not found', 404);
}

const slugify = (s) => String(s).toLowerCase()
  .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');

async function uniqueSlug(env, base, id) {
  let slug = base, n = 1;
  for (;;) {
    const hit = await env.DB.prepare('SELECT id FROM posts WHERE slug = ?').bind(slug).first();
    if (!hit || hit.id === id) return slug;
    slug = `${base}-${++n}`;
  }
}

async function savePost(env, id, input) {
  const now = new Date().toISOString();
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  const title = String(input.title || '').trim().slice(0, 200);
  const body = String(input.body || '').slice(0, 50000);
  const images = (Array.isArray(input.images) ? input.images : []).slice(0, MAX_IMAGES)
    .filter((i) => i && typeof i.key === 'string' && /^[\w/.-]+$/.test(i.key))
    .map((i) => ({ key: i.key, w: Math.round(Number(i.w)) || 0, h: Math.round(Number(i.h)) || 0, alt: String(i.alt || '').slice(0, 300) }));
  const post = {
    title, body, images: JSON.stringify(images),
    lang: pick(input.lang, ['no', 'en', 'both'], 'no'),
    kind: pick(input.kind, ['note', 'post', 'photos'], images.length && !body ? 'photos' : 'note'),
    status: pick(input.status, ['draft', 'published'], 'draft'),
  };
  if (!title && !body.trim() && !images.length) return json({ error: 'empty' }, 400);

  if (id == null) {
    const base = slugify(title || plain(body, 40)) || `note-${now.slice(0, 10)}`;
    const slug = await uniqueSlug(env, base, null);
    const pub = post.status === 'published' ? now : null;
    const res = await env.DB.prepare(
      'INSERT INTO posts (slug, title, body, lang, kind, images, status, created_at, updated_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(slug, post.title, post.body, post.lang, post.kind, post.images, post.status, now, now, pub).run();
    id = res.meta.last_row_id;
  } else {
    const old = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
    if (!old) return json({ error: 'not found' }, 404);
    // The link stays stable once published; drafts follow their title.
    const slug = old.published_at ? old.slug : await uniqueSlug(env, slugify(title || plain(body, 40)) || old.slug, id);
    const pub = post.status === 'published' ? (old.published_at || now) : old.published_at;
    await env.DB.prepare(
      'UPDATE posts SET slug=?, title=?, body=?, lang=?, kind=?, images=?, status=?, updated_at=?, published_at=? WHERE id=?'
    ).bind(slug, post.title, post.body, post.lang, post.kind, post.images, post.status, now, pub, id).run();
  }
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  return json({ post: { ...row, images: parseImages(row.images) } });
}

async function upload(req, env) {
  const type = req.headers.get('Content-Type') || '';
  const ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg' }[type];
  if (!ext) return json({ error: 'type' }, 415);
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE) return json({ error: 'too large' }, 413);
  const d = new Date();
  const name = slugify(new URL(req.url).searchParams.get('name') || '') || 'photo';
  const key = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${name}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await env.DB.prepare('INSERT INTO images (key, type, data, created_at) VALUES (?, ?, ?, ?)').bind(key, type, buf, d.toISOString()).run();
  return json({ key });
}
