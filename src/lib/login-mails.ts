/**
 * E-Mails fuer den Bank-Zugang: Einladung und Anmeldecode. Reine Funktionen
 * ohne Datenbank, damit sie sich testen und als Vorschau zeigen lassen.
 */

export const CODE_GUELTIG_MINUTEN = 10;

/** Das Logo geht als eingebettetes Bild mit (Content-ID) - Outlook zeigt es so ohne Nachfrage. */
export const LOGO_CID = "wohnwerk-logo@wohnwerk";

/** Schlichter, gut lesbarer Rahmen - Tabellen-Layout, damit Outlook mitspielt. */
function rahmen(inhalt: string, fuss: string, logoSrc: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f3f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f3;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #dfe4e3">
      <tr><td style="background:#ffffff;padding:22px 28px 18px;border-bottom:4px solid #2a5654">
        <img src="${logoSrc}" width="172" height="33" alt="Wohnwerk" style="display:block;border:0;outline:none;width:172px;height:33px">
      </td></tr>
      <tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#16201f">
        ${inhalt}
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #e6eaea;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7473">
        ${escapeHtml(fuss)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function codeMail(p: { name: string; code: string; absender: string; fuss: string; logoSrc?: string }) {
  const subject = `Ihr Anmeldecode: ${p.code}`;
  const text = [
    `Guten Tag ${p.name},`,
    "",
    `Ihr Code für die Anmeldung bei ${p.absender} lautet:`,
    "",
    `    ${p.code}`,
    "",
    `Der Code ist ${CODE_GUELTIG_MINUTEN} Minuten gültig und kann nur einmal verwendet werden.`,
    "Falls Sie keine Anmeldung angefordert haben, können Sie diese E-Mail ignorieren.",
    "",
    "Mit freundlichen Grüßen",
    p.absender,
    "",
    "--",
    p.fuss,
  ].join("\n");
  const html = rahmen(
    `<p style="margin:0 0 14px">Guten Tag ${escapeHtml(p.name)},</p>
     <p style="margin:0 0 6px">Ihr Code für die Anmeldung lautet:</p>
     <p style="margin:0 0 18px;font-size:34px;font-weight:700;letter-spacing:8px;color:#2a5654">${p.code}</p>
     <p style="margin:0 0 14px;font-size:13px;color:#5b6363">Der Code ist ${CODE_GUELTIG_MINUTEN} Minuten gültig und kann nur einmal verwendet werden. Falls Sie keine Anmeldung angefordert haben, können Sie diese E-Mail ignorieren.</p>
     <p style="margin:0">Mit freundlichen Grüßen<br>${escapeHtml(p.absender)}</p>`,
    p.fuss,
    p.logoSrc ?? `cid:${LOGO_CID}`,
  );
  return { subject, text, html };
}

export function einladungMail(p: { name: string; link: string; absender: string; fuss: string; logoSrc?: string }) {
  const subject = `Zugang zu den Mietverträgen – ${p.absender}`;
  const text = [
    `Guten Tag ${p.name},`,
    "",
    "wie besprochen haben wir Ihnen einen Zugang eingerichtet, über den Sie alle laufenden, unterschriebenen Mietverträge einsehen und herunterladen können – einzeln oder alle auf einmal als ZIP-Datei.",
    "",
    "So melden Sie sich an:",
    `1. Diesen Link öffnen: ${p.link}`,
    "2. Ihre E-Mail-Adresse bestätigen und „Code anfordern“ wählen.",
    `3. Den sechsstelligen Code eingeben, den Sie daraufhin per E-Mail erhalten (${CODE_GUELTIG_MINUTEN} Minuten gültig).`,
    "",
    "Ein Passwort ist nicht nötig – bei jeder Anmeldung kommt ein neuer Code an diese Adresse. Der Zugang ist ausschließlich lesend.",
    "",
    "Bei Fragen antworten Sie gern einfach auf diese E-Mail.",
    "",
    "Mit freundlichen Grüßen",
    p.absender,
    "",
    "--",
    p.fuss,
  ].join("\n");
  const schritt = (nr: number, inhalt: string) =>
    `<tr><td valign="top" style="padding:0 12px 10px 0"><span style="display:inline-block;width:24px;height:24px;border-radius:12px;background:#e8efee;color:#2a5654;font-weight:700;font-size:13px;line-height:24px;text-align:center">${nr}</span></td><td style="padding:2px 0 10px;font-size:14px">${inhalt}</td></tr>`;
  const html = rahmen(
    `<p style="margin:0 0 14px">Guten Tag ${escapeHtml(p.name)},</p>
     <p style="margin:0 0 18px">wie besprochen haben wir Ihnen einen Zugang eingerichtet, über den Sie alle <b>laufenden, unterschriebenen Mietverträge</b> einsehen und herunterladen können – einzeln oder alle auf einmal als ZIP-Datei.</p>
     <p style="margin:0 0 22px"><a href="${p.link}" style="display:inline-block;background:#2a5654;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700">Zur Anmeldung</a></p>
     <p style="margin:0 0 10px;font-weight:700">So melden Sie sich an</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px">
       ${schritt(1, "Link oben öffnen.")}
       ${schritt(2, "E-Mail-Adresse bestätigen und <b>„Code anfordern“</b> wählen.")}
       ${schritt(3, `Den sechsstelligen Code eingeben, der daraufhin per E-Mail kommt (${CODE_GUELTIG_MINUTEN} Minuten gültig).`)}
     </table>
     <p style="margin:0 0 14px;font-size:13px;color:#5b6363">Ein Passwort ist nicht nötig – bei jeder Anmeldung kommt ein neuer Code an diese Adresse. Der Zugang ist ausschließlich lesend.</p>
     <p style="margin:0 0 14px">Bei Fragen antworten Sie gern einfach auf diese E-Mail.</p>
     <p style="margin:0">Mit freundlichen Grüßen<br>${escapeHtml(p.absender)}</p>
     <p style="margin:18px 0 0;font-size:12px;color:#6b7473">Falls der Button nicht funktioniert: <span style="word-break:break-all">${p.link}</span></p>`,
    p.fuss,
    p.logoSrc ?? `cid:${LOGO_CID}`,
  );
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
