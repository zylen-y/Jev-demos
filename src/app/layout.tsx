import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Outfit } from "next/font/google";
import { KeyProvider } from "@/components/key-context";
import { SiteFooter, SiteHeader } from "@/components/header";
import "./globals.css";

const sans = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Jev Atlas", template: "%s · Jev Atlas" },
  description: "Live demos of every use case on the TypeSafe map. Bring your own Jev API key.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={`${sans.variable} ${serif.variable} ${mono.variable}`} lang="en">
      <body>
        <KeyProvider>
          <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:px-3 focus:py-2" href="#content">
            Skip to content
          </a>
          <SiteHeader />
          <div id="content">{children}</div>
          <SiteFooter />
        </KeyProvider>
      </body>
    </html>
  );
}
