export type DeanScheduleRow = { id: string; groupId: string; groupCode: string; roomId: string | null; roomCode: string | null; startsAt: Date; endsAt: Date; staffIds: string[] };

export function detectDeanScheduleConflicts(rows: readonly DeanScheduleRow[]) {
  const conflicts: Array<{ lessonIds: [string, string]; resource: string }> = [];
  const sorted = [...rows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.startsAt >= a.endsAt) break;
      if (a.startsAt >= b.endsAt) continue;
      if (a.groupId === b.groupId) conflicts.push({ lessonIds: [a.id, b.id], resource: `группа ${a.groupCode}` });
      if (a.roomId && a.roomId === b.roomId) conflicts.push({ lessonIds: [a.id, b.id], resource: `аудитория ${a.roomCode ?? a.roomId}` });
      const staffId = a.staffIds.find((id) => b.staffIds.includes(id));
      if (staffId) conflicts.push({ lessonIds: [a.id, b.id], resource: `сотрудник ${staffId}` });
    }
  }
  return conflicts;
}

export function publishedScoreSummary(scores: readonly number[]) {
  const safe = scores.filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
  return { count: safe.length, average: safe.length ? safe.reduce((sum, score) => sum + score, 0) / safe.length : null };
}
