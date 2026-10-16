import { createFileRoute } from "@tanstack/react-router";
import IsaiasChat from "@/components/IsaiasChat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ISAÍAS GPT — Assistente pessoal de IA" },
      { name: "description", content: "Conversa, analisa imagens e documentos, estuda e programa com o ISAÍAS GPT." },
      { property: "og:title", content: "ISAÍAS GPT — Assistente pessoal de IA" },
      { property: "og:description", content: "O teu assistente de inteligência artificial inspirado no JARVIS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "author", content: "Isaías Edson Muiambo" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "ISAÍAS GPT",
          applicationCategory: "AssistantApplication",
          inLanguage: "pt",
          url: "https://isaias-gpt.lovable.app",
          creator: {
            "@type": "Person",
            name: "Isaías Edson Muiambo",
            telephone: "+258875417210",
          },
        }),
      },
    ],
  }),
  component: IsaiasChat,
});
