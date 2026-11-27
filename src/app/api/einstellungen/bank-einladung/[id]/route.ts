import { getSessionUser, isAdmin, ROLES } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { anmeldeLink, einladungMail, mailAbsender } from "@/lib/login-code";

/** Vorschau der Einladungs-E-Mail fuer einen Bank-Zugang - verschickt nichts. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdmin(await getSessionUser())) return new Response("Nicht angemeldet", { status: 401 });
  const { id } = await context.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== ROLES.BANK) return new Response("Kein Bank-Zugang", { status: 404 });

  const mail = einladungMail({ name: user.name, link: await anmeldeLink(user.email), ...(await mailAbsender()) });
  const kopf = `<div style="font-family:Arial,sans-serif;font-size:13px;background:#fff8e6;border-bottom:1px solid #e8d8a8;padding:10px 16px;color:#5b4a1a">
<b>Vorschau – nichts verschickt.</b> An: ${user.email} · Betreff: ${mail.subject.replace(/</g, "&lt;")}</div>`;
  return new Response(mail.html.replace(/<body([^>]*)>/, `<body$1>${kopf}`), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
