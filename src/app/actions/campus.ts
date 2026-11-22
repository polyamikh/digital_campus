"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { requestStudentPass } from "@/lib/campus/pass-service";
import { sendStudentChatMessage } from "@/lib/campus/chat-service";

async function sameOrigin() {
  const h = await headers();
  return isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production");
}

/** Compatibility wrapper for earlier student pass forms. */
export async function requestTemporaryPassAction(): Promise<void> {
  if (!(await sameOrigin())) return;
  const user = await currentUser();
  if (!user || user.activeRole !== Role.STUDENT) return;
  await requestStudentPass("TEMPORARY_DEMO_QR");
  revalidatePath("/pass");
}

/** Compatibility wrapper; current chat UI also supports replies and private attachments. */
export async function sendCampusMessageAction(formData: FormData): Promise<void> {
  if (!(await sameOrigin())) return;
  const user = await currentUser();
  if (!user || user.activeRole !== Role.STUDENT) return;
  await sendStudentChatMessage({ chatId: formData.get("chatId"), body: formData.get("body") });
  revalidatePath("/chats");
}
