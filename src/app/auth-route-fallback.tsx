export default function AuthRouteFallback({ message = "Проверяем сессию…" }: { message?: string }) {
  return (
    <main className="auth-route-fallback" aria-busy="true">
      <div className="auth-route-fallback-indicator" aria-hidden="true"><span /></div>
      <p role="status" aria-live="polite">{message}</p>
    </main>
  );
}
