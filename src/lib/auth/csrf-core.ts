export function isSameOriginRequest(
  origin: string | null,
  host: string | null,
  forwardedProtocol: string | null,
  production: boolean,
): boolean {
  const expectedHost = host?.split(",")[0]?.trim().toLowerCase();
  const protocol = forwardedProtocol?.split(",")[0]?.trim().toLowerCase();
  if (!origin || !expectedHost) return false;

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.pathname !== "/" || parsedOrigin.search || parsedOrigin.hash) return false;
    if (parsedOrigin.host.toLowerCase() !== expectedHost) return false;
    if (production && parsedOrigin.protocol !== "https:") return false;
    return !protocol || parsedOrigin.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
