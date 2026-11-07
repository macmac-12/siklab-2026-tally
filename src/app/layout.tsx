import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SIKLAB 2026 · Official Tally", description: "Official CSPC Intramurals score tally" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
