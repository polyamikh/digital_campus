import { Suspense } from "react";
import Link from "next/link";
import TeacherAppShell from "../teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherGroups, getTeacherGroupAnnouncements } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage, teacherHeader } from "../teacher-route";
import TeacherGroupAnnouncementForm from "./teacher-group-announcement-form";

export default function TeacherGroupsPage() { return <Suspense fallback={<AuthRouteFallback message="Загружаем учебные группы…" />}><Content /></Suspense>; }

async function Content() {
  await requireTeacherPage(); const [data, announcements] = await Promise.all([getTeacherGroups(), getTeacherGroupAnnouncements()]);
  return <TeacherAppShell activeSection="groups"><div className="teacher-workspace-page">
    {teacherHeader("МОИ НАЗНАЧЕНИЯ", "Мои группы", "Состав групп и сводка опубликованных работ доступны только по вашим действующим назначениям.")}
    <p><a className="teacher-secondary-link" href="/teacher/groups/export">Экспорт списков в CSV</a></p>
    {data.groups.length ? <div className="teacher-data-grid">{data.groups.map((group) => <section className="teacher-data-card" key={group.id}><div className="teacher-section-title"><div><span className="profile-heading-kicker">{group.code}</span><h2>{group.name}</h2></div><span>{group.students.length} студентов</span></div><p>{group.courseNames.join(" · ")}</p><p className="teacher-demo-note">Опубликованных оценённых работ: {group.publishedGradeEntryCount}. Работ ожидают проверки: {group.pendingReviewCount}. Это счётчики активности, не итоговая успеваемость.</p>{group.students.length ? <details className="teacher-roster"><summary>Список студентов и индивидуальная активность</summary><div className="teacher-roster-list">{group.students.map((student) => <div key={student.id}><strong>{student.name}</strong><span>{student.academicStatus ?? "Статус не указан"}</span><span>{student.publishedWorkCount} опубликованных работ · {student.pendingReviewCount} ожидают проверки</span></div>)}</div></details> : <p>Активный состав группы не найден.</p>}<TeacherGroupAnnouncementForm groupId={group.id} courses={group.courses} /><details className="teacher-group-announcements"><summary>Объявления группы ({announcements.filter((item) => item.groupId === group.id).length})</summary><ul>{announcements.filter((item) => item.groupId === group.id).slice(0, 10).map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.course.name} · {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(item.publishedAt)}</span><small>{item.body}</small></li>)}</ul></details><Link className="teacher-secondary-link" href={"/teacher/grades?group=" + encodeURIComponent(group.id)}>Открыть журнал группы →</Link></section>)}</div> : <div className="teacher-empty"><h2>Действующие группы не найдены</h2><p>Проверьте назначение преподавателя или обратитесь в деканат.</p></div>}
  </div></TeacherAppShell>;
}
