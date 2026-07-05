import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TTSProvider } from "@/contexts/TTSContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import NavBar from "@/components/NavBar";
import { getUser, getDisplayName } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Podcast Insights",
  description: "Daily insights extracted from your podcasts",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const displayName = user ? await getDisplayName() : null;

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased min-h-screen" style={{ background: "var(--bg-page)", color: "var(--txt-1)" }}>
        <ThemeProvider>
          <TTSProvider>
            <NavBar
              userEmail={user?.email ?? null}
              displayName={displayName}
            />
            <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
          </TTSProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
