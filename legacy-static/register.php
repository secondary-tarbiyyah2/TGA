<?php
/**
 * Tarbiyyah Global Academy — register-interest handler.
 *
 * Receives the register-interest form (POST) and emails it on. The front-end
 * (index.html / assets/site.js) POSTs here and falls back to a mailto: link if
 * this endpoint is unreachable.
 *
 * Mail goes out through the Brevo HTTPS API, because this shared host
 * firewalls every outbound SMTP port and because PHP mail() from this server
 * hard-fails SPF for tarbiyyah.co.uk. See register.config.php for the full
 * reasoning and for where to paste the API key.
 *
 * PHP mail() is kept only as a last-resort fallback so an enquiry is never
 * lost outright if the API is unreachable — but it is expected to be junked,
 * so any use of it is written to register.log as a warning.
 */

$cfg = is_file(__DIR__ . '/register.config.php') ? (require __DIR__ . '/register.config.php') : [];

$RECIPIENT = $cfg['recipient']     ?? 'globalacademy@tarbiyyah.co.uk';
$FROM      = $cfg['from_email']    ?? 'globalacademy@tarbiyyah.co.uk';
$SITE      = $cfg['from_name']     ?? 'Tarbiyyah Global Academy';
$API_KEY   = trim((string) ($cfg['brevo_api_key'] ?? ''));
$SEND_ACK  = $cfg['send_acknowledgement'] ?? true;
$DO_LOG    = $cfg['log'] ?? true;

header('Content-Type: application/json; charset=utf-8');

// ── Logging ─────────────────────────────────────────────────────────────────
// One line per send attempt, appended to register.log next to this file.
// .htaccess blocks the file from the web.
function log_line($msg) {
    global $DO_LOG;
    if (!$DO_LOG) return;
    @file_put_contents(
        __DIR__ . '/register.log',
        gmdate('Y-m-d H:i:s') . ' UTC  ' . $msg . "\n",
        FILE_APPEND | LOCK_EX
    );
}

// ── Send one message via the Brevo API, falling back to mail() ──────────────
// Returns [bool ok, string transport, string detail].
function send_message($to, $toName, $subject, $text, $replyEmail, $replyName) {
    global $API_KEY, $FROM, $SITE;

    // ---- Preferred path: Brevo HTTPS API -----------------------------------
    if ($API_KEY !== '' && function_exists('curl_init')) {
        $payload = [
            'sender'      => ['email' => $FROM, 'name' => $SITE],
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
                'api-key: ' . $API_KEY,
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ]);
        $resp   = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $cerr   = curl_error($ch);
        curl_close($ch);

        // Brevo returns 201 Created on success.
        if ($status === 201) {
            $id = '';
            $j  = json_decode((string) $resp, true);
            if (is_array($j) && !empty($j['messageId'])) $id = ' id=' . $j['messageId'];
            return [true, 'brevo', 'HTTP 201' . $id];
        }

        $detail = $cerr !== ''
            ? 'curl: ' . $cerr
            : 'HTTP ' . $status . ' ' . substr((string) $resp, 0, 300);
        log_line('WARN  brevo send failed to ' . $to . ' — ' . $detail);
        // fall through to mail()
    }

    // ---- Fallback: PHP mail() ---------------------------------------------
    // Expected to fail SPF for this domain. Used only so nothing is lost.
    $enc = function ($name) {
        // RFC 2047-encode display names; avoids commas/quotes breaking headers.
        return $name === '' ? '' : '=?UTF-8?B?' . base64_encode($name) . '?= ';
    };

    $headers  = 'From: ' . $enc($SITE) . '<' . $FROM . ">\r\n";
    if ($replyEmail !== '') {
        $headers .= 'Reply-To: ' . $enc($replyName) . '<' . $replyEmail . ">\r\n";
    }
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=utf-8\r\n";
    $headers .= "X-Mailer: PHP/register.php\r\n";

    $ok = @mail($to, $subject, $text, $headers, '-f' . $FROM);
    return [
        (bool) $ok,
        'mail()',
        $ok ? 'accepted by local MTA (likely to fail SPF)' : 'mail() returned false',
    ];
}

// ── Only accept POST ────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

// ── Honeypot: silently accept (200) so bots don't retry, but send nothing ───
if (!empty($_POST['company'])) {
    echo json_encode(['ok' => true]);
    exit;
}

// ── Gather + sanitise ───────────────────────────────────────────────────────
// clean() strips CR/LF, which is what stops a submitted value being used to
// inject extra mail headers on the mail() fallback path.
function clean($v) { return trim(str_replace(["\r", "\n"], ' ', (string) $v)); }

