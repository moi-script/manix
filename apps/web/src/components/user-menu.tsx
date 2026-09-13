"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  if (loading) return <span aria-hidden className="inline-block w-24" />;

  if (!user) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <Link href="/login" className="text-dusk hover:text-paper">
          Log in
        </Link>
        <Link href="/register" className="rounded-sm bg-marker px-3 py-1.5 font-medium text-ink">
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="hidden text-paper sm:inline">{user.username}</span>
      <button
        type="button"
        onClick={async () => {
          await logout();
          router.refresh();
        }}
        className="text-dusk hover:text-paper"
      >
        Log out
      </button>
    </div>
  );
}
