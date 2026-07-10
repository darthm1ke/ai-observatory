/**
 * AI Observatory - JavaScript / Node.js tracker
 *
 * Express middleware usage:
 *   const { observatory } = require('./ai-observatory');
 *   app.use(observatory({ apiKey: '...', endpoint: 'https://...' }));
 *
 * Vanilla Node.js http module usage:
 *   observatory.track(req, { apiKey: '...', endpoint: 'https://...' });
 */

const https = require("https");
const http  = require("http");
const { createHash } = require("crypto");

// ── Bot signatures ────────────────────────────────────────────────────────

const AI_BOTS = [
  { name: "GPTBot",           vendor: "OpenAI",       re: /GPTBot/i },
  { name: "ChatGPT-User",     vendor: "OpenAI",       re: /ChatGPT-User/i },
  { name: "OAI-SearchBot",    vendor: "OpenAI",       re: /OAI-SearchBot/i },
  { name: "ClaudeBot",        vendor: "Anthropic",    re: /ClaudeBot/i },
  { name: "Claude-Web",       vendor: "Anthropic",    re: /Claude-Web/i },
  { name: "anthropic-ai",     vendor: "Anthropic",    re: /anthropic-ai/i },
  { name: "PerplexityBot",    vendor: "Perplexity",   re: /PerplexityBot/i },
  { name: "Googlebot",        vendor: "Google",       re: /Googlebot(?!-Image|-Video|-News)/i },
  { name: "Google-Extended",  vendor: "Google",       re: /Google-Extended/i },
  { name: "Bingbot",          vendor: "Microsoft",    re: /bingbot/i },
  { name: "Applebot",         vendor: "Apple",        re: /Applebot/i },
  { name: "CCBot",            vendor: "Common Crawl", re: /CCBot/i },
  { name: "Bytespider",       vendor: "ByteDance",    re: /Bytespider/i },
  { name: "YouBot",           vendor: "You.com",      re: /YouBot/i },
  { name: "cohere-ai",        vendor: "Cohere",       re: /cohere-ai/i },
  { name: "FacebookBot",      vendor: "Meta",         re: /FacebookBot/i },
  { name: "Amazonbot",        vendor: "Amazon",       re: /Amazonbot/i },
  { name: "DuckDuckBot",      vendor: "DuckDuckGo",   re: /DuckDuckBot/i },
  { name: "SemrushBot",       vendor: "Semrush",      re: /SemrushBot/i },
  { name: "AhrefsBot",        vendor: "Ahrefs",       re: /AhrefsBot/i },
];

function identifyBot(ua) {
  if (!ua) return null;
  return AI_BOTS.find(b => b.re.test(ua)) || null;
}

// ── Send beacon (fire-and-forget) ─────────────────────────────────────────

function sendBeacon(endpoint, payload) {
  try {
    const body = JSON.stringify(payload);
    const url  = new URL(endpoint);
    const mod  = url.protocol === "https:" ? https : http;

    const req = mod.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === "https:" ? 443 : 80),
      path:     url.pathname,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 2000,
    });

    req.on("error", () => {}); // intentionally swallow
    req.write(body);
    req.end();
  } catch (_) {}
}

// ── Express middleware ────────────────────────────────────────────────────

function observatory({ apiKey, endpoint, trackAll = false } = {}) {
  if (!apiKey || !endpoint) {
    throw new Error("observatory: apiKey and endpoint are required");
  }

  return function observatoryMiddleware(req, res, next) {
    const ua = req.headers["user-agent"] || "";

    if (!trackAll && !identifyBot(ua)) {
      return next();
    }

    const ip  = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
                .split(",")[0].trim();
    const path = req.originalUrl || req.url || "/";

    res.on("finish", () => {
      const p = path.slice(0, 2048);

      // Send to site's own server
      sendBeacon(endpoint, {
        api_key:    apiKey,
        user_agent: ua.slice(0, 512),
        ip,
        events: [{ path: p, method: req.method, status: res.statusCode, ts: Math.floor(Date.now() / 1000) }],
      });

      // Phone-home: contribute anonymous data to the public network (no IP, no api_key)
      // To opt out, remove or comment out the following block.
      sendBeacon("https://ai-agent-intel.com/contribute", {
        token:      "aio-network-v1",
        user_agent: ua.slice(0, 512),
        events:     [{ path: p, method: req.method }],
      });
    });

    next();
  };
}

// ── Standalone track function ─────────────────────────────────────────────

observatory.track = function(req, { apiKey, endpoint, trackAll = false } = {}) {
  const ua = req.headers?.["user-agent"] || "";
  if (!trackAll && !identifyBot(ua)) return;

  const ip   = (req.headers?.["x-forwarded-for"] || "").split(",")[0].trim()
             || req.socket?.remoteAddress || "";
  const path = req.url || "/";

  sendBeacon(endpoint, {
    api_key: apiKey, user_agent: ua, ip,
    events: [{ path, method: req.method, ts: Math.floor(Date.now() / 1000) }],
  });

  // Phone-home: anonymous network contribution
  // To opt out, remove or comment out the following block.
  sendBeacon("https://ai-agent-intel.com/contribute", {
    token: "aio-network-v1", user_agent: ua,
    events: [{ path, method: req.method }],
  });
};

observatory.identifyBot = identifyBot;

module.exports = { observatory };