// 'name' is the pre-2026 field name. Still accepted so a visitor on a cached
// copy of the old page doesn't hit a validation error they can't fix.
$parentName = clean($_POST['parent_name'] ?? $_POST['name'] ?? '');
$email      = clean($_POST['email']       ?? '');
$phone      = clean($_POST['phone']       ?? '');
$country    = clean($_POST['country']     ?? '');
$timezone   = clean($_POST['timezone']    ?? '');
$childName  = clean($_POST['child_name']  ?? '');
$childDob   = clean($_POST['child_dob']   ?? '');
$yeargroup  = clean($_POST['yeargroup']   ?? '');
$start      = clean($_POST['start']       ?? '');
$heard      = clean($_POST['heard']       ?? '');
$consent    = clean($_POST['consent']     ?? '');
$message    = trim((string) ($_POST['message'] ?? ''));

// ── Validate ────────────────────────────────────────────────────────────────
$errors = [];
if ($parentName === '')                                          $errors[] = 'parent_name';
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'email';
// Phone formats vary far too much internationally to pattern-match; just
// insist on something that plausibly contains a number.
if (preg_match_all('/\d/', $phone) < 7)                          $errors[] = 'phone';
if ($country === '')                                             $errors[] = 'country';
if ($childName === '')                                           $errors[] = 'child_name';
if ($yeargroup === '')                                           $errors[] = 'yeargroup';
if ($consent === '')                                             $errors[] = 'consent';

if ($errors) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'validation', 'fields' => $errors]);
    exit;
}

// Format the date of birth readably, and work out the age it implies — a quick
// sanity check against the year group the parent chose.
$dobLine = '(not given)';
if ($childDob !== '') {
    $d = DateTime::createFromFormat('Y-m-d', $childDob);
    if ($d instanceof DateTime) {
        $age = $d->diff(new DateTime('today'))->y;
        $dobLine = $d->format('j F Y') . ' (age ' . $age . ')';
    } else {
        $dobLine = $childDob;
    }
}

// ── Compose the enquiry to the Academy ──────────────────────────────────────
// Child + year group go in the subject so the inbox is scannable without
// opening each message.
$subject = 'Register interest — ' . $childName . ' (' . $yeargroup . ')';

$body = implode("\n", [
    'A new register-interest enquiry was submitted on ' . $SITE . '.',
    '',
    'PARENT / GUARDIAN',
    '  Name:            ' . $parentName,
    '  Email:           ' . $email,
    '  Contact number:  ' . $phone,
    '  Country:         ' . $country,
    '  Time zone:       ' . ($timezone !== '' ? $timezone : '(not detected)'),
    '',
    'CHILD',
    '  Full name:       ' . $childName,
    '  Date of birth:   ' . $dobLine,
    '  Year group:      ' . $yeargroup,
    '  Preferred start: ' . ($start !== '' ? $start : '(not given)'),
    '',
    'OTHER',
    '  Heard about us:  ' . ($heard !== '' ? $heard : '(not given)'),
    '  Contact consent: ' . ($consent !== '' ? 'yes' : 'no'),
    '',
    'MESSAGE',
    ($message !== '' ? $message : '(none)'),
    '',
    '—',
    'Sent ' . gmdate('Y-m-d H:i') . ' UTC from ' . ($_SERVER['HTTP_HOST'] ?? 'the website') . '.',
    'Reply directly to this email to reach ' . $parentName . '.',
]);

list($sent, $transport, $detail) = send_message(
    $RECIPIENT, $SITE, $subject, $body, $email, $parentName
);

log_line(($sent ? 'OK   ' : 'FAIL ') . 'enquiry  to=' . $RECIPIENT
    . ' child=' . $childName . ' year=' . $yeargroup
    . ' from_applicant=' . $email . ' via=' . $transport . ' — ' . $detail);

// ── Auto-confirmation to the person who registered (best effort) ────────────
// A failure here never affects the response — the enquiry is what matters.
if ($SEND_ACK) {
    $firstName = trim(strtok($parentName, ' '));
    $greetName = $firstName !== '' ? ' ' . $firstName : '';

    $ackLines = [
        'Assalamu alaikum' . $greetName . ',',
        '',
        'Thank you for registering your interest in ' . $SITE . '. We have received',
        'your details and will be in touch as places open.',
        '',
        'What we have on record:',
        '  Child:       ' . $childName,
        '  Year group:  ' . $yeargroup,
    ];
    if ($start !== '') {
        $ackLines[] = '  Start:       ' . $start;
    }
    $ackLines = array_merge($ackLines, [
        '',
        'If any of that is wrong, just reply to this email and we will correct it.',
        '',
        'If you have any questions in the meantime, you can reach us at',
        $RECIPIENT . '.',
        '',
        'Warm regards,',
        $SITE,
        'Part of the Tarbiyyah Education Trust',
    ]);

    list($ackOk, $ackTransport, $ackDetail) = send_message(
        $email, $parentName,
        'Thank you for registering your interest — ' . $SITE,
        implode("\n", $ackLines),
        $RECIPIENT, $SITE
    );

    log_line(($ackOk ? 'OK   ' : 'FAIL ') . 'ack      to=' . $email
        . ' via=' . $ackTransport . ' — ' . $ackDetail);
}

if ($sent) {
    echo json_encode(['ok' => true]);
} else {
    // Front-end falls back to a mailto: link so the enquiry isn't lost.
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'send_failed']);
}
