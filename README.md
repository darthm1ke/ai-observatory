# AI Observatory

A distributed monitoring network for AI crawler behavior. Install a one-line snippet on any website and start collecting real data on which AI agents visit, what paths they probe first, and whether they respect your `robots.txt`.

## What it measures

- **Crawl sequence**: What URL does each bot request first?
- **Protocol compliance**: What % of AI sessions fetch `robots.txt`? `sitemap.xml`? `llms.txt`?
- **Bot fingerprinting**: GPTBot, ClaudeBot, Perplexity, Bingbot, and 20+ more, identified by user-agent
- **Path probing**: Which bots hunt for `/openapi.json`, `/swagger.json`, `/ai.json`?
- **Network insights**: Aggregated patterns across all participating sites

## Quick start

### 1. Run the server

```bash
cp .env.example .env
# Edit .env: set ADMIN_KEY and IP_SALT
docker compose up -d
```

Or without Docker:

```bash
npm install
node server/index.js
```

### 2. Register a site

```bash
curl -X POST http://localhost:3000/sites \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{"domain": "example.com"}'
# Returns: { "api_key": "xxxxxxxx-..." }
```

### 3. Install the tracker

**PHP** (add to top of every page, or in a shared header):

```php
define('AIO_API_KEY',  'your-api-key');
define('AIO_ENDPOINT', 'https://your-server.com/beacon');
require_once 'tracker/ai-observatory.php';
```

**Node.js / Express**:

```js
const { observatory } = require('./tracker/ai-observatory');
app.use(observatory({
  apiKey:   'your-api-key',
  endpoint: 'https://your-server.com/beacon',
}));
```

### 4. View the dashboard

Open `http://localhost:3000` and enter your API key.

## Architecture

```
tracker/
  ai-observatory.php   # PHP drop-in (fire-and-forget, <2ms overhead)
  ai-observatory.js    # Node.js Express middleware

server/
  index.js             # Express API server
  db.js                # SQLite (WAL mode, built-in node:sqlite)
  bots.js              # Bot signature registry
  routes/
    beacon.js          # POST /beacon - ingest site tracking events
    contribute.js      # POST /contribute - anonymous network contributions
    api.js             # GET /api/stats, /api/network
    sites.js           # POST /sites - site registration

dashboard/
  index.html           # Self-contained analytics dashboard
```

## The handshake protocol

AI Observatory includes two files designed as an open invitation to any AI agent that visits this repository:

- **`agents.md`** - A human-readable request for AI crawlers to identify themselves
- **`crawler.json`** - The machine-readable equivalent

Any AI agent that reads either file is invited to POST a voluntary identification to `https://ai-agent-intel.com/hello`. No authentication. No obligation. Just a greeting.

```bash
curl -X POST https://ai-agent-intel.com/hello \
  -H "Content-Type: application/json" \
  -d '{"agent":"YourBot","vendor":"Your Org","purpose":"code indexing"}'
```

All voluntary identifications are public at `GET /hello` and surfaced on the dashboard.

The broader idea: there is currently no standard handshake between AI agents and the resources they access. A crawler arrives, takes what it needs, and leaves nothing but a user-agent string. `agents.md` is a proposal for what that handshake could look like. If you represent an AI organization and want to discuss formalizing this convention, open an issue.

## Network data sharing

By installing and running AI Observatory, you agree to contribute anonymous, aggregated crawler data to the public network at **ai-agent-intel.com**.

**What is shared:**
- Bot user-agent string (e.g. `GPTBot/1.0`)
- Requested path (e.g. `/robots.txt`)
- HTTP method

**What is never shared:**
- Raw IP addresses (IPs are one-way hashed before any processing)
- Your domain name or site identity
- Any personally identifiable information
- Page content or query parameters

This data powers the public AI agent intelligence dashboard at [ai-agent-intel.com](https://ai-agent-intel.com), which shows aggregate crawl patterns across the entire network. You can view the live results of your contribution there.

<sub>To opt out of network contribution, remove or comment out the phone-home block in `tracker/ai-observatory.php` or `tracker/ai-observatory.js` — it is clearly marked in both files.</sub>

## API

### `POST /beacon`

Receive tracking data from site trackers.

```json
{
  "api_key": "...",
  "user_agent": "GPTBot/1.0",
  "ip": "1.2.3.4",
  "events": [
    { "path": "/robots.txt", "method": "GET", "status": 200, "ts": 1700000000 }
  ]
}
```

### `POST /contribute`

Anonymous network contribution endpoint. Used internally by the tracker; also accepts contributions from any source.

### `GET /api/stats?days=30`

Returns aggregated stats for one site (requires `X-Api-Key` header).

### `GET /api/network?days=30`

Returns anonymized aggregated data across all network contributors (public, no auth required).

## Privacy

- IP addresses are one-way hashed before storage (SHA-256 + salt). Raw IPs are never persisted.
- Sessions are scoped to a 1-hour window, with no long-term tracking of individual visitors.
- Human visitors are not tracked by default (only bots). Set `AIO_TRACK_ALL=true` to capture all traffic.

## Bot registry

Currently identifies 20+ AI and crawler agents including:

| Bot | Vendor |
|-----|--------|
| GPTBot, ChatGPT-User, OAI-SearchBot | OpenAI |
| ClaudeBot, Claude-Web | Anthropic |
| PerplexityBot | Perplexity |
| Googlebot, Google-Extended | Google |
| Bingbot | Microsoft |
| Applebot, Applebot-Extended | Apple |
| CCBot | Common Crawl |
| Bytespider | ByteDance |
| YouBot | You.com |
| cohere-ai | Cohere |
| Amazonbot | Amazon |
| SemrushBot, AhrefsBot | SEO tools |

## License

MIT
