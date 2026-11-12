import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Karma · Schalte deinen Kiez frei",
  description:
    "Schnelle Nachbarschaftshilfe per Swipe. Hilf mit, deinen Campus oder Kiez freizuschalten.",
};

export const viewport: Viewport = {
  themeColor: "#0F3D2E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <div className="flex-1">{children}</div>
        <footer className="mx-auto flex w-full max-w-xl gap-5 px-5 py-8 text-sm text-muted">
          <span>© Karma</span>
          <Link href="/impressum" className="underline underline-offset-4">
            Impressum
          </Link>
          <Link href="/datenschutz" className="underline underline-offset-4">
            Datenschutz
          </Link>
        </footer>
      </body>
    </html>
  );
}
