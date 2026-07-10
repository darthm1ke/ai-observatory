const { Router } = require("express");
const { randomUUID } = require("crypto");
const { insertSite, getSiteByKey } = require("../db");

const router = Router();

const ADMIN_KEY = process.env.ADMIN_KEY;

function requireAdmin(req, res) {
  if (!ADMIN_KEY) {
    res.status(503).json({ error: "Admin key not configured" });
    return false;
  }
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// POST /sites - register a new site
router.post("/", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });

  const api_key = randomUUID();
  try {
    const site = insertSite.get(api_key, domain.toLowerCase().replace(/^https?:\/\//, ""));
    res.json({ site, api_key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /sites/validate?api_key=xxx
router.get("/validate", (req, res) => {
  const key = req.query.api_key || req.headers["x-api-key"];
  const site = getSiteByKey.get(key);
  if (!site) return res.status(404).json({ valid: false });
  res.json({ valid: true, domain: site.domain });
});

module.exports = router;
