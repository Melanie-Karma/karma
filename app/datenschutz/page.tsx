import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";
import LegalText from "@/components/LegalText";
import { DATENSCHUTZ } from "@/lib/legal/datenschutz";

export const metadata = { title: "Datenschutz · Karma" };

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-xl px-5 py-10">
        <Link href="/" className="text-sm underline underline-offset-4">
          Zurück
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold">Datenschutz bei Karma</h1>
        <LegalText text={DATENSCHUTZ} />
      </main>
      <LegalFooter />
    </>
  );
}
