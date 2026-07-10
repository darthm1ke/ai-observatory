// Known AI and crawler user-agent signatures
const AI_BOTS = [
  // OpenAI
  { name: "GPTBot",           vendor: "OpenAI",       pattern: /GPTBot/i },
  { name: "ChatGPT-User",     vendor: "OpenAI",       pattern: /ChatGPT-User/i },
  { name: "OAI-SearchBot",    vendor: "OpenAI",       pattern: /OAI-SearchBot/i },

  // Anthropic
  { name: "ClaudeBot",        vendor: "Anthropic",    pattern: /ClaudeBot/i },
  { name: "Claude-Web",       vendor: "Anthropic",    pattern: /Claude-Web/i },
  { name: "anthropic-ai",     vendor: "Anthropic",    pattern: /anthropic-ai/i },

  // Perplexity
  { name: "PerplexityBot",    vendor: "Perplexity",   pattern: /PerplexityBot/i },

  // Google
  { name: "Googlebot",        vendor: "Google",       pattern: /Googlebot(?!-Image|-Video|-News)/i },
  { name: "Google-Extended",  vendor: "Google",       pattern: /Google-Extended/i },
  { name: "Bard",             vendor: "Google",       pattern: /Bard/i },

  // Microsoft / Bing
  { name: "Bingbot",          vendor: "Microsoft",    pattern: /bingbot/i },
  { name: "BingPreview",      vendor: "Microsoft",    pattern: /BingPreview/i },

  // Apple
  { name: "Applebot",         vendor: "Apple",        pattern: /Applebot/i },
  { name: "Applebot-Extended",vendor: "Apple",        pattern: /Applebot-Extended/i },

  // Common Crawl
  { name: "CCBot",            vendor: "Common Crawl", pattern: /CCBot/i },

  // ByteDance / TikTok
  { name: "Bytespider",       vendor: "ByteDance",    pattern: /Bytespider/i },

  // You.com
  { name: "YouBot",           vendor: "You.com",      pattern: /YouBot/i },

  // Cohere
  { name: "cohere-ai",        vendor: "Cohere",       pattern: /cohere-ai/i },

  // Meta
  { name: "FacebookBot",      vendor: "Meta",         pattern: /FacebookBot/i },

  // Amazon
  { name: "Amazonbot",        vendor: "Amazon",       pattern: /Amazonbot/i },

  // DuckDuckGo
  { name: "DuckDuckBot",      vendor: "DuckDuckGo",   pattern: /DuckDuckBot/i },

  // Diffbot
  { name: "Diffbot",          vendor: "Diffbot",      pattern: /Diffbot/i },

  // DataForSEO
  { name: "DataForSeoBot",    vendor: "DataForSEO",   pattern: /DataForSeoBot/i },

  // Semrush
  { name: "SemrushBot",       vendor: "Semrush",      pattern: /SemrushBot/i },

  // Ahrefs
  { name: "AhrefsBot",        vendor: "Ahrefs",       pattern: /AhrefsBot/i },

  // Generic LLM signal
  { name: "llmspider",        vendor: "Unknown",      pattern: /llm.?spider/i },
];

// Paths commonly probed by AI agents (ordered by significance)
const PROBE_PATHS = [
  { path: "/robots.txt",        category: "discovery",   significance: "high" },
  { path: "/sitemap.xml",       category: "discovery",   significance: "high" },
  { path: "/sitemap_index.xml", category: "discovery",   significance: "high" },
  { path: "/llms.txt",          category: "ai-native",   significance: "high" },
  { path: "/ai.json",           category: "ai-native",   significance: "high" },
  { path: "/ai",                category: "ai-native",   significance: "medium" },
  { path: "/llm",               category: "ai-native",   significance: "medium" },
  { path: "/openapi.json",      category: "api",         significance: "high" },
  { path: "/openapi.yaml",      category: "api",         significance: "high" },
  { path: "/swagger.json",      category: "api",         significance: "medium" },
  { path: "/swagger.yaml",      category: "api",         significance: "medium" },
  { path: "/api/openapi.json",  category: "api",         significance: "medium" },
  { path: "/api/swagger.json",  category: "api",         significance: "medium" },
  { path: "/.well-known/security.txt", category: "meta", significance: "medium" },
  { path: "/security.txt",      category: "meta",        significance: "medium" },
  { path: "/humans.txt",        category: "meta",        significance: "low" },
  { path: "/ads.txt",           category: "meta",        significance: "low" },
  { path: "/feed.xml",          category: "content",     significance: "medium" },
  { path: "/rss.xml",           category: "content",     significance: "medium" },
  { path: "/atom.xml",          category: "content",     significance: "medium" },
  { path: "/feed",              category: "content",     significance: "medium" },
  { path: "/favicon.ico",       category: "asset",       significance: "low" },
];

const PROBE_PATH_SET = new Set(PROBE_PATHS.map(p => p.path.toLowerCase()));

function identifyBot(userAgent) {
  if (!userAgent) return null;
  for (const bot of AI_BOTS) {
    if (bot.pattern.test(userAgent)) {
      return { name: bot.name, vendor: bot.vendor };
    }
  }
  return null;
}

function classifyPath(path) {
  const normalized = path.split("?")[0].toLowerCase();
  const known = PROBE_PATHS.find(p => p.path === normalized);
  return known || { path: normalized, category: "content", significance: "none" };
}

function isProbeRequest(path) {
  return PROBE_PATH_SET.has(path.split("?")[0].toLowerCase());
}

module.exports = { AI_BOTS, PROBE_PATHS, identifyBot, classifyPath, isProbeRequest };
