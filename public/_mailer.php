<?php
/**
 * Shared mailer helpers for register.php and apply.php, ported from the
 * legacy static site's register.php, which used the Brevo HTTPS API because
 * this host firewalls outbound SMTP and only Brevo passes SPF/DKIM for
 * tarbiyyah.co.uk. See register.config.example.php for the full reasoning.
 */

$cfg = is_file(__DIR__ . '/register.config.php') ? (require __DIR__ . '/register.config.php') : [];

define('MAIL_RECIPIENT', $cfg['recipient']        ?? 'globalacademy@tarbiyyah.co.uk');
define('MAIL_FROM',      $cfg['from_email']       ?? 'globalacademy@tarbiyyah.co.uk');
define('MAIL_SITE',      $cfg['from_name']        ?? 'Tarbiyyah Global Academy');
define('MAIL_API_KEY',   trim((string) ($cfg['brevo_api_key'] ?? '')));
define('MAIL_SEND_ACK',  $cfg['send_acknowledgement'] ?? true);
define('MAIL_DO_LOG',    $cfg['log'] ?? true);
define('MAIL_CRM_WEBHOOK_URL', trim((string) ($cfg['crm_webhook_url'] ?? '')));

function mailer_log($msg) {
    if (!MAIL_DO_LOG) return;
    @file_put_contents(
        __DIR__ . '/register.log',
        gmdate('Y-m-d H:i:s') . ' UTC  ' . $msg . "\n",
        FILE_APPEND | LOCK_EX
    );
}

function mailer_clean($v, $max = 200) {
    $v = trim(str_replace(["\r", "\n"], ' ', (string) $v));
    // Length caps: every field here ends up in an email or the log.
    return mb_substr($v, 0, $max);
}

/**
 * A name as it may appear in the acknowledgement email we send back to the
 * address the submitter typed: letters, marks, spaces, apostrophes and
 * hyphens only. Anything else (URLs, "click here", digits) is dropped, so
 * nobody can use the form to send a school-branded email carrying their own
 * text to an address of their choosing.
 */
function mailer_safe_name($v, $max = 40) {
    $v = preg_replace("/[^\\p{L}\\p{M}' \\-]/u", '', (string) $v);
    return mb_substr(trim(preg_replace('/\\s+/u', ' ', $v)), 0, $max);
}

/**
 * The browser-facing origin the forms are allowed to post from. A fetch()
 * POST always carries an Origin header; anything else (curl, another site)
 * is refused. Hosts may be overridden in register.config.php ('origins').
 */
function mailer_check_origin(array $cfg) {
    $allowed = $cfg['origins'] ?? [
        'https://globalacademy.tarbiyyah.co.uk',
        'https://preview.tarbiyyah.co.uk',
        'https://www.globalacademy.tarbiyyah.co.uk',
    ];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '' && !empty($_SERVER['HTTP_REFERER'])) {
        $p = parse_url($_SERVER['HTTP_REFERER']);
        if (!empty($p['scheme']) && !empty($p['host'])) $origin = $p['scheme'] . '://' . $p['host'];
    }
    return in_array(rtrim($origin, '/'), $allowed, true);
}

/**
 * Per-IP and per-email submission limits (default 6 per IP and 3 per email
 * an hour), kept in a small JSON file next to the log; .htaccess denies it
 * to the web. Fails open if the file cannot be written: a disk problem
 * must not take the forms down.
 */
