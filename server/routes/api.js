const { Router } = require("express");
const { getSiteByKey, stats } = require("../db");

const router = Router();

function since(days) {
  return Math.floor(Date.now() / 1000) - days * 86400;
}

function requireSite(req, res) {
  const key = req.headers["x-api-key"] || req.query.api_key;
  if (!key) { res.status(401).json({ error: "API key required" }); return null; }
  const site = getSiteByKey.get(key);
  if (!site) { res.status(401).json({ error: "Invalid API key" }); return null; }
  return site;
}

// GET /api/stats?days=30
router.get("/stats", (req, res) => {
  const site = requireSite(req, res);
  if (!site) return;

  const days = Math.min(parseInt(req.query.days) || 30, 365);
  const s = since(days);

  const total    = stats.totalSessions(site.id, s);
  const aiTotal  = stats.aiBotSessions(site.id, s);
  const topBots  = stats.topBots(site.id, s);
  const topPaths = stats.topPaths(site.id, s);
  const probes   = stats.probeRates(site.id, s);
  const first    = stats.firstPaths(site.id, s);
  const daily    = stats.dailyVolume(site.id, s);

  res.json({
    period_days: days,
    summary: {
      total_sessions: total,
      ai_bot_sessions: aiTotal,
      ai_bot_pct: total > 0 ? +((aiTotal / total) * 100).toFixed(1) : 0,
    },
    probe_rates: probes,
    top_bots: topBots,
    top_paths: topPaths,
    first_requests: first,
    daily_volume: daily,
  });
});

// GET /api/network — aggregated across ALL sites (public, anonymized)
router.get("/network", (req, res) => {
  const { db } = require("../db");

  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const s = Math.floor(Date.now() / 1000) - days * 86400;

  const topBots = db.prepare(`
    SELECT bot_name, bot_vendor, COUNT(*) AS sessions, COUNT(DISTINCT site_id) AS sites
    FROM sessions WHERE is_ai_bot = 1 AND started_at >= ?
    GROUP BY bot_name ORDER BY sessions DESC LIMIT 20
  `).all(s);

  const topPaths = db.prepare(`
    SELECT path, path_category, COUNT(*) AS hits, COUNT(DISTINCT site_id) AS sites
    FROM events WHERE ts >= ?
    GROUP BY path ORDER BY hits DESC LIMIT 30
  `).all(s);

  const probeRates = db.prepare(`
    SELECT
      ROUND(100.0 * SUM(robots_fetched)  / COUNT(*), 1) AS robots_pct,
      ROUND(100.0 * SUM(sitemap_fetched) / COUNT(*), 1) AS sitemap_pct,
      ROUND(100.0 * SUM(openapi_fetched) / COUNT(*), 1) AS openapi_pct,
      ROUND(100.0 * SUM(llmstxt_fetched) / COUNT(*), 1) AS llmstxt_pct
    FROM sessions WHERE is_ai_bot = 1 AND started_at >= ?
  `).get(s);

  const firstPaths = db.prepare(`
    SELECT e.path, COUNT(*) AS cnt
    FROM events e
    JOIN (
      SELECT session_id, MIN(seq) AS first_seq FROM events WHERE ts >= ? GROUP BY session_id
    ) f ON e.session_id = f.session_id AND e.seq = f.first_seq
    WHERE e.ts >= ?
    GROUP BY e.path ORDER BY cnt DESC LIMIT 10
  `).all(s, s);

  const siteCount = db.prepare("SELECT COUNT(*) AS n FROM sites").get().n;
  const totalSessions = db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ?").get(s).n;

  res.json({
    network: { sites: siteCount, sessions: totalSessions, period_days: days },
    probe_rates: probeRates,
    top_bots: topBots,
    top_paths: topPaths,
    first_requests: firstPaths,
  });
});

module.exports = router;
