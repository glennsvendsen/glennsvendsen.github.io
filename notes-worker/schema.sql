-- npx wrangler d1 execute notes --remote --file=schema.sql   (and --local for wrangler dev)
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'no' CHECK (lang IN ('no', 'en', 'both')),
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'post', 'photos')),
  images TEXT NOT NULL DEFAULT '[]',          -- JSON: [{ "key", "w", "h", "alt" }] in order
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT                           -- set on first publish; the date shown on the site
);
CREATE INDEX IF NOT EXISTS posts_published ON posts (status, published_at DESC);

-- Photos, shrunk in the browser (WebP/JPEG, max 1600 px, < 2 MB). Kept in D1 instead of R2 so the free plan's hard
-- limits apply: when a limit is reached the service stops until the next day, it is never billed.
CREATE TABLE IF NOT EXISTS images (
  key TEXT PRIMARY KEY,                       -- e.g. 2026/11/forste-snoen-1a2b3c4d.webp
  type TEXT NOT NULL,                         -- image/webp or image/jpeg
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);
