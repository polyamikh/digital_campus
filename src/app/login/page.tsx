import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/role-routes";
import AuthRouteFallback from "@/app/auth-route-fallback";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthRouteFallback message="Проверяем статус входа…" />}>
      <LoginContent />
    </Suspense>
  );
}

async function LoginContent() {
  const user = await currentUser();
  if (user) redirect(homePathForRole(user.activeRole));

  return (
    <main className="login-page">
      <div className="login-city-glow login-city-glow-cyan" aria-hidden="true" />
      <div className="login-city-glow login-city-glow-pink" aria-hidden="true" />
      <div className="login-grid-overlay" aria-hidden="true" />

      <a className="login-brand" href="/login" aria-label="Digital Campus">
        <span className="login-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <span>DIGITAL<br />CAMPUS<small>УНИВЕРСИТЕТСКАЯ ПЛАТФОРМА</small></span>
      </a>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel-kicker"><span /> CAMPUS ACCESS <span /></div>
        <LoginForm />
      </section>

      <div className="login-cityline" aria-hidden="true">
        <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
        <span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      <footer className="login-footer"><span> DIGITAL CAMPUS</span><i /> КОНКУРСНЫЙ КОНЦЕПТ · ELECTRIC BLUE CITY</footer>
    </main>
  );
}
