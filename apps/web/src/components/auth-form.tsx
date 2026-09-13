"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { friendlyAuthError } from "@/lib/auth-errors";
import { safeNext } from "@/lib/navigation";

const field = "mt-1 w-full rounded-sm border border-rule bg-gutter px-3 py-2 text-paper";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    setPending(true);
    setError(null);
    try {
      if (isLogin) await login(email, password);
      else await register(email, String(data.get("username") ?? ""), password);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? friendlyAuthError(err)
          : "Manix couldn't reach its server. Check your connection and try again.",
      );
      setPending(false);
    }
  }

  const nextQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="text-sm text-dusk">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className={field} />
      </div>

      {!isLogin && (
        <div>
          <label htmlFor="username" className="text-sm text-dusk">
            Username
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]{3,24}"
            aria-describedby="username-hint"
            className={field}
          />
          <p id="username-hint" className="mt-1 text-xs text-dusk">
            3 to 24 letters, numbers, or underscores.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="password" className="text-sm text-dusk">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
          minLength={isLogin ? 1 : 8}
          maxLength={128}
          aria-describedby={isLogin ? undefined : "password-hint"}
          className={field}
        />
        {!isLogin && (
          <p id="password-hint" className="mt-1 text-xs text-dusk">
            At least 8 characters.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-sm bg-marker px-4 py-2.5 font-medium text-ink disabled:opacity-60"
      >
        {pending ? (isLogin ? "Logging in" : "Creating account") : isLogin ? "Log in" : "Create account"}
      </button>

      <p className="text-sm text-dusk">
        {isLogin ? "New to Manix? " : "Already have an account? "}
        <Link href={`${isLogin ? "/register" : "/login"}${nextQuery}`} className="text-paper underline underline-offset-2">
          {isLogin ? "Create an account" : "Log in instead"}
        </Link>
      </p>
    </form>
  );
}
