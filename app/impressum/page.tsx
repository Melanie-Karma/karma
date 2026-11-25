import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";
import LegalText from "@/components/LegalText";
import { IMPRESSUM } from "@/lib/legal/impressum";

export const metadata = { title: "Impressum · Karma" };

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-xl px-5 py-10">
        <Link href="/" className="text-sm underline underline-offset-4">
          Zurück
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold">Impressum</h1>
        <LegalText text={IMPRESSUM} />
      </main>
      <LegalFooter />
    </>
  );
}
