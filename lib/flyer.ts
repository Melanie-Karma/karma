import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export type FlyerInput = {
  /** Ort der Testphase, z. B. "Trebbin" */
  place: string;
  inviteUrl: string;
};

/** A4-Aushang für Hausflur oder Schwarzes Brett, mit persönlichem QR-Code. */
export async function buildFlyer({ place, inviteUrl }: FlyerInput): Promise<jsPDF> {
  const qr = await QRCode.toDataURL(inviteUrl, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 900,
    color: { dark: "#14201A", light: "#FFFFFF" },
  });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const ink: [number, number, number] = [20, 32, 26];

  // Kopf
  doc.setFillColor(15, 61, 46);
  doc.rect(0, 0, W, 112, "F");
  doc.setFillColor(198, 242, 78);
  doc.roundedRect(20, 20, 38, 11, 5.5, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...ink);
  doc.text("KARMA", 39, 27.4, { align: "center" });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(40);
  doc.text(["Kurz mal", "Hilfe gebraucht?"], 20, 54);
  doc.setTextColor(198, 242, 78);
  doc.text("Oder 15 Minuten Zeit?", 20, 88);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("Nachbarschaftshilfe per Swipe. Ohne Geld, ohne Tratsch.", 20, 101);

  // QR-Code
  const size = 92;
  const x = (W - size) / 2;
  const y = 126;
  doc.setDrawColor(...ink);
  doc.setLineWidth(1.2);
  doc.roundedRect(x - 8, y - 8, size + 16, size + 16, 6, 6, "S");
  doc.addImage(qr, "PNG", x, y, size, size);

  // Aufruf
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Scannen und dabei sein", W / 2, 244, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  const line = `Testphase in ${place}: Mach mit und hilf uns, Karma besser zu machen.`;
  doc.text(doc.splitTextToSize(line, 170), W / 2, 254, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor(90, 100, 95);
  doc.text(inviteUrl.replace(/^https?:\/\//, ""), W / 2, 284, { align: "center" });

  return doc;
}

export async function downloadFlyer(input: FlyerInput, fileSlug: string) {
  const doc = await buildFlyer(input);
  doc.save(`karma-aushang-${fileSlug}.pdf`);
}
