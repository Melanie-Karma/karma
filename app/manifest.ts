import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Karma",
    short_name: "Karma",
    description: "Menschen helfen Menschen: Hilfe anfragen, Hilfe anbieten, Karma sammeln.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#FFF7EF",
    theme_color: "#1D4E5C",
    lang: "de",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
