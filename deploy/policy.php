<?php
/**
 * Policy-document proxy for the main site: serves /policies/<slug>.pdf (or
 * .docx) from the file uploaded in the admin portal, so a policy edit is live
 * immediately and the visible address stays on globalacademy.tarbiyyah.co.uk
 * (not the storage host). Same idea as calendar.php on the learn subdomain:
 * the static export can't do this itself, so a tiny PHP passthrough calls the
 * policy-file function and returns its bytes unchanged.
 *
 * public/.htaccess rewrites ^policies/<slug>.(pdf|docx) to this script. If
 * nothing is uploaded for that slug (or the function can't be reached), it
 * falls back to the PDF bundled with the site build in ./policies/, so the
 * original policies keep working.
 */
$slug = isset($_GET['slug']) ? strtolower($_GET['slug']) : '';
$ext = (isset($_GET['ext']) && $_GET['ext'] === 'docx') ? 'docx' : 'pdf';
if (!preg_match('/^[a-z0-9][a-z0-9-]{0,118}$/', $slug)) {
    http_response_code(404);
    exit;
}
$types = [
    'pdf' => 'application/pdf',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

$url = 'https://bgtspjhdajqheaktudip.supabase.co/functions/v1/policy-file?slug=' . urlencode($slug) . '&ext=' . $ext;
$ctx = stream_context_create(['http' => ['timeout' => 20, 'ignore_errors' => true]]);
$body = @file_get_contents($url, false, $ctx);
$status = 502;
if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $status = (int)$m[1];

header('X-Robots-Tag: noindex');
header('Cache-Control: public, max-age=0, must-revalidate');

if ($body !== false && $status === 200) {
    header('Content-Type: ' . $types[$ext]);
    header('Content-Disposition: inline; filename="' . $slug . '.' . $ext . '"');
    echo $body;
    exit;
}

$local = __DIR__ . '/policies/' . $slug . '.' . $ext;
if (is_file($local)) {
    header('Content-Type: ' . $types[$ext]);
    header('Content-Disposition: inline; filename="' . $slug . '.' . $ext . '"');
    header('Content-Length: ' . filesize($local));
    readfile($local);
    exit;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Not found';
