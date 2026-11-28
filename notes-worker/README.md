# Notes Worker

Posts and photos for www.glennsvendsen.com: the "Lately" list in the hero and `/notes/`. Served at
`https://notes.glennsvendsen.com`. No dependencies. D1 (`DB`) holds the posts and the images (blobs in
`images`). No R2 on purpose: on the free plan everything has hard limits and nothing is ever billed, so no card is needed.

| Path | What |
|---|---|
| `GET /posts?limit=20&before=<iso>` | published posts, newest first (`{ posts, more }`) |
| `GET /posts/:slug` | one post |
| `GET /img/:key` | an image from D1 (cached for a day, so a deleted photo is gone everywhere within a day) |
| `GET /feed.xml` | RSS |
| `GET /p/:slug` | share page with Open Graph tags, redirects to `/notes/#slug` |
| `/admin` | the writing tool (mobile first); its API needs the admin key |

Posts are plain text: blank line = new paragraph, `**bold**`, `*italic*`, `[text](https://…)`, bare https links. The
Worker escapes everything first (`render()`), so a post can never carry HTML or scripts. Reads are cached at the edge
for 60 s; a new post is on the site within a minute (the site also keeps the list for 5 minutes per visit).
Images are shrunk in the browser before upload (max 1600 px, WebP, JPEG as fallback); re-encoding drops EXIF and GPS.

## One-time setup

From this folder:

```bash
npx wrangler login
npx wrangler d1 create notes                     # put the database_id in wrangler.toml
npx wrangler d1 execute notes --remote --file=schema.sql
```

Then deploy and set the admin key (a long random string; kept in the git-ignored `notes-worker/.admin-key`):

```bash
npx wrangler deploy
openssl rand -base64 48 | tr -d '/+=\n' | head -c 64 > .admin-key
npx wrangler secret put ADMIN_TOKEN < .admin-key
```

Open `https://notes.glennsvendsen.com/admin` on the phone, paste the key once (it is kept in the phone's
localStorage), and add the page to the home screen. Every `/admin/*` request sends it as `Authorization: Bearer …`
and the Worker compares it in constant time. To change the key (say a phone is lost), run the last two commands
again; every device then has to paste the new one.

No Cloudflare Access on purpose (Zero Trust needs a plan with a card). The Worker still accepts an Access token if
`ACCESS_TEAM` and `ACCESS_AUD` are ever set.

## Local development

`notes-worker/.dev.vars` (git-ignored) holds `DEV=1`, which skips the key check. It is read by `wrangler dev`
and never uploaded by `wrangler deploy`.

```bash
npx wrangler d1 execute notes --local --file=schema.sql
npx wrangler dev --port 8788
```

Then `/admin` is at http://localhost:8788/admin, and the site (`python3 -m http.server 8000`) reads from :8788.

## Backup

```bash
npx wrangler d1 export notes --remote --output=notes-backup.sql
```

The export includes the images (the `images` table).
