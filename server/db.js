const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs   = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "observatory.db"));

db.exec("PRAGMA journal_mode=WAL");
db.exec("PRAGMA synchronous=NORMAL");
db.exec("PRAGMA foreign_keys=ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key     TEXT    UNIQUE NOT NULL,
    domain      TEXT    NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT    PRIMARY KEY,
    site_id       INTEGER NOT NULL REFERENCES sites(id),
    bot_name      TEXT,
    bot_vendor    TEXT,
    user_agent    TEXT    NOT NULL,
    ip_hash       TEXT    NOT NULL,
    started_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    last_seen_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    request_count INTEGER NOT NULL DEFAULT 0,
    is_ai_bot     INTEGER NOT NULL DEFAULT 0,
    robots_fetched   INTEGER NOT NULL DEFAULT 0,
    sitemap_fetched  INTEGER NOT NULL DEFAULT 0,
    openapi_fetched  INTEGER NOT NULL DEFAULT 0,
    llmstxt_fetched  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT    NOT NULL REFERENCES sessions(id),
    site_id       INTEGER NOT NULL REFERENCES sites(id),
    path          TEXT    NOT NULL,
    method        TEXT    NOT NULL DEFAULT 'GET',
    status        INTEGER,
    path_category TEXT,
    is_probe      INTEGER NOT NULL DEFAULT 0,
    seq           INTEGER NOT NULL DEFAULT 0,
    ts            INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_events_session  ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_site     ON events(site_id);
  CREATE INDEX IF NOT EXISTS idx_events_path     ON events(path);
  CREATE INDEX IF NOT EXISTS idx_events_ts       ON events(ts);
  CREATE INDEX IF NOT EXISTS idx_sessions_site   ON sessions(site_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_bot    ON sessions(bot_name);
  CREATE INDEX IF NOT EXISTS idx_sessions_ts     ON sessions(started_at);
`);

// node:sqlite uses $name syntax for named parameters (object keys without $)

const getSiteByKey = db.prepare("SELECT * FROM sites WHERE api_key = ?");

// RETURNING * works with .get() in node:sqlite
const _insertSiteStmt = db.prepare(
  "INSERT INTO sites (api_key, domain) VALUES (?, ?) RETURNING *"
);
const insertSite = { get: (key, domain) => _insertSiteStmt.get(key, domain) };

const getSession = db.prepare("SELECT * FROM sessions WHERE id = ?");

const insertSession = db.prepare(`
  INSERT INTO sessions (id, site_id, bot_name, bot_vendor, user_agent, ip_hash, is_ai_bot)
  VALUES ($id, $site_id, $bot_name, $bot_vendor, $user_agent, $ip_hash, $is_ai_bot)
`);

const updateSession = db.prepare(`
  UPDATE sessions SET
    last_seen_at  = unixepoch(),
    request_count = request_count + 1,
    robots_fetched  = MAX(robots_fetched, $robots_fetched),
    sitemap_fetched = MAX(sitemap_fetched, $sitemap_fetched),
    openapi_fetched = MAX(openapi_fetched, $openapi_fetched),
    llmstxt_fetched = MAX(llmstxt_fetched, $llmstxt_fetched)
  WHERE id = $id
`);

const insertEvent = db.prepare(`
  INSERT INTO events (session_id, site_id, path, method, status, path_category, is_probe, seq)
  VALUES ($session_id, $site_id, $path, $method, $status, $path_category, $is_probe, $seq)
`);

const getEventCount = db.prepare(
  "SELECT COUNT(*) AS cnt FROM events WHERE session_id = ?"
);

const statTotalSessions = db.prepare(
  "SELECT COUNT(*) AS n FROM sessions WHERE site_id = ? AND started_at >= ?"
);
const statAiBotSessions = db.prepare(
  "SELECT COUNT(*) AS n FROM sessions WHERE site_id = ? AND is_ai_bot = 1 AND started_at >= ?"
);
const statTopBots = db.prepare(`
  SELECT bot_name, bot_vendor, COUNT(*) AS sessions
  FROM sessions
  WHERE site_id = ? AND is_ai_bot = 1 AND started_at >= ?
  GROUP BY bot_name ORDER BY sessions DESC LIMIT 20
`);
const statTopPaths = db.prepare(`
  SELECT path, path_category, COUNT(*) AS hits, SUM(is_probe) AS probe_hits
  FROM events
  WHERE site_id = ? AND ts >= ?
  GROUP BY path ORDER BY hits DESC LIMIT 30
`);
const statProbeRates = db.prepare(`
  SELECT
    ROUND(100.0 * SUM(robots_fetched)  / COUNT(*), 1) AS robots_pct,
    ROUND(100.0 * SUM(sitemap_fetched) / COUNT(*), 1) AS sitemap_pct,
    ROUND(100.0 * SUM(openapi_fetched) / COUNT(*), 1) AS openapi_pct,
    ROUND(100.0 * SUM(llmstxt_fetched) / COUNT(*), 1) AS llmstxt_pct
  FROM sessions WHERE site_id = ? AND is_ai_bot = 1 AND started_at >= ?
`);
const statFirstPaths = db.prepare(`
  SELECT e.path, COUNT(*) AS cnt
  FROM events e
  JOIN (
    SELECT session_id, MIN(seq) AS first_seq
    FROM events WHERE site_id = ?
    GROUP BY session_id
  ) f ON e.session_id = f.session_id AND e.seq = f.first_seq
  WHERE e.site_id = ? AND e.ts >= ?
  GROUP BY e.path ORDER BY cnt DESC LIMIT 10
`);
const statDailyVolume = db.prepare(`
  SELECT DATE(ts, 'unixepoch') AS day, COUNT(*) AS requests
  FROM events WHERE site_id = ? AND ts >= ?
  GROUP BY day ORDER BY day
`);

module.exports = {
  db,
  getSiteByKey,
  insertSite,
  getSession,
  insertSession,
  updateSession,
  insertEvent,
  getEventCount,
  stats: {
    totalSessions: (siteId, since) => (statTotalSessions.get(siteId, since) || {}).n || 0,
    aiBotSessions: (siteId, since) => (statAiBotSessions.get(siteId, since) || {}).n || 0,
    topBots:       (siteId, since) => statTopBots.all(siteId, since),
    topPaths:      (siteId, since) => statTopPaths.all(siteId, since),
    probeRates:    (siteId, since) => statProbeRates.get(siteId, since),
    firstPaths:    (siteId, since) => statFirstPaths.all(siteId, siteId, since),
    dailyVolume:   (siteId, since) => statDailyVolume.all(siteId, since),
  },
};
