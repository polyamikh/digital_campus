import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import { prisma } from "@/lib/prisma";
import { getStudentHomeSchedule } from "@/lib/schedule/student-home-schedule";
import StudentHomeContent from "./student-home-content";
import StudentAppShell from "./student-app-shell";
import AuthRouteFallback from "./auth-route-fallback";
import { getProfilePhotoMetadata } from "@/lib/profile/profile-photo-store";
import { getCurrentStudentGrades } from "@/lib/grades/student-grades";
import { getCurrentStudentTaskCalendar } from "@/lib/tasks/student-tasks";
import { getStudentHomeworkList } from "@/lib/coursework/coursework-service";
import { getCurrentStudentTesting } from "@/lib/testing/testing-service";
import { getStudentCareerWorkspace } from "@/lib/campus/career-service";
import { getCurrentStudentNotificationCenter } from "@/lib/notifications/student-notifications";
import { moscowDateKey } from "@/lib/schedule/moscow-time";

export default function Home() {
  return (
    <Suspense fallback={<AuthRouteFallback />}>
      <AuthenticatedStudentHome />
    </Suspense>
  );
}

async function AuthenticatedStudentHome() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.activeRole !== Role.STUDENT) redirect(homePathForRole(user.activeRole));

  const now = new Date();
  const [identity, schedule, photo] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { login: true, profile: { select: { displayName: true } } },
    }),
    getStudentHomeSchedule(user.id),
    getProfilePhotoMetadata(user.id),
  ]);
  const displayName = identity?.profile?.displayName || identity?.login || user.login;
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const month = moscowDateKey(now).slice(0, 7);
  const [gradesResult, tasksResult, homeworkResult, testsResult, careerResult, noticesResult] = await Promise.allSettled([
    getCurrentStudentGrades(null, now),
    getCurrentStudentTaskCalendar(month, now, "list", schedule.todayDate),
    getStudentHomeworkList(now),
    getCurrentStudentTesting(now),
    getStudentCareerWorkspace(),
    getCurrentStudentNotificationCenter(),
  ]);
  const grades = gradesResult.status === "fulfilled" ? gradesResult.value : null;
  const tasks = tasksResult.status === "fulfilled" ? tasksResult.value : null;
  const homework = homeworkResult.status === "fulfilled" ? homeworkResult.value : null;
  const tests = testsResult.status === "fulfilled" ? testsResult.value : null;
  const career = careerResult.status === "fulfilled" ? careerResult.value : null;
  const notices = noticesResult.status === "fulfilled" ? noticesResult.value : null;
  const deadlineItems = [
    ...(homework?.state === "READY" ? homework.items.flatMap((item) => item.deadline && item.deadline >= now ? [{ id: `homework:${item.id}`, title: item.title, course: item.courseName, dueAt: item.deadline.toISOString(), href: `/homework/${item.id}`, kind: "Домашнее задание" }] : []) : []),
    ...(tests?.membershipState === "READY" ? tests.tests.filter((item) => item.closesAt && item.closesAt >= now).map((item) => ({ id: `test:${item.id}`, title: item.title, course: item.courseName, dueAt: item.closesAt!.toISOString(), href: "/testing", kind: "Тестирование" })) : []),
  ].sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 4);
  const dashboard = {
    todayTasks: tasks?.events.filter((event) => event.sourceType === "PERSONAL_TASK" && moscowDateKey(event.startsAt) === schedule.todayDate).map((event) => ({ id: event.id, title: event.title, category: event.category, state: event.state, time: event.allDay ? null : new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }).format(event.startsAt) })) ?? [],
    deadlines: deadlineItems,
    grades: grades ? {
      semester: grades.selectedSemester?.label ?? null,
      courseCount: grades.courses.length,
      accumulated: grades.courses.reduce((sum, course) => sum + Number(course.structures.at(-1)?.accumulatedPoints ?? 0), 0),
      available: grades.courses.reduce((sum, course) => sum + Number(course.structures.at(-1)?.availableMaximum ?? 0), 0),
      unresolvedWorks: grades.courses.reduce((sum, course) => sum + (course.structures.at(-1)?.worksWithoutPublishedResult ?? 0), 0),
    } : null,
    events: career?.events.slice(0, 3).map((event) => ({ id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), location: event.location })) ?? [],
    opportunities: career?.opportunities.slice(0, 2).map((item) => ({ id: item.id, title: item.title, organization: item.organization, category: item.category.name })) ?? [],
    notifications: notices?.notifications.slice(0, 3).map((item) => ({ id: item.deliveryId, title: item.title, category: item.category, createdAt: item.createdAt.toISOString(), read: item.readAt !== null })) ?? [],
    unavailable: {
      tasks: tasks === null, grades: grades === null, deadlines: homework === null && tests === null, career: career === null, notifications: notices === null,
    },
  };
  const studentSchedule = {
    todayDate: schedule.todayDate,
    lessons: schedule.lessons,
    timeWindowViolationCount: schedule.timeWindowViolationCount,
    membershipProblem: schedule.membershipProblem,
  };

  return (
    <StudentAppShell displayName={displayName} groupCode={schedule.groupCode} photoVersion={photo?.version ?? null} activeSection="home">
      <StudentHomeContent schedule={studentSchedule} dashboard={dashboard} firstName={firstName} />
    </StudentAppShell>
  );
}
