import { ForbiddenRoleError, UnauthenticatedError } from "@/lib/auth/session";
import { readPrivateRequestDocument } from "@/lib/requests/request-document-store";
import { requestDocumentForCurrentUser } from "@/lib/requests/request-workflow";

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function contentDisposition(fileName: string): string {
  const safeFallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_").slice(0, 120) || "document.pdf";
  return `attachment; filename="${safeFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }): Promise<Response> {
  const { documentId } = await context.params;
  if (!UUID.test(documentId)) return new Response(null, { status: 404, headers: RESPONSE_HEADERS });
  try {
    const document = await requestDocumentForCurrentUser(documentId);
    if (!document) return new Response(null, { status: 404, headers: RESPONSE_HEADERS });
    const bytes = await readPrivateRequestDocument(document.objectKey);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...RESPONSE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(document.fileName),
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return Response.json({ error: "Войдите в кабинет." }, { status: 401, headers: RESPONSE_HEADERS });
    if (error instanceof ForbiddenRoleError) return new Response(null, { status: 404, headers: RESPONSE_HEADERS });
    return new Response(null, { status: 404, headers: RESPONSE_HEADERS });
  }
}
