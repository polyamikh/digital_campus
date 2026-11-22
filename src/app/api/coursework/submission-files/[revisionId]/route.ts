import { Role } from "@/generated/prisma/enums";
import { currentUser, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { courseworkContentDisposition, readCourseworkFile } from "@/lib/coursework/coursework-file-store";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, context: { params: Promise<{ revisionId: string }> }) {
  try {
    const user = await currentUser(); if (!user) return Response.json({ error: "Требуется авторизация." }, { status: 401, headers: privateHeaders }); await requireRole(user.activeRole);
    const { revisionId } = await context.params;
    const revision = await prisma.submissionRevision.findUnique({
      where: { id: revisionId },
      include: { submission: { include: { homework: { select: { authorId: true, courseId: true, groupId: true, assessment: { select: { groupId: true } } } } } } },
    });
    if (!revision?.objectKey || !revision.fileName || !revision.mimeType) return new Response(null, { status: 404, headers: privateHeaders });
    let allowed = revision.submission.studentId === user.id && user.activeRole === Role.STUDENT;
    if (user.activeRole === Role.TEACHER) { const now = new Date(); const homework = revision.submission.homework; const groupId = homework.groupId ?? homework.assessment?.groupId; allowed = homework.authorId === user.id && Boolean(groupId) && await prisma.teacherAssignment.count({ where: { teacherId: user.id, courseId: homework.courseId, groupId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } }).then((count) => count > 0); }
    if (!allowed) return new Response(null, { status: 404, headers: privateHeaders });
    const bytes = await readCourseworkFile(revision.objectKey); const body = new ArrayBuffer(bytes.byteLength); new Uint8Array(body).set(bytes);
    return new Response(body, { status: 200, headers: { ...privateHeaders, "Content-Type": revision.mimeType, "Content-Length": String(bytes.byteLength), "Content-Disposition": courseworkContentDisposition(revision.fileName) } });
  } catch { return Response.json({ error: "Не удалось получить файл." }, { status: 500, headers: privateHeaders }); }
}
