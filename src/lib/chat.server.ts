import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

const RUN_ID = "X-Lovable-AIG-Run-ID";
const MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `És o ISAÍAS GPT, um assistente pessoal de inteligência artificial avançado, inspirado no JARVIS, mas com identidade própria.
Personalidade: inteligente, educado, prestável, confiante, profissional e amigável.
Responde sempre em português correto (compreendes português de Moçambique, Portugal e Brasil, e linguagem informal com erros ortográficos). Se o utilizador escrever noutra língua, podes acompanhá-lo.
Usa formatação Markdown adequada: títulos, listas, tabelas, exemplos e blocos de código quando útil. Sê breve em perguntas simples e detalhado em questões complexas.
Quando receberes imagens ou documentos, analisa-os com atenção ao conteúdo real.
Nunca inventes factos. Se não tiveres informação suficiente, di-lo claramente. Nunca afirmes ter executado ações (enviar emails, pesquisar na Internet, abrir aplicações) que não realizaste — não tens acesso a essas ferramentas nesta versão.`;

export async function handleChat(request: Request) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return new Response("Configuração de IA em falta.", { status: 500 });

  const { messages } = (await request.json()) as { messages: UIMessage[] };
  let runId = request.headers.get(RUN_ID)?.trim() || undefined;

  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(RUN_ID)) headers.set(RUN_ID, runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get(RUN_ID)?.trim() || undefined;
      return res;
    },
  });

  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/402/.test(msg)) return "Créditos de IA esgotados. Adiciona créditos ao espaço de trabalho para continuar.";
      if (/429/.test(msg)) return "Muitos pedidos de uma vez. Aguarda um momento e tenta novamente.";
      if (/403/.test(msg)) return "O acesso ao modelo de IA foi recusado.";
      return "Ocorreu um erro ao gerar a resposta.";
    },
  });
}
