import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_PASSWORDS, collectDemoPasswords, hashDemoPassword, validateLocalDatabaseUrl, type DemoLogin } from "../src/lib/auth/demo-password-reset-core";

async function resetDemoPasswords(): Promise<void> {
  const database = validateLocalDatabaseUrl(process.env.DATABASE_URL);
  const passwords = collectDemoPasswords(process.env);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL не задан.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const logins = DEMO_PASSWORDS.map(([login]) => login);
    const users = await prisma.user.findMany({
      where: { login: { in: logins } },
      select: { id: true, login: true },
    });
    const userByLogin = new Map(users.map((user) => [user.login, user]));
    const missingLogin = logins.find((login) => !userByLogin.has(login));
    if (missingLogin) throw new Error(`Не найден обязательный демоаккаунт ${missingLogin}; изменений не выполнено.`);

    const passwordHashes = new Map<DemoLogin, string>();
    for (const [login] of DEMO_PASSWORDS) {
      const password = passwords[login];
      passwordHashes.set(login, await hashDemoPassword(password));
    }

    const revokedAt = new Date();
    const revokedSessions = await prisma.$transaction(async (tx) => {
      const currentUsers = await tx.user.findMany({
        where: { login: { in: logins } },
        select: { id: true, login: true },
      });
      const currentUserByLogin = new Map(currentUsers.map((user) => [user.login, user]));
      const missingInTransaction = logins.find((login) => !currentUserByLogin.has(login));
      if (missingInTransaction || currentUserByLogin.size !== logins.length) {
        throw new Error("Список демоаккаунтов изменился во время проверки; транзакция отменена.");
      }

      for (const [login] of DEMO_PASSWORDS) {
        const user = currentUserByLogin.get(login);
        const passwordHash = passwordHashes.get(login);
        if (!user || !passwordHash) throw new Error("Проверка демоаккаунтов не пройдена; транзакция отменена.");

        // Raw SQL avoids Prisma's @updatedAt side effect; this changes only passwordHash.
        const updated = await tx.$executeRaw`UPDATE "User" SET "passwordHash" = ${passwordHash} WHERE "id" = ${user.id} AND "login" = ${login}`;
        if (updated !== 1) throw new Error("Не удалось обновить ровно один аккаунт; транзакция отменена.");
      }

      const userIds = currentUsers.map((user) => user.id);
      const revoked = await tx.session.updateMany({
        where: { userId: { in: userIds }, revokedAt: null, expiresAt: { gt: revokedAt } },
        data: { revokedAt },
      });
      return revoked.count;
    });

    console.log(`Пароли четырёх демоаккаунтов обновлены в локальной базе ${database.database}; активных сессий отозвано: ${revokedSessions}.`);
  } finally {
    await prisma.$disconnect();
  }
}

resetDemoPasswords().catch((error: unknown) => {
  const safeMessage = error instanceof Error && /^(DATABASE_URL|Разрешено|Операция|Не удалось|Для запуска|DEMO_PASSWORD_|Не найден обязательный демоаккаунт|Список демоаккаунтов|Проверка демоаккаунтов|Не удалось обновить)/.test(error.message)
    ? error.message
    : "Обновление отменено из-за ошибки. Пароли, хеши и строка подключения не выводились.";
  console.error(safeMessage);
  process.exitCode = 1;
});
