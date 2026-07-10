<?php
/**
 * AI Observatory Tracker
 * Drop-in PHP tracker for monitoring AI crawler behavior.
 *
 * Usage:
 *   define('AIO_API_KEY',  'your-api-key');
 *   define('AIO_ENDPOINT', 'https://your-observatory-server.com/beacon');
 *   require_once 'ai-observatory.php';
 */

if (!defined('AIO_API_KEY') || !defined('AIO_ENDPOINT')) {
    return; // Silently skip if not configured
}

// ── Bot signatures ──────────────────────────────────────────────────────────

function aio_identify_bot(string $ua): ?array {
    $bots = [
        // OpenAI
        ['name' => 'GPTBot',           'vendor' => 'OpenAI',       'pattern' => '/GPTBot/i'],
        ['name' => 'ChatGPT-User',     'vendor' => 'OpenAI',       'pattern' => '/ChatGPT-User/i'],
        ['name' => 'OAI-SearchBot',    'vendor' => 'OpenAI',       'pattern' => '/OAI-SearchBot/i'],
        // Anthropic
        ['name' => 'ClaudeBot',        'vendor' => 'Anthropic',    'pattern' => '/ClaudeBot/i'],
        ['name' => 'Claude-Web',       'vendor' => 'Anthropic',    'pattern' => '/Claude-Web/i'],
        ['name' => 'anthropic-ai',     'vendor' => 'Anthropic',    'pattern' => '/anthropic-ai/i'],
        // Perplexity
        ['name' => 'PerplexityBot',    'vendor' => 'Perplexity',   'pattern' => '/PerplexityBot/i'],
        // Google
        ['name' => 'Googlebot',        'vendor' => 'Google',       'pattern' => '/Googlebot(?!-Image|-Video|-News)/i'],
        ['name' => 'Google-Extended',  'vendor' => 'Google',       'pattern' => '/Google-Extended/i'],
        // Microsoft
        ['name' => 'Bingbot',          'vendor' => 'Microsoft',    'pattern' => '/bingbot/i'],
        // Apple
        ['name' => 'Applebot',         'vendor' => 'Apple',        'pattern' => '/Applebot/i'],
        // Common Crawl
        ['name' => 'CCBot',            'vendor' => 'Common Crawl', 'pattern' => '/CCBot/i'],
        // ByteDance
        ['name' => 'Bytespider',       'vendor' => 'ByteDance',    'pattern' => '/Bytespider/i'],
        // You.com
        ['name' => 'YouBot',           'vendor' => 'You.com',      'pattern' => '/YouBot/i'],
        // Cohere
        ['name' => 'cohere-ai',        'vendor' => 'Cohere',       'pattern' => '/cohere-ai/i'],
        // Meta
        ['name' => 'FacebookBot',      'vendor' => 'Meta',         'pattern' => '/FacebookBot/i'],
        // Amazon
        ['name' => 'Amazonbot',        'vendor' => 'Amazon',       'pattern' => '/Amazonbot/i'],
        // DuckDuckGo
        ['name' => 'DuckDuckBot',      'vendor' => 'DuckDuckGo',   'pattern' => '/DuckDuckBot/i'],
        // SEO tools
        ['name' => 'SemrushBot',       'vendor' => 'Semrush',      'pattern' => '/SemrushBot/i'],
        ['name' => 'AhrefsBot',        'vendor' => 'Ahrefs',       'pattern' => '/AhrefsBot/i'],
    ];

    foreach ($bots as $bot) {
        if (preg_match($bot['pattern'], $ua)) {
            return ['name' => $bot['name'], 'vendor' => $bot['vendor']];
        }
    }
    return null;
}

function aio_is_probe_path(string $path): bool {
    static $probes = [
        '/robots.txt', '/sitemap.xml', '/sitemap_index.xml',
        '/llms.txt', '/ai.json', '/ai', '/llm',
        '/openapi.json', '/openapi.yaml', '/swagger.json', '/swagger.yaml',
        '/.well-known/security.txt', '/security.txt', '/humans.txt',
        '/ads.txt', '/feed.xml', '/rss.xml', '/atom.xml', '/feed',
        '/favicon.ico',
    ];
    $clean = strtolower(strtok($path, '?'));
    return in_array($clean, $probes, true);
}

// ── Track current request ───────────────────────────────────────────────────

function aio_track(): void {
    $ua   = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $ip   = $_SERVER['HTTP_X_FORWARDED_FOR']
          ? explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]
          : ($_SERVER['REMOTE_ADDR'] ?? '');
    $path = $_SERVER['REQUEST_URI'] ?? '/';
    $meth = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // Only track bots by default; set AIO_TRACK_ALL=true to capture humans too
    if (!defined('AIO_TRACK_ALL') || !AIO_TRACK_ALL) {
        $bot = aio_identify_bot($ua);
        if (!$bot) return;
    }

    $payload = json_encode([
        'api_key'    => AIO_API_KEY,
        'user_agent' => substr($ua, 0, 512),
        'ip'         => trim($ip),
        'events'     => [[
            'path'   => substr($path, 0, 2048),
            'method' => $meth,
            'status' => http_response_code() ?: null,
            'ts'     => time(),
        ]],
    ]);

    // Send to the site's own server
    aio_send_async($payload, AIO_ENDPOINT);

    // Phone-home: contribute anonymous data to the public network (no IP, no api_key)
    // To opt out, remove or comment out the following block.
    $network_payload = json_encode([
        'token'      => 'aio-network-v1',
        'user_agent' => substr($ua, 0, 512),
        'domain'     => substr($_SERVER['HTTP_HOST'] ?? '', 0, 253),
        'events'     => [[
            'path'   => substr($path, 0, 2048),
            'method' => $meth,
        ]],
    ]);
    aio_send_async($network_payload, 'https://ai-agent-intel.com/contribute');
}

function aio_send_async(string $payload, string $endpoint): void {

    // Try non-blocking curl first
    if (function_exists('curl_init')) {
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 2,
            CURLOPT_CONNECTTIMEOUT => 1,
            CURLOPT_NOSIGNAL       => 1,
        ]);
        curl_exec($ch);
        curl_close($ch);
        return;
    }

    // Fallback: fsockopen non-blocking write
    $parsed = parse_url($endpoint);
    $host   = $parsed['host'];
    $port   = $parsed['port'] ?? ($parsed['scheme'] === 'https' ? 443 : 80);
    $uri    = ($parsed['path'] ?? '/') . (isset($parsed['query']) ? '?' . $parsed['query'] : '');
    $prefix = $parsed['scheme'] === 'https' ? 'ssl://' : '';

    $fp = @fsockopen($prefix . $host, $port, $errno, $errstr, 1);
    if (!$fp) return;

    $body = "POST {$uri} HTTP/1.1\r\n"
          . "Host: {$host}\r\n"
          . "Content-Type: application/json\r\n"
          . "Content-Length: " . strlen($payload) . "\r\n"
          . "Connection: close\r\n\r\n"
          . $payload;

    fwrite($fp, $body);
    stream_set_blocking($fp, false);
    fclose($fp);
}

// Auto-track on include
aio_track();
