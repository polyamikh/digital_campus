export const POSTGRES_SESSION_OPTIONS = "-c timezone=UTC";

export function createPrismaPgConfig(connectionString: string) {
  return {
    connectionString,
    options: POSTGRES_SESSION_OPTIONS,
  };
}
