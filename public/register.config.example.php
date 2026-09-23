<?php
/**
 * Email settings for the register-interest and application form handlers
 * (register.php / apply.php) — TEMPLATE.
 *
 * Copy this file to register.config.php in this same directory (it's
 * gitignored — never commit the real one, it holds a live Brevo API key).
 * If this server already ran the legacy static site, a real
 * register.config.php may already exist here from that deployment — same
 * filename, same shape, so it should keep working unchanged.
 *
 * ── HOW MAIL LEAVES THIS SERVER ──────────────────────────────────────────
 * Via the Brevo HTTPS API (port 443), NOT SMTP — see the original
 * legacy-static/register.config.example.php for the full reasoning (GoDaddy
 * shared hosts firewall outbound SMTP; Brevo is what tarbiyyah.co.uk's SPF/
 * DKIM records authorise). register.php/apply.php fall back to PHP mail()
 * if the key is left blank, but that path is unreliable on this host.
 */

return [
    // Where register-interest / application enquiries are delivered.
    'recipient' => 'globalacademy@tarbiyyah.co.uk',

    // Sending identity (must match a domain verified in Brevo / SPF).
    'from_email' => 'globalacademy@tarbiyyah.co.uk',
    'from_name'  => 'Tarbiyyah Global Academy',

    // Brevo transactional API key (Brevo dashboard > SMTP & API > API Keys).
    'brevo_api_key' => '',

    // Send a "thank you" auto-confirmation back to the applicant/parent.
    'send_acknowledgement' => true,

    // Append one line per send attempt to register.log next to this file
    // (blocked from the web by .htaccess).
    'log' => true,

    // Optional: forward every submission as JSON to a CRM/Notion webhook.
    // Leave blank to disable.
    'crm_webhook_url' => '',
];
