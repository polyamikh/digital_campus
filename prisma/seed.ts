import "dotenv/config";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

const SEED_CONFIRMATION = "I_CONFIRM_DEMO_DATABASE_SEED";
const ALLOWED_DATABASES = new Set(["digital_campus", "digital_campus_seed_test"]);
const SEED_NAMESPACE = "digital-campus-contest-seed-v1";
const FIXTURE_NOW = new Date("2026-11-08T09:00:00.000+03:00");
const SEMESTER_START = new Date("2026-09-01T00:00:00.000+03:00");
const MOSCOW_OFFSET = "+03:00";

const OFFICIAL_CALENDAR_SOURCE =
  "https://mintrud.gov.ru/social/social/1366";

type SeedRow = Record<string, unknown> & { id: string };
type SeedDelegate = {
  findMany(args: { where: { id: { in: string[] } } }): Promise<Record<string, unknown>[]>;
  createMany(args: { data: SeedRow[]; skipDuplicates: boolean }): Promise<{ count: number }>;
};

type GroupCode = "ЦМ-26-1" | "ЦМ-26-2" | "ЦМ-25-2";
type StudentFixture = { id: string; login: string; displayName: string; groupCode: GroupCode; rosterIndex: number };
type StaffFixture = { id: string; login: string; displayName: string; role: "TEACHER" | "DEAN"; key: string };
type ComponentFixture = { name: string; maximumPoints: number };
type CourseFixture = {
  key: string;
  code: string;
  name: string;
  teacherKey: string;
  groups: GroupCode[];
  components: ComponentFixture[];
};
type OfferingFixture = {
  key: string;
  courseKey: string;
  groupCode: GroupCode;
  teacherKey: string;
  weekdayOffset: number;
  startTime: string;
  roomCode: string;
  courseIndex: number;
};
type LessonFixture = {
  id: string;
  courseKey: string;
  groupCode: GroupCode;
  teacherId: string | null;
  examinerId: string | null;
  roomCode: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  format: string | null;
  kind: "CLASS" | "EXAM";
  state: "COMPLETED" | "SCHEDULED";
  courseIndex: number;
  weekIndex: number;
};

const groupNames: Record<GroupCode, string> = {
  "ЦМ-26-1": "Цифровой маркетинг — группа 1",
  "ЦМ-26-2": "Цифровой маркетинг — группа 2",
  "ЦМ-25-2": "Цифровой маркетинг — группа 3",
};

const staff: StaffFixture[] = [
  { key: "maria", login: "volkova.m_teacher", displayName: "Мария Волкова", role: "TEACHER", id: stableId("user:volkova.m_teacher") },
  { key: "anna", login: "mironova.a_teacher", displayName: "Анна Миронова", role: "TEACHER", id: stableId("user:mironova.a_teacher") },
  { key: "dmitry", login: "sokolov.d_teacher", displayName: "Дмитрий Соколов", role: "TEACHER", id: stableId("user:sokolov.d_teacher") },
  { key: "elena", login: "krylova.e_teacher", displayName: "Елена Крылова", role: "TEACHER", id: stableId("user:krylova.e_teacher") },
  { key: "alexander", login: "voronov.a_teacher", displayName: "Александр Воронов", role: "TEACHER", id: stableId("user:voronov.a_teacher") },
  { key: "victoria", login: "lebedeva.v_teacher", displayName: "Виктория Лебедева", role: "TEACHER", id: stableId("user:lebedeva.v_teacher") },
  { key: "maxim", login: "orlov.m_teacher", displayName: "Максим Орлов", role: "TEACHER", id: stableId("user:orlov.m_teacher") },
  { key: "natalia", login: "fedorova.n_teacher", displayName: "Наталья Федорова", role: "TEACHER", id: stableId("user:fedorova.n_teacher") },
  { key: "ekaterina", login: "orlova.e_dean", displayName: "Екатерина Орлова", role: "DEAN", id: stableId("user:orlova.e_dean") },
  { key: "olga", login: "smirnova.o_dean", displayName: "Ольга Смирнова", role: "DEAN", id: stableId("user:smirnova.o_dean") },
];

const namedStudents: StudentFixture[] = [
  { id: stableId("user:sokolova.a_student"), login: "sokolova.a_student", displayName: "Алиса Соколова", groupCode: "ЦМ-26-1", rosterIndex: 0 },
  { id: stableId("user:belova.s_student"), login: "belova.s_student", displayName: "София Белова", groupCode: "ЦМ-26-2", rosterIndex: 0 },
];

const studentFirstNames = [
  "Анастасия", "Артем", "Варвара", "Владислав", "Галина", "Глеб", "Дарья",
  "Денис", "Ева", "Иван", "Ирина", "Кирилл", "Ксения", "Лев", "Лилия",
  "Макар", "Марина", "Марк", "Надежда", "Никита", "Олеся", "Павел",
  "Полина", "Роман", "Светлана", "Семен", "Тамара", "Тимур", "Ульяна",
  "Федор", "Элина", "Юрий", "Яна",
];
const studentSurnames = [
  "Абрамова", "Агапова", "Андреева", "Анисимова", "Артемьева", "Баранова", "Беляева",
  "Богданова", "Борисова", "Васильева", "Виноградова", "Гаврилова", "Герасимова",
  "Голубева", "Громова", "Давыдова", "Денисова", "Дмитриева", "Егорова", "Ефимова",
  "Жукова", "Зайцева", "Захарова", "Зверева", "Иванова", "Игнатова", "Ильина",
  "Калинина", "Карпова", "Киселева", "Климова", "Ковалева", "Козлова", "Комарова",
  "Коновалова", "Королева", "Костина", "Кузнецова", "Лаврова", "Логинова", "Макарова",
  "Малинина", "Маркова", "Матвеева", "Медведева", "Мельникова", "Михайлова", "Морозова",
  "Назарова", "Никитина", "Новикова", "Осипова", "Павлова", "Петрова", "Полякова",
  "Попова", "Романова", "Семенова", "Сергеева", "Соловьева", "Степанова", "Тарасова",
  "Филиппова", "Фролова", "Харитонова", "Чернова",
];

const courseFixtures: CourseFixture[] = [
  { key: "digital-marketing", code: "DM-2026", name: "Digital Marketing", teacherKey: "maria", groups: ["ЦМ-26-1", "ЦМ-26-2"], components: [{ name: "Домашние задания", maximumPoints: 25 }, { name: "Тесты", maximumPoints: 20 }, { name: "Проект", maximumPoints: 35 }, { name: "Семинарская активность", maximumPoints: 20 }] },
  { key: "marketing-analytics", code: "MA-2026", name: "Marketing Analytics", teacherKey: "anna", groups: ["ЦМ-26-1", "ЦМ-26-2"], components: [{ name: "Аналитические задания", maximumPoints: 30 }, { name: "Тесты", maximumPoints: 20 }, { name: "Кейс-анализ", maximumPoints: 30 }, { name: "Итоговый отчёт", maximumPoints: 20 }] },
  { key: "consumer-behavior", code: "CB-2026", name: "Consumer Behavior", teacherKey: "dmitry", groups: ["ЦМ-26-1"], components: [{ name: "Эссе", maximumPoints: 25 }, { name: "Тесты", maximumPoints: 25 }, { name: "Анализ аудитории", maximumPoints: 30 }, { name: "Участие в семинарах", maximumPoints: 20 }] },
  { key: "brand-management", code: "BM-2026", name: "Brand Management", teacherKey: "elena", groups: ["ЦМ-26-2"], components: [{ name: "Задания", maximumPoints: 25 }, { name: "Презентация", maximumPoints: 25 }, { name: "Разбор кейса", maximumPoints: 30 }, { name: "Итоговый проект", maximumPoints: 20 }] },
  { key: "strategic-marketing", code: "SM-2026", name: "Strategic Marketing", teacherKey: "alexander", groups: ["ЦМ-25-2"], components: [{ name: "Стратегические кейсы", maximumPoints: 30 }, { name: "Промежуточный тест", maximumPoints: 20 }, { name: "Семинарский доклад", maximumPoints: 20 }, { name: "Итоговая стратегия", maximumPoints: 30 }] },
  { key: "e-commerce", code: "EC-2026", name: "E-commerce", teacherKey: "victoria", groups: ["ЦМ-26-1"], components: [{ name: "Задания", maximumPoints: 30 }, { name: "Тесты", maximumPoints: 20 }, { name: "Проект магазина", maximumPoints: 35 }, { name: "Итоговая работа", maximumPoints: 15 }] },
  { key: "digital-advertising", code: "DA-2026", name: "Digital Advertising", teacherKey: "maxim", groups: ["ЦМ-26-2"], components: [{ name: "Рекламные концепции", maximumPoints: 35 }, { name: "Тесты", maximumPoints: 20 }, { name: "Медиаплан", maximumPoints: 25 }, { name: "Итоговый проект", maximumPoints: 20 }] },
  { key: "marketing-research", code: "MR-2026", name: "Marketing Research", teacherKey: "natalia", groups: ["ЦМ-25-2"], components: [{ name: "Исследовательские задания", maximumPoints: 30 }, { name: "Тесты", maximumPoints: 20 }, { name: "План исследования", maximumPoints: 30 }, { name: "Итоговый отчёт", maximumPoints: 20 }] },
  { key: "marketing-strategies", code: "MS-2026", name: "Marketing Strategies", teacherKey: "maria", groups: ["ЦМ-25-2"], components: [{ name: "Разборы кейсов", maximumPoints: 25 }, { name: "Семинарская активность", maximumPoints: 15 }, { name: "Стратегический доклад", maximumPoints: 20 }, { name: "Итоговый проект", maximumPoints: 40 }] },
];

const groupOrder: GroupCode[] = ["ЦМ-26-1", "ЦМ-26-2", "ЦМ-25-2"];
const roomCodes = ["А-201", "А-204", "Б-105", "Б-210", "В-301", "В-305"];

const officialAnnouncementFixtures = [
  { key: "term-start-info", title: "Учебный семестр: организационная информация", body: "Демонстрационная информация о начале осеннего семестра 2026/2027. Данные полностью вымышлены.", requiresAcknowledgement: false, state: "PUBLISHED", createdAt: new Date("2026-09-03T10:00:00.000+03:00"), publishedAt: new Date("2026-09-03T10:30:00.000+03:00"), groups: groupOrder, roles: [] as string[] },
  { key: "library-rules-ack", title: "Порядок работы с учебными материалами", body: "Демонстрационное объявление, требующее подтверждения ознакомления. Оно не является официальным сообщением университета.", requiresAcknowledgement: true, state: "PUBLISHED", createdAt: new Date("2026-10-05T11:00:00.000+03:00"), publishedAt: new Date("2026-10-05T11:15:00.000+03:00"), groups: groupOrder, roles: ["TEACHER"] },
  { key: "e2e-04-draft", title: "Черновик объявления для подтверждения ознакомления", body: "Черновик подготовлен для сценария E2E-04. Его публикация и подтверждения должны произойти во время демонстрации.", requiresAcknowledgement: true, state: "DRAFT", createdAt: new Date("2026-11-01T09:00:00.000+03:00"), publishedAt: null, groups: ["ЦМ-26-1" as GroupCode], roles: ["TEACHER"] },
];

