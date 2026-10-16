// Servidor: pede voz real de IA ao Lovable AI Gateway (formato Gemini TTS).
// Só usar do lado do servidor — a chave nunca vai para o browser.

const BASE_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "google/gemini-3.1-flash-tts-preview";
const VOICE = "Charon"; // voz masculina, quente e calma

export function requestSpeech(text: string, apiKey: string, signal?: AbortSignal) {
  const body = {
    model: MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
    stream_format: "sse",
  };
  return fetch(`${BASE_URL}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}

export function safeSpeechErrorMessage(status: number, raw: string): string {
  if (status === 402) return "Créditos de IA esgotados. Adiciona créditos ao espaço de trabalho para continuar.";
  if (status === 429) return "Muitos pedidos de uma vez. Aguarda um momento e tenta novamente.";
  if (status === 403) return "O acesso à voz de IA foi recusado.";
  if (status === 401) return "Configuração de IA em falta.";
  return "Não consegui gerar a voz agora. Tenta outra vez.";
}
