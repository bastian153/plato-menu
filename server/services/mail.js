const config = require("../config");

/**
 * Send email. Without SMTP, logs magic link to console (dev-friendly).
 */
async function sendMail({ to, subject, text, html }) {
  if (!config.smtp.host) {
    console.log("\n📧  [mail:console] — SMTP not configured");
    console.log(`    To: ${to}`);
    console.log(`    Subject: ${subject}`);
    console.log(`    ${text}\n`);
    return { ok: true, transport: "console" };
  }

  // Lightweight SMTP via nodemailer if installed; otherwise console
  try {
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
    await transport.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text,
      html: html || text,
    });
    return { ok: true, transport: "smtp" };
  } catch (err) {
    console.warn("[mail] SMTP failed, logging to console:", err.message);
    console.log(`    To: ${to}\n    ${text}`);
    return { ok: true, transport: "console-fallback" };
  }
}

async function sendMagicLink({ to, link, restaurantName }) {
  const subject = `Sign in to Plato${restaurantName ? ` · ${restaurantName}` : ""}`;
  const text = `Sign in to Plato:\n\n${link}\n\nThis link expires in ${config.magicLinkExpiresMin} minutes. If you didn't request it, ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#e85d04">🌮 Plato</h2>
      <p>Click to sign in${restaurantName ? ` to <strong>${escapeHtml(restaurantName)}</strong>` : ""}:</p>
      <p><a href="${link}" style="display:inline-block;background:#e85d04;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Sign in</a></p>
      <p style="color:#666;font-size:13px">Or copy: ${escapeHtml(link)}</p>
      <p style="color:#999;font-size:12px">Expires in ${config.magicLinkExpiresMin} minutes.</p>
    </div>`;
  return sendMail({ to, subject, text, html });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = { sendMail, sendMagicLink };
