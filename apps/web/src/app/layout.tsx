import type { Metadata } from "next";
import { Black_Han_Sans, Gothic_A1 } from "next/font/google";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SourceBanner } from "@/components/source-banner";
import "./globals.css";

const display = Black_Han_Sans({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-black-han-sans",
  display: "swap",
});

const sans = Gothic_A1({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-gothic-a1",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Manix", template: "%s | Manix" },
  description: "Read manhwa fast. Chapters come from MangaDex, credited to the groups who translate them.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <AuthProvider>
          <SiteHeader />
          <SourceBanner />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
