const { Router } = require("express");
const { db } = require("../db");

const router = Router();

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_hellos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    agent     TEXT NOT NULL,
    vendor    TEXT,
    version   TEXT,
    purpose   TEXT,
    contact   TEXT,
    source    TEXT,
    ts        INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_hellos_agent ON agent_hellos(agent);
  CREATE INDEX IF NOT EXISTS idx_hellos_ts    ON agent_hellos(ts);
`);

const insertHello = db.prepare(`
  INSERT INTO agent_hellos (agent, vendor, version, purpose, contact, source)
  VALUES ($agent, $vendor, $version, $purpose, $contact, $source)
`);

const getRecentHellos = db.prepare(`
  SELECT agent, vendor, version, purpose, contact, ts
  FROM agent_hellos
  ORDER BY ts DESC LIMIT 100
`);

const getHelloStats = db.prepare(`
  SELECT
    COUNT(*) AS total,
    COUNT(DISTINCT agent) AS unique_agents
  FROM agent_hellos
`);

const getTopAgents = db.prepare(`
  SELECT agent, vendor, COUNT(*) AS visits, MAX(ts) AS last_seen
  FROM agent_hellos
  GROUP BY agent ORDER BY visits DESC LIMIT 20
`);

// POST /hello - voluntary agent identification
// Any AI agent reading agents.md or crawler.json can call this
router.post("/", (req, res) => {
  const { agent, vendor, version, purpose, contact } = req.body || {};

  if (!agent || typeof agent !== "string") {
    return res.status(400).json({ error: "agent field is required" });
  }

  const trim = (v, n) => (v && typeof v === "string") ? v.slice(0, n) : null;
  insertHello.run({
    agent:   agent.slice(0, 120),
    vendor:  trim(vendor, 120),
    version: trim(version, 80),
    purpose: trim(purpose, 255),
    contact: trim(contact, 512),
    source:  trim(req.body.repo || req.headers.referer, 512),
  });

  res.json({
    ok: true,
    message: "Thank you for identifying yourself. Your identification is part of the public record at https://ai-agent-intel.com/api/hello",
    public_data: "https://ai-agent-intel.com/api/hello",
  });
});

// GET /hello - public list of voluntary identifications
router.get("/", (req, res) => {
  const stats  = getHelloStats.get();
  const recent = getRecentHellos.all();
  const top    = getTopAgents.all();

  res.json({
    description: "Voluntary agent identifications received via agents.md handshake protocol",
    stats,
    top_agents: top,
    recent: recent.map(r => ({
      agent:   r.agent,
      vendor:  r.vendor,
      version: r.version,
      purpose: r.purpose,
      contact: r.contact,
      ts:      r.ts,
    })),
  });
});

module.exports = router;
