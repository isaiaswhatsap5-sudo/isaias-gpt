import { createFileRoute } from "@tanstack/react-router";
import { requestSpeech, safeSpeechErrorMessage } from "@/lib/tts.server";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Configuração de IA em falta.", { status: 500 });

        let text = "";
        try {
          ({ text } = (await request.json()) as { text?: string });
        } catch {
          return new Response("Pedido inválido.", { status: 400 });
        }
        text = String(text ?? "").trim();
        if (!text) return new Response("Texto vazio.", { status: 400 });
        if (text.length > 4000) text = text.slice(0, 4000);

        try {
          const upstream = await requestSpeech(text, apiKey, request.signal);
          if (!upstream.ok) {
            const err = await upstream.text();
            console.error(`TTS request failed [${upstream.status}]: ${err}`);
            return new Response(safeSpeechErrorMessage(upstream.status, err), {
              status: upstream.status,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
              "Cache-Control": "no-cache",
            },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          console.error("TTS request error:", err);
          return new Response("Não consegui gerar a voz agora. Tenta outra vez.", { status: 500 });
        }
      },
    },
  },
});
