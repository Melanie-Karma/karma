import Link from "next/link";

export const metadata = { title: "Impressum · Karma" };

export default function Page() {
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <Link href="/" className="text-sm underline underline-offset-4">
        Zurück
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold">Impressum</h1>
      {/* TODO vor dem Livegang: echten Text einsetzen. Ohne Impressum und
          Datenschutzerklärung darf die Seite in Deutschland nicht online gehen. */}
      <p className="mt-4 rounded-2xl bg-lime/40 p-4">
        Platzhalter. Dieser Text muss vor dem Start ersetzt werden.
      </p>
    </main>
  );
}
