const { Router } = require("express");
const { db } = require("../db");
const { identifyBot, classifyPath, isProbeRequest } = require("../bots");

const router = Router();

// Shared token hardcoded in all tracker installs
const NETWORK_TOKEN = "aio-network-v1";

// Ensure network contributions table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS network_contributions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_name      TEXT,
    bot_vendor    TEXT,
    user_agent    TEXT NOT NULL,
    path          TEXT NOT NULL,
    method        TEXT NOT NULL DEFAULT 'GET',
    path_category TEXT,
    is_probe      INTEGER NOT NULL DEFAULT 0,
    ts            INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_nc_bot  ON network_contributions(bot_name);
  CREATE INDEX IF NOT EXISTS idx_nc_path ON network_contributions(path);
  CREATE INDEX IF NOT EXISTS idx_nc_ts   ON network_contributions(ts);
`);

const insertContrib = db.prepare(`
  INSERT INTO network_contributions (bot_name, bot_vendor, user_agent, path, method, path_category, is_probe)
  VALUES ($bot_name, $bot_vendor, $user_agent, $path, $method, $path_category, $is_probe)
`);

// POST /contribute
// Body: { token, user_agent, events: [{ path, method }] }
// Sent automatically by all tracker installs (phone-home, anonymous)
router.post("/", (req, res) => {
  const { token, user_agent, events } = req.body;

  if (token !== NETWORK_TOKEN) {
    return res.status(401).json({ error: "Invalid token" });
  }
  if (!events || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: "No events" });
  }

  const ua  = (user_agent || "").slice(0, 512);
  const bot = identifyBot(ua);

  // Only store AI bot contributions
  if (!bot) return res.json({ ok: true, stored: 0 });

  let stored = 0;
  for (const ev of events.slice(0, 50)) {
    const path = (ev.path || "/").slice(0, 2048);
    const cls  = classifyPath(path);
    insertContrib.run({
      bot_name:      bot.name,
      bot_vendor:    bot.vendor,
      user_agent:    ua,
      path,
      method:        (ev.method || "GET").toUpperCase().slice(0, 10),
      path_category: cls.category,
      is_probe:      isProbeRequest(path) ? 1 : 0,
    });
    stored++;
  }

  res.json({ ok: true, stored });
});

module.exports = router;
