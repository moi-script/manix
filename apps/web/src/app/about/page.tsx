import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

const link = "text-marker underline underline-offset-2";

export default function AboutPage() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 leading-relaxed">
      <h1 className="font-display text-5xl leading-none">About Manix</h1>
      <p className="mt-6">
        Manix is a fast, ad-free reader for manhwa. It doesn&apos;t host chapters itself. Titles, covers, and pages come from{" "}
        <a href="https://mangadex.org" target="_blank" rel="noreferrer" className={link}>
          MangaDex
        </a>{" "}
        through its public API, and every chapter credits the scanlation group that translated it.
      </p>

      <h2 className="mt-10 font-display text-2xl">Why pages load quickly</h2>
      <p className="mt-3">
        Manix keeps a copy of title details and recently read pages on its own server, and loads the next pages of a chapter before you reach
        them.
      </p>

      <h2 className="mt-10 font-display text-2xl">Support the translators</h2>
      <p className="mt-3">
        Scanlation groups translate these chapters for free. If you enjoy a series, follow its group on MangaDex, and buy the official release
        when one exists.
      </p>

      <h2 className="mt-10 font-display text-2xl">Removal requests</h2>
      <p className="mt-3">
        If you lead a scanlation group or hold the rights to a work and want it removed from Manix,{" "}
        {contact ? (
          <>
            email{" "}
            <a href={`mailto:${contact}`} className={link}>
              {contact}
            </a>{" "}
            with the group or title name.
          </>
        ) : (
          <>contact the operator of this site with the group or title name.</>
        )}{" "}
        Once a group is removed, its chapters stop appearing and stop loading.
      </p>
    </div>
  );
}
