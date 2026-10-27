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

function mailer_clean($v) {
    return trim(str_replace(["\r", "\n"], ' ', (string) $v));
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
