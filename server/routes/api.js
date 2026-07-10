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

// GET /api/network - aggregated across ALL network contributors (public, no auth)
router.get("/network", (req, res) => {
  const { db } = require("../db");

  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const s = Math.floor(Date.now() / 1000) - days * 86400;

  const topBots = db.prepare(`
    SELECT bot_name, bot_vendor, COUNT(*) AS hits, COUNT(DISTINCT path) AS unique_paths
    FROM network_contributions WHERE ts >= ?
    GROUP BY bot_name ORDER BY hits DESC LIMIT 20
  `).all(s);

  const topPaths = db.prepare(`
    SELECT path, path_category, COUNT(*) AS hits
    FROM network_contributions WHERE ts >= ?
    GROUP BY path ORDER BY hits DESC LIMIT 30
  `).all(s);

  const probeRates = db.prepare(`
    SELECT
      ROUND(100.0 * SUM(CASE WHEN path = '/robots.txt'  THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT bot_name || '|' || path), 0), 1) AS robots_pct,
      ROUND(100.0 * SUM(CASE WHEN path = '/sitemap.xml' THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT bot_name || '|' || path), 0), 1) AS sitemap_pct,
      ROUND(100.0 * SUM(CASE WHEN path LIKE '%openapi%' OR path LIKE '%swagger%' THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT bot_name || '|' || path), 0), 1) AS openapi_pct,
      ROUND(100.0 * SUM(CASE WHEN path = '/llms.txt'   THEN 1 ELSE 0 END) / NULLIF(COUNT(DISTINCT bot_name || '|' || path), 0), 1) AS llmstxt_pct
    FROM network_contributions WHERE ts >= ?
  `).get(s);

  // First path per notional session (group by bot_name + hour bucket)
  const firstPaths = db.prepare(`
    SELECT path, COUNT(*) AS cnt
    FROM network_contributions WHERE ts >= ? AND is_probe = 1
    GROUP BY path ORDER BY cnt DESC LIMIT 10
  `).all(s);

  const totalContribs  = (db.prepare("SELECT COUNT(*) AS n FROM network_contributions WHERE ts >= ?").get(s) || {}).n || 0;
  const uniqueBots     = (db.prepare("SELECT COUNT(DISTINCT bot_name) AS n FROM network_contributions WHERE ts >= ?").get(s) || {}).n || 0;
  const uniqueSites    = (db.prepare("SELECT COUNT(DISTINCT source_domain) AS n FROM network_contributions WHERE ts >= ? AND source_domain IS NOT NULL AND source_domain != ''").get(s) || {}).n || 0;

  res.json({
    network: { contributions: totalContribs, unique_bots: uniqueBots, contributors: uniqueSites, period_days: days },
    probe_rates: probeRates,
    top_bots: topBots,
    top_paths: topPaths,
    first_requests: firstPaths,
  });
});

module.exports = router;
