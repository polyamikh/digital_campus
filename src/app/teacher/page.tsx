import { Suspense } from "react";
import Link from "next/link";
import TeacherAppShell from "./teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherHome } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherDateTime, teacherHeader, teacherTime } from "./teacher-route";

export default function TeacherHomePage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем кабинет преподавателя…" />}><Content /></Suspense>; }

async function Content() {
  await requireTeacherPage(); const data = await getTeacherHome();
  const quick = [
    ["/teacher/grades", "Журнал оценок", "Внести и опубликовать оценки"],
    ["/teacher/homework", "Домашние задания", "Проверить работы студентов"],
    ["/teacher/testing", "Тестирование", "Управлять назначенными тестами"],
    ["/teacher/materials", "Материалы", "Обновить учебные материалы"],
    ["/teacher/groups", "Мои группы", "Посмотреть состав и прогресс"],
  ];
  return <TeacherAppShell activeSection="home"><div className="teacher-workspace-page">
    {teacherHeader("РАБОЧЕЕ ПРОСТРАНСТВО", "Кабинет преподавателя", "Здравствуйте, " + data.displayName + ". Здесь собраны ваши занятия и текущие действия.")}
    <div className="teacher-overview-cards"><article><span>Назначения</span><strong>{data.assignmentCount}</strong></article><article><span>Работы на проверке</span><strong>{data.pendingReviews}</strong><Link href="/teacher/homework">Открыть очередь →</Link></article><article><span>Ближайшие занятия недели</span><strong>{data.lessons.length}</strong><Link href="/teacher/schedule">Расписание →</Link></article></div>
    <div className="teacher-data-grid"><section className="teacher-data-card"><div className="teacher-section-title"><h2>Ближайшие занятия</h2><Link href="/teacher/schedule">Всё расписание →</Link></div>{data.lessons.length ? <ul>{data.lessons.slice(0, 6).map((lesson) => <li key={lesson.id}><strong>{lesson.course.subject.name} · {lesson.group?.code ?? "Группа не указана"}</strong><span>{teacherDateTime(lesson.startsAt)} · {teacherTime(lesson.startsAt)}–{teacherTime(lesson.endsAt)}</span><small>{lesson.kind === "EXAM" ? "Экзамен" : "Занятие"} · {lesson.room?.code ?? "Аудитория не указана"}</small></li>)}</ul> : <p>На этой неделе занятий нет.</p>}</section><section className="teacher-data-card"><div className="teacher-section-title"><h2>Ближайшие сроки</h2><Link href="/teacher/calendar">Календарь →</Link></div>{data.upcomingWork.length ? <ul>{data.upcomingWork.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.course.subject.name} · {item.group?.code ?? "Группа не указана"}</span><small>{item.deadline ? teacherDateTime(item.deadline) : "Срок не указан"}</small></li>)}</ul> : <p>Ближайших опубликованных сроков нет.</p>}</section></div>
    <section className="teacher-data-card"><h2>Быстрые действия</h2><div className="teacher-quick-links">{quick.map(([href, title, description]) => <Link href={href} key={href}><strong>{title}</strong><span>{description}</span><b aria-hidden="true">↗</b></Link>)}</div></section>
  </div></TeacherAppShell>;
}
