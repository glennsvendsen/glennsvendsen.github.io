// Contact form → hello@glennsvendsen.com, via Cloudflare Email Routing's send_email binding.
// No dependencies. Deployed separately from the site (see worker/README.md).
//
// POST /contact  (form-encoded from a no-JS post, or JSON from main.js)
//   fields: name, email, message, website (honeypot, must be empty), cf-turnstile-response
//   JSON request  → JSON reply { ok: true } or { ok: false, error }
//   form request  → 303 back to the site with ?sent=1 or ?sent=0
import { EmailMessage } from 'cloudflare:email';

const SITE = 'https://www.glennsvendsen.com';
const ALLOWED_RE = /^(https:\/\/(www\.)?glennsvendsen\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const allowed = (origin) => ALLOWED_RE.test(origin);
const LIMITS = { name: 100, email: 200, message: 5000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = allowed(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
      : {};

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/contact') return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    // A browser always sends Origin on a cross-site POST; refuse other sites' pages.
    if (origin && !allowed(origin)) return new Response('Forbidden', { status: 403 });

    // Nothing honest is bigger than this; don't even read it.
    if (Number(request.headers.get('Content-Length') || 0) > 16384) return new Response('Too large', { status: 413, headers: cors });

    const type = request.headers.get('Content-Type') || '';
    const wantsJson = type.includes('application/json');
    const back = (ok) => {
      const to = new URL(allowed(origin) ? origin : SITE);
      to.searchParams.set('sent', ok ? '1' : '0');
      to.hash = 'hello';
      return Response.redirect(to.toString(), 303);
    };
    const reply = (ok, error, status = ok ? 200 : 400) =>
      wantsJson
        ? new Response(JSON.stringify(ok ? { ok } : { ok, error }), { status, headers: { 'Content-Type': 'application/json', ...cors } })
        : back(ok);

    let data;
    try {
      data = wantsJson ? await request.json() : Object.fromEntries(await request.formData());
    } catch {
      return reply(false, 'bad-request');
    }

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (env.LIMIT) {
      const { success } = await env.LIMIT.limit({ key: ip || 'anon' });
      if (!success) return reply(false, 'slow-down', 429);
    }

    // Bots fill every field. Pretend it worked so they move on.
    if (str(data.website)) return reply(true);

    const name = oneLine(str(data.name)).slice(0, LIMITS.name);
    const email = oneLine(str(data.email)).slice(0, LIMITS.email);
    const message = str(data.message).replace(/\r\n?/g, '\n').trim();
    if (!message) return reply(false, 'empty');
    if (message.length > LIMITS.message) return reply(false, 'too-long');
    if (email && !/^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/.test(email)) return reply(false, 'email');

    if (!(await human(str(data['cf-turnstile-response']), ip, env))) return reply(false, 'turnstile', 403);

    const from = env.FROM || 'form@glennsvendsen.com';
    const to = env.TO;
    if (!to) return reply(false, 'send', 500);
    const who = name || email || 'someone';
    const lines = [
      message,
      '',
      '—',
      `Name:  ${name || '(not given)'}`,
      `Email: ${email || '(not given)'}`,
      `Page:  ${origin || 'no-js post'}`,
      `Sent:  ${new Date().toISOString()}`,
    ];
    const headers = [
      `From: ${mimeWord('glennsvendsen.com')} <${from}>`,
      `To: <${to}>`,
      email ? `Reply-To: ${name ? `${mimeWord(name)} ` : ''}<${email}>` : null,
      `Subject: ${mimeWord(`Hello from ${who}`)}`,
      `Message-ID: <${crypto.randomUUID()}@glennsvendsen.com>`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
    ].filter(Boolean);
    const raw = `${headers.join('\r\n')}\r\n\r\n${base64(lines.join('\n')).replace(/.{76}/g, '$&\r\n')}`;

    try {
      await env.SEND.send(new EmailMessage(from, to, raw));
    } catch (err) {
      console.error('send failed', err && err.message);
      return reply(false, 'send', 502);
    }
    return reply(true);
  },
};

async function human(token, ip, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const out = await res.json();
    // The token must come from this site (or localhost in development with Turnstile's test keys).
    return out.success === true && (!out.hostname || /^(www\.)?glennsvendsen\.com$|^localhost$|^127\.0\.0\.1$|^example\.com$/.test(out.hostname));
  } catch {
    return false;
  }
}

const str = (v) => (typeof v === 'string' ? v : '');
// No line breaks in anything that goes into a header (stops header injection).
const oneLine = (s) => s.replace(/[\r\n\t]+/g, ' ').trim();
const base64 = (s) => {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
// RFC 2047 encoded-word, so names like "Bjørn" survive in headers.
const mimeWord = (s) => (/^[\x20-\x7e]*$/.test(s) && !/[<>"]/.test(s) ? s : `=?UTF-8?B?${base64(s)}?=`);