function mailer_rate_limited($email, array $cfg) {
    $perIp    = (int) ($cfg['rate_limit_ip']    ?? 6);
    $perEmail = (int) ($cfg['rate_limit_email'] ?? 3);
    $window   = 3600;
    $file     = __DIR__ . '/register.ratelimit.json';
    $now      = time();
    $ip       = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $ipKey    = 'ip:' . hash('sha256', $ip);
    $emKey    = 'em:' . hash('sha256', strtolower($email));

    $fh = @fopen($file, 'c+');
    if (!$fh) return false;
    if (!flock($fh, LOCK_EX)) { fclose($fh); return false; }
    $raw  = stream_get_contents($fh);
    $data = $raw ? (json_decode($raw, true) ?: []) : [];
    foreach ($data as $k => $times) {
        $data[$k] = array_values(array_filter($times, function ($t) use ($now, $window) { return $t > $now - $window; }));
        if (!$data[$k]) unset($data[$k]);
    }
    $limited = count($data[$ipKey] ?? []) >= $perIp || count($data[$emKey] ?? []) >= $perEmail;
    if (!$limited) {
        $data[$ipKey][] = $now;
        $data[$emKey][] = $now;
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data));
    flock($fh, LOCK_UN);
    fclose($fh);
    return $limited;
}

/** Reads a JSON POST body (what the site's fetch() calls send), falling back to $_POST. */
function mailer_read_body() {
    $raw = file_get_contents('php://input');
    if ($raw !== false && $raw !== '') {
        $json = json_decode($raw, true);
        if (is_array($json)) return $json;
    }
    return $_POST;
}

/** Best-effort forward to an external CRM/Notion webhook, if configured. Never throws. */
function mailer_forward_to_crm(array $payload) {
    if (MAIL_CRM_WEBHOOK_URL === '') return;
    $ch = curl_init(MAIL_CRM_WEBHOOK_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER     => ['content-type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);
    @curl_exec($ch);
    curl_close($ch);
}

/** Sends one message via the Brevo API, falling back to mail(). Returns [ok, transport, detail]. */
function mailer_send($to, $toName, $subject, $text, $replyEmail = '', $replyName = '') {
    if (MAIL_API_KEY !== '' && function_exists('curl_init')) {
        $payload = [
            'sender'      => ['email' => MAIL_FROM, 'name' => MAIL_SITE],
            'to'          => [array_filter(['email' => $to, 'name' => $toName])],
            'subject'     => $subject,
            'textContent' => $text,
        ];
        if ($replyEmail !== '') {
            $payload['replyTo'] = array_filter(['email' => $replyEmail, 'name' => $replyName]);
        }

        $ch = curl_init('https://api.brevo.com/v3/smtp/email');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_HTTPHEADER     => [
                'accept: application/json',
                'content-type: application/json',
                'api-key: ' . MAIL_API_KEY,
            ],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ]);
        $resp   = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $cerr   = curl_error($ch);
        curl_close($ch);

        if ($status === 201) {
            $id = '';
            $j  = json_decode((string) $resp, true);
            if (is_array($j) && !empty($j['messageId'])) $id = ' id=' . $j['messageId'];
            return [true, 'brevo', 'HTTP 201' . $id];
        }

        $detail = $cerr !== '' ? 'curl: ' . $cerr : 'HTTP ' . $status . ' ' . substr((string) $resp, 0, 300);
        mailer_log('WARN  brevo send failed to ' . $to . '– ' . $detail);
        // fall through to mail()
    }

    // ---- Fallback: PHP mail() · expected to fail SPF, used only so nothing is lost.
    $enc = function ($name) {
        return $name === '' ? '' : '=?UTF-8?B?' . base64_encode($name) . '?= ';
    };

    $headers  = 'From: ' . $enc(MAIL_SITE) . '<' . MAIL_FROM . ">\r\n";
    if ($replyEmail !== '') {
        $headers .= 'Reply-To: ' . $enc($replyName) . '<' . $replyEmail . ">\r\n";
    }
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=utf-8\r\n";
    $headers .= "X-Mailer: PHP/mailer\r\n";

    $ok = @mail($to, $subject, $text, $headers, '-f' . MAIL_FROM);
    return [
        (bool) $ok,
        'mail()',
        $ok ? 'accepted by local MTA (likely to fail SPF)' : 'mail() returned false',
    ];
}
