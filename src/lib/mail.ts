import "server-only";

/**
 * E-Mail-Versand ueber Resend (reine HTTP-API, keine zusaetzliche Abhaengigkeit).
 *
 * Ist kein Schluessel hinterlegt, meldet die Funktion das ehrlich zurueck – die
 * Oberflaeche zeigt dann den Vertragslink zum Kopieren an, statt einen Versand
 * vorzutaeuschen.
 */

export type MailResult = { sent: boolean; message: string };

export async function sendMail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    return {
      sent: false,
      message: "Kein E-Mail-Versand konfiguriert (RESEND_API_KEY und MAIL_FROM fehlen).",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { sent: false, message: `E-Mail-Versand fehlgeschlagen: ${detail.slice(0, 200)}` };
    }
    return { sent: true, message: `E-Mail wurde an ${params.to} versendet.` };
  } catch (error) {
    return { sent: false, message: `E-Mail-Versand fehlgeschlagen: ${(error as Error).message}` };
  }
}

export function contractInviteMail(params: {
  tenantName: string;
  landlordName: string;
  propertyName: string;
  roomName: string;
  bedLabel: string;
  startDate: string;
  link: string;
}): { subject: string; html: string; text: string } {
  const subject = `Ihr Mietvertrag für ${params.propertyName}`;

  const text = [
    `Hallo ${params.tenantName},`,
    "",
    `für Ihre Unterkunft bei ${params.landlordName} liegt der Mietvertrag bereit.`,
    "",
    `Objekt: ${params.propertyName}`,
    `Zimmer: ${params.roomName}, ${params.bedLabel}`,
    `Mietbeginn: ${params.startDate}`,
    "",
    "Bitte öffnen Sie den folgenden Link, prüfen Sie Ihre Daten und unterschreiben Sie den Vertrag direkt im Browser:",
    params.link,
    "",
    "Der Link ist persönlich und sollte nicht weitergegeben werden.",
    "",
    `Viele Grüße`,
    params.landlordName,
  ].join("\n");

  const html = `
<div style="font-family:ui-sans-serif,system-ui,Segoe UI,Arial,sans-serif;max-width:560px;color:#0f172a">
  <p>Hallo ${escapeHtml(params.tenantName)},</p>
  <p>für Ihre Unterkunft bei <strong>${escapeHtml(params.landlordName)}</strong> liegt der Mietvertrag bereit.</p>
  <table style="border-collapse:collapse;font-size:14px;margin:16px 0">
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Objekt</td><td>${escapeHtml(params.propertyName)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Zimmer</td><td>${escapeHtml(params.roomName)}, ${escapeHtml(params.bedLabel)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b">Mietbeginn</td><td>${escapeHtml(params.startDate)}</td></tr>
  </table>
  <p>
    <a href="${params.link}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">
      Vertrag ansehen und unterschreiben
    </a>
  </p>
  <p style="font-size:12px;color:#64748b">
    Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
    <span style="word-break:break-all">${params.link}</span>
  </p>
  <p style="font-size:12px;color:#64748b">Der Link ist persönlich und sollte nicht weitergegeben werden.</p>
  <p>Viele Grüße<br>${escapeHtml(params.landlordName)}</p>
</div>`.trim();

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;");
}
