import { Role, PublicationState } from "@/generated/prisma/enums";
import { currentUser, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { courseworkContentDisposition, readCourseworkFile } from "@/lib/coursework/coursework-file-store";
import { activeMembershipWhere } from "@/lib/schedule/schedule-query";

const headersPrivate = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    const user = await currentUser(); if (!user) return Response.json({ error: "Требуется авторизация." }, { status: 401, headers: headersPrivate });
    await requireRole(user.activeRole);
    const { fileId } = await context.params;
    const file = await prisma.materialFile.findUnique({ where: { id: fileId }, include: { material: { include: { audiences: { select: { groupId: true } } } } } });
    if (!file) return new Response(null, { status: 404, headers: headersPrivate });
    let allowed = false;
    if (user.activeRole === Role.STUDENT) {
      const memberships = await prisma.groupMembership.findMany({ where: activeMembershipWhere(user.id, new Date()), select: { groupId: true }, take: 2 });
      allowed = memberships.length === 1 && file.material.state === PublicationState.PUBLISHED && file.material.publishedAt !== null && file.material.audiences.some((item) => item.groupId === memberships[0]!.groupId);
    } else if (user.activeRole === Role.TEACHER) {
      const now = new Date();
      allowed = file.material.authorId === user.id || await prisma.teacherAssignment.count({ where: { teacherId: user.id, courseId: file.material.courseId, groupId: { in: file.material.audiences.map((item) => item.groupId) }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } }).then((count) => count > 0);
    }
    if (!allowed) return new Response(null, { status: 404, headers: headersPrivate });
    const bytes = await readCourseworkFile(file.objectKey); const body = new ArrayBuffer(bytes.byteLength); new Uint8Array(body).set(bytes);
    return new Response(body, { status: 200, headers: { ...headersPrivate, "Content-Type": file.mimeType, "Content-Length": String(bytes.byteLength), "Content-Disposition": courseworkContentDisposition(file.fileName) } });
  } catch { return Response.json({ error: "Не удалось получить файл." }, { status: 500, headers: headersPrivate }); }
}
