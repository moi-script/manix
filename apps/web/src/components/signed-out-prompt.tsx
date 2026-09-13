import Link from "next/link";

export function SignedOutPrompt({ message, next }: { message: string; next: string }) {
  return (
    <p className="text-dusk">
      {message}{" "}
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-paper underline underline-offset-2">
        Log in
      </Link>
    </p>
  );
}
