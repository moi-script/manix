import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-4xl">Create an account</h1>
      <p className="mt-2 text-dusk">Save titles to your library and continue reading on any device.</p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </div>
  );
}