function stableId(key: string): string {
  const hex = createHash("sha256").update(`${SEED_NAMESPACE}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function normalize(value: unknown): string {
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (typeof value === "number") return `numeric:${value}`;
  if (value !== null && typeof value === "object" && "toFixed" in value && typeof value.toString === "function") return `numeric:${value.toString()}`;
  if (value !== null && typeof value === "object") return `json:${stableJson(value)}`;
  return `${typeof value}:${String(value)}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function asSeedDelegate(value: unknown): SeedDelegate {
  return value as SeedDelegate;
}

async function ensureMany(
  label: string,
  delegateValue: unknown,
  rows: SeedRow[],
  mutableFields: readonly string[] = [],
): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const delegate = asSeedDelegate(delegateValue);
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${label}: duplicate deterministic IDs in seed fixture`);

  const existingById = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    for (const row of await delegate.findMany({ where: { id: { in: chunk } } })) {
      const id = row.id;
      if (typeof id === "string") existingById.set(id, row);
    }
  }

  const mutable = new Set(mutableFields);
  for (const row of rows) {
    const existing = existingById.get(row.id);
    if (!existing) continue;
    for (const [field, expected] of Object.entries(row)) {
      if (mutable.has(field)) continue;
      if (normalize(existing[field]) !== normalize(expected)) {
        throw new Error(`${label}: existing seed record ${row.id} conflicts on ${field}; it was left unchanged`);
      }
    }
  }

  const missing = rows.filter((row) => !existingById.has(row.id));
  for (let index = 0; index < missing.length; index += 300) {
    await delegate.createMany({ data: missing.slice(index, index + 300), skipDuplicates: true });
  }

  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    const found = new Set((await delegate.findMany({ where: { id: { in: chunk } } }).then((result) => result.map((row) => row.id).filter((id): id is string => typeof id === "string"))));
    const collision = chunk.find((id) => !found.has(id));
    if (collision) throw new Error(`${label}: a conflicting unique key prevented fixture ${collision}; no existing data was overwritten`);
  }
  return new Set(missing.map((row) => row.id));
}

function requireLocalDemoDatabase(): { connectionString: string; databaseName: string } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Seed refused: DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Seed refused: DATABASE_URL is not a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Seed refused: DATABASE_URL must use PostgreSQL.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("Seed refused: only a local loopback PostgreSQL host is permitted.");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const expectedDatabase = process.env.DIGITAL_CAMPUS_SEED_DB;
  if (!ALLOWED_DATABASES.has(databaseName) || expectedDatabase !== databaseName) {
    throw new Error("Seed refused: set DIGITAL_CAMPUS_SEED_DB to the exact approved local demo database name.");
  }
  if (process.env.DIGITAL_CAMPUS_SEED_APPROVED !== SEED_CONFIRMATION) {
    throw new Error("Seed refused: explicit DIGITAL_CAMPUS_SEED_APPROVED confirmation is required.");
  }
  return { connectionString, databaseName };
}

function transliterate(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return [...value.toLowerCase()].map((character) => map[character] ?? character).join("").replace(/[^a-z0-9]+/g, "");
}

function buildStudents(): StudentFixture[] {
  const additional = studentSurnames.map((surname, index) => {
    const firstName = studentFirstNames[index % studentFirstNames.length];
    if (!firstName) throw new Error("Student name fixture is incomplete");
    const login = `${transliterate(surname)}.${transliterate(firstName).slice(0, 1)}_student`;
    return { id: stableId(`user:${login}`), login, displayName: `${firstName} ${surname}`, surname, index };
  });
  const target = 64;
  if (additional.length < target) throw new Error(`Need ${target} synthetic students besides Alice and Sofia`);
  const selected = additional.slice(0, target);
  const students: StudentFixture[] = [...namedStudents];
  const groupCounts: Record<GroupCode, number> = { "ЦМ-26-1": 1, "ЦМ-26-2": 1, "ЦМ-25-2": 0 };
  for (const [index, student] of selected.entries()) {
    const groupCode: GroupCode = index < 21 ? "ЦМ-26-1" : index < 42 ? "ЦМ-26-2" : "ЦМ-25-2";
    const groupCount = groupCounts[groupCode];
    groupCounts[groupCode] += 1;
    students.push({ id: student.id, login: student.login, displayName: student.displayName, groupCode, rosterIndex: groupCount });
  }
  for (const groupCode of groupOrder) {
    const count = students.filter((student) => student.groupCode === groupCode).length;
    if (count !== 22) throw new Error(`${groupCode}: expected 22 students, got ${count}`);
  }
  if (new Set(students.map((student) => student.login)).size !== 66) throw new Error("Student logins are not unique");
  return students;
}

const students = buildStudents();
const studentsByGroup = new Map<GroupCode, StudentFixture[]>(groupOrder.map((groupCode) => [groupCode, students.filter((student) => student.groupCode === groupCode)]));
const staffByKey = new Map(staff.map((person) => [person.key, person]));
const groups = new Map<GroupCode, { id: string; code: GroupCode; name: string }>(groupOrder.map((code) => [code, { id: stableId(`group:${code}`), code, name: groupNames[code] }]));
const courses = new Map(courseFixtures.map((course) => [course.key, { ...course, id: stableId(`course:${course.key}`), subjectId: stableId(`subject:${course.key}`), teacher: staffByKey.get(course.teacherKey) } ]));

const offerings: OfferingFixture[] = [];
for (const [courseIndex, course] of courseFixtures.entries()) {
  for (const groupCode of course.groups) {
    const slotIndex = offerings.length;
    const weekdayOffset = slotIndex < 3 ? 0 : slotIndex < 6 ? 1 : slotIndex < 9 ? 2 : 3;
    const withinDayIndex = slotIndex < 3 ? slotIndex : slotIndex < 6 ? slotIndex - 3 : slotIndex < 9 ? slotIndex - 6 : slotIndex - 9;
    offerings.push({
      key: `${course.key}:${groupCode}`,
      courseKey: course.key,
      groupCode,
      teacherKey: course.teacherKey,
      weekdayOffset,
      startTime: ["19:00", "20:00", "21:00"][withinDayIndex] ?? "19:00",
      roomCode: roomCodes[slotIndex % roomCodes.length] ?? roomCodes[0] ?? "А-201",
      courseIndex,
    });
  }
}

function isoDate(date: Date): string { return date.toISOString().slice(0, 10); }
function moscowDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day"): string => parts.find((item) => item.type === type)?.value ?? "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("Could not resolve a Europe/Moscow calendar date");
  return `${year}-${month}-${day}`;
}
function utcDate(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
function moscowDateTime(date: string, time: string): Date { return new Date(`${date}T${time}:00.000${MOSCOW_OFFSET}`); }
function datePlusDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

const officialNonWorkingNotes = new Map<string, string>();
function addDateRange(start: string, end: string, note: (date: string) => string): void {
  for (let date = utcDate(start); date <= utcDate(end); date = datePlusDays(date, 1)) {
    const key = isoDate(date);
    officialNonWorkingNotes.set(key, note(key));
  }
}
addDateRange("2026-01-01", "2026-01-08", () => "Нерабочие праздничные дни: новогодние каникулы и Рождество Христово");
officialNonWorkingNotes.set("2026-01-09", "Выходной перенесён с 03.01.2026 постановлением Правительства РФ № 1466");
addDateRange("2026-02-21", "2026-02-23", (date) => date === "2026-02-23" ? "День защитника Отечества; официальный выходной период" : "Выходной день по пятидневной рабочей неделе");
addDateRange("2026-03-07", "2026-03-09", (date) => date === "2026-03-08" ? "Международный женский день; официальный выходной период" : "Официальный выходной период Минтруда России");
addDateRange("2026-05-01", "2026-05-03", (date) => date === "2026-05-01" ? "Праздник Весны и Труда; официальный выходной период" : "Официальный выходной период Минтруда России");
addDateRange("2026-05-09", "2026-05-11", (date) => date === "2026-05-09" ? "День Победы; официальный выходной период" : "Официальный выходной период Минтруда России");
addDateRange("2026-06-12", "2026-06-14", (date) => date === "2026-06-12" ? "День России; официальный выходной период" : "Официальный выходной период Минтруда России");
officialNonWorkingNotes.set("2026-11-04", "День народного единства");
officialNonWorkingNotes.set("2026-12-31", "Выходной перенесён с 04.01.2026 постановлением Правительства РФ № 1466");

function buildProductionDays(calendarId: string): SeedRow[] {
  const rows: SeedRow[] = [];
  let workingCount = 0;
  for (let date = utcDate("2026-01-01"); date < utcDate("2027-01-01"); date = datePlusDays(date, 1)) {
    const dateKey = isoDate(date);
    const weekday = date.getUTCDay();
    const statutoryNote = officialNonWorkingNotes.get(dateKey);
    const weekend = weekday === 0 || weekday === 6;
    const kind = statutoryNote || weekend ? "NON_WORKING" : "WORKING";
    if (kind === "WORKING") workingCount += 1;
    rows.push({
      id: stableId(`production-day:2026:${dateKey}`),
      calendarId,
      date,
      kind,
      note: statutoryNote ?? (weekend ? "Выходной день по пятидневной рабочей неделе" : null),
    });
  }
  if (rows.length !== 365 || workingCount !== 247) {
    throw new Error(`Official 2026 calendar fixture sanity check failed: ${workingCount} working days across ${rows.length} dates`);
  }
  return rows;
}

function calendarDateIsWorking(date: Date): boolean {
  const dateKey = isoDate(date);
  return date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !officialNonWorkingNotes.has(dateKey);
}

function addWorkingDaysDeadline(submittedAt: Date, workingDays: number): Date {
  let date = utcDate(moscowDateKey(submittedAt));
  let remaining = workingDays;
  while (remaining > 0) {
    date = datePlusDays(date, 1);
    if (calendarDateIsWorking(date)) remaining -= 1;
  }
  return new Date(`${isoDate(date)}T23:59:59.999${MOSCOW_OFFSET}`);
}

function buildLessons(): LessonFixture[] {
  const rows: LessonFixture[] = [];
  const termMonday = utcDate("2026-09-14");
  for (const offering of offerings) {
    for (let weekIndex = 0; weekIndex < 15; weekIndex += 1) {
      const date = datePlusDays(termMonday, weekIndex * 7 + offering.weekdayOffset);
      if (!calendarDateIsWorking(date)) continue;
      const dateKey = isoDate(date);
      const startsAt = moscowDateTime(dateKey, offering.startTime);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const course = courses.get(offering.courseKey);
      const teacher = staffByKey.get(offering.teacherKey);
      if (!course || !teacher) throw new Error(`Schedule fixture is missing ${offering.key}`);
      const sessionType = weekIndex % 2 === 0 ? "Лекция" : "Семинар";
      rows.push({
        id: stableId(`lesson:${offering.key}:${dateKey}`),
        courseKey: offering.courseKey,
        groupCode: offering.groupCode,
        teacherId: teacher.id,
        examinerId: null,
        roomCode: offering.roomCode,
        startsAt,
        endsAt,
        title: `${course.name} — ${sessionType.toLowerCase()} ${weekIndex + 1}`,
        format: sessionType,
        kind: "CLASS",
        state: startsAt < FIXTURE_NOW ? "COMPLETED" : "SCHEDULED",
        courseIndex: offering.courseIndex,
        weekIndex,
      });
    }
  }

  const exams = [
    { courseKey: "consumer-behavior", groupCode: "ЦМ-26-1" as GroupCode, date: "2026-11-28", examinerKey: "elena", roomCode: "А-201" },
    { courseKey: "brand-management", groupCode: "ЦМ-26-2" as GroupCode, date: "2026-12-05", examinerKey: "dmitry", roomCode: "А-204" },
    { courseKey: "strategic-marketing", groupCode: "ЦМ-25-2" as GroupCode, date: "2026-12-12", examinerKey: "anna", roomCode: "Б-105" },
  ];
  for (const exam of exams) {
    const course = courses.get(exam.courseKey);
    const examiner = staffByKey.get(exam.examinerKey);
    if (!course || !examiner) throw new Error(`Exam fixture is incomplete for ${exam.courseKey}`);
    const startsAt = moscowDateTime(exam.date, "11:00");
    rows.push({
      id: stableId(`exam:${exam.courseKey}:${exam.groupCode}:${exam.date}`),
      courseKey: exam.courseKey,
      groupCode: exam.groupCode,
      teacherId: null,
      examinerId: examiner.id,
      roomCode: exam.roomCode,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
      title: `${course.name} — демонстрационный экзамен`,
      format: null,
      kind: "EXAM",
      state: "SCHEDULED",
      courseIndex: courseFixtures.findIndex((row) => row.key === exam.courseKey),
      weekIndex: 15,
    });
  }
  assertScheduleHasNoConflicts(rows);
  return rows;
}

function assertScheduleHasNoConflicts(rows: LessonFixture[]): void {
  const staffSlots = new Map<string, LessonFixture[]>();
  const groupSlots = new Map<string, LessonFixture[]>();
  const roomSlots = new Map<string, LessonFixture[]>();
  for (const row of rows.filter((lesson) => lesson.state === "SCHEDULED")) {
    for (const staffId of [row.teacherId, row.examinerId].filter((value): value is string => Boolean(value))) {
      const list = staffSlots.get(staffId) ?? [];
      list.push(row);
      staffSlots.set(staffId, list);
    }
    const groupKey = row.groupCode;
    const groupList = groupSlots.get(groupKey) ?? [];
    groupList.push(row);
    groupSlots.set(groupKey, groupList);
    const roomList = roomSlots.get(row.roomCode) ?? [];
    roomList.push(row);
    roomSlots.set(row.roomCode, roomList);
  }
  for (const [label, slots] of [["staff", staffSlots], ["group", groupSlots], ["room", roomSlots]] as const) {
    for (const [key, lessons] of slots) {
      lessons.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
      for (let index = 1; index < lessons.length; index += 1) {
        const previous = lessons[index - 1];
        const current = lessons[index];
        if (previous && current && previous.endsAt > current.startsAt) {
          throw new Error(`Schedule fixture conflict for ${label} ${key}: ${previous.id} overlaps ${current.id}`);
        }
      }
    }
  }
}

function scoreFor(student: StudentFixture, courseKey: string, assessmentKind: "homework" | "test", courseIndex: number): number {
  if (student.login === "sokolova.a_student") {
    if (courseKey === "digital-marketing") return assessmentKind === "homework" ? 82 : 78;
    if (courseKey === "marketing-analytics") return assessmentKind === "homework" ? 70 : 74;
    return 61 + ((courseIndex * 7 + (assessmentKind === "test" ? 9 : 2)) % 20);
  }
  if (student.login === "belova.s_student") {
    if (courseKey === "digital-marketing") return assessmentKind === "homework" ? 88 : 90;
    if (courseKey === "marketing-analytics") return assessmentKind === "homework" ? 96 : 98;
    return 84 + ((courseIndex * 5 + (assessmentKind === "test" ? 4 : 1)) % 15);
  }
  return 58 + ((student.rosterIndex * 7 + courseIndex * 11 + (assessmentKind === "test" ? 13 : 3)) % 42);
}

function passwordFromEnvironment(login: string): string {
  const variableByLogin: Record<string, string> = {
    "sokolova.a_student": "DEMO_PASSWORD_SOKOLOVA_A",
    "belova.s_student": "DEMO_PASSWORD_BELOVA_S",
    "volkova.m_teacher": "DEMO_PASSWORD_VOLKOVA_M",
    "orlova.e_dean": "DEMO_PASSWORD_ORLOVA_E",
  };
  const variableName = variableByLogin[login];
  if (!variableName) throw new Error(`No local password variable is configured for ${login}`);
  const password = process.env[variableName];
  if (!password || password.length < 14) throw new Error(`${variableName} must be set locally and contain at least 14 characters`);
  return password;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, nValue, rValue, pValue, saltText, derivedText] = encoded.split("$");
  if (algorithm !== "scrypt" || !nValue || !rValue || !pValue || !saltText || !derivedText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(derivedText, "base64url");
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(nValue), r: Number(rValue), p: Number(pValue), maxmem: 128 * 1024 * 1024,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function verifyPrimaryAccounts(tx: Prisma.TransactionClient, passwords: Map<string, string>): Promise<void> {
  for (const login of ["sokolova.a_student", "belova.s_student", "volkova.m_teacher", "orlova.e_dean"]) {
    const existing = await tx.user.findUnique({ where: { login } });
    if (!existing) continue;
    const candidate = passwords.get(login);
    if (!candidate || !existing.passwordHash || !existing.activatedAt || !existing.isActive || !verifyPassword(candidate, existing.passwordHash)) {
      throw new Error(`Existing primary demo account ${login} is not in the expected active state or its local password does not match; seed did not alter it`);
    }
  }
}

function userRows(passwords: Map<string, string>): SeedRow[] {
  const accountRows = [
    ...students.map((student) => ({ id: student.id, login: student.login, displayName: student.displayName, role: "STUDENT", activated: student.login === "sokolova.a_student" || student.login === "belova.s_student" })),
    ...staff.map((person) => ({ id: person.id, login: person.login, displayName: person.displayName, role: person.role, activated: ["volkova.m_teacher", "orlova.e_dean"].includes(person.login) })),
  ];
  return accountRows.map((account) => {
    const password = passwords.get(account.login);
    return {
      id: account.id,
      login: account.login,
      passwordHash: account.activated && password ? hashPassword(password) : null,
      activatedAt: account.activated ? SEMESTER_START : null,
      isActive: true,
      createdAt: SEMESTER_START,
      updatedAt: SEMESTER_START,
      version: 1,
    };
  });
}

function statusHistoryRows(requests: Array<{ id: string; studentId: string; state: string; submittedAt: Date; assignedToId: string | null }>): SeedRow[] {
  const rows: SeedRow[] = [];
  for (const request of requests) {
    const firstId = stableId(`request-history:${request.id}:created`);
    rows.push({ id: firstId, requestId: request.id, actorId: request.studentId, fromState: null, toState: "SUBMITTED", reason: "Демонстрационная заявка создана студентом", createdAt: request.submittedAt });
    if (request.state !== "SUBMITTED" && request.assignedToId) {
      rows.push({ id: stableId(`request-history:${request.id}:review`), requestId: request.id, actorId: request.assignedToId, fromState: "SUBMITTED", toState: request.state, reason: "Передано в обработку деканата", createdAt: new Date(request.submittedAt.getTime() + 60 * 60 * 1000) });
    }
  }
  return rows;
}

async function runSeed(tx: Prisma.TransactionClient, passwords: Map<string, string>): Promise<Record<string, number>> {
  // Prisma's PostgreSQL adapter binds Date values as timezone-less timestamps;
  // fix the transaction timezone so those instants are stored consistently.
  await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
  await verifyPrimaryAccounts(tx, passwords);
  const people = userRows(passwords);
  await ensureMany("User", tx.user, people, ["passwordHash", "activatedAt", "isActive", "updatedAt", "version"]);

  const profiles = [...students.map((student) => ({ id: stableId(`profile:${student.login}`), userId: student.id, displayName: student.displayName, email: `${student.login}@demo.invalid`, phone: null, settings: null, createdAt: SEMESTER_START, updatedAt: SEMESTER_START, version: 1 })), ...staff.map((person) => ({ id: stableId(`profile:${person.login}`), userId: person.id, displayName: person.displayName, email: `${person.login}@demo.invalid`, phone: null, settings: null, createdAt: SEMESTER_START, updatedAt: SEMESTER_START, version: 1 }))];
  await ensureMany("UserProfile", tx.userProfile, profiles, ["displayName", "email", "phone", "settings", "updatedAt", "version"]);
  await ensureMany("UserRole", tx.userRole, people.map((person) => ({ id: stableId(`user-role:${person.login}:${String(person.login).endsWith("_student") ? "STUDENT" : String(person.login).endsWith("_dean") ? "DEAN" : "TEACHER"}`), userId: person.id, role: String(person.login).endsWith("_student") ? "STUDENT" : String(person.login).endsWith("_dean") ? "DEAN" : "TEACHER", grantedAt: SEMESTER_START, revokedAt: null } as SeedRow)));

  const groupRows: SeedRow[] = groupOrder.map((code) => ({ id: groups.get(code)?.id ?? stableId(`group:${code}`), code, name: groupNames[code] }));
  await ensureMany("Group", tx.group, groupRows);
  const membershipRows: SeedRow[] = students.map((student) => ({ id: stableId(`membership:${student.groupCode}:${student.login}`), groupId: groups.get(student.groupCode)?.id, studentId: student.id, startsAt: SEMESTER_START, endsAt: null }));
  await ensureMany("GroupMembership", tx.groupMembership, membershipRows, ["startsAt", "endsAt"]);

  const subjectRows: SeedRow[] = courseFixtures.map((course) => ({ id: stableId(`subject:${course.key}`), code: `SUB-${course.code}`, name: course.name }));
  await ensureMany("Subject", tx.subject, subjectRows);
  const courseRows: SeedRow[] = courseFixtures.map((course) => ({ id: stableId(`course:${course.key}`), code: course.code, name: course.name, subjectId: stableId(`subject:${course.key}`), ownerId: staffByKey.get(course.teacherKey)?.id, createdAt: SEMESTER_START }));
  await ensureMany("Course", tx.course, courseRows);

  const courseGroupRows: SeedRow[] = offerings.map((offering) => ({ id: stableId(`course-group:${offering.key}`), courseId: stableId(`course:${offering.courseKey}`), groupId: groups.get(offering.groupCode)?.id }));
  const teacherAssignmentRows: SeedRow[] = offerings.map((offering) => ({ id: stableId(`teacher-assignment:${offering.key}`), teacherId: staffByKey.get(offering.teacherKey)?.id, courseId: stableId(`course:${offering.courseKey}`), groupId: groups.get(offering.groupCode)?.id, startsAt: SEMESTER_START, endsAt: new Date("2026-12-31T23:59:59.999+03:00") }));
  await ensureMany("CourseGroup", tx.courseGroup, courseGroupRows);
  await ensureMany("TeacherAssignment", tx.teacherAssignment, teacherAssignmentRows, ["startsAt", "endsAt"]);

  const roomRows: SeedRow[] = roomCodes.map((code, index) => ({ id: stableId(`room:${code}`), code, name: `Демонстрационная аудитория ${index + 1}` }));
  await ensureMany("Room", tx.room, roomRows);

  const calendarYearId = stableId("production-calendar:2026");
  await ensureMany("ProductionCalendarYear", tx.productionCalendarYear, [{
    id: calendarYearId,
    year: 2026,
    sourceName: "Минтруд России: календарь праздничных и выходных дней 2026 (01.07.2025); переносы сверены с Постановлением Правительства РФ от 24.09.2025 № 1466",
    sourceUrl: OFFICIAL_CALENDAR_SOURCE,
    sourcePublishedAt: new Date("2025-07-01T00:00:00.000+03:00"),
    importedAt: FIXTURE_NOW,
    verifiedAt: FIXTURE_NOW,
  }]);
  await ensureMany("ProductionCalendarDay", tx.productionCalendarDay, buildProductionDays(calendarYearId), ["kind", "note"]);

  const componentRows: SeedRow[] = [];
  const structureRows: SeedRow[] = [];
  const allocationRows: SeedRow[] = [];
  for (const course of courseFixtures) {
    const courseId = stableId(`course:${course.key}`);
    const structureId = stableId(`assessment-structure:${course.key}:v1`);
    const sum = course.components.reduce((total, component) => total + component.maximumPoints, 0);
    if (course.components.length < 3 || course.components.length > 5 || sum !== 100) throw new Error(`${course.name}: assessment components must be 3–5 and total 100`);
    structureRows.push({ id: structureId, courseId, version: 1, createdById: staffByKey.get(course.teacherKey)?.id, createdAt: SEMESTER_START, publishedAt: null, reason: "Демонстрационная структура оценивания дисциплины" });
    for (const [position, component] of course.components.entries()) {
      const componentId = stableId(`assessment-component:${course.key}:${component.name}`);
      componentRows.push({ id: componentId, courseId, name: component.name, isRequired: false });
      allocationRows.push({
        id: stableId(`assessment-allocation:${course.key}:v1:${component.name}`),
        componentId,
        courseId,
        structureVersionId: structureId,
        componentName: component.name,
        maximumPoints: component.maximumPoints,
        isRequired: false,
        position,
        effectiveAt: new Date("2026-09-07T09:00:00.000+03:00"),
      });
    }
  }
  await ensureMany("AssessmentComponent", tx.assessmentComponent, componentRows);
  const structureCreatedIds = await ensureMany("AssessmentStructureVersion", tx.assessmentStructureVersion, structureRows, ["publishedAt", "reason"]);
  await ensureMany("AssessmentWeight", tx.assessmentWeight, allocationRows);
  if (structureCreatedIds.size > 0) {
    await tx.assessmentStructureVersion.updateMany({ where: { id: { in: [...structureCreatedIds] } }, data: { publishedAt: new Date("2026-09-07T09:00:00.000+03:00") } });
  }

  const lessons = buildLessons();
  const lessonRows: SeedRow[] = lessons.map((lesson) => ({
    id: lesson.id,
    courseId: stableId(`course:${lesson.courseKey}`),
    groupId: groups.get(lesson.groupCode)?.id,
    teacherId: lesson.teacherId,
    examinerId: lesson.examinerId,
    substituteId: null,
    roomId: stableId(`room:${lesson.roomCode}`),
    title: lesson.title,
    format: lesson.format,
    kind: lesson.kind,
    startsAt: lesson.startsAt,
    endsAt: lesson.endsAt,
    state: lesson.state,
    version: 1,
  }));
  await ensureMany("Lesson", tx.lesson, lessonRows, ["teacherId", "examinerId", "substituteId", "roomId", "title", "format", "startsAt", "endsAt", "state", "version"]);
  const scheduleVersionRows: SeedRow[] = lessons.map((lesson) => ({
    id: stableId(`lesson-schedule-version:${lesson.id}:1`),
    lessonId: lesson.id,
    version: 1,
    snapshot: {
      courseId: stableId(`course:${lesson.courseKey}`),
      groupId: groups.get(lesson.groupCode)?.id,
      teacherId: lesson.teacherId,
      examinerId: lesson.examinerId,
      roomId: stableId(`room:${lesson.roomCode}`),
      title: lesson.title,
      format: lesson.format,
      kind: lesson.kind,
      startsAt: lesson.startsAt.toISOString(),
      endsAt: lesson.endsAt.toISOString(),
      state: lesson.state,
    },
    changedAt: new Date("2026-09-01T09:00:00.000+03:00"),
  }));
  await ensureMany("LessonScheduleVersion", tx.lessonScheduleVersion, scheduleVersionRows);

  const attendanceRows: SeedRow[] = [];
  for (const lesson of lessons.filter((row) => row.kind === "CLASS" && row.state === "COMPLETED")) {
    const roster = studentsByGroup.get(lesson.groupCode) ?? [];
    for (const student of roster) {
      const rotation = (student.rosterIndex + lesson.weekIndex + lesson.courseIndex) % 12;
      const status = rotation === 0 ? "ABSENT" : rotation === 1 || rotation === 2 ? "LATE" : "PRESENT";
      const markedAt = new Date(lesson.endsAt.getTime() + 10 * 60 * 1000);
      attendanceRows.push({
        id: stableId(`attendance:${lesson.id}:${student.login}`),
        lessonId: lesson.id,
        groupId: groups.get(lesson.groupCode)?.id,
        studentId: student.id,
        status,
        markedById: lesson.teacherId,
        markedAt,
        updatedAt: markedAt,
        version: 1,
      });
    }
  }
  await ensureMany("AttendanceRecord", tx.attendanceRecord, attendanceRows, ["status", "markedAt", "updatedAt", "version"]);

  const assessmentRows: SeedRow[] = [];
  const homeworkRows: SeedRow[] = [];
  const testRows: SeedRow[] = [];
  const publicationVersionRows: SeedRow[] = [];
  const assessmentByOfferingKind = new Map<string, string>();
  const homeworkByOffering = new Map<string, string>();
  const testByOffering = new Map<string, string>();
  for (const offering of offerings) {
    const course = courseFixtures.find((item) => item.key === offering.courseKey);
    const courseId = stableId(`course:${offering.courseKey}`);
    const teacherId = staffByKey.get(offering.teacherKey)?.id;
    if (!course || !teacherId) throw new Error(`Assessment fixture is incomplete for ${offering.key}`);
    const homeworkComponent = course.components.find((component) => component.name.includes("Домашние") || component.name.includes("задания") || component.name.includes("Задания") || component.name.includes("концепции") || component.name.includes("кейсы")) ?? course.components[0];
    const testComponent = course.components.find((component) => component.name.includes("Тест")) ?? course.components[1];
    if (!homeworkComponent || !testComponent) throw new Error(`${course.name}: cannot map homework/test to approved course components`);
    for (const [kind, component, assessmentTitle] of [["homework", homeworkComponent, "Домашняя работа: анализ темы дисциплины"], ["test", testComponent, "Контрольный тест по пройденным темам"]] as const) {
      const assessmentId = stableId(`assessment:${offering.key}:${kind}`);
      assessmentByOfferingKind.set(`${offering.key}:${kind}`, assessmentId);
      assessmentRows.push({
        id: assessmentId,
        courseId,
        groupId: groups.get(offering.groupCode)?.id,
        componentId: stableId(`assessment-component:${course.key}:${component.name}`),
        structureVersionId: stableId(`assessment-structure:${course.key}:v1`),
        authorId: teacherId,
        title: `${course.name}: ${assessmentTitle}`,
        state: "PUBLISHED",
        publishedAt: new Date("2026-09-14T10:00:00.000+03:00"),
        createdAt: SEMESTER_START,
        version: 1,
      });
      if (kind === "homework") {
        const homeworkId = stableId(`homework:${offering.key}:published-v1`);
        homeworkByOffering.set(offering.key, homeworkId);
        const deadline = moscowDateTime("2026-11-24", "23:59");
        homeworkRows.push({ id: homeworkId, courseId, authorId: teacherId, assessmentId, title: `${course.name}: аналитическая работа`, instructions: "Подготовьте краткий анализ вымышленного учебного кейса. Демонстрационное задание.", deadline, state: "PUBLISHED", aiPolicy: { assistance: "permitted_with_citation", demo: true }, publishedAt: new Date("2026-09-14T10:00:00.000+03:00"), createdAt: SEMESTER_START, version: 1 });
        publicationVersionRows.push({ id: stableId(`publication-version:homework:${homeworkId}:1`), materialId: null, homeworkId, testId: null, number: 1, state: "PUBLISHED", content: { title: `${course.name}: аналитическая работа`, instructions: "Демонстрационное задание на анализ вымышленного кейса." }, createdAt: SEMESTER_START, publishedAt: new Date("2026-09-14T10:00:00.000+03:00") });
      } else {
        const testId = stableId(`test:${offering.key}:published-v1`);
        testByOffering.set(offering.key, testId);
        const opensAt = new Date("2026-09-14T10:00:00.000+03:00");
        const closesAt = moscowDateTime("2026-12-15", "22:00");
        testRows.push({ id: testId, courseId, authorId: teacherId, assessmentId, title: `${course.name}: тематический тест`, opensAt, closesAt, attemptLimit: 2, state: "PUBLISHED", aiPolicy: { assistance: "restricted_during_attempt", demo: true }, publishedAt: opensAt, version: 1 });
        publicationVersionRows.push({ id: stableId(`publication-version:test:${testId}:1`), materialId: null, homeworkId: null, testId, number: 1, state: "PUBLISHED", content: { title: `${course.name}: тематический тест`, questionCount: 2 }, createdAt: SEMESTER_START, publishedAt: opensAt });
      }
    }
  }

  const e2eOffering = offerings.find((offering) => offering.courseKey === "digital-marketing" && offering.groupCode === "ЦМ-26-1");
  if (!e2eOffering) throw new Error("E2E-01 offering not found");
  const dmCourse = courses.get("digital-marketing");
  const dmHomeworkComponent = dmCourse?.components.find((component) => component.name === "Домашние задания");
  const e2eAssessmentId = stableId("assessment:e2e-01:digital-marketing-cm26-1:homework");
  const e2eHomeworkId = stableId("homework:e2e-01:digital-marketing-cm26-1:draft");
  if (!dmCourse || !dmHomeworkComponent) throw new Error("E2E-01 draft configuration not found");
  assessmentRows.push({ id: e2eAssessmentId, courseId: dmCourse.id, groupId: groups.get("ЦМ-26-1")?.id, componentId: stableId(`assessment-component:digital-marketing:${dmHomeworkComponent.name}`), structureVersionId: stableId("assessment-structure:digital-marketing:v1"), authorId: staffByKey.get("maria")?.id, title: "E2E-01: Черновик домашнего задания Алисе", state: "DRAFT", publishedAt: null, createdAt: new Date("2026-11-01T10:00:00.000+03:00"), version: 1 });
  homeworkRows.push({ id: e2eHomeworkId, courseId: dmCourse.id, authorId: staffByKey.get("maria")?.id, assessmentId: e2eAssessmentId, title: "E2E-01: Черновик анализа Digital Marketing", instructions: "Черновик задания для публикации Марией во время E2E-01.", deadline: moscowDateTime("2026-11-20", "23:59"), state: "DRAFT", aiPolicy: { assistance: "permitted_with_citation", demo: true }, publishedAt: null, createdAt: new Date("2026-11-01T10:00:00.000+03:00"), version: 1 });

  const newAssessmentIds = await ensureMany("Assessment", tx.assessment, assessmentRows, ["state", "publishedAt", "version", "title"]);
  const newHomeworkIds = await ensureMany("Homework", tx.homework, homeworkRows, ["title", "instructions", "deadline", "state", "aiPolicy", "publishedAt", "version"]);
  const newTestIds = await ensureMany("Test", tx.test, testRows, ["title", "opensAt", "closesAt", "attemptLimit", "state", "aiPolicy", "publishedAt", "version"]);
  await ensureMany("PublicationVersion", tx.publicationVersion, publicationVersionRows);

  const materialRows: SeedRow[] = [];
  const materialVersionRows: SeedRow[] = [];
  for (const course of courseFixtures) {
    const teacherId = staffByKey.get(course.teacherKey)?.id;
    for (const [number, topic] of ["Основные понятия и терминология", "Разбор учебного кейса"].entries()) {
      const materialId = stableId(`material:${course.key}:${number + 1}`);
      const title = `${course.name}: ${topic}`;
      const publishedAt = new Date(number === 0 ? "2026-09-08T10:00:00.000+03:00" : "2026-10-06T10:00:00.000+03:00");
      materialRows.push({ id: materialId, courseId: stableId(`course:${course.key}`), authorId: teacherId, title, description: "Вымышленный учебный материал, не содержащий приватных файлов.", state: "PUBLISHED", publishedAt, version: 1 });
      materialVersionRows.push({ id: stableId(`publication-version:material:${materialId}:1`), materialId, homeworkId: null, testId: null, number: 1, state: "PUBLISHED", content: { title, body: `Демонстрационный конспект по дисциплине ${course.name}.` }, createdAt: SEMESTER_START, publishedAt });
    }
  }
  await ensureMany("Material", tx.material, materialRows, ["title", "description", "state", "publishedAt", "version"]);
  await ensureMany("PublicationVersion:materials", tx.publicationVersion, materialVersionRows);

  const submissionRows: SeedRow[] = [];
  const submissionRevisionRows: SeedRow[] = [];
  const testQuestionRows: SeedRow[] = [];
  const testAttemptRows: SeedRow[] = [];
  const testAnswerRows: SeedRow[] = [];
  const gradeEntryRows: SeedRow[] = [];
  const gradeRevisionRows: SeedRow[] = [];
  const gradeLinkByEntry = new Map<string, string>();
  const assessmentById = new Map(assessmentRows.map((row) => [String(row.id), row]));

  for (const offering of offerings) {
    const homeworkId = homeworkByOffering.get(offering.key);
    const testId = testByOffering.get(offering.key);
    const homeworkAssessmentId = assessmentByOfferingKind.get(`${offering.key}:homework`);
    const testAssessmentId = assessmentByOfferingKind.get(`${offering.key}:test`);
    if (!homeworkId || !testId || !homeworkAssessmentId || !testAssessmentId) throw new Error(`Homework/test IDs missing for ${offering.key}`);
    const course = courseFixtures.find((item) => item.key === offering.courseKey);
    if (!course) throw new Error(`Course fixture missing for ${offering.key}`);
    const roster = studentsByGroup.get(offering.groupCode) ?? [];
    for (const student of roster) {
      const statusRotation = student.rosterIndex % 5;
      const submissionState = student.rosterIndex === 0 || statusRotation === 0 ? "TO_SUBMIT" : statusRotation === 1 ? "UNDER_REVIEW" : statusRotation === 2 ? "REVISION_REQUIRED" : "CHECKED";
      const submittedAt = submissionState === "TO_SUBMIT" ? null : moscowDateTime("2026-10-19", "18:00");
      const reviewedAt = submissionState === "CHECKED" || submissionState === "REVISION_REQUIRED" ? moscowDateTime("2026-10-20", "16:00") : null;
      const submissionId = stableId(`submission:${homeworkId}:${student.login}`);
      submissionRows.push({ id: submissionId, homeworkId, studentId: student.id, state: submissionState, submittedAt, reviewedAt, feedback: submissionState === "REVISION_REQUIRED" ? "Демонстрационный комментарий: уточните аргументацию." : null, version: 1 });
      if (submittedAt) submissionRevisionRows.push({ id: stableId(`submission-revision:${submissionId}:1`), submissionId, objectKey: null, textContent: "Вымышленный текст учебной работы для демонстрации проверки.", createdAt: submittedAt });

      for (const [assessmentId, kind] of [[homeworkAssessmentId, "homework"], [testAssessmentId, "test"]] as const) {
        const entryId = stableId(`grade-entry:${assessmentId}:${student.login}`);
        gradeEntryRows.push({ id: entryId, assessmentId, studentId: student.id, currentRevisionId: null, createdAt: new Date("2026-09-14T10:00:00.000+03:00"), updatedAt: new Date("2026-09-14T10:00:00.000+03:00"), version: 1 });
        const hasPublishedResult = kind === "homework" ? submissionState === "CHECKED" || student.login === "sokolova.a_student" || student.login === "belova.s_student" : student.rosterIndex % 4 !== 0 || student.login === "sokolova.a_student" || student.login === "belova.s_student";
        if (!hasPublishedResult) continue;
        const score = scoreFor(student, offering.courseKey, kind, courseFixtures.findIndex((item) => item.key === offering.courseKey));
        const currentRevisionId = stableId(`grade-revision:${entryId}:published-v1`);
        let currentRevisionData: SeedRow;
        if (student.login === "sokolova.a_student" && offering.key === "digital-marketing:ЦМ-26-1" && kind === "homework") {
          const oldRevisionId = stableId(`grade-revision:${entryId}:superseded-v1`);
          gradeRevisionRows.push({ id: oldRevisionId, entryId, authorId: staffByKey.get("maria")?.id, retakeId: null, score: score - 8, state: "SUPERSEDED", reason: "Предыдущая опубликованная демонстрационная ревизия", createdAt: new Date("2026-10-21T10:00:00.000+03:00"), publishedAt: new Date("2026-10-21T10:00:00.000+03:00") });
          currentRevisionData = { id: currentRevisionId, entryId, authorId: staffByKey.get(offering.teacherKey)?.id, retakeId: null, score, state: "PUBLISHED", reason: "Исправление демонстрационного результата с сохранением истории", createdAt: new Date("2026-10-23T10:00:00.000+03:00"), publishedAt: new Date("2026-10-23T10:00:00.000+03:00") };
        } else {
          currentRevisionData = { id: currentRevisionId, entryId, authorId: staffByKey.get(offering.teacherKey)?.id, retakeId: null, score, state: "PUBLISHED", reason: null, createdAt: new Date("2026-10-21T10:00:00.000+03:00"), publishedAt: new Date("2026-10-21T10:00:00.000+03:00") };
        }
        gradeRevisionRows.push(currentRevisionData);
        gradeLinkByEntry.set(entryId, currentRevisionId);
      }
    }

    const questions = [
      { position: 1, prompt: `Какой вывод наиболее обоснован для учебного кейса по дисциплине ${course.name}?`, config: { options: ["Сопоставить гипотезу с данными", "Игнорировать выборку", "Подменить период анализа", "Считать предположение доказанным"] } },
      { position: 2, prompt: `Какой следующий шаг помогает проверить вывод по дисциплине ${course.name}?`, config: { options: ["Проверить источник и метод", "Скрыть ограничения", "Убрать описание периода", "Заменить данные догадкой"] } },
    ];
    for (const question of questions) {
      testQuestionRows.push({ id: stableId(`question:${testId}:${question.position}`), testId, prompt: question.prompt, kind: "SINGLE_CHOICE", position: question.position, config: question.config });
    }
    for (const student of roster) {
      if (student.rosterIndex >= 13) continue;
      const attemptId = stableId(`test-attempt:${testId}:${student.login}:1`);
      const attemptState = student.rosterIndex < 6 || student.login === "sokolova.a_student" || student.login === "belova.s_student" ? "PUBLISHED" : student.rosterIndex < 10 ? "SUBMITTED" : "IN_PROGRESS";
      const submittedAt = attemptState === "IN_PROGRESS" ? null : moscowDateTime("2026-10-27", "19:00");
      const reviewedAt = attemptState === "PUBLISHED" ? moscowDateTime("2026-10-28", "12:00") : null;
      const publishedAt = attemptState === "PUBLISHED" ? moscowDateTime("2026-10-28", "12:30") : null;
      testAttemptRows.push({ id: attemptId, testId, studentId: student.id, attemptNo: 1, state: attemptState, startedAt: moscowDateTime("2026-10-27", "18:30"), submittedAt, reviewedAt, publishedAt });
      for (const question of questions) {
        const questionId = stableId(`question:${testId}:${question.position}`);
        const correct = (student.rosterIndex + question.position + courseIndexGuard(offering.courseIndex)) % 3 !== 0;
        const resultScore = attemptState === "PUBLISHED" ? (correct ? Math.min(100, scoreFor(student, offering.courseKey, "test", offering.courseIndex) + question.position) : 45) : null;
        testAnswerRows.push({ id: stableId(`test-answer:${attemptId}:${questionId}`), attemptId, questionId, testId, response: { selectedOption: correct ? 0 : 2 }, score: resultScore, reviewedAt });
      }
    }
  }

  function courseIndexGuard(value: number): number { return value; }
  void assessmentById;
  void newAssessmentIds;
  void newHomeworkIds;
  void newTestIds;

  await ensureMany("Submission", tx.submission, submissionRows, ["state", "submittedAt", "reviewedAt", "feedback", "version"]);
  await ensureMany("SubmissionRevision", tx.submissionRevision, submissionRevisionRows);
  await ensureMany("Question", tx.question, testQuestionRows);
  await ensureMany("TestAttempt", tx.testAttempt, testAttemptRows, ["state", "submittedAt", "reviewedAt", "publishedAt"]);
  await ensureMany("TestAnswer", tx.testAnswer, testAnswerRows, ["response", "score", "reviewedAt"]);

  const newGradeEntries = await ensureMany("GradebookEntry", tx.gradebookEntry, gradeEntryRows, ["currentRevisionId", "updatedAt", "version"]);
  const entriesToGrade = new Set([...newGradeEntries]);
  const revisionsForNewEntries = gradeRevisionRows.filter((revision) => entriesToGrade.has(String(revision.entryId)));
  await ensureMany("GradeRevision", tx.gradeRevision, revisionsForNewEntries, ["score", "state", "reason", "publishedAt"]);
  const correctionAuditId = stableId("audit:seed-grade-correction:alice-dm");
  const correctionEntry = gradeEntryRows.find((entry) => String(entry.studentId) === namedStudents[0]?.id && String(entry.assessmentId) === assessmentByOfferingKind.get("digital-marketing:ЦМ-26-1:homework"));
  const correctionRevision = correctionEntry ? gradeLinkByEntry.get(String(correctionEntry.id)) : undefined;
  if (correctionEntry && correctionRevision) {
    await ensureMany("AuditEvent:grade-correction", tx.auditEvent, [{ id: correctionAuditId, actorId: staffByKey.get("maria")?.id, action: "GRADE_REVISION_CORRECTED", targetType: "GradebookEntry", targetId: correctionEntry.id, outcome: "SUCCEEDED", reason: "Исправление демонстрационной оценки с сохранением предыдущей ревизии", metadata: { revisionId: correctionRevision, demo: true }, createdAt: new Date("2026-10-23T10:00:00.000+03:00") }]);
  }
  for (const [entryId, revisionId] of gradeLinkByEntry) {
    if (!newGradeEntries.has(entryId)) continue;
    await tx.gradebookEntry.update({ where: { id: entryId }, data: { currentRevisionId: revisionId, updatedAt: new Date("2026-10-21T10:00:00.000+03:00") } });
  }

  const requests = [
    { key: "alice-e2e-not-created", category: "STUDY_CERTIFICATE", ownerIndex: 1, state: "IN_REVIEW", assignedToKey: "ekaterina", sla: 3, submittedAt: moscowDateTime("2026-11-05", "10:00"), title: "Справка об обучении", body: "Демонстрационный запрос справки об обучении." },
    { key: "study-period-other", category: "STUDY_PERIOD_CERTIFICATE", ownerIndex: 2, state: "SUBMITTED", assignedToKey: null, sla: 3, submittedAt: moscowDateTime("2026-11-06", "11:00"), title: "Справка о периоде обучения", body: "Демонстрационный запрос справки о периоде обучения." },
    { key: "transcript-other", category: "GRADE_TRANSCRIPT", ownerIndex: 3, state: "SUBMITTED", assignedToKey: null, sla: 3, submittedAt: moscowDateTime("2026-11-05", "12:00"), title: "Выписка с оценками", body: "Демонстрационный запрос выписки с опубликованными оценками." },
    { key: "academic-question-sofia", category: "ACADEMIC_QUESTION", ownerIndex: 1, state: "IN_REVIEW", assignedToKey: "olga", sla: 5, submittedAt: moscowDateTime("2026-11-06", "13:00"), title: "Вопрос по учебному плану", body: "Вымышленный демонстрационный вопрос по учебному плану." },
    { key: "personal-data-other", category: "PERSONAL_DATA_CORRECTION", ownerIndex: 4, state: "SUBMITTED", assignedToKey: null, sla: 5, submittedAt: moscowDateTime("2026-11-05", "14:00"), title: "Запрос на исправление персональных данных", body: "Вымышленный запрос для демонстрации проверки; канонические данные профиля не изменяются." },
  ];
  const requestRows: SeedRow[] = requests.map((request) => {
    const owner = students[request.ownerIndex];
    const assigneeId = request.assignedToKey ? staffByKey.get(request.assignedToKey)?.id ?? null : null;
    if (!owner) throw new Error(`Request owner slot ${request.ownerIndex} is missing`);
    return { id: stableId(`service-request:${request.key}`), studentId: owner.id, assignedToId: assigneeId, kind: null, category: request.category, state: request.state, title: request.title, body: request.body, priority: 0, submittedAt: request.submittedAt, slaWorkingDays: request.sla, deadlineAt: addWorkingDaysDeadline(request.submittedAt, request.sla), completedAt: null, rejectionReason: null, version: 1 };
  });
  await ensureMany("ServiceRequest", tx.serviceRequest, requestRows, ["assignedToId", "state", "priority", "submittedAt", "deadlineAt", "completedAt", "rejectionReason", "version", "title", "body"]);
  await ensureMany("ServiceRequestCalendar", tx.serviceRequestCalendar, requestRows.map((request) => ({ id: stableId(`request-calendar:${request.id}:2026`), requestId: request.id, calendarId: calendarYearId })));
  const requestForHistory = requestRows.map((request, index) => ({
    id: String(request.id), studentId: String(request.studentId), state: String(request.state), submittedAt: requests[index]?.submittedAt ?? FIXTURE_NOW,
    assignedToId: typeof request.assignedToId === "string" ? request.assignedToId : null,
  }));
  await ensureMany("RequestStatusHistory", tx.requestStatusHistory, statusHistoryRows(requestForHistory));

  const replacementPassRows: SeedRow[] = [
    { id: stableId("pass-request:replacement:alice"), studentId: namedStudents[0]?.id, kind: "REPLACEMENT", state: "IN_REVIEW", submittedAt: moscowDateTime("2026-11-06", "09:00"), issuedAt: null, version: 1 },
    { id: stableId("pass-request:replacement:sofia"), studentId: namedStudents[1]?.id, kind: "REPLACEMENT", state: "SUBMITTED", submittedAt: moscowDateTime("2026-11-06", "09:30"), issuedAt: null, version: 1 },
  ];
  await ensureMany("PassRequest:replacement-only", tx.passRequest, replacementPassRows, ["state", "submittedAt", "issuedAt", "version"]);

  const announcementRows: SeedRow[] = officialAnnouncementFixtures.map((announcement) => ({ id: stableId(`official-announcement:${announcement.key}`), authorId: staffByKey.get("ekaterina")?.id, state: announcement.state, createdAt: announcement.createdAt, withdrawnAt: null, version: 1 }));
  await ensureMany("OfficialAnnouncement", tx.officialAnnouncement, announcementRows, ["state", "withdrawnAt", "version"]);
  const announcementVersionRows: SeedRow[] = officialAnnouncementFixtures.map((announcement) => ({ id: stableId(`announcement-version:${announcement.key}:1`), announcementId: stableId(`official-announcement:${announcement.key}`), number: 1, title: announcement.title, body: announcement.body, requiresAcknowledgement: announcement.requiresAcknowledgement, publishedAt: announcement.publishedAt }));
  await ensureMany("AnnouncementVersion", tx.announcementVersion, announcementVersionRows, ["title", "body", "publishedAt"]);
  const roleAudienceRows: SeedRow[] = [];
  const groupAudienceRows: SeedRow[] = [];
  for (const announcement of officialAnnouncementFixtures) {
    const announcementId = stableId(`official-announcement:${announcement.key}`);
    for (const role of announcement.roles) roleAudienceRows.push({ id: stableId(`announcement-role-audience:${announcement.key}:${role}`), announcementId, role });
    for (const groupCode of announcement.groups) groupAudienceRows.push({ id: stableId(`announcement-group-audience:${announcement.key}:${groupCode}`), announcementId, groupId: groups.get(groupCode)?.id });
  }
  await ensureMany("RoleAnnouncementAudience", tx.roleAnnouncementAudience, roleAudienceRows);
  await ensureMany("GroupAnnouncementAudience", tx.groupAnnouncementAudience, groupAudienceRows);

  const courseAnnouncementRows: SeedRow[] = [];
  for (const offering of offerings) {
    const course = courseFixtures.find((item) => item.key === offering.courseKey);
    if (!course) continue;
    courseAnnouncementRows.push({ id: stableId(`course-announcement:${offering.key}`), courseId: stableId(`course:${course.key}`), authorId: staffByKey.get(offering.teacherKey)?.id, title: `План недели: ${course.name}`, body: "Вымышленное учебное объявление для демонстрации кабинета преподавателя и чата группы.", publishedAt: new Date("2026-10-12T10:00:00.000+03:00") });
  }
  await ensureMany("CourseAnnouncement", tx.courseAnnouncement, courseAnnouncementRows);

  const chatRows: SeedRow[] = offerings.map((offering) => ({ id: stableId(`chat:${offering.key}`), courseId: stableId(`course:${offering.courseKey}`), name: `${offering.courseKey} — ${offering.groupCode}`, createdAt: SEMESTER_START }));
  await ensureMany("Chat", tx.chat, chatRows);
  const chatMemberRows: SeedRow[] = [];
  const messageRows: SeedRow[] = [];
  for (const offering of offerings) {
    const chatId = stableId(`chat:${offering.key}`);
    const teacherId = staffByKey.get(offering.teacherKey)?.id;
    const course = courseFixtures.find((item) => item.key === offering.courseKey);
    const roster = studentsByGroup.get(offering.groupCode) ?? [];
    if (!teacherId || !course) throw new Error(`Chat participants missing for ${offering.key}`);
    for (const student of roster) chatMemberRows.push({ id: stableId(`chat-member:${chatId}:${student.id}`), chatId, userId: student.id, joinedAt: SEMESTER_START, leftAt: null });
    chatMemberRows.push({ id: stableId(`chat-member:${chatId}:${teacherId}`), chatId, userId: teacherId, joinedAt: SEMESTER_START, leftAt: null });
    messageRows.push({ id: stableId(`message:${chatId}:welcome`), chatId, senderId: teacherId, body: `Добро пожаловать в учебный чат ${course.name}. Данные демонстрационные.`, createdAt: new Date("2026-09-15T10:00:00.000+03:00") });
    const sampleStudent = roster[0];
    if (sampleStudent) messageRows.push({ id: stableId(`message:${chatId}:question`), chatId, senderId: sampleStudent.id, body: "Подскажите, пожалуйста, где посмотреть материалы к следующему занятию?", createdAt: new Date("2026-09-16T14:00:00.000+03:00") });
  }
  await ensureMany("ChatMember", tx.chatMember, chatMemberRows, ["joinedAt", "leftAt"]);
  await ensureMany("Message", tx.message, messageRows, ["body"]);

  const personalTaskFixtures = [
    ...["Повторить темы Digital Marketing", "Подготовить вопросы к семинару", "Проверить дедлайн аналитической работы", "Собрать материалы для проекта"].map((title, index) => ({ owner: namedStudents[0], title, dueDate: ["2026-11-10", "2026-11-13", "2026-11-18", "2026-11-25"][index] ?? "2026-11-25" })),
    ...["Повторить Marketing Analytics", "Подготовить заметки к Brand Management", "Сверить сроки тестов"].map((title, index) => ({ owner: namedStudents[1], title, dueDate: ["2026-11-12", "2026-11-19", "2026-11-26"][index] ?? "2026-11-26" })),
  ];
  const personalTaskRows: SeedRow[] = personalTaskFixtures.map((task, index) => ({ id: stableId(`personal-task:${task.owner?.login}:${index}`), ownerId: task.owner?.id, title: task.title, details: "Личная демонстрационная задача; не является официальным учебным дедлайном.", dueAt: moscowDateTime(task.dueDate, "20:00"), state: "OPEN", createdAt: new Date("2026-11-01T09:00:00.000+03:00"), updatedAt: new Date("2026-11-01T09:00:00.000+03:00"), version: 1 }));
  await ensureMany("PersonalTask", tx.personalTask, personalTaskRows, ["title", "details", "dueAt", "state", "updatedAt", "version"]);

  const taskAssignments = [
    { assigner: "ekaterina", assignee: "olga", title: "Сверить демонстрационный список групп", due: "2026-11-10", state: "TO_DO" },
    { assigner: "ekaterina", assignee: "olga", title: "Подготовить сводку по учебным обращениям", due: "2026-11-12", state: "IN_PROGRESS" },
    { assigner: "olga", assignee: "ekaterina", title: "Проверить черновик объявления", due: "2026-11-13", state: "TO_DO" },
    { assigner: "ekaterina", assignee: "maria", title: "Подтвердить демонстрационный график дисциплины", due: "2026-11-16", state: "TO_DO" },
    { assigner: "olga", assignee: "anna", title: "Подготовить учебный аналитический кейс", due: "2026-11-18", state: "IN_PROGRESS" },
    { assigner: "ekaterina", assignee: "olga", title: "Сверить список материалов к декабрю", due: "2026-11-20", state: "TO_DO" },
  ];
  const assignedTaskRows: SeedRow[] = taskAssignments.map((task, index) => ({ id: stableId(`assigned-task:${index}:${task.title}`), assignerId: staffByKey.get(task.assigner)?.id, assigneeId: staffByKey.get(task.assignee)?.id, title: task.title, details: "Вымышленная внутренняя задача демонстрационного кабинета.", dueAt: moscowDateTime(task.due, "18:00"), state: task.state, cancelledReason: null, completedAt: null, createdAt: new Date("2026-11-02T09:00:00.000+03:00"), updatedAt: new Date("2026-11-02T09:00:00.000+03:00"), version: 1 }));
  await ensureMany("AssignedTask", tx.assignedTask, assignedTaskRows, ["assigneeId", "title", "details", "dueAt", "state", "cancelledReason", "completedAt", "updatedAt", "version"]);
  const taskHistoryRows: SeedRow[] = [];
  for (const [index, task] of taskAssignments.entries()) {
    const taskId = stableId(`assigned-task:${index}:${task.title}`);
    const assignerId = staffByKey.get(task.assigner)?.id;
    const assigneeId = staffByKey.get(task.assignee)?.id;
    if (!assignerId || !assigneeId) continue;
    taskHistoryRows.push({ id: stableId(`task-history:${taskId}:created`), taskId, actorId: assignerId, fromState: null, toState: "TO_DO", previousAssigneeId: null, nextAssigneeId: assigneeId, reason: "Демонстрационная задача назначена", createdAt: new Date("2026-11-02T09:00:00.000+03:00") });
    if (task.state === "IN_PROGRESS") taskHistoryRows.push({ id: stableId(`task-history:${taskId}:started`), taskId, actorId: assigneeId, fromState: "TO_DO", toState: "IN_PROGRESS", previousAssigneeId: assigneeId, nextAssigneeId: assigneeId, reason: null, createdAt: new Date("2026-11-03T09:00:00.000+03:00") });
  }
  await ensureMany("TaskHistory", tx.taskHistory, taskHistoryRows);

  const careerCategoryNames = ["Стажировки", "Проектная работа", "Карьерные мероприятия"];
  const careerCategoryRows: SeedRow[] = careerCategoryNames.map((name) => ({ id: stableId(`career-category:${name}`), name }));
  await ensureMany("CareerCategory", tx.careerCategory, careerCategoryRows);
  const careerOpportunityRows: SeedRow[] = [
    ["Стажировка по digital-коммуникациям", "Учебная организация Север", "Стажировка в вымышленной команде цифровых коммуникаций.", "Стажировки", "2026-11-20"],
    ["Младший аналитик учебного кейса", "Демо-лаборатория данных", "Практика анализа обезличенного вымышленного набора данных.", "Стажировки", "2026-11-25"],
    ["Проект по контент-стратегии", "Студенческая мастерская", "Короткий проект для портфолио на синтетическом брифе.", "Проектная работа", "2026-11-27"],
    ["Исследование пользовательского опыта", "Лаборатория кампусных сервисов", "Демонстрационный проект по исследованию вымышленного сервиса.", "Проектная работа", "2026-12-04"],
    ["Встреча о карьерном маршруте", "Карьерный клуб кампуса", "Вымышленное карьерное мероприятие без официального партнёрства.", "Карьерные мероприятия", "2026-11-18"],
    ["Разбор портфолио", "Студенческая мастерская", "Демонстрационная консультация по учебному портфолио.", "Карьерные мероприятия", "2026-12-02"],
  ].map(([title, organization, description, category, closesAt], index) => ({ id: stableId(`career-opportunity:${index}:${title}`), categoryId: stableId(`career-category:${category}`), title, organization, description, location: "Москва (демо)", closesAt: moscowDateTime(closesAt ?? "2026-12-02", "23:59"), isDemo: true, state: "PUBLISHED", createdAt: new Date("2026-10-01T09:00:00.000+03:00") }));
  await ensureMany("CareerOpportunity", tx.careerOpportunity, careerOpportunityRows);

  const academicEvents: SeedRow[] = [];
  for (const lesson of lessons) {
    const participantIds = new Set((studentsByGroup.get(lesson.groupCode) ?? []).map((student) => student.id));
    if (lesson.teacherId) participantIds.add(lesson.teacherId);
    if (lesson.examinerId) participantIds.add(lesson.examinerId);
    for (const userId of participantIds) {
      academicEvents.push({ id: stableId(`calendar:lesson:${userId}:${lesson.id}`), userId, kind: lesson.kind === "EXAM" ? "EXAM" : "LESSON", sourceType: "LESSON", sourceId: lesson.id, startsAt: lesson.startsAt, endsAt: lesson.endsAt, lessonId: lesson.id, homeworkId: null, testId: null, personalTaskId: null, assignedTaskId: null });
    }
  }
  for (const offering of offerings) {
    const roster = studentsByGroup.get(offering.groupCode) ?? [];
    const homeworkId = homeworkByOffering.get(offering.key);
    const testId = testByOffering.get(offering.key);
    const homeworkDeadline = moscowDateTime("2026-11-24", "23:59");
    const testDeadline = moscowDateTime("2026-12-15", "22:00");
    for (const student of roster) {
      if (homeworkId) academicEvents.push({ id: stableId(`calendar:homework:${student.id}:${homeworkId}`), userId: student.id, kind: "HOMEWORK_DEADLINE", sourceType: "HOMEWORK", sourceId: homeworkId, startsAt: homeworkDeadline, endsAt: null, lessonId: null, homeworkId, testId: null, personalTaskId: null, assignedTaskId: null });
      if (testId) academicEvents.push({ id: stableId(`calendar:test:${student.id}:${testId}`), userId: student.id, kind: "TEST_DEADLINE", sourceType: "TEST", sourceId: testId, startsAt: testDeadline, endsAt: null, lessonId: null, homeworkId: null, testId, personalTaskId: null, assignedTaskId: null });
    }
  }
  for (const task of personalTaskRows) academicEvents.push({ id: stableId(`calendar:personal:${task.id}`), userId: task.ownerId, kind: "PERSONAL_TASK", sourceType: "PERSONAL_TASK", sourceId: task.id, startsAt: task.dueAt, endsAt: null, lessonId: null, homeworkId: null, testId: null, personalTaskId: task.id, assignedTaskId: null });
  for (const task of assignedTaskRows) {
    for (const userId of [task.assignerId, task.assigneeId]) academicEvents.push({ id: stableId(`calendar:assigned:${userId}:${task.id}`), userId, kind: "ASSIGNED_TASK", sourceType: "ASSIGNED_TASK", sourceId: task.id, startsAt: task.dueAt, endsAt: null, lessonId: null, homeworkId: null, testId: null, personalTaskId: null, assignedTaskId: task.id });
  }
  await ensureMany("AcademicCalendarEvent", tx.academicCalendarEvent, academicEvents, ["startsAt", "endsAt", "kind"]);

  const reminderRows: SeedRow[] = [];
  const now = FIXTURE_NOW.getTime();
  for (const homework of homeworkRows.filter((row) => row.id !== e2eHomeworkId)) {
    const deadline = homework.deadline;
    if (!(deadline instanceof Date) || deadline.getTime() - 24 * 60 * 60 * 1000 <= now) continue;
    reminderRows.push({ id: stableId(`reminder:homework:${homework.id}:24h`), kind: "HOMEWORK_DEADLINE", sourceType: "HOMEWORK", sourceId: homework.id, dueAt: deadline, scheduledAt: new Date(deadline.getTime() - 24 * 60 * 60 * 1000), sentAt: null, homeworkId: homework.id, testId: null, personalTaskId: null, assignedTaskId: null });
  }
  for (const test of testRows) {
    const deadline = test.closesAt;
    if (!(deadline instanceof Date) || deadline.getTime() - 24 * 60 * 60 * 1000 <= now) continue;
    reminderRows.push({ id: stableId(`reminder:test:${test.id}:24h`), kind: "TEST_DEADLINE", sourceType: "TEST", sourceId: test.id, dueAt: deadline, scheduledAt: new Date(deadline.getTime() - 24 * 60 * 60 * 1000), sentAt: null, homeworkId: null, testId: test.id, personalTaskId: null, assignedTaskId: null });
  }
  for (const task of personalTaskRows) {
    const dueAt = task.dueAt;
    if (!(dueAt instanceof Date) || dueAt.getTime() - 24 * 60 * 60 * 1000 <= now) continue;
    reminderRows.push({ id: stableId(`reminder:personal:${task.id}:24h`), kind: "PERSONAL_TASK", sourceType: "PERSONAL_TASK", sourceId: task.id, dueAt, scheduledAt: new Date(dueAt.getTime() - 24 * 60 * 60 * 1000), sentAt: null, homeworkId: null, testId: null, personalTaskId: task.id, assignedTaskId: null });
  }
  for (const task of assignedTaskRows) {
    const dueAt = task.dueAt;
    if (!(dueAt instanceof Date) || dueAt.getTime() - 24 * 60 * 60 * 1000 <= now) continue;
    reminderRows.push({ id: stableId(`reminder:assigned:${task.id}:24h`), kind: "ASSIGNED_TASK", sourceType: "ASSIGNED_TASK", sourceId: task.id, dueAt, scheduledAt: new Date(dueAt.getTime() - 24 * 60 * 60 * 1000), sentAt: null, homeworkId: null, testId: null, personalTaskId: null, assignedTaskId: task.id });
  }
  await ensureMany("Reminder", tx.reminder, reminderRows, ["dueAt", "scheduledAt", "sentAt"]);

  const notificationRows: SeedRow[] = [];
  const deliveryRows: SeedRow[] = [];
  const addNotification = (key: string, category: string, sourceType: string, sourceId: string, title: string, body: string, createdAt: Date, recipients: Array<{ userId: string; readAt?: Date | null }>): void => {
    const notificationId = stableId(`notification:${key}`);
    notificationRows.push({ id: notificationId, category, critical: false, sourceType, sourceId, eventKey: `demo:${key}`, title, body, createdAt });
    for (const recipient of recipients) deliveryRows.push({ id: stableId(`notification-delivery:${key}:${recipient.userId}:IN_APP`), notificationId, recipientId: recipient.userId, channel: "IN_APP", createdAt, deliveredAt: createdAt, readAt: recipient.readAt ?? null, mutedAt: null });
  };

  for (const announcement of officialAnnouncementFixtures.filter((item) => item.state === "PUBLISHED")) {
    const announcementId = stableId(`official-announcement:${announcement.key}`);
    const versionId = stableId(`announcement-version:${announcement.key}:1`);
    const recipients = new Map<string, Date | null>();
    for (const groupCode of announcement.groups) for (const student of studentsByGroup.get(groupCode) ?? []) recipients.set(student.id, null);
    for (const role of announcement.roles) {
      if (role === "TEACHER") for (const person of staff.filter((member) => member.role === "TEACHER")) recipients.set(person.id, null);
      if (role === "STUDENT") for (const student of students) recipients.set(student.id, null);
      if (role === "DEAN") for (const person of staff.filter((member) => member.role === "DEAN")) recipients.set(person.id, null);
    }
    if (announcement.key === "term-start-info") {
      recipients.set(namedStudents[0]?.id ?? "", new Date("2026-09-04T10:00:00.000+03:00"));
      recipients.set(namedStudents[1]?.id ?? "", null);
    }
    addNotification(`announcement:${announcement.key}`, "OFFICIAL_ANNOUNCEMENT", "ANNOUNCEMENT_VERSION", versionId, announcement.title, "Опубликовано демонстрационное официальное объявление.", announcement.publishedAt ?? FIXTURE_NOW, [...recipients.entries()].filter(([userId]) => userId.length > 0).map(([userId, readAt]) => ({ userId, readAt })));
    void announcementId;
  }

  for (const offering of offerings) {
    const homeworkId = homeworkByOffering.get(offering.key);
    const testId = testByOffering.get(offering.key);
    const roster = studentsByGroup.get(offering.groupCode) ?? [];
    if (homeworkId) addNotification(`homework:${offering.key}`, "HOMEWORK", "HOMEWORK", homeworkId, "Новое домашнее задание", `Опубликовано демонстрационное задание по ${courseFixtures.find((item) => item.key === offering.courseKey)?.name ?? "дисциплине"}.`, new Date("2026-09-14T10:00:00.000+03:00"), roster.map((student) => ({ userId: student.id, readAt: student.login === "sokolova.a_student" ? new Date("2026-09-15T09:00:00.000+03:00") : null })));
    if (testId) addNotification(`test:${offering.key}`, "TEST", "TEST", testId, "Доступен тематический тест", `Демонстрационный тест по ${courseFixtures.find((item) => item.key === offering.courseKey)?.name ?? "дисциплине"}.`, new Date("2026-09-14T10:05:00.000+03:00"), roster.filter((student) => student.login === "sokolova.a_student" || student.login === "belova.s_student").map((student) => ({ userId: student.id, readAt: null })));
  }
  const requestRowsForNotice = requestRows.filter((row) => row.state === "IN_REVIEW");
  for (const request of requestRowsForNotice) {
    addNotification(`request:${request.id}`, "REQUEST", "SERVICE_REQUEST", String(request.id), "Заявка принята в работу", "Демонстрационный статус заявки обновлён.", new Date("2026-11-06T10:00:00.000+03:00"), [{ userId: String(request.studentId), readAt: null }, { userId: String(request.assignedToId), readAt: null }]);
  }
  for (const task of personalTaskRows.slice(0, 4)) addNotification(`personal-task:${task.id}`, "TASK", "PERSONAL_TASK", String(task.id), "Личная задача добавлена", String(task.title), new Date("2026-11-02T10:00:00.000+03:00"), [{ userId: String(task.ownerId), readAt: null }]);
  await ensureMany("Notification", tx.notification, notificationRows);
  await ensureMany("NotificationDelivery", tx.notificationDelivery, deliveryRows, ["createdAt", "deliveredAt", "readAt", "mutedAt"]);

  const preferenceRows: SeedRow[] = [
    { id: stableId("notification-preference:alice:CHAT"), userId: namedStudents[0]?.id, category: "CHAT", muted: false, updatedAt: new Date("2026-09-01T09:00:00.000+03:00") },
    { id: stableId("notification-preference:sofia:COURSE_ANNOUNCEMENT"), userId: namedStudents[1]?.id, category: "COURSE_ANNOUNCEMENT", muted: false, updatedAt: new Date("2026-09-01T09:00:00.000+03:00") },
  ];
  await ensureMany("NotificationPreference", tx.notificationPreference, preferenceRows, ["muted", "updatedAt"]);

  const countQueries = {
    users: tx.user.count(), profiles: tx.userProfile.count(), userRoles: tx.userRole.count(), groups: tx.group.count(), memberships: tx.groupMembership.count(), subjects: tx.subject.count(), courses: tx.course.count(), courseGroups: tx.courseGroup.count(), teacherAssignments: tx.teacherAssignment.count(), rooms: tx.room.count(), productionCalendarYears: tx.productionCalendarYear.count(), productionCalendarDays: tx.productionCalendarDay.count(), assessmentComponents: tx.assessmentComponent.count(), assessmentStructureVersions: tx.assessmentStructureVersion.count(), assessmentAllocations: tx.assessmentWeight.count(), assessments: tx.assessment.count(), lessonsAndExams: tx.lesson.count(), lessonScheduleVersions: tx.lessonScheduleVersion.count(), staffReservations: tx.scheduleStaffReservation.count(), attendanceRecords: tx.attendanceRecord.count(), homeworks: tx.homework.count(), submissions: tx.submission.count(), submissionRevisions: tx.submissionRevision.count(), tests: tx.test.count(), questions: tx.question.count(), testAttempts: tx.testAttempt.count(), testAnswers: tx.testAnswer.count(), gradebookEntries: tx.gradebookEntry.count(), gradeRevisions: tx.gradeRevision.count(), materials: tx.material.count(), publicationVersions: tx.publicationVersion.count(), serviceRequests: tx.serviceRequest.count(), passRequests: tx.passRequest.count(), temporaryDemoPasses: tx.temporaryDemoPass.count(), officialAnnouncements: tx.officialAnnouncement.count(), announcementVersions: tx.announcementVersion.count(), acknowledgements: tx.acknowledgement.count(), courseAnnouncements: tx.courseAnnouncement.count(), chats: tx.chat.count(), chatMembers: tx.chatMember.count(), messages: tx.message.count(), notifications: tx.notification.count(), notificationDeliveries: tx.notificationDelivery.count(), personalTasks: tx.personalTask.count(), assignedTasks: tx.assignedTask.count(), taskHistory: tx.taskHistory.count(), calendarEvents: tx.academicCalendarEvent.count(), reminders: tx.reminder.count(), careerCategories: tx.careerCategory.count(), careerOpportunities: tx.careerOpportunity.count(), aiConversations: tx.aIConversation.count(), aiMessages: tx.aIMessage.count(), aiActionConfirmations: tx.aIActionConfirmation.count(), accountActivations: tx.accountActivation.count(), sessions: tx.session.count(), documents: tx.documentArtifact.count(),
  };
  const counts = Object.fromEntries(await Promise.all(Object.entries(countQueries).map(async ([key, query]) => [key, await query] as const)));
  const seededUserIds = people.map((person) => person.id);
  const seededStudentIds = students.map((student) => student.id);
  const seededCourseIds = courseFixtures.map((course) => stableId(`course:${course.key}`));
  const seededAssignmentIds = offerings.map((offering) => stableId(`teacher-assignment:${offering.key}`));
  const seedOwnedCounts = {
    users: await tx.user.count({ where: { id: { in: seededUserIds } } }),
    groups: await tx.group.count({ where: { id: { in: groupOrder.map((code) => groups.get(code)?.id ?? "") } } }),
    memberships: await tx.groupMembership.count({ where: { studentId: { in: seededStudentIds } } }),
    courses: await tx.course.count({ where: { id: { in: seededCourseIds } } }),
    teacherAssignments: await tx.teacherAssignment.count({ where: { id: { in: seededAssignmentIds } } }),
  };
  if (seedOwnedCounts.users !== 76 || seedOwnedCounts.groups !== 3 || seedOwnedCounts.memberships !== 66 || seedOwnedCounts.courses !== 9 || seedOwnedCounts.teacherAssignments !== 11) {
    throw new Error(`Seed count invariant failed: ${JSON.stringify(counts)}`);
  }
  const groupCounts = await tx.groupMembership.groupBy({ by: ["groupId"], _count: { _all: true } });
  if (groupCounts.length !== 3 || groupCounts.some((row) => row._count._all !== 22)) throw new Error("Seed invariant failed: each of the three groups must contain exactly 22 students");
  const invalidComponents = await tx.$queryRaw<Array<{ courseId: string; total: Prisma.Decimal; componentCount: bigint }>>`
    SELECT "courseId", SUM("weight") AS total, COUNT(*) AS "componentCount"
    FROM "AssessmentWeight"
    WHERE "structureVersionId" IN (SELECT id FROM "AssessmentStructureVersion" WHERE "publishedAt" IS NOT NULL)
    GROUP BY "courseId"
    HAVING SUM("weight") <> 100 OR COUNT(*) < 3 OR COUNT(*) > 5
  `;
  if (invalidComponents.length > 0) throw new Error("Seed invariant failed: a published assessment structure does not have 3–5 components totaling 100");
  const intervalConflicts = await tx.$queryRaw<Array<{ kind: string; resourceId: string }>>`
    SELECT 'staff' AS kind, a."staffId"::text AS "resourceId"
      FROM "ScheduleStaffReservation" a
      JOIN "ScheduleStaffReservation" b ON a."staffId" = b."staffId" AND a."lessonId" < b."lessonId"
     WHERE a."isActive" AND b."isActive" AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
    UNION ALL
    SELECT 'group', a."groupId"::text
      FROM "Lesson" a JOIN "Lesson" b ON a."groupId" = b."groupId" AND a.id < b.id
     WHERE a.state = 'SCHEDULED' AND b.state = 'SCHEDULED' AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
    UNION ALL
    SELECT 'room', a."roomId"::text
      FROM "Lesson" a JOIN "Lesson" b ON a."roomId" = b."roomId" AND a.id < b.id
     WHERE a."roomId" IS NOT NULL AND a.state = 'SCHEDULED' AND b.state = 'SCHEDULED' AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
  `;
  if (intervalConflicts.length > 0) throw new Error("Seed invariant failed: approved schedule resources overlap");
  const mismatchedRequests = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT request.id
      FROM "ServiceRequest" request
     WHERE (request.category IN ('STUDY_CERTIFICATE', 'STUDY_PERIOD_CERTIFICATE', 'GRADE_TRANSCRIPT') AND request."slaWorkingDays" <> 3)
        OR (request.category IN ('ACADEMIC_QUESTION', 'PERSONAL_DATA_CORRECTION') AND request."slaWorkingDays" <> 5)
        OR request."deadlineAt" IS NULL
  `;
  if (mismatchedRequests.length > 0) throw new Error("Seed invariant failed: request category/SLA/deadline mismatch");
  const wrongRosterAssessments = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT assessment.id
      FROM "Assessment" assessment
      LEFT JOIN "GroupMembership" membership ON membership."groupId" = assessment."groupId"
     GROUP BY assessment.id
    HAVING COUNT(membership.id) <> 22
  `;
  if (wrongRosterAssessments.length > 0) throw new Error("Seed invariant failed: an assessment is not linked to a 22-student group");
  const wrongAnnouncements = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT version.id FROM "AnnouncementVersion" version
    JOIN "OfficialAnnouncement" announcement ON announcement.id = version."announcementId"
    WHERE announcement.id = ${stableId("official-announcement:e2e-04-draft")}
      AND announcement.state = 'DRAFT' AND EXISTS (
      SELECT 1 FROM "Notification" notification WHERE notification."sourceType" = 'ANNOUNCEMENT_VERSION' AND notification."sourceId" = version.id
    )
  `;
  if (wrongAnnouncements.length > 0) throw new Error("Seed invariant failed: E2E draft announcement already has notifications");

  return counts as Record<string, number>;
}

async function main(): Promise<void> {
  const { connectionString, databaseName } = requireLocalDemoDatabase();
  const passwords = new Map<string, string>([
    ["sokolova.a_student", passwordFromEnvironment("sokolova.a_student")],
    ["belova.s_student", passwordFromEnvironment("belova.s_student")],
    ["volkova.m_teacher", passwordFromEnvironment("volkova.m_teacher")],
    ["orlova.e_dean", passwordFromEnvironment("orlova.e_dean")],
  ]);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const connected = await prisma.$queryRaw<Array<{ databaseName: string }>>`SELECT current_database() AS "databaseName"`;
    if (connected[0]?.databaseName !== databaseName) throw new Error("Seed refused: connected PostgreSQL database did not match the explicit target name");
    const counts = await prisma.$transaction((tx) => runSeed(tx, passwords), { maxWait: 30_000, timeout: 300_000 });
    console.log(`Digital Campus demo seed completed for local database ${databaseName}.`);
    console.log(JSON.stringify(counts, null, 2));
    console.log("No passwords, DATABASE_URL, sessions, activation tokens, QR passes, or AI-generated data were emitted.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed failure";
  console.error(`Digital Campus demo seed failed: ${message}`);
  process.exitCode = 1;
});
