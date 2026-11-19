"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/actions/auth";
import type { LoginState } from "@/lib/auth/login-action-state";

const initialState: LoginState = { error: null };
const cabinets = [
  { role: "STUDENT", label: "Студент", title: "Кабинет студента" },
  { role: "TEACHER", label: "Преподаватель", title: "Кабинет преподавателя" },
  { role: "DEAN", label: "Деканат", title: "Кабинет сотрудника деканата" },
] as const;

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [selectedCabinet, setSelectedCabinet] = useState<(typeof cabinets)[number]["role"]>("STUDENT");
  const cabinet = cabinets.find((item) => item.role === selectedCabinet) ?? cabinets[0];

  return (
    <>
      <div className="login-role-switch" role="group" aria-label="Вариант кабинета">
        {cabinets.map((item) => (
          <button
            key={item.role}
            className={`login-role-option${selectedCabinet === item.role ? " is-selected" : ""}`}
            type="button"
            aria-pressed={selectedCabinet === item.role}
            disabled={pending}
            onClick={() => setSelectedCabinet(item.role)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <h1 className="login-role-heading" id="login-title">{cabinet.title}</h1>
      <p className="login-intro">Продолжите работу в своём университетском кабинете.</p>

      <form className="login-form" action={formAction}>
        <div className="login-field">
          <label htmlFor="login">Логин</label>
          <input
            id="login"
            name="login"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={190}
            aria-describedby={state.error ? "login-error" : undefined}
          />
        </div>

        <div className="login-field">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            aria-describedby={state.error ? "login-error" : undefined}
          />
        </div>

        {state.error ? <p className="login-error" id="login-error" role="alert">{state.error}</p> : null}

        <button className="login-submit" type="submit" disabled={pending}>
          {pending ? <><span className="login-spinner" aria-hidden="true" />Входим…</> : "Войти"}
        </button>
        <p className="login-footnote">Доступ предоставляется университетом. Публичной регистрации нет. Кабинет после входа определяется назначенной аккаунту ролью.</p>
      </form>
    </>
  );
}
