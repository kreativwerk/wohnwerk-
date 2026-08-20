import { prisma } from "./db";

export async function audit(
  actor: string,
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: string | null,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { actor, action, entity, entityId: entityId ?? null, detail: detail ?? null },
    });
  } catch {
    // Protokollierung darf den fachlichen Vorgang nie blockieren.
  }
}
