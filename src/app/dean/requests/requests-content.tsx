"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ServiceRequestCategory, ServiceRequestState, type ServiceRequestCategory as RequestCategory, type ServiceRequestState as RequestState } from "@/generated/prisma/enums";
import { markRequestNotificationReadAction, requestWorkflowAction } from "@/app/actions/service-requests";
import { initialRequestWorkflowActionState } from "@/lib/requests/request-action-state";
import { REQUEST_CATEGORY_LABELS, REQUEST_STATE_LABELS, type RequestNotificationView } from "@/lib/requests/requests-view-core";

export type DeanRequestView = {
  id: string;
  studentId: string;
  assignedToId: string | null;
  category: RequestCategory;
  state: RequestState;
  title: string;
  body: string;
  submittedAt: string;
  deadlineAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  version: number;
  studentName: string;
  studentLogin: string;
  groupCode: string;
  assignedName: string | null;
  history: Array<{ fromState: RequestState | null; toState: RequestState; reason: string | null; createdAt: string; actorName: string }>;
  clarifications: Array<{ id: string; question: string; answer: string | null; requestedAt: string; answeredAt: string | null; requesterName: string }>;
  documents: Array<{ id: string; fileName: string; byteSize: string; issuedAt: string | null }>;
};

type AssignmentOption = { id: string; label: string };
type DeadlineFilter = "ALL" | "OVERDUE" | "SOON";

