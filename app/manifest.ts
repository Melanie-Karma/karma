import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Karma",
    short_name: "Karma",
    description: "Schnelle Nachbarschaftshilfe per Swipe.",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F4EC",
    theme_color: "#0F3D2E",
    lang: "de",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
