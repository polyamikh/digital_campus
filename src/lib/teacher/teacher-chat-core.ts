export function teacherChatVisible(input: { kind: string; chatGroupId: string | null; assignedGroupIds: readonly string[]; participantGroupIds: readonly string[] }) {
  if (input.kind === "GROUP") return Boolean(input.chatGroupId && input.assignedGroupIds.includes(input.chatGroupId));
  if (input.kind === "DIRECT") return input.participantGroupIds.some((groupId) => input.assignedGroupIds.includes(groupId));
  // A COURSE chat has no group key, so its audience cannot be safely narrowed.
  return false;
}
