import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marks",
    short_name: "Marks",
    description: "Private bookmark tracker",
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    // Web Share Target — allows iOS share sheet to send URLs to Marks
    share_target: {
      action: "/add",
      method: "GET",
      params: {
        url: "url",
        title: "title",
        text: "description",
      },
    },
  } as MetadataRoute.Manifest & { share_target: unknown };
}
