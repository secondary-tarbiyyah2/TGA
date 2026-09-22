<?php
/**
 * Email settings for the register-interest form — TEMPLATE.
 *
 * Copy this file to register.config.php (which is gitignored — never commit
 * the real one, it holds a live Brevo API key) and fill in 'brevo_api_key'
 * below. register.php falls back to PHP mail() if the key is left blank, but
 * that path is unreliable on this host — see the comments in register.php.
 *
 * ── HOW MAIL LEAVES THIS SERVER ──────────────────────────────────────────────
 * Via the Brevo HTTPS API (port 443), NOT SMTP.
 *
 * This is a GoDaddy shared host and every outbound SMTP port is firewalled
 * (25, 465, 587, 2525 all refused) — so PHPMailer or any SMTP relay simply
 * cannot connect from here. Brevo's REST API goes over ordinary HTTPS, which
 * is open, so it works where SMTP can't.
 *
 * It is also the only properly authenticated option. tarbiyyah.co.uk publishes
 * "include:spf.brevo.com" in SPF and has Brevo DKIM keys (brevo1/brevo2
 * ._domainkey) live in DNS, so mail sent this way passes SPF *and* DKIM and
 * aligns for DMARC. Mail sent with PHP mail() from this box hard-fails SPF
 * (the record ends in -all and this server's IP is not authorised).
 *
 * Brevo delivers to tarbiyyah.co.uk over the public MX, which points at
 * Microsoft 365 — so it also sidesteps this server's local mail routing.
 */

return [
    // Where register-interest enquiries are delivered.
    'recipient'  => 'globalacademy@tarbiyyah.co.uk',

    // From / sender. Must be a tarbiyyah.co.uk address so the Brevo DKIM
    // signature aligns. Replies go to the person who registered (Reply-To is
    // set automatically).
    'from_email' => 'globalacademy@tarbiyyah.co.uk',
    'from_name'  => 'Tarbiyyah Global Academy',

    // ── Brevo API key ────────────────────────────────────────────────────────
    // Create at: Brevo dashboard → SMTP & API → API Keys → Generate a new key.
    // It is a long string starting with "xkeysib-". Paste it between the
    // quotes below. Until it is set, the form falls back to PHP mail(), which
    // is unreliable here — so this is the one thing that must be filled in.
    'brevo_api_key' => '',

    // Send the applicant an automatic "thank you" confirmation.
    'send_acknowledgement' => true,

    // Append every send attempt to register.log (blocked from the web in
    // .htaccess). Leave on — it is what makes a future failure diagnosable
    // instead of silent.
    'log' => true,
];
