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

function brandShell({ title, bodyHtml, footerNote }) {
  const brand = config.brand.name || "Plato";
  const accent = config.brand.accent || "#e85d04";
  const domain = config.brand.domain || config.publicBaseUrl;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#0f0e0c;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f0e0c;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#1a1814;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden">
        <tr><td style="height:4px;background:linear-gradient(90deg,${accent},#f48c06)"></td></tr>
        <tr><td style="padding:28px 28px 8px">
          <div style="font-size:22px;font-weight:700;color:#faf6f0;letter-spacing:-0.02em">🌮 ${escapeHtml(brand)}</div>
          <div style="font-size:13px;color:#a89f91;margin-top:4px">${escapeHtml(domain.replace(/^https?:\/\//, ""))}</div>
        </td></tr>
        <tr><td style="padding:8px 28px 28px">
          <h1 style="margin:0 0 12px;font-size:20px;color:#faf6f0;font-weight:600">${escapeHtml(title)}</h1>
          ${bodyHtml}
          <p style="margin:24px 0 0;font-size:12px;color:#6f685f;line-height:1.5">${footerNote || "If you didn’t request this, you can ignore this email."}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendMagicLink({ to, link, restaurantName }) {
  const brand = config.brand.name || "Plato";
  const subject = `Sign in to ${brand}${restaurantName ? ` · ${restaurantName}` : ""}`;
  const text = `Sign in to ${brand}:\n\n${link}\n\nThis link expires in ${config.magicLinkExpiresMin} minutes. If you didn't request it, ignore this email.`;
  const bodyHtml = `
    <p style="color:#cfc6ba;font-size:15px;line-height:1.55;margin:0 0 20px">
      Click below to sign in${restaurantName ? ` to <strong style="color:#faf6f0">${escapeHtml(restaurantName)}</strong>` : ""}.
    </p>
    <p style="margin:0 0 16px">
      <a href="${link}" style="display:inline-block;background:${config.brand.accent || "#e85d04"};color:#fff;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px">
        Sign in to ${escapeHtml(brand)}
      </a>
    </p>
    <p style="color:#6f685f;font-size:12px;word-break:break-all;margin:0">Or copy this link:<br/>${escapeHtml(link)}</p>
    <p style="color:#6f685f;font-size:12px;margin:16px 0 0">Expires in ${config.magicLinkExpiresMin} minutes.</p>
  `;
  const html = brandShell({
    title: "Your sign-in link",
    bodyHtml,
    footerNote: `Sent by ${brand}. Link expires in ${config.magicLinkExpiresMin} minutes.`,
  });
  return sendMail({ to, subject, text, html });
}

async function sendOrderNotify({ to, restaurantName, order }) {
  const brand = config.brand.name || "Plato";
  const subject = `New counter order · ${restaurantName || brand}`;
  const items = (order.items || [])
    .map((i) => `• ${i.qty || 1}× ${i.name} ($${Number(i.price || 0).toFixed(2)})`)
    .join("\n");
  const text = `New order ${order.id}\nTable: ${order.tableCode || "—"}\n\n${items}\n\nTotal: $${Number(order.total || 0).toFixed(2)}\nNote: ${order.note || "—"}`;
  const bodyHtml = `
    <p style="color:#cfc6ba;font-size:15px">Table <strong style="color:#faf6f0">${escapeHtml(order.tableCode || "—")}</strong>
    ${order.guestName ? ` · ${escapeHtml(order.guestName)}` : ""}</p>
    <ul style="color:#faf6f0;padding-left:18px;line-height:1.6">
      ${(order.items || [])
        .map(
          (i) =>
            `<li>${escapeHtml(String(i.qty || 1))}× ${escapeHtml(i.name)} — $${Number(i.price || 0).toFixed(2)}</li>`
        )
        .join("")}
    </ul>
    <p style="color:#faf6f0;font-weight:600">Total $${Number(order.total || 0).toFixed(2)}${order.tip ? ` · Tip $${Number(order.tip).toFixed(2)}` : ""}</p>
    ${order.note ? `<p style="color:#a89f91">Note: ${escapeHtml(order.note)}</p>` : ""}
  `;
  const html = brandShell({ title: "Kitchen ticket", bodyHtml });
  return sendMail({ to, subject, text, html });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = { sendMail, sendMagicLink, sendOrderNotify };
