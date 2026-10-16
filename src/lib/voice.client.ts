// Cliente: reproduz a voz de IA em streaming (PCM 24 kHz) à medida que chega.
// Módulo só para browser — importar dinamicamente dentro de useEffect.

type Delta = { type: string; audio?: string; error?: unknown };

function decodePCM(pending: Uint8Array, incoming: Uint8Array) {
  const bytes = new Uint8Array(pending.length + incoming.length);
  bytes.set(pending);
  bytes.set(incoming, pending.length);
  const usable = bytes.length - (bytes.length % 2);
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(usable / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return { samples, pending: bytes.slice(usable) };
}

// Parser SSE mínimo, sem dependências externas.
function feedSse(chunk: string, onEvent: (data: string) => void) {
  const events = chunk.split("\n\n");
  for (const ev of events) {
    const data = ev
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("\n");
    if (data) onEvent(data);
  }
}

export async function streamSpeech(endpoint: string, text: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const context = new AudioContext({ sampleRate: 24000 });
  const sources = new Set<AudioBufferSourceNode>();
  let playhead = 0;
  let pending = new Uint8Array(0);
  let completed = false;
  let samplesPlayed = 0;
  const controller = new AbortController();
  const abort = () => {
    controller.abort(signal?.reason);
    for (const source of sources) source.stop();
  };
  signal?.addEventListener("abort", abort, { once: true });
  let playback: Promise<void> = Promise.resolve();
  try {
    if (context.state === "suspended") await context.resume();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `TTS failed: ${response.status}`);
    }
    let buffer = "";
    const onEvent = (data: string) => {
      const payload = JSON.parse(data) as Delta;
      if (payload.type === "error" || payload.error) throw new Error(`Speech failed: ${data}`);
      if (payload.type === "speech.audio.done") {
        completed = true;
        return;
      }
      if (payload.type !== "speech.audio.delta") return;
      if (completed || !payload.audio) throw new Error("Invalid speech audio event");
      const decoded = decodePCM(pending, Uint8Array.from(atob(payload.audio), (c) => c.charCodeAt(0)));
      pending = new Uint8Array(decoded.pending);
      if (!decoded.samples.length) return;
      samplesPlayed += decoded.samples.length;
      const b = context.createBuffer(1, decoded.samples.length, 24000);
      b.copyToChannel(decoded.samples, 0);
      const source = context.createBufferSource();
      source.buffer = b;
      source.connect(context.destination);
      sources.add(source);
      playback = new Promise<void>((resolve) => {
        source.onended = () => {
          sources.delete(source);
          resolve();
        };
      });
      playhead = Math.max(playhead, context.currentTime + 0.05);
      source.start(playhead);
      playhead += b.duration;
    };
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        buffer += next.value;
        // Mantém o último pedaço incompleto para o próximo bloco.
        const lastBreak = buffer.lastIndexOf("\n\n");
        if (lastBreak >= 0) {
          feedSse(buffer.slice(0, lastBreak + 2), onEvent);
          buffer = buffer.slice(lastBreak + 2);
        }
      }
      feedSse(buffer + "\n\n", onEvent);
    } finally {
      reader.releaseLock();
    }
    if (!completed || !samplesPlayed) throw new Error("Incomplete speech stream");
    await playback;
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener("abort", abort);
    controller.abort();
    for (const source of sources) source.stop();
    await context.close();
  }
}
