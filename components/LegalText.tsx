import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/contact";

/** Rendert die Rechtstexte aus lib/legal (einfaches Markdown: ##, Absätze, Listen, Tabellen, **fett**, [Link](url)). */

function fill(text: string): string {
  return text
    .replaceAll("{{EMAIL}}", CONTACT_EMAIL)
    .replaceAll("{{TELEFON}}", CONTACT_PHONE ? `Telefon: ${CONTACT_PHONE}` : "")
    .replace(/\n{3,}/g, "\n\n");
}

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)|([\w.+-]+@[\w-]+\.[\w.]+\w)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2]) {
      const href = m[3];
      out.push(
        href.startsWith("/") ? (
          <Link key={k} href={href} className="underline underline-offset-4">
            {m[2]}
          </Link>
        ) : (
          <a key={k} href={href} className="underline underline-offset-4">
            {m[2]}
          </a>
        ),
      );
    } else if (m[4]) {
      out.push(
        <a key={k} href={`mailto:${m[4]}`} className="underline underline-offset-4">
          {m[4]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(block: string[], key: string): ReactNode[] {
  return block.flatMap((l, i) => (i === 0 ? inline(l, `${key}-${i}`) : [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)]));
}

export default function LegalText({ text }: { text: string }) {
  const blocks = fill(text)
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").filter((l) => l.trim() !== ""))
    .filter((b) => b.length);

  return (
    <div className="mt-6 space-y-4 leading-relaxed">
      {blocks.map((b, bi) => {
        const key = `b${bi}`;
        const first = b[0];
        if (first.startsWith("## ")) {
          return (
            <div key={key}>
              <h2 className="mt-8 text-xl font-extrabold text-brand">{first.slice(3)}</h2>
              {b.length > 1 && <p className="mt-2">{lines(b.slice(1), key)}</p>}
            </div>
          );
        }
        if (b.every((l) => l.startsWith("|"))) {
          const rows = b
            .filter((l) => !/^\|\s*-/.test(l))
            .map((l) =>
              l
                .replace(/^\|/, "")
                .replace(/\|$/, "")
                .split("|")
                .map((c) => c.trim()),
            );
          const [head, ...body] = rows;
          return (
            <div key={key} className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <thead>
                  <tr>
                    {head.map((c, ci) => (
                      <th key={ci} className="border-b-2 border-ink/15 p-2 text-left font-extrabold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} className="border-b border-ink/10 p-2 align-top">
                          {inline(c, `${key}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const listStart = b.findIndex((l) => l.startsWith("- "));
        if (listStart >= 0) {
          const intro = b.slice(0, listStart);
          const items = b.slice(listStart);
          return (
            <div key={key}>
              {intro.length > 0 && <p>{lines(intro, key)}</p>}
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {items.map((l, li) =>
                  l.startsWith("- ") ? <li key={li}>{inline(l.slice(2), `${key}-${li}`)}</li> : null,
                )}
              </ul>
            </div>
          );
        }
        return <p key={key}>{lines(b, key)}</p>;
      })}
    </div>
  );
}
