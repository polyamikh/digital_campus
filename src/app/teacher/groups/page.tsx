import { Suspense } from "react";
import Link from "next/link";
import TeacherAppShell from "../teacher-app-shell";
import AuthRouteFallback from "@/app/auth-route-fallback";
import { getTeacherGroups, getTeacherGroupAnnouncements } from "@/lib/teacher/teacher-workspace";
import { requireTeacherPage } from "../teacher-route";
import TeacherGroupAnnouncementForm from "./teacher-group-announcement-form";

export default function TeacherGroupsPage({ searchParams }: { searchParams: Promise<{ group?: string; course?: string }> }) { return <Suspense fallback={<AuthRouteFallback message="Загружаем учебные группы…" />}><Content searchParams={searchParams} /></Suspense>; }

async function Content({ searchParams }: { searchParams: Promise<{ group?: string; course?: string }> }) {
  await requireTeacherPage();
  const [data, announcements, params] = await Promise.all([getTeacherGroups(), getTeacherGroupAnnouncements(), searchParams]);
  const current = data.groups.find((group) => group.id === params.group) ?? data.groups[0];
  const selectedCourseId = current?.courses.some((item) => item.courseId === params.course) ? params.course : current?.courses[0]?.courseId;
  const groupAnnouncements = announcements.filter((item) => item.groupId === current?.id && (!selectedCourseId || item.courseId === selectedCourseId));
  return <TeacherAppShell activeSection="groups"><div className="teacher-workspace-page">
    <header className="teacher-page-heading"><span className="profile-heading-kicker">МОИ НАЗНАЧЕНИЯ</span><h1>Мои группы</h1><p>Состав, активность и объявления групп по вашим действующим назначениям.</p></header>
    {data.groups.length ? <><form className="teacher-filter-row teacher-groups-selector" method="get"><label>Группа<select name="group" defaultValue={current?.id}>{data.groups.map((group) => <option key={group.id} value={group.id}>{group.code} · {group.name}</option>)}</select></label><label>Дисциплина<select name="course" defaultValue={selectedCourseId}>{current?.courses.map((course) => <option key={course.courseId} value={course.courseId}>{course.name}</option>)}</select></label><button className="coursework-secondary">Показать</button><a className="teacher-secondary-link" href="/teacher/groups/export">Экспорт CSV</a></form>
      {current ? <><section className="teacher-data-card teacher-group-overview"><div className="teacher-section-title"><div><span className="profile-heading-kicker">{current.code}</span><h2>{current.name}</h2></div><span>{current.students.length} студентов</span></div><div className="teacher-group-stats"><span><strong>{current.publishedGradeEntryCount}</strong> опубликованных результатов</span><span><strong>{current.pendingReviewCount}</strong> работ ожидают проверки</span></div></section>
      <section className="teacher-data-card teacher-roster-panel"><div className="teacher-section-title"><h2>Студенты и активность</h2><span>{current.students.length} участников</span></div>{current.students.length ? <div className="teacher-roster-table-scroll"><table className="teacher-roster-table"><thead><tr><th>Студент</th><th>Академический статус</th><th>Опубликовано работ</th><th>На проверке</th></tr></thead><tbody>{current.students.map((student) => <tr key={student.id}><th scope="row">{student.name}</th><td>{student.academicStatus ?? "Не указан"}</td><td>{student.publishedWorkCount}</td><td>{student.pendingReviewCount}</td></tr>)}</tbody></table></div> : <p>Активный состав группы не найден.</p>}</section>
      <TeacherGroupAnnouncementForm groupId={current.id} courses={current.courses} announcements={groupAnnouncements}/><p className="teacher-group-gradebook-link"><Link className="teacher-secondary-link" href={`/teacher/grades?group=${encodeURIComponent(current.id)}${selectedCourseId ? `&course=${encodeURIComponent(selectedCourseId)}` : ""}`}>Открыть журнал группы ↗</Link></p></> : null}</> : <div className="teacher-empty"><h2>Действующие группы не найдены</h2><p>Проверьте назначение преподавателя или обратитесь в деканат.</p></div>}
  </div></TeacherAppShell>;
}