export default function DeanRequestsContent({ requests, assignments, notifications, evaluatedAt }: { requests: DeanRequestView[]; assignments: AssignmentOption[]; notifications: RequestNotificationView[]; evaluatedAt: string }) {
  const now = new Date(evaluatedAt).getTime();
  const [category, setCategory] = useState<RequestCategory | "ALL">("ALL");
  const [state, setState] = useState<RequestState | "ALL">("ALL");
  const [deadline, setDeadline] = useState<DeadlineFilter>("ALL");
  const visible = requests.filter((request) => {
    if (category !== "ALL" && request.category !== category) return false;
    if (state !== "ALL" && request.state !== state) return false;
    if (deadline === "ALL") return true;
    if (!request.deadlineAt || isFinished(request.state) || request.state === ServiceRequestState.CLARIFICATION_REQUESTED) return false;
    const remaining = new Date(request.deadlineAt).getTime() - now;
    return deadline === "OVERDUE" ? remaining < 0 : remaining >= 0 && remaining <= 3 * 86_400_000;
  });
  const active = requests.filter((request) => !isFinished(request.state)).length;
  const overdue = requests.filter((request) => request.deadlineAt && !isFinished(request.state) && request.state !== ServiceRequestState.CLARIFICATION_REQUESTED && new Date(request.deadlineAt).getTime() < now).length;

  return <div className="dean-request-workspace">
    <div className="dean-request-summary"><Summary label="Активные" value={active} /><Summary label="Просрочены" value={overdue} tone="danger" /><Summary label="Всего" value={requests.length} tone="violet" /></div>
    <NotificationPanel notifications={notifications} />
    <section className="dean-request-queue" aria-labelledby="dean-request-queue-title">
      <div className="dean-request-queue-heading"><div><span className="profile-heading-kicker">ОЧЕРЕДЬ ДЕКАНАТА</span><h2 id="dean-request-queue-title">Поступившие заявки</h2></div><span>{visible.length} из {requests.length}</span></div>
      <div className="dean-request-filters">
        <label><span>Категория</span><select value={category} onChange={(event) => setCategory(event.target.value as RequestCategory | "ALL")}><option value="ALL">Все категории</option>{Object.entries(REQUEST_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Статус</span><select value={state} onChange={(event) => setState(event.target.value as RequestState | "ALL")}><option value="ALL">Все статусы</option>{Object.entries(REQUEST_STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Срок</span><select value={deadline} onChange={(event) => setDeadline(event.target.value as DeadlineFilter)}><option value="ALL">Любой срок</option><option value="OVERDUE">Просроченные</option><option value="SOON">До 3 дней</option></select></label>
      </div>
      {requests.length === 0 ? <div className="dean-request-empty" role="status"><strong>Новых заявок пока нет</strong><p>Заявки студентов появятся здесь после отправки.</p></div>
        : visible.length === 0 ? <div className="dean-request-empty" role="status"><strong>Нет заявок по выбранным фильтрам</strong></div>
          : <div className="dean-request-list">{visible.map((request) => <DeanRequestCard key={request.id} request={request} assignments={assignments} now={now} />)}</div>}
    </section>
  </div>;
}

function Summary({ label, value, tone = "cyan" }: { label: string; value: number; tone?: "cyan" | "danger" | "violet" }) {
  return <article className={`dean-request-summary-card tone-${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function DeanRequestCard({ request, assignments, now }: { request: DeanRequestView; assignments: AssignmentOption[]; now: number }) {
  const [state, action, pending] = useActionState(requestWorkflowAction, initialRequestWorkflowActionState);
  const refreshed = useRef<string | null>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  useEffect(() => {
    if (state.success && refreshed.current !== `${state.requestId}:${state.success}`) {
      refreshed.current = `${state.requestId}:${state.success}`;
      router.refresh();
    }
  }, [router, state.requestId, state.success]);

  async function uploadDocument(formData: FormData) {
    setUploadError(null);
    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) { setUploadError("Выберите PDF-документ."); return; }
    setUploading(true);
    try {
      const response = await fetch(`/api/dean/requests/${request.id}/documents`, { method: "POST", body: formData, cache: "no-store" });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setUploadError(result.error ?? "Не удалось приложить документ."); return; }
      router.refresh();
    } catch {
      setUploadError("Не удалось подключиться к серверу.");
    } finally {
      setUploading(false);
    }
  }

  const canAct = !isFinished(request.state) && request.state !== ServiceRequestState.CLARIFICATION_REQUESTED;
  const canAsk = request.state === ServiceRequestState.SUBMITTED || request.state === ServiceRequestState.IN_REVIEW;
  const canUpload = isCertificate(request.category) && (request.state === ServiceRequestState.IN_REVIEW || request.state === ServiceRequestState.READY_FOR_ISSUE);

  return <details id={`dean-request-${request.id}`} className={`dean-request-card${request.deadlineAt && !isFinished(request.state) && request.state !== ServiceRequestState.CLARIFICATION_REQUESTED && new Date(request.deadlineAt).getTime() < now ? " is-overdue" : ""}`}>
    <summary>
      <span className="dean-request-card-main"><span className="dean-request-category">{REQUEST_CATEGORY_LABELS[request.category]}</span><strong>{request.title}</strong><small>{request.studentName} · {request.groupCode} · {formatDate(request.submittedAt)}</small></span>
      <span className="dean-request-card-meta"><span className={`dean-request-status state-${request.state.toLowerCase()}`}>{REQUEST_STATE_LABELS[request.state]}</span><small>{request.state === ServiceRequestState.CLARIFICATION_REQUESTED ? "SLA приостановлен" : request.deadlineAt ? `Срок · ${formatDate(request.deadlineAt)}` : "Срок не рассчитан"}</small></span>
    </summary>
    <div className="dean-request-details">
      <section className="dean-request-student"><div><span className="profile-heading-kicker">СТУДЕНТ</span><strong>{request.studentName}</strong><small>{request.studentLogin} · {request.groupCode}</small></div><div><span className="profile-heading-kicker">ОТВЕТСТВЕННЫЙ</span><strong>{request.assignedName ?? "Не назначен"}</strong></div><div><span className="profile-heading-kicker">ПОДАНА</span><strong>{formatDateTime(request.submittedAt)}</strong></div></section>
      <p className="dean-request-body">{request.body}</p>
      {request.rejectionReason ? <p className="request-rejection-reason"><strong>Причина отклонения:</strong> {request.rejectionReason}</p> : null}
      <section className="dean-request-subsection"><h3>Уточнения</h3>{request.clarifications.length ? request.clarifications.map((clarification) => <article className="dean-clarification" key={clarification.id}><p><strong>Вопрос · {clarification.requesterName}</strong><small>{formatDateTime(clarification.requestedAt)}</small>{clarification.question}</p>{clarification.answer ? <p><strong>Ответ студента</strong><small>{clarification.answeredAt ? formatDateTime(clarification.answeredAt) : ""}</small>{clarification.answer}</p> : <p className="request-history-empty">Ожидается ответ студента.</p>}</article>) : <p className="request-history-empty">Уточнений пока нет.</p>}</section>
      {request.documents.length ? <section className="dean-request-subsection"><h3>Приложенные документы</h3>{request.documents.map((document) => <a className="request-document-link" href={`/api/requests/documents/${document.id}`} key={document.id}><span aria-hidden="true">PDF</span><span><strong>{document.fileName}</strong><small>{formatBytes(Number(document.byteSize))}</small></span><span aria-hidden="true">↓</span></a>)}</section> : null}
      <section className="dean-request-subsection"><h3>История действий</h3>{request.history.length ? <ol className="request-history-list">{request.history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}><span className="request-history-dot" aria-hidden="true"/><div><strong>{entry.fromState === entry.toState ? entry.reason ?? "Данные заявки обновлены" : REQUEST_STATE_LABELS[entry.toState]}</strong><small>{formatDateTime(entry.createdAt)} · {entry.actorName}</small>{entry.fromState !== entry.toState && entry.reason ? <p>{entry.reason}</p> : null}</div></li>)}</ol> : <p className="request-history-empty">История пока пуста.</p>}</section>
      <section className="dean-request-actions"><h3>Обработка</h3>
        <form action={action} className="dean-assignment-form"><HiddenRequest request={request} intent="assign"/><label><span>Ответственный сотрудник деканата</span><select name="assignedToId" defaultValue={request.assignedToId ?? ""}><option value="">Не назначен</option>{assignments.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}</select></label><button type="submit" disabled={pending}>Назначить</button></form>
        {state.error ? <p className="request-form-error" role="alert">{state.error}</p> : null}{state.success ? <p className="request-inline-success" role="status">{state.success}</p> : null}
        {canAct ? <div className="dean-action-grid">
          {request.state === ServiceRequestState.SUBMITTED ? <StateActionForm action={action} request={request} nextState={ServiceRequestState.IN_REVIEW} label="Взять в обработку" pending={pending}/> : null}
          {canAsk ? <form action={action} className="dean-action-form"><HiddenRequest request={request} intent="clarification"/><label><span>Вопрос студенту</span><textarea name="question" rows={3} required maxLength={8000} placeholder="Что нужно уточнить для обработки заявки?"/></label><button className="request-outline-button" type="submit" disabled={pending}>Запросить уточнение</button></form> : null}
          {request.state === ServiceRequestState.IN_REVIEW && isCertificate(request.category) ? <StateActionForm action={action} request={request} nextState={ServiceRequestState.READY_FOR_ISSUE} label="Готово к выдаче" pending={pending}/> : null}
          {canFinishText(request.category) ? <form action={action} className="dean-action-form"><HiddenRequest request={request} intent="state"/><input type="hidden" name="nextState" value={ServiceRequestState.COMPLETED}/><label><span>Решение для студента</span><textarea name="reason" rows={3} required maxLength={8000} placeholder="Напишите итог обработки заявки"/></label><button type="submit" disabled={pending}>Завершить заявку</button></form> : null}
          {canUpload ? <form className="dean-action-form dean-document-upload" onSubmit={(event) => { event.preventDefault(); void uploadDocument(new FormData(event.currentTarget)); }}><label><span>Готовый PDF-документ (до 10 МБ)</span><input name="document" type="file" accept="application/pdf,.pdf" required/></label>{uploadError ? <p className="request-form-error" role="alert">{uploadError}</p> : null}<button type="submit" disabled={uploading}>{uploading ? "Загружаем…" : "Приложить и завершить"}</button></form> : null}
          <form action={action} className="dean-action-form"><HiddenRequest request={request} intent="state"/><input type="hidden" name="nextState" value={ServiceRequestState.REJECTED}/><label><span>Причина отклонения</span><textarea name="reason" rows={2} required maxLength={8000} placeholder="Обязательная причина отказа"/></label><button className="request-danger-button" type="submit" disabled={pending}>Отклонить заявку</button></form>
        </div> : <p className="request-history-empty">Действия недоступны для текущего статуса.</p>}
      </section>
    </div>
  </details>;
}

function HiddenRequest({ request, intent }: { request: DeanRequestView; intent: string }) {
  return <><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="version" value={request.version}/><input type="hidden" name="intent" value={intent}/></>;
}

function StateActionForm({ action, request, nextState, label, pending }: { action: (formData: FormData) => void; request: DeanRequestView; nextState: RequestState; label: string; pending: boolean }) {
  return <form action={action} className="dean-action-form dean-state-action"><HiddenRequest request={request} intent="state"/><input type="hidden" name="nextState" value={nextState}/><button type="submit" disabled={pending}>{label}</button></form>;
}

function NotificationPanel({ notifications }: { notifications: RequestNotificationView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section className="dean-request-notifications" id="dean-request-notifications" aria-labelledby="dean-notifications-title"><div className="dean-request-queue-heading"><div><span className="profile-heading-kicker">ВХОДЯЩИЕ СОБЫТИЯ</span><h2 id="dean-notifications-title">Уведомления по заявкам</h2></div><span>{notifications.filter((item) => !item.readAt).length} новых</span></div>{notifications.length ? <ul>{notifications.slice(0, 5).map((notification) => <li className={!notification.readAt ? "is-unread" : ""} key={notification.deliveryId}><span aria-hidden="true">•</span><div><strong>{notification.title}</strong><p>{notification.body}</p><small>{formatDateTime(notification.createdAt)}</small><a href={`#dean-request-${notification.sourceId}`}>Открыть заявку</a></div>{!notification.readAt ? <button type="button" disabled={pending} onClick={() => startTransition(async () => { await markRequestNotificationReadAction(notification.deliveryId); router.refresh(); })}>Прочитано</button> : null}</li>)}</ul> : <p className="request-history-empty">Новых уведомлений по заявкам нет.</p>}</section>;
}

function isFinished(state: RequestState): boolean { const finished: readonly RequestState[] = [ServiceRequestState.COMPLETED, ServiceRequestState.REJECTED, ServiceRequestState.CANCELLED]; return finished.includes(state); }
function isCertificate(category: RequestCategory): boolean { const certificates: readonly RequestCategory[] = [ServiceRequestCategory.STUDY_CERTIFICATE, ServiceRequestCategory.STUDY_PERIOD_CERTIFICATE, ServiceRequestCategory.GRADE_TRANSCRIPT]; return certificates.includes(category); }
function canFinishText(category: RequestCategory): boolean { return !isCertificate(category); }
function formatDate(value: string): string { return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
function formatDateTime(value: string): string { return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatBytes(bytes: number): string { return `${Math.max(1, Math.round(bytes / 1024))} КБ`; }
