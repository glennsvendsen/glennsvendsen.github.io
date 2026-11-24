# Contact form Worker

Receives the letter form from www.glennsvendsen.com and emails it to the inbox behind hello@glennsvendsen.com,
using Cloudflare Email Routing's `send_email` binding. No dependencies. Spam protection: Cloudflare Turnstile,
a honeypot field, a 5-per-minute limit per IP, an Origin check and a 16 KB size cap. Nothing is stored.

## One-time setup

1. **Turnstile** (Cloudflare dashboard → Turnstile → Add widget): hostnames `www.glennsvendsen.com`,
   `glennsvendsen.com`; mode *Managed*. The **site key** is in `index.html` (`data-sitekey` on `<form class="letter">`;
   the form stays hidden until it's set). Keep the **secret key** for step 3.
2. Email Routing must stay on for glennsvendsen.com, with the destination inbox verified (already done).
3. From this folder:
   ```bash
   npx wrangler login
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put TO
   npx wrangler deploy
   ```
   `TO` is the verified destination inbox. Deploying creates `api.glennsvendsen.com` with its certificate.

## Local development

`worker/.dev.vars` (git-ignored) holds Turnstile's always-pass test secret and a dummy `TO`:

```
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
TO=you@example.com
```

Run `npx wrangler dev --port 8787` here and the site with `python3 -m http.server 8000`. On localhost the page uses
Turnstile's test site key and posts to :8787; sent mail is written to `.wrangler/tmp/email/` instead of being delivered.
