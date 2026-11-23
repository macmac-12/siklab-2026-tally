import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import ThemeProvider, { ThemeScript } from "@/components/shared/ThemeProvider";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./theme.css";
import "./globals.css";
import "./public.css";
import "./staff.css";
import "./ui.css";
export const metadata: Metadata = {
  title: "SIKLAB 2026 · Official Tally",
  description: "Official CSPC Intramurals score tally",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
