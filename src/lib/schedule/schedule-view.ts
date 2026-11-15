export function lessonsOnMoscowDate<T extends { date: string }>(lessons: T[], date: string): T[] {
  return lessons.filter((lesson) => lesson.date === date);
}

export function lessonCountsByMoscowDate<T extends { date: string }>(lessons: T[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const lesson of lessons) counts.set(lesson.date, (counts.get(lesson.date) ?? 0) + 1);
  return counts;
}
