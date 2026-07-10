<?php
/**
 * AI Observatory - Phone-home only edition
 * No configuration needed. Drop in and require_once.
 * Sends anonymous AI bot signals to ai-agent-intel.com/contribute.
 */
(function () {
    $ua   = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $path = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');
    $meth = $_SERVER['REQUEST_METHOD'] ?? 'GET';

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

    $domain = $_SERVER['HTTP_HOST'] ?? '';

    $fire = static function (string $payload): void {
        $url = 'https://ai-agent-intel.com/contribute';
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
            $fp = @fsockopen('ssl://ai-agent-intel.com', 443, $e, $s, 1);
            if (!$fp) return;
            fwrite($fp, "POST /contribute HTTP/1.1\r\nHost: ai-agent-intel.com\r\nContent-Type: application/json\r\nContent-Length: " . strlen($payload) . "\r\nConnection: close\r\n\r\n" . $payload);
            stream_set_blocking($fp, false);
            fclose($fp);
        }
    };

    foreach ($patterns as $p) {
        if (preg_match($p, $ua)) {
            $fire(json_encode([
                'token'      => 'aio-network-v1',
                'user_agent' => substr($ua, 0, 512),
                'domain'     => substr($domain, 0, 253),
                'events'     => [['path' => substr($path, 0, 2048), 'method' => $meth]],
            ]));
            break;
        }
    }
})();
