<?php
/**
 * Tarbiyyah Global Academy, application handler.
 *
 * Receives the multi-step admissions application (ApplicationForm.tsx POSTs
 * JSON here) and emails it via Brevo. See _mailer.php for the mail transport
 * and register.config.example.php for configuration.
 */
require __DIR__ . '/_mailer.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

$body = mailer_read_body();

// Honeypot: silently accept (200) so bots don't retry, but send nothing.
// ApplicationForm.tsx renders the matching hidden "company" field.
if (!empty($body['company'])) {
    echo json_encode(['ok' => true]);
    exit;
}

$parentName = mailer_clean($body['parent_name'] ?? '');
$email      = mailer_clean($body['email']       ?? '');
$phone      = mailer_clean($body['phone']       ?? '');
$country    = mailer_clean($body['country']     ?? '');
$childName  = mailer_clean($body['child_name']  ?? '');
$yeargroup  = mailer_clean($body['yeargroup']   ?? '');
$consent    = mailer_clean($body['consent']     ?? '');
$notes      = trim((string) ($body['notes'] ?? ''));
// See register.php for what this is, the same reference sent for a prior
// register-interest submission from the same email, so the two can be
// matched as one lead by a human or a downstream CRM.
$leadRef    = mailer_clean($body['lead_ref']    ?? '');
$hadRegisteredInterest = mailer_clean($body['previous_register_interest'] ?? '') === 'yes';

$errors = [];
if ($parentName === '')                                          $errors[] = 'parent_name';
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'email';
if (preg_match_all('/\d/', $phone) < 7)                          $errors[] = 'phone';
if ($country === '')                                              $errors[] = 'country';
if ($childName === '')                                            $errors[] = 'child_name';
if ($yeargroup === '')                                            $errors[] = 'yeargroup';
if ($consent === '')                                              $errors[] = 'consent';

if ($errors) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'validation', 'fields' => $errors]);
    exit;
}

$subject = 'New application' . $childName . ' (' . $yeargroup . ')';
$text = implode("\n", [
    'A new application was submitted on Tarbiyyah Global Academy.',
    '',
    'PARENT / GUARDIAN',
    '  Name: ' . $parentName,
    '  Email: ' . $email,
    '  Phone: ' . $phone,
    '  Country: ' . $country,
    '',
    'CHILD',
    '  Name: ' . $childName,
    '  Year group: ' . $yeargroup,
    '',
    'Lead reference: ' . ($leadRef !== '' ? $leadRef : '(none)') . '– matches a register-interest email with the same reference.',
    'Previously registered interest (same device): ' . ($hadRegisteredInterest ? 'Yes' : 'Not indicated'),
    '',
    'Notes: ' . ($notes !== '' ? $notes : '(none)'),
]);

list($sent, $transport, $detail) = mailer_send(MAIL_RECIPIENT, MAIL_SITE, $subject, $text, $email, $parentName);

mailer_log(($sent ? 'OK   ' : 'FAIL ') . 'apply child=' . $childName . ' year=' . $yeargroup
    . ' from_applicant=' . $email . ' via=' . $transport . '– ' . $detail);

if (MAIL_SEND_ACK && $sent) {
    $firstName = trim(strtok($parentName, ' '));
    $greetName = $firstName !== '' ? ' ' . $firstName : '';
    $ackText = implode("\n", [
        'Assalamu alaikum' . $greetName . ',',
        '',
        'Thank you for applying to Tarbiyyah Global Academy on behalf of ' . $childName . '. We',
        'have received your application and will be in touch with next steps, including any',
        'entry assessment.',
        '',
        'If you have any questions in the meantime, you can reach us at ' . MAIL_RECIPIENT . '.',
        '',
        'Warm regards,',
        MAIL_SITE,
        'Part of the Tarbiyyah Education Trust',
    ]);
    list($ackOk, $ackTransport, $ackDetail) = mailer_send($email, $parentName, 'Application received' . MAIL_SITE, $ackText, MAIL_RECIPIENT, MAIL_SITE);
    mailer_log(($ackOk ? 'OK   ' : 'FAIL ') . 'apply ack to=' . $email . ' via=' . $ackTransport . '– ' . $ackDetail);
}

mailer_forward_to_crm(['type' => 'application', 'leadRef' => $leadRef, 'parentName' => $parentName, 'email' => $email, 'phone' => $phone, 'country' => $country, 'childName' => $childName, 'yeargroup' => $yeargroup, 'notes' => $notes, 'submittedAt' => gmdate('c')]);

if (!$sent) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'send_failed']);
    exit;
}

echo json_encode(['ok' => true]);
