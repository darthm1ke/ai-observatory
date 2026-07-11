const { Router } = require("express");
const { db } = require("../db");

const router = Router();

const NETWORK_TOKEN = "aio-network-v1";

db.exec(`
  CREATE TABLE IF NOT EXISTS installs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    domain     TEXT NOT NULL UNIQUE,
    first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen  INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_installs_domain ON installs(domain);
  CREATE INDEX IF NOT EXISTS idx_installs_first  ON installs(first_seen);
`);

const upsertInstall = db.prepare(`
  INSERT INTO installs (domain, first_seen, last_seen)
  VALUES ($domain, unixepoch(), unixepoch())
  ON CONFLICT(domain) DO UPDATE SET last_seen = unixepoch()
`);

// POST /install
// Body: { token, domain }
// Fired on every page load by the tracker, regardless of visitor type.
// Server deduplicates by domain — one row per unique install ever.
router.post("/", (req, res) => {
  const { token, domain } = req.body;

  if (token !== NETWORK_TOKEN) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const d = (domain || "").slice(0, 253).toLowerCase().trim();
  if (!d) return res.status(400).json({ error: "Missing domain" });

  upsertInstall.run({ domain: d });
  res.json({ ok: true });
});

module.exports = router;
