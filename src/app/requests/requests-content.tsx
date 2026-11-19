"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { answerServiceClarificationAction, createServiceRequestAction, getServiceRequestDetailsAction, markRequestNotificationReadAction } from "@/app/actions/service-requests";
import { initialRequestWorkflowActionState, type CreateServiceRequestState } from "@/lib/requests/request-action-state";
import {
  filterStudentRequests,
  requestCategoryLabel,
  requestCategoryRequiresDetails,
  requestStateLabel,
  requestSummary,
  REQUEST_CATEGORY_LABELS,
  REQUEST_STATE_LABELS,
  type RequestCategoryValue,
  type RequestNotificationView,
  type RequestStateValue,
  type StudentRequestView,
} from "@/lib/requests/requests-view-core";

const initialActionState: CreateServiceRequestState = { error: null, successId: null };

type RequestDetailsResult = Awaited<ReturnType<typeof getServiceRequestDetailsAction>>;

export default function RequestsContent({ requests, notifications }: { requests: StudentRequestView[]; notifications: RequestNotificationView[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<RequestCategoryValue>("STUDY_CERTIFICATE");
  const [categoryFilter, setCategoryFilter] = useState<RequestCategoryValue | "ALL">("ALL");
  const [stateFilter, setStateFilter] = useState<RequestStateValue | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<RequestDetailsResult | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const summary = requestSummary(requests);
  const visibleRequests = filterStudentRequests(requests, { category: categoryFilter, state: stateFilter });

  async function toggleDetails(id: string) {
    if (selectedId === id) {
      setSelectedId(null);
      setDetails(null);
      return;
    }
    setSelectedId(id);
    setDetails(null);
    setDetailsLoading(true);
    const result = await getServiceRequestDetailsAction(id);
    setDetails(result);
    setDetailsLoading(false);
  }

  return (
    <div className="requests-page-content">
      <RequestNotifications notifications={notifications} />
      <div className="requests-summary-grid" aria-label="Сводка заявок">
        <SummaryCard label="Активные" count={summary.active} tone="cyan" />
        <SummaryCard label="Выполненные" count={summary.completed} tone="success" />
        <SummaryCard label="Отклонённые" count={summary.rejected} tone="pink" />
      </div>

      <div className="requests-primary-actions">
        <div><span className="profile-heading-kicker">ВАШИ ОБРАЩЕНИЯ</span><h2>История заявок</h2></div>
        <button
          className="requests-create-button"
          type="button"
          aria-expanded={createOpen}
          aria-controls="request-create-panel"
          onClick={() => setCreateOpen((open) => !open)}
        >
          <span aria-hidden="true">{createOpen ? "×" : "+"}</span>{createOpen ? "Закрыть форму" : "Создать заявку"}
        </button>
      </div>

      {createOpen ? <CreateRequestForm category={newCategory} onCategoryChange={setNewCategory} onClose={() => { setCreateOpen(false); router.refresh(); }} /> : null}

      <section className="requests-list-panel" aria-labelledby="requests-list-title">
        <div className="requests-filter-row">
          <h2 id="requests-list-title" className="visually-hidden">Список заявок</h2>
          <label className="requests-filter">
            <span>Категория</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as RequestCategoryValue | "ALL")}>
              <option value="ALL">Все категории</option>
              {Object.entries(REQUEST_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="requests-filter">
            <span>Статус</span>
            <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as RequestStateValue | "ALL")}>
              <option value="ALL">Все статусы</option>
              {Object.entries(REQUEST_STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <span className="requests-results-count">{visibleRequests.length} {pluralizeRequest(visibleRequests.length)}</span>
        </div>

        {requests.length === 0 ? (
          <div className="requests-empty" role="status">
            <span className="requests-empty-icon" aria-hidden="true">▤</span>
            <h3>Заявок пока нет</h3>
            <p>Создайте заявку, чтобы обратиться в деканат или запросить документ.</p>
          </div>
        ) : visibleRequests.length === 0 ? (
          <div className="requests-filter-empty" role="status">По выбранным фильтрам заявок нет.</div>
        ) : (
          <div className="requests-list">
            {visibleRequests.map((request) => {
              const expanded = selectedId === request.id;
              return (
                <article className={`request-row${expanded ? " is-expanded" : ""}`} id={`request-${request.id}`} key={request.id}>
                  <button
                    className="request-row-trigger"
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => void toggleDetails(request.id)}
                  >
                    <span className="request-row-main">
                      <span className="request-category-label">{requestCategoryLabel(request.category)}</span>
                      <strong>{request.title}</strong>
                      <small>Создана · {formatRequestDate(request.submittedAt)}</small>
                    </span>
                    <span className="request-row-meta">
                      <span className={`request-status request-status-${request.state.toLowerCase()}`}>{requestStateLabel(request.state)}</span>
                      <span className="request-deadline">{request.state === "CLARIFICATION_REQUESTED" ? "Срок приостановлен до ответа" : request.deadlineAt ? `Срок · ${formatRequestDate(request.deadlineAt)}` : "Срок не указан"}</span>
                    </span>
                  </button>
                  {expanded ? <RequestDetailsPanel result={details} loading={detailsLoading} /> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, count, tone }: { label: string; count: number; tone: "cyan" | "success" | "pink" }) {
  return (
    <article className={`requests-summary-card tone-${tone}`}>
      <span>{label}</span><strong>{count}</strong><i aria-hidden="true" />
    </article>
  );
}

function CreateRequestForm({ category, onCategoryChange, onClose }: { category: RequestCategoryValue; onCategoryChange: (category: RequestCategoryValue) => void; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createServiceRequestAction, initialActionState);
  const refreshedId = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.successId && refreshedId.current !== state.successId) {
      refreshedId.current = state.successId;
      router.refresh();
    }
  }, [router, state.successId]);

  if (state.successId) {
    return (
      <section className="request-create-panel request-create-success" id="request-create-panel" role="status" aria-live="polite">
        <span className="request-success-mark" aria-hidden="true">✓</span>
        <div><h2>Заявка отправлена</h2><p>Она появилась в списке. Срок обработки рассчитан по официальному производственному календарю.</p></div>
        <button className="requests-secondary-button" type="button" onClick={onClose}>Готово</button>
      </section>
    );
  }

  return (
    <section className="request-create-panel" id="request-create-panel" aria-labelledby="request-create-title">
      <div className="request-create-heading"><div><span className="profile-heading-kicker">НОВОЕ ОБРАЩЕНИЕ</span><h2 id="request-create-title">Создать заявку</h2></div><span className="request-demo-note">Данные сохраняются в личной заявке</span></div>
      <form action={formAction} className="request-create-form">
        <label>
          <span>Тип заявки</span>
          <select name="category" required value={category} onChange={(event) => onCategoryChange(event.target.value as RequestCategoryValue)}>
            {Object.entries(REQUEST_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {requestCategoryRequiresDetails(category) ? <>
          <label>
            <span>Название обращения</span>
            <input name="title" type="text" maxLength={240} required autoComplete="off" placeholder="Кратко сформулируйте обращение" />
          </label>
          <label className="request-form-body">
            <span>Описание</span>
            <textarea name="body" rows={5} required placeholder="Опишите, что вам нужно" />
          </label>
        </> : null}
        {state.error ? <p className="request-form-error" role="alert">{state.error}</p> : null}
        <div className="request-form-actions">
          <p>Срок будет рассчитан по официальному календарю РФ. Если календарных данных недостаточно, заявка не будет создана.</p>
          <button className="requests-create-button" type="submit" disabled={pending}>{pending ? "Отправляем…" : "Отправить заявку"}</button>
        </div>
      </form>
    </section>
  );
}

function RequestDetailsPanel({ result, loading }: { result: RequestDetailsResult | null; loading: boolean }) {
  if (loading) return <div className="request-details-loading" role="status">Загружаем подробности…</div>;
  if (!result) return null;
  if (result.error) return <div className="request-details-error" role="alert">{result.error}</div>;
  if (!result.request) return <div className="request-details-error" role="status">Заявка не найдена или недоступна.</div>;
  const request = result.request;

  return (
    <div className="request-details-panel">
      {request.rejectionReason ? <p className="request-rejection-reason"><strong>Причина отказа:</strong> {request.rejectionReason}</p> : null}
      {request.resolution ? <section className="request-resolution"><strong>Решение деканата</strong><p>{request.resolution}</p></section> : null}
      {request.documents.length ? <section className="request-document-list" aria-label="Документы по заявке"><h3>Готовые документы</h3>{request.documents.map((document) => <a className="request-document-link" key={document.id} href={`/api/requests/documents/${document.id}`}><span aria-hidden="true">PDF</span><span><strong>{document.fileName}</strong><small>{formatBytes(Number(document.byteSize))}{document.issuedAt ? ` · ${formatRequestDate(document.issuedAt)}` : ""}</small></span><span aria-hidden="true">↓</span></a>)}</section> : null}
      {request.clarifications?.length ? <section className="request-clarification-list"><h3>Уточнения</h3>{request.clarifications.map((clarification) => <article key={clarification.id} className="request-clarification-entry"><p><strong>Вопрос деканата</strong><small>{formatRequestDateTime(clarification.requestedAt)}</small>{clarification.question}</p>{clarification.answer ? <p><strong>Ваш ответ</strong><small>{clarification.answeredAt ? formatRequestDateTime(clarification.answeredAt) : ""}</small>{clarification.answer}</p> : request.state === "CLARIFICATION_REQUESTED" ? <ClarificationAnswerForm requestId={request.id} clarificationId={clarification.id} /> : <p className="request-history-empty">Ожидается ответ студента.</p>}</article>)}</section> : null}
      {request.body ? <p className="request-details-body">{request.body}</p> : null}
      <h3>История статусов</h3>
      {request.history.length === 0 ? <p className="request-history-empty">История пока не заполнена.</p> : (
        <ol className="request-history-list">
          {request.history.map((entry, index) => (
            <li key={`${entry.createdAt}-${index}`}>
              <span className="request-history-dot" aria-hidden="true" />
              <div><strong>{requestStateLabel(entry.toState)}</strong><small>{formatRequestDateTime(entry.createdAt)}{entry.actorName ? ` · ${entry.actorName}` : ""}</small>{entry.reason ? <p>{entry.reason}</p> : null}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ClarificationAnswerForm({ requestId, clarificationId }: { requestId: string; clarificationId: string }) {
  const [state, action, pending] = useActionState(answerServiceClarificationAction, initialRequestWorkflowActionState);
  const refreshed = useRef(false);
  const router = useRouter();
  useEffect(() => {
    if (state.success && !refreshed.current) { refreshed.current = true; router.refresh(); }
  }, [router, state.success]);
  return <form action={action} className="request-answer-form"><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="clarificationId" value={clarificationId} /><label><span>Ваш ответ</span><textarea name="answer" required maxLength={8000} rows={4} placeholder="Напишите ответ деканату" /></label>{state.error ? <p className="request-form-error" role="alert">{state.error}</p> : null}{state.success ? <p className="request-inline-success" role="status">{state.success}</p> : null}<button className="requests-create-button" type="submit" disabled={pending}>{pending ? "Отправляем…" : "Отправить ответ"}</button></form>;
}

function RequestNotifications({ notifications }: { notifications: RequestNotificationView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section className="request-notifications" id="request-notifications" aria-labelledby="request-notifications-title"><div className="request-notifications-heading"><div><span className="profile-heading-kicker">ОБНОВЛЕНИЯ</span><h2 id="request-notifications-title">Уведомления по заявкам</h2></div><span>{notifications.filter((entry) => !entry.readAt).length} новых</span></div>{notifications.length ? <ul>{notifications.slice(0, 5).map((notification) => <li key={notification.deliveryId} className={!notification.readAt ? "is-unread" : ""}><span className="request-notification-mark" aria-hidden="true">•</span><div><strong>{notification.title}</strong><p>{notification.body}</p><small>{formatRequestDateTime(notification.createdAt)}</small><Link href={`/requests#request-${notification.sourceId}`}>Открыть заявку</Link></div>{!notification.readAt ? <button type="button" disabled={pending} onClick={() => startTransition(async () => { await markRequestNotificationReadAction(notification.deliveryId); router.refresh(); })}>Прочитано</button> : null}</li>)}</ul> : <p className="request-history-empty">Уведомлений по заявкам пока нет.</p>}</section>;
}

function formatRequestDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatRequestDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function pluralizeRequest(count: number): string {
  return new Intl.NumberFormat("ru-RU").format(count) + " " + (count === 1 ? "заявка" : count > 1 && count < 5 ? "заявки" : "заявок");
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
