import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return Response.json({ error: "Configuração em falta." }, { status: 500 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > 20_000_000)
    return Response.json({ error: "Gravação inválida." }, { status: 400 });

  const up = new FormData();
  up.append("model", "openai/gpt-transcribe");
  up.append("file", file, file.name || "audio.webm");
  up.append("response_format", "json");
  up.append("stream", "true");
  up.append("languages", "pt");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: up,
    signal: request.signal,
  });
  if (!res.ok || !res.body) {
    const msg = res.status === 402 ? "Créditos de IA esgotados." : res.status === 429 ? "Muitos pedidos, tenta daqui a pouco." : "Não foi possível transcrever.";
    return Response.json({ error: msg }, { status: res.status });
  }
  const raw = await res.text();
  let text = "", deltas = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(line.slice(5).trim());
      if (ev.type === "transcript.text.done") text = ev.text;
      else if (ev.type === "transcript.text.delta") deltas += ev.delta ?? "";
    } catch {}
  }
  return Response.json({ text: (text || deltas).trim() });
}

export const Route = createFileRoute("/api/transcribe")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
