import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          TeddyBed
        </div>
        <p className="admin-auth-sub">Sign in to the Company OS.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
