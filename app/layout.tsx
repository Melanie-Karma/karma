import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Karma · Nachbarn helfen Nachbarn",
  description:
    "Nachbarschaftshilfe per Swipe: Hilfe anfragen, in der Nähe helfen, Karma sammeln. Ohne Geld, ohne Tratsch.",
  appleWebApp: { capable: true, title: "Karma", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f6f4ec",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
