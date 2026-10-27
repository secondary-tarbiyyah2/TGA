<?php
/**
 * Tarbiyyah Global Academy, register-interest handler.
 *
 * Receives the register-interest form (RegisterInterestForm.tsx POSTs JSON
 * here) and emails it via Brevo. See _mailer.php for the mail transport and
 * register.config.example.php for configuration.
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
if (!empty($body['company'])) {
    echo json_encode(['ok' => true]);
    exit;
}

$parentName = mailer_clean($body['parent_name'] ?? '');
$email      = mailer_clean($body['email']       ?? '');
$phone      = mailer_clean($body['phone']       ?? '');
$yeargroup  = mailer_clean($body['yeargroup']   ?? '');
$consent    = mailer_clean($body['consent']     ?? '');
$timezone   = mailer_clean($body['timezone']    ?? '');
$message    = trim((string) ($body['message'] ?? ''));
// A short reference derived client-side from the email address (see
// src/lib/leadRef.ts) · the same value the admissions application form
// sends for the same email, so the two submissions can be matched by a
// human (or a downstream CRM) as one lead, even though neither PHP script
// keeps a database of its own.
$leadRef    = mailer_clean($body['lead_ref']    ?? '');

$errors = [];
if ($parentName === '')                                          $errors[] = 'parent_name';
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'email';
if (preg_match_all('/\d/', $phone) < 7)                          $errors[] = 'phone';
if ($yeargroup === '')                                            $errors[] = 'yeargroup';
if ($consent === '')                                              $errors[] = 'consent';

if ($errors) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'validation', 'fields' => $errors]);
    exit;
}

$subject = 'Register interest' . $parentName . ' (' . $yeargroup . ')';
$text = implode("\n", [
    'A new register-interest enquiry was submitted on Tarbiyyah Global Academy.',
    '',
    'Parent/guardian: ' . $parentName,
    'Email: ' . $email,
    'Phone: ' . $phone,
    'Year group: ' . $yeargroup,
    'Time zone: ' . ($timezone !== '' ? $timezone : '(not detected)'),
    'Lead reference: ' . ($leadRef !== '' ? $leadRef : '(none)') . '– same reference on a later application from this email means the same family.',
    '',
    'Message: ' . ($message !== '' ? $message : '(none)'),
]);

list($sent, $transport, $detail) = mailer_send(MAIL_RECIPIENT, MAIL_SITE, $subject, $text, $email, $parentName);

mailer_log(($sent ? 'OK   ' : 'FAIL ') . 'register to=' . MAIL_RECIPIENT
    . ' from_applicant=' . $email . ' via=' . $transport . '– ' . $detail);

if (MAIL_SEND_ACK && $sent) {
    $firstName = trim(strtok($parentName, ' '));
    $greetName = $firstName !== '' ? ' ' . $firstName : '';
    $ackText = implode("\n", [
        'Assalamu alaikum' . $greetName . ',',
        '',
        'Thank you for registering your interest in Tarbiyyah Global Academy. We have',
        'received your details and will be in touch as places open.',
        '',
        'If you have any questions in the meantime, you can reach us at ' . MAIL_RECIPIENT . '.',
        '',
        'Warm regards,',
        MAIL_SITE,
        'Part of the Tarbiyyah Education Trust',
    ]);
    list($ackOk, $ackTransport, $ackDetail) = mailer_send($email, $parentName, 'Thank you for registering your interest' . MAIL_SITE, $ackText, MAIL_RECIPIENT, MAIL_SITE);
    mailer_log(($ackOk ? 'OK   ' : 'FAIL ') . 'register ack to=' . $email . ' via=' . $ackTransport . '– ' . $ackDetail);
}

mailer_forward_to_crm(['type' => 'register_interest', 'leadRef' => $leadRef, 'parentName' => $parentName, 'email' => $email, 'phone' => $phone, 'yeargroup' => $yeargroup, 'message' => $message, 'timezone' => $timezone, 'submittedAt' => gmdate('c')]);

if (!$sent) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'send_failed']);
    exit;
}

echo json_encode(['ok' => true]);
