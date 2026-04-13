import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Knowledge Nebula",
  description: "Your personal AI-powered knowledge universe",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="nebula-bg min-h-screen flex flex-col text-slate-200">
        <Nav />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
          {children}
        </main>
      </body>
    </html>
  );
}
