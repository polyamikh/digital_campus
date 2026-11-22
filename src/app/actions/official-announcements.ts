"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import { acknowledgeOfficialAnnouncement } from "@/lib/campus/official-announcements";

export async function acknowledgeOfficialAnnouncementAction(id: string, versionId: string) {
  const h = await headers();
  if (!isSameOriginRequest(h.get("origin"), h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NODE_ENV === "production")) return { ok: false };
  try { await acknowledgeOfficialAnnouncement(id, versionId); revalidatePath(`/official-announcements/${id}`); return { ok: true }; } catch { return { ok: false }; }
}
