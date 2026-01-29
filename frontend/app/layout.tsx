import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jimaku Analyzer",
  description:
    "Browse Anime statistics and vocabulary derived from subtitle files.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.className} min-h-screen flex flex-col`}>
        {/* Persistent Navbar */}
        <Navbar />

        <Toaster position="bottom-right" />

        {/* Main Content (Grows to fill space) */}
        <main className="grow">{children}</main>

        {/* Persistent Footer */}
        <Footer />
      </body>
    </html>
  );
}
