import { useState, type FormEvent } from "react";
import { loginWithEmail } from "../api/authApi";
import { saveToken } from "../auth/authStore";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      const result = await loginWithEmail({ email, password });
      saveToken(result.token);
      window.location.reload();
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <main>
      <h1>AssetFlow Login</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={8}
            required
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
