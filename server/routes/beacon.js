const { Router } = require("express");
const { randomUUID } = require("crypto");
const { createHash } = require("crypto");
const {
  getSiteByKey, getSession, insertSession,
  updateSession, insertEvent, getEventCount,
} = require("../db");
const { identifyBot, classifyPath, isProbeRequest } = require("../bots");

const router = Router();

function hashIp(ip) {
  return createHash("sha256").update(ip + process.env.IP_SALT || "obs").digest("hex").slice(0, 16);
}

function sessionId(siteId, ipHash, ua) {
  // Deterministic session key: site + ip-hash + ua-hash, resets each hour
  const hour = Math.floor(Date.now() / 3_600_000);
  return createHash("sha256")
    .update(`${siteId}:${ipHash}:${ua}:${hour}`)
    .digest("hex")
    .slice(0, 32);
}

// POST /beacon - main data ingestion endpoint
// Body: { api_key, events: [{ path, method, status, ts }], user_agent, ip }
router.post("/", (req, res) => {
  const { api_key, events, user_agent, ip, referrer } = req.body;

  if (!api_key || !events || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const site = getSiteByKey.get(api_key);
  if (!site) return res.status(401).json({ error: "Invalid API key" });

  const ua = (user_agent || req.headers["user-agent"] || "").slice(0, 512);
  const remoteIp = ip || req.ip || "";
  const ipHash = hashIp(remoteIp);
  const sid = sessionId(site.id, ipHash, ua);
  const bot = identifyBot(ua);

  // Upsert session
  let session = getSession.get(sid);
  if (!session) {
    insertSession.run({
      id: sid,
      site_id: site.id,
      bot_name: bot?.name || null,
      bot_vendor: bot?.vendor || null,
      user_agent: ua,
      ip_hash: ipHash,
      is_ai_bot: bot ? 1 : 0,
    });
    session = getSession.get(sid);
  }

  const currentCount = getEventCount.get(sid).cnt;

  let robots_fetched = 0, sitemap_fetched = 0,
      openapi_fetched = 0, llmstxt_fetched = 0;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const path = (ev.path || "/").slice(0, 2048);
    const cls = classifyPath(path);
    const probe = isProbeRequest(path) ? 1 : 0;

    const lp = path.split("?")[0].toLowerCase();
    if (lp === "/robots.txt")  robots_fetched = 1;
    if (lp === "/sitemap.xml" || lp === "/sitemap_index.xml") sitemap_fetched = 1;
    if (lp.includes("openapi") || lp.includes("swagger")) openapi_fetched = 1;
    if (lp === "/llms.txt") llmstxt_fetched = 1;

    insertEvent.run({
      session_id: sid,
      site_id: site.id,
      path,
      method: (ev.method || "GET").toUpperCase().slice(0, 10),
      status: ev.status || null,
      path_category: cls.category,
      is_probe: probe,
      seq: currentCount + i,
    });
  }

  updateSession.run({
    id: sid,
    robots_fetched,
    sitemap_fetched,
    openapi_fetched,
    llmstxt_fetched,
  });

  res.json({ ok: true, session_id: sid, bot: bot?.name || null });
});

module.exports = router;
