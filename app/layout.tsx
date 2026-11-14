import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Before the Click — Rehearse agent decisions", template: "%s · Before the Click" },
  description: "Map proposed actions, review them in order, and test what happens in a sandbox.",
  metadataBase: new URL("https://before-the-click.vercel.app"),
  openGraph: {
    type: "website", siteName: "Before the Click",
    title: "Before the Click — Rehearse agent decisions",
    description: "Review agent plans and see what changes before anyone acts.",
    images: [{ url: "/architecture.webp", width: 1320, height: 880, alt: "Limestone and glass paths" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <a className="skip-link" href="#main-content">Skip to content</a>
    {children}
  </body></html>;
}
