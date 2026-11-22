import { Suspense } from "react";
import Link from "next/link";
import TeacherAppShell from "./teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherHome } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherDateTime, teacherTime } from "./teacher-route";

export default function TeacherHomePage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем кабинет преподавателя…" />}><Content /></Suspense>; }

async function Content() {
  await requireTeacherPage();
  const data = await getTeacherHome();
  const firstName = data.displayName.trim().split(/\s+/)[0] || "Преподаватель";
  const unread = data.recentNotifications;
  const weekLessons = data.weeklyLessonCount;
  return <TeacherAppShell activeSection="home"><div className="teacher-workspace-page">
    <div className="student-home-grid">
      <div className="home-welcome-stack">
        <section className="hero home-welcome" aria-labelledby="teacher-welcome-title"><div className="home-welcome-main"><div><span className="home-eyebrow">КАБИНЕТ ПРЕПОДАВАТЕЛЯ</span><h1 className="hero-title" id="teacher-welcome-title"><span>ЗДРАВСТВУЙТЕ,</span><span>{firstName.toUpperCase()}!</span></h1></div><span className="hero-divider" aria-hidden="true"/><p className="hero-copy">Занятия, проверка работ<br/>и работа с курсами —<br/>в одном пространстве.</p></div></section>
        <div className="home-summary-strip" aria-label="Краткая сводка"><div><span>ДИСЦИПЛИНЫ И ГРУППЫ</span><strong>{data.assignmentCount}</strong></div><div><span>РАБОТЫ НА ПРОВЕРКЕ</span><strong>{data.pendingReviews}</strong></div><div><span>ЗАНЯТИЯ НА НЕДЕЛЕ</span><strong>{weekLessons}</strong></div></div>
      </div>
      <section className="home-panel home-deadlines"><div className="home-section-title"><h2>Ближайшие сроки</h2><Link href="/teacher/calendar">Календарь ↗</Link></div>{data.upcomingWork.length ? <ul className="home-deadline-list">{data.upcomingWork.map((item) => <li key={item.id}><time>{item.deadline ? teacherDateTime(item.deadline) : "Без срока"}</time><Link href="/teacher/homework"><strong>{item.title}</strong><small>{item.course.subject.name} · {item.group?.code ?? "Группа не указана"}</small></Link></li>)}</ul> : <p className="home-empty">Ближайших сроков пока нет.</p>}</section>
      <section className="home-panel home-schedule"><div className="home-panel-heading"><div><span className="home-eyebrow">УЧЕБНАЯ НЕДЕЛЯ</span><h2>Расписание</h2></div><Link href="/teacher/schedule">Всё расписание ↗</Link></div>{data.lessons.length ? <ol className="home-lesson-list">{data.lessons.slice(0, 4).map((lesson) => <li className="home-lesson" key={lesson.id}><time><strong>{teacherTime(lesson.startsAt)}</strong><span>{teacherTime(lesson.endsAt)}</span></time><span className="home-lesson-line" aria-hidden="true"/><div><span className="lesson-kind">{lesson.kind === "EXAM" ? "Экзамен" : "Занятие"}</span><h3>{lesson.course.subject.name}</h3><p>{lesson.group?.code ?? "Группа не указана"} · {lesson.room?.code ?? "Аудитория не указана"}</p></div></li>)}</ol> : <p className="home-empty">На этой неделе занятий нет.</p>}</section>
      <section className="home-panel home-tasks"><div className="home-section-title"><h2>Задачи</h2><Link href="/teacher/homework">Очередь ↗</Link></div><p className="home-panel-caption">Проверка и публикация результатов</p><div className="home-performance-score"><strong>{data.pendingReviews}</strong><span>работ ожидают проверки</span></div><Link href="/teacher/homework">Открыть домашние задания ↗</Link></section>
      <section className="home-panel home-events"><div className="home-section-title"><h2>События</h2><Link href="/teacher/notifications">Уведомления ↗</Link></div>{unread.length ? <ul className="home-notice-list">{unread.map((item) => <li className="is-unread" key={item.id}><span aria-hidden="true"/><div><strong>{item.notification.title}</strong><small>{item.notification.category.replaceAll("_", " ")} · {teacherDateTime(item.createdAt)}</small></div></li>)}</ul> : <p className="home-empty">Непрочитанных уведомлений нет.</p>}</section>
      <section className="home-panel home-performance"><div className="home-section-title"><h2>Журнал оценок</h2><Link href="/teacher/grades">Открыть ↗</Link></div><div className="home-performance-score"><strong>{data.pendingReviews}</strong><span>работ ожидают проверки</span></div><p className="home-panel-caption">Оценки публикуются после проверки.</p></section>
      <section className="home-panel home-career"><div className="home-section-title"><h2>Мои группы</h2><Link href="/teacher/groups">Открыть ↗</Link></div><div className="home-performance-score"><strong>{data.assignmentCount}</strong><span>дисциплин и групп в назначениях</span></div><ul className="home-opportunities"><li><span><strong>Материалы курса</strong><small>Публикация учебных материалов</small></span><Link href="/teacher/materials">↗</Link></li><li><span><strong>Тестирование</strong><small>Управление назначенными тестами</small></span><Link href="/teacher/testing">↗</Link></li></ul></section>
      <section className="home-ai-panel"><div className="home-ai-art" aria-hidden="true"><span/><span/><span/></div><span className="home-eyebrow">CAMPUS AI</span><h2>Помощник преподавателя</h2><p>Справка и навигация по функциям кабинета.</p><Link href="/teacher/assistant">Открыть помощника ↗</Link></section>
    </div>
  </div></TeacherAppShell>;
}
