"use client";

import { useState, useTransition } from "react";
import { createTeacherTestAction, publishTeacherTestAction, publishTeacherTestResultAction, recordTeacherTestResultAction, removeTeacherTestAction, updateTeacherTestAction } from "@/app/actions/testing";
import { toMoscowDateTimeLocal } from "@/lib/tasks/tasks-core";

type Assignment = { id: string; courseId: string; groupId: string; groupCode: string; courseName: string };
type ComponentOption = { assignmentId: string; courseId: string; groupId: string; groupCode: string; courseName: string; structureVersionId: string; componentId: string; componentName: string };
type TestItem = { id: string; title: string; courseName: string; groupCode: string; groupId: string; state: string; version: number; externalUrl: string | null; opensAt: Date | null; closesAt: Date | null; attemptLimit: number | null; students: Array<{ id: string; name: string }>; attempts: Array<{ id: string; studentId: string; attemptNo: number; state: string; submittedAt: Date | null; publishedAt: Date | null; studentName: string; result: string | null; resultPublished: boolean }> };

export default function TeacherTestingContent({ assignments, componentOptions, tests }: { assignments: Assignment[]; componentOptions: ComponentOption[]; tests: TestItem[] }) {
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedComponents = componentOptions.filter((item) => item.assignmentId === assignmentId);

  function submit(action: (formData: FormData) => Promise<{ ok: boolean; error: string | null }>, form: HTMLFormElement, onSuccess?: () => void) {
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await action(formData);
      setMessage(result.ok ? "Изменения сохранены." : result.error ?? "Не удалось выполнить действие.");
      if (result.ok) { form.reset(); onSuccess?.(); }
    });
  }

  return <div className="testing-teacher-content">
    {message ? <p className="testing-teacher-message" role="status">{message}</p> : null}
    <section className="testing-teacher-panel">
      <h2>Новый тест</h2>
      {assignments.length === 0 ? <p>Нет активных назначений дисциплин и групп.</p> : selectedComponents.length === 0 ? <p>Для выбранного назначения не опубликована структура оценивания.</p> : <form onSubmit={(event) => { event.preventDefault(); submit(createTeacherTestAction, event.currentTarget); }}>
        <label>Дисциплина и группа<select name="assignmentId" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>{assignments.map((item) => <option value={item.id} key={item.id}>{item.courseName} · {item.groupCode}</option>)}</select></label>
        <label>Компонент журнала<select name="componentId" required>{selectedComponents.map((item) => <option value={item.componentId} key={item.componentId}>{item.componentName}</option>)}</select></label>
        <label>Название<input name="title" maxLength={240} required /></label>
        <label>Ссылка на внешнюю платформу<input name="externalUrl" type="url" placeholder="https://…" /></label>
        <div className="testing-form-row"><label>Открытие (московское время)<input type="datetime-local" name="opensAt" /></label><label>Срок (московское время)<input type="datetime-local" name="closesAt" /></label></div>
        <label>Разрешённое количество попыток<input name="attemptLimit" type="number" min="1" step="1" placeholder="Без ограничения" /></label>
        <button className="testing-start" type="submit" disabled={isPending}>{isPending ? "Сохраняем…" : "Создать черновик теста"}</button>
      </form>}
    </section>
    <section className="testing-teacher-panel"><h2>Тесты и результаты</h2>
      {tests.length === 0 ? <p>Назначенных тестов пока нет.</p> : <div className="testing-teacher-list">{tests.map((item) => <article className="testing-teacher-test" key={item.id}>
        <div className="testing-teacher-test-heading"><div><span>{item.courseName} · {item.groupCode}</span><h3>{item.title}</h3></div><strong>{item.state === "PUBLISHED" ? "Опубликован" : item.state === "DRAFT" ? "Черновик" : "Снят с публикации"}</strong></div>
        {item.externalUrl ? <p><a href={item.externalUrl} target="_blank" rel="noopener noreferrer">Открыть внешнюю платформу ↗</a></p> : <p>Внешняя ссылка не указана.</p>}
        <div className="testing-teacher-edit-actions">
          <button type="button" className="testing-secondary-button" onClick={() => setEditingTestId(editingTestId === item.id ? null : item.id)}>{editingTestId === item.id ? "Закрыть редактирование" : "Редактировать"}</button>
          <button type="button" className="testing-danger-button" disabled={isPending} onClick={() => {
            const confirmed = window.confirm(`Удалить тест «${item.title}»? Если есть попытки, оценки, отправленные напоминания или уведомления, тест будет снят с публикации, а история останется. Без связанной истории тест и его черновые/календарные записи будут удалены.`);
            if (!confirmed) return;
            startTransition(async () => {
              const result = await removeTeacherTestAction(item.id, item.version);
              setMessage(result.ok ? result.disposition === "deleted" ? "Тест удалён вместе с черновыми и календарными записями." : "Тест снят с публикации. История и результаты сохранены." : result.error ?? "Не удалось обработать тест.");
              setEditingTestId(null);
            });
          }}>Удалить</button>
        </div>
        {editingTestId === item.id ? <form className="testing-edit-form" onSubmit={(event) => { event.preventDefault(); submit(updateTeacherTestAction, event.currentTarget, () => setEditingTestId(null)); }}>
          <input type="hidden" name="testId" value={item.id} /><input type="hidden" name="version" value={item.version} />
          <label>Дисциплина и группа<input value={`${item.courseName} · ${item.groupCode}`} readOnly aria-label="Дисциплина и группа не редактируются" /></label>
          <label>Название<input name="title" maxLength={240} required defaultValue={item.title} /></label>
          <label>Ссылка на внешнюю платформу<input name="externalUrl" type="url" placeholder="https://…" defaultValue={item.externalUrl ?? ""} /></label>
          <div className="testing-form-row"><label>Открытие (московское время)<input type="datetime-local" name="opensAt" defaultValue={item.opensAt ? toMoscowDateTimeLocal(item.opensAt) : ""} /></label><label>Срок (московское время)<input type="datetime-local" name="closesAt" defaultValue={item.closesAt ? toMoscowDateTimeLocal(item.closesAt) : ""} /></label></div>
          <label>Разрешённое количество попыток<input name="attemptLimit" type="number" min="1" step="1" placeholder="Без ограничения" defaultValue={item.attemptLimit ?? ""} /></label>
          <p>Дисциплина и группа зафиксированы назначением. Чтобы изменить их, создайте отдельный тест: перенос существующей истории между группами не выполняется.</p>
          <button type="submit" className="testing-start" disabled={isPending}>{isPending ? "Сохраняем…" : "Сохранить изменения"}</button>
        </form> : null}
        {item.state === "DRAFT" ? <button type="button" className="testing-start" disabled={isPending} onClick={() => startTransition(async () => { const result = await publishTeacherTestAction(item.id); setMessage(result.ok ? "Тест опубликован." : result.error ?? "Не удалось опубликовать тест."); })}>Опубликовать группе</button> : null}
        {item.attempts.map((attempt) => <div className="testing-teacher-attempt" key={attempt.id}>
          <div><strong>{attempt.studentName}</strong><span>Попытка №{attempt.attemptNo} · {attempt.state === "PUBLISHED" ? "результат опубликован" : attempt.state === "REVIEWED" ? "ожидает публикации" : attempt.state}</span></div>
          {attempt.result !== null ? <span className="testing-teacher-score">{attempt.result} / 100</span> : null}
          {attempt.state === "REVIEWED" ? <button type="button" className="testing-secondary-button" disabled={isPending} onClick={() => startTransition(async () => { const result = await publishTeacherTestResultAction(attempt.id); setMessage(result.ok ? "Результат опубликован и добавлен в журнал." : result.error ?? "Не удалось опубликовать результат."); })}>Опубликовать результат</button> : null}
        </div>)}
        {item.state === "PUBLISHED" ? <form className="testing-result-form" onSubmit={(event) => { event.preventDefault(); submit(recordTeacherTestResultAction, event.currentTarget); }}><input type="hidden" name="testId" value={item.id} /><label>Студент<select name="studentId" required defaultValue="">{item.students.length ? <option value="" disabled>Выберите студента</option> : <option value="" disabled>В группе нет активных студентов</option>}{item.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><label>Результат 0–100<input name="score" type="number" min="0" max="100" step="0.01" required /></label><button type="submit" className="testing-secondary-button" disabled={isPending || item.students.length === 0}>Зафиксировать результат</button><small>Результат сохраняется как черновик в едином журнале оценок; публикация выполняется отдельно.</small></form> : null}
      </article>)}</div>}
    </section>
  </div>;
}
