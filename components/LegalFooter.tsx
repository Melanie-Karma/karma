import Link from "next/link";

export default function LegalFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-xl flex-wrap gap-5 px-5 py-8 text-sm text-muted">
      <span>© Karma</span>
      <Link href="/regeln" className="underline underline-offset-4">
        Regeln
      </Link>
      <Link href="/nutzungsbedingungen" className="underline underline-offset-4">
        Nutzungsbedingungen
      </Link>
      <Link href="/impressum" className="underline underline-offset-4">
        Impressum
      </Link>
      <Link href="/datenschutz" className="underline underline-offset-4">
        Datenschutz
      </Link>
    </footer>
  );
}
