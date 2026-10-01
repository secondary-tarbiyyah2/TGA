<?php
/**
 * Calendar-feed proxy for learn.tarbiyyah.co.uk: lets people subscribe to
 * https://learn.tarbiyyah.co.uk/calendar.php?token=… instead of a URL that
 * names the backend. Forwards the (secret, hashed-at-rest) token to the
 * timetable-ics function and returns its .ics unchanged.
 */
$token = isset($_GET['token']) ? $_GET['token'] : '';
if (!preg_match('/^[a-f0-9]{32,128}$/i', $token)) {
    http_response_code(404);
    exit;
}
$url = 'https://bgtspjhdajqheaktudip.supabase.co/functions/v1/timetable-ics?token=' . urlencode($token);
$ctx = stream_context_create(['http' => ['timeout' => 15, 'ignore_errors' => true]]);
$body = @file_get_contents($url, false, $ctx);
$status = 502;
if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $status = (int)$m[1];
http_response_code($body === false ? 502 : $status);
header('Content-Type: text/calendar; charset=utf-8');
header('Cache-Control: private, max-age=300');
header('X-Robots-Tag: noindex');
echo $body === false ? '' : $body;
