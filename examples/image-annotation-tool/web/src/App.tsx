import { FormEvent, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Role, getRole, login, logout } from "./api/client";
import { AdminUploadPage } from "./pages/AdminUploadPage";
import { AnnotatePage } from "./pages/AnnotatePage";
import { ReviewQueuePage } from "./pages/ReviewQueuePage";

// Each role has exactly one page.
const HOME: Record<Role, string> = {
  admin: "/admin",
  annotator: "/annotate",
  reviewer: "/review",
};

export function App() {
  const [role, setRole] = useState<Role | null>(getRole());

  if (role === null) {
    return <LoginForm onLogin={setRole} />;
  }

  return (
    <>
      <header>
        Image Annotation Tool - signed in as {role}{" "}
        <button onClick={() => { logout(); setRole(null); }}>Sign out</button>
      </header>
      <Routes>
        {role === "annotator" && <Route path="/annotate" element={<AnnotatePage />} />}
        {role === "reviewer" && <Route path="/review" element={<ReviewQueuePage />} />}
        {role === "admin" && <Route path="/admin" element={<AdminUploadPage />} />}
        <Route path="*" element={<Navigate to={HOME[role]} replace />} />
      </Routes>
    </>
  );
}

function LoginForm({ onLogin }: { onLogin: (role: Role) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onLogin(await login(email, password));
    } catch {
      setError("Invalid email or password");
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Sign in</h1>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Sign in</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
