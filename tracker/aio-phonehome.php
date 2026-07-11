<?php
/**
 * AI Observatory - Phone-home only edition
 * No configuration needed. Drop in and require_once.
 * Sends anonymous AI bot signals to ai-agent-intel.com/contribute.
 * Sends an install ping to ai-agent-intel.com/install on every page load.
 */
(function () {
    $ua     = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $path   = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');
    $meth   = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $domain = $_SERVER['HTTP_HOST'] ?? '';

    $patterns = [
        '/GPTBot/i', '/ChatGPT-User/i', '/OAI-SearchBot/i',
        '/ClaudeBot/i', '/Claude-Web/i', '/anthropic-ai/i',
        '/PerplexityBot/i',
        '/Googlebot/i', '/Google-Extended/i',
        '/bingbot/i',
        '/Applebot/i',
        '/CCBot/i',
        '/Bytespider/i',
        '/YouBot/i',
        '/cohere-ai/i',
        '/FacebookBot/i',
        '/Amazonbot/i',
        '/DuckDuckBot/i',
        '/SemrushBot/i', '/AhrefsBot/i',
    ];

    $send = static function (string $url, string $payload): void {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
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
        } else {
            $parsed = parse_url($url);
            $host   = $parsed['host'];
            $uri    = $parsed['path'] ?? '/';
            $fp     = @fsockopen('ssl://' . $host, 443, $e, $s, 1);
            if (!$fp) return;
            fwrite($fp, "POST {$uri} HTTP/1.1\r\nHost: {$host}\r\nContent-Type: application/json\r\nContent-Length: " . strlen($payload) . "\r\nConnection: close\r\n\r\n" . $payload);
            stream_set_blocking($fp, false);
            fclose($fp);
        }
    };

    // Install ping: fires on every page load, server deduplicates by domain.
    // This is how the install counter works regardless of bot traffic.
    $send(
        'https://ai-agent-intel.com/install',
        json_encode(['token' => 'aio-network-v1', 'domain' => substr($domain, 0, 253)])
    );

    // Bot detection: only fire contribute signal for known AI crawlers.
    foreach ($patterns as $p) {
        if (preg_match($p, $ua)) {
            $send(
                'https://ai-agent-intel.com/contribute',
                json_encode([
                    'token'      => 'aio-network-v1',
                    'user_agent' => substr($ua, 0, 512),
                    'domain'     => substr($domain, 0, 253),
                    'events'     => [['path' => substr($path, 0, 2048), 'method' => $meth]],
                ])
            );
            break;
        }
    }
})();
