"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateCredentials, type AuthenticatedAccount } from "@/lib/auth/credentials";
import { homePathForRole } from "@/lib/auth/role-routes";
import { createSession, logout, setSessionCookie } from "@/lib/auth/session";
import { isSameOriginRequest } from "@/lib/auth/csrf-core";
import type { LoginState } from "@/lib/auth/login-action-state";

const LOGIN_ERROR = "Не удалось войти. Проверьте логин и пароль.";
const ORIGIN_ERROR = "Запрос отклонён. Обновите страницу и попробуйте ещё раз.";

async function isSameOriginAction(): Promise<boolean> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  return isSameOriginRequest(
    requestHeaders.get("origin"),
    host,
    requestHeaders.get("x-forwarded-proto"),
    process.env.NODE_ENV === "production",
  );
}

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  if (!(await isSameOriginAction())) return { error: ORIGIN_ERROR };

  const login = formData.get("login");
  const password = formData.get("password");
  if (typeof login !== "string" || typeof password !== "string" || !login.trim() || !password) {
    return { error: LOGIN_ERROR };
  }

  let account: AuthenticatedAccount | null;
  try {
    account = await authenticateCredentials(login, password);
  } catch {
    return { error: "Сервис входа временно недоступен. Попробуйте позже." };
  }
  if (!account) return { error: LOGIN_ERROR };
  if (account.roles.length !== 1) {
    return { error: "Для этой учётной записи выбор роли пока недоступен. Обратитесь к администратору." };
  }

  const activeRole = account.roles[0];
  if (!activeRole) return { error: LOGIN_ERROR };
  try {
    const session = await createSession(account.id, activeRole);
    await setSessionCookie(session.token, session.expiresAt);
  } catch {
    return { error: "Сервис входа временно недоступен. Попробуйте позже." };
  }
  redirect(homePathForRole(activeRole));
}

export async function logoutAction(): Promise<void> {
  if (!(await isSameOriginAction())) throw new Error(ORIGIN_ERROR);
  await logout();
  redirect("/login");
}
