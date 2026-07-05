import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Podcast Insights",
  description: "Daily insights extracted from your podcasts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="antialiased bg-[#0a0d14] text-slate-100 min-h-screen">
        <nav className="border-b border-slate-800 bg-[#0d1117] sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold hover:text-white transition-colors">
              <span className="text-lg">🎙</span>
              <span>Podcast Insights</span>
            </Link>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <Link href="/"         className="hover:text-slate-100 transition-colors">Dashboard</Link>
              <Link href="/podcasts" className="hover:text-slate-100 transition-colors">My Podcasts</Link>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
