import { randomBytes, scrypt } from "node:crypto";

export const PASSWORD_RESET_APPROVAL = "I_CONFIRM_DEMO_PASSWORD_RESET";

export const DEMO_PASSWORDS = [
  ["sokolova.a_student", "DEMO_PASSWORD_SOKOLOVA_A"],
  ["belova.s_student", "DEMO_PASSWORD_BELOVA_S"],
  ["volkova.m_teacher", "DEMO_PASSWORD_VOLKOVA_M"],
  ["orlova.e_dean", "DEMO_PASSWORD_ORLOVA_E"],
] as const;

export type DemoLogin = (typeof DEMO_PASSWORDS)[number][0];
export type DemoPasswordMap = Record<DemoLogin, string>;
export type DatabaseTarget = { host: string; database: string };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase().replace(/^\[|\]$/g, ""));
}

export function validateLocalDatabaseUrl(connectionString: string | undefined): DatabaseTarget {
  if (!connectionString) throw new Error("DATABASE_URL не задан.");

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL имеет некорректный формат.");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Разрешено подключение только к локальной PostgreSQL.");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!isLoopback(host)) throw new Error("Разрешено подключение только к PostgreSQL на loopback-адресе.");

  for (const parameter of ["host", "hostaddr"]) {
    const values = parsed.searchParams.getAll(parameter);
    if (values.length > 1 || values.some((value) => !isLoopback(value))) {
      throw new Error("Параметры DATABASE_URL не должны перенаправлять подключение на удалённый хост.");
    }
  }

  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new Error("Не удалось проверить имя базы данных.");
  }
  if (database !== "digital_campus") {
    throw new Error("Операция разрешена только для локальной базы digital_campus.");
  }

  return { host, database };
}

export function collectDemoPasswords(environment: Readonly<Record<string, string | undefined>>): DemoPasswordMap {
  if (environment.DIGITAL_CAMPUS_PASSWORD_RESET_APPROVED !== PASSWORD_RESET_APPROVAL) {
    throw new Error("Для запуска задайте DIGITAL_CAMPUS_PASSWORD_RESET_APPROVED=I_CONFIRM_DEMO_PASSWORD_RESET.");
  }

  const result = {} as DemoPasswordMap;
  for (const [login, variableName] of DEMO_PASSWORDS) {
    const password = environment[variableName];
    if (!password || password.length < 14) {
      throw new Error(`${variableName} должна содержать пароль длиной не менее 14 символов.`);
    }
    result[login] = password;
  }
  return result;
}

export function hashDemoPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`scrypt$32768$8$1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`);
    });
  });
}
