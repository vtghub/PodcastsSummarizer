import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TTSProvider } from "@/contexts/TTSContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import NavBar from "@/components/NavBar";
import MobileNav from "@/components/MobileNav";
import { getUser, getDisplayName, getUserId } from "@/lib/auth";
import { getNewInsightCount } from "@/lib/analytics";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Podcast Insights",
  description: "Daily insights extracted from your podcasts",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const userId = user ? await getUserId() : null;
  const [displayName, newInsightCount] = await Promise.all([
    user ? getDisplayName() : Promise.resolve(null),
    userId ? getNewInsightCount(userId) : Promise.resolve(0),
  ]);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased min-h-screen" style={{ background: "var(--bg-page)", color: "var(--txt-1)" }}>
        <ThemeProvider>
          <TTSProvider>
            <NavBar
              userEmail={user?.email ?? null}
              displayName={displayName}
              newInsightCount={newInsightCount}
            />
            <main className="max-w-6xl mx-auto px-6 py-8 pb-20 sm:pb-8">{children}</main>
            <MobileNav newInsightCount={newInsightCount} />
          </TTSProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
