"use client";

import { useState } from "react";
import { formatGradePercent, formatGradePoints, gradeStateLabel, selectedGradeCourse, type GradeCourseForView } from "@/lib/grades/grades-view-core";

export default function GradesContent({ courses }: { courses: GradeCourseForView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(courses[0]?.id ?? null);
  const selected = selectedGradeCourse(courses, selectedId);
  const currentStructure = selected?.structures.find((structure) => structure.version === selected.currentStructureVersion)
    ?? selected?.structures.at(-1)
    ?? null;

  if (courses.length === 0) {
    return (
      <section className="grades-empty" role="status">
        <span className="grades-empty-mark" aria-hidden="true">▥</span>
        <h2>В этом семестре дисциплины не найдены</h2>
        <p>Для выбранного семестра в учебном плане пока нет дисциплин.</p>
      </section>
    );
  }

  return (
    <div className="grades-layout">
      <section className="grades-course-list" aria-labelledby="grades-courses-title">
        <div className="grades-section-heading">
          <div><span className="profile-heading-kicker">ТВОЯ ГРУППА</span><h2 id="grades-courses-title">Дисциплины</h2></div>
          <span className="grades-count">{courses.length}</span>
        </div>
        <div className="grades-course-options" role="group" aria-label="Выбор дисциплины">
          {courses.map((course) => {
            const structure = course.structures.find((item) => item.version === course.currentStructureVersion) ?? course.structures.at(-1);
            const isSelected = course.id === selected?.id;
            return (
              <button
                className={`grades-course-option${isSelected ? " is-selected" : ""}`}
                key={course.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedId(course.id)}
              >
                <span className="grades-course-option-top"><strong>{course.name}</strong><i aria-hidden="true">{isSelected ? "●" : "○"}</i></span>
                {structure && structure.availableMaximum !== "0" ? (
                  <span className="grades-course-option-score">
                    <strong>{formatGradePoints(structure.accumulatedPoints)} <small>из {formatGradePoints(structure.availableMaximum)}</small></strong>
                    <span>{formatGradePercent(structure.preliminaryPercent) ?? "—"}</span>
                  </span>
                ) : <span className="grades-course-option-state">{gradeStateLabel(course.state)}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {selected ? (
        <section className="grades-detail" aria-labelledby="grades-detail-title" aria-live="polite">
          <header className="grades-detail-heading">
            <div><span className="profile-heading-kicker">УЧЕБНЫЙ РЕЗУЛЬТАТ</span><h2 id="grades-detail-title">{selected.name}</h2></div>
            <span className={`grades-state-badge state-${currentStructure?.state ?? "NO_PUBLISHED_STRUCTURE"}`}>{gradeStateLabel(currentStructure?.state ?? "NO_PUBLISHED_STRUCTURE")}</span>
          </header>

          {currentStructure ? (
            <>
              {currentStructure.availableMaximum !== "0" ? (
                <>
                  <div className="grades-summary" aria-label="Предварительный результат">
                    <div className="grades-summary-score"><strong>{formatGradePoints(currentStructure.accumulatedPoints)}</strong><span>из {formatGradePoints(currentStructure.availableMaximum)} доступных баллов</span></div>
                    <div className="grades-summary-percent"><strong>{formatGradePercent(currentStructure.preliminaryPercent) ?? "—"}</strong><span>предварительный процент</span></div>
                  </div>
                  <p className="grades-summary-note">Процент рассчитан только по компонентам с опубликованными оценками. Он не является итоговой оценкой по дисциплине.</p>
                </>
              ) : (
                <div className="grades-no-result-summary" role="status">Опубликованных оценок пока нет. Неоценённые работы не считаются нулём.</div>
              )}

              {currentStructure.worksWithoutPublishedResult > 0 ? (
                <p className="grades-pending-note" role="status">По {currentStructure.worksWithoutPublishedResult} опубликованным работам пока нет опубликованного результата.</p>
              ) : null}

              <div className="grades-components">
                <h3>Компоненты оценивания <span>Структура v{currentStructure.version}</span></h3>
                {currentStructure.components.map((component) => (
                  <article className="grades-component" key={component.id}>
                    <div className="grades-component-heading">
                      <div><h4>{component.name}</h4><span>Максимум {formatGradePoints(component.maximumPoints)} баллов</span></div>
                      {component.publishedWorkCount > 0 ? (
                        <div className="grades-component-result"><strong>{formatGradePoints(component.earnedPoints)}</strong><span>вклад</span></div>
                      ) : <span className="grades-component-unscored">Не включён в доступный максимум</span>}
                    </div>
                    {component.publishedWorkCount > 0 ? (
                      <p className="grades-component-average">Средняя оценка работ: {formatGradePoints(component.averageScore ?? "0")} / 100</p>
                    ) : null}
                    {component.works.length > 0 ? (
                      <ul className="grades-work-list">
                        {component.works.map((work) => (
                          <li key={work.id}>
                            <span>{work.title}</span>
                            {work.score !== null ? (
                              <strong>{formatGradePoints(work.score)} / 100{work.isRetake ? <em>Пересдача{work.retakeAttemptNo ? ` №${work.retakeAttemptNo}` : ""}</em> : null}</strong>
                            ) : <small>Оценка не опубликована</small>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="grades-component-empty">Опубликованных работ по компоненту пока нет.</p>}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="grades-no-structure" role="status">
              <strong>{selected.state === "NO_PUBLISHED_STRUCTURE" ? "Структура оценивания ещё не опубликована" : "Опубликованных оценок пока нет"}</strong>
              <p>{selected.state === "NO_PUBLISHED_STRUCTURE" ? "Преподаватель опубликует состав компонентов и их максимальные баллы для дисциплины." : "Когда преподаватель опубликует оценки, они появятся в этом разделе."}</p>
            </div>
          )}

          <section className="grades-final-status" aria-label="Итоговая оценка">
            <div><span className="profile-heading-kicker">ИТОГОВАЯ АТТЕСТАЦИЯ</span><h3>Статус итоговой оценки</h3></div>
            {selected.finalGradeClosure ? (
              <p><span className="grades-status-dot is-closed" />Официально закрыта · {formatDate(selected.finalGradeClosure.closedAt)}</p>
            ) : <p><span className="grades-status-dot" />Официальное закрытие не зарегистрировано</p>}
          </section>

          <section className="grades-debts" aria-label="Академические задолженности">
            <div className="grades-debts-heading"><div><span className="profile-heading-kicker">ПОДТВЕРЖДЁННЫЕ ЗАПИСИ</span><h3>Академические задолженности</h3></div><span className="grades-count">{selected.confirmedAcademicDebts.length}</span></div>
            {selected.confirmedAcademicDebts.length === 0 ? (
              <p className="grades-no-debts">Подтверждённых задолженностей нет.</p>
            ) : (
              <ul className="grades-debt-list">
                {selected.confirmedAcademicDebts.map((debt) => (
                  <li key={debt.id}>
                    <span><strong>{debt.resolvedAt ? "Погашена" : "Подтверждена"}</strong><small>С {formatDate(debt.confirmedAt)}{debt.resolvedAt ? ` · закрыта ${formatDate(debt.resolvedAt)}` : ""}</small>{debt.reason ? <small>{debt.reason}</small> : null}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      ) : null}
    </div>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }).format(value);
}
