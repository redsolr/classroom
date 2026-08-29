import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Classroom",
    short_name: "Classroom",
    description:
      "Your language classroom — AI tutor chat, personal vocabulary, spaced review, and your teacher's lesson records.",
    // The founder's daily driver is the study space — installed app opens there.
    start_url: "/chat",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0e0e11",
    theme_color: "#0e0e11",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
