import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";
import { RULES } from "@/lib/rules";

export const metadata = { title: "Regeln · Karma" };

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-xl px-5 py-10">
        <Link href="/" className="text-sm underline underline-offset-4">
          Zurück
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold">So helfen wir uns</h1>
        <ol className="mt-6 space-y-4">
          {RULES.map((r, i) => (
            <li key={r.title} className="rounded-3xl bg-white p-5">
              <p className="font-extrabold">
                {i + 1}. {r.title}
              </p>
              <p className="mt-1 text-muted">{r.text}</p>
            </li>
          ))}
        </ol>
      </main>
      <LegalFooter />
    </>
  );
}
