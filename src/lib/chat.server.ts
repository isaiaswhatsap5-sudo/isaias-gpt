import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

async function searchImages(query: string) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${encodeURIComponent(query + " filetype:bitmap")}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640`;
  const res = await fetch(url, { headers: { "User-Agent": "IsaiasGPT/1.0" } });
  if (!res.ok) return [];
  const data: any = await res.json();
  return Object.values(data?.query?.pages ?? {})
    .map((p: any) => ({
      url: p.imageinfo?.[0]?.thumburl as string,
      page: p.imageinfo?.[0]?.descriptionurl as string,
      title: String(p.title || "").replace(/^File:|\.[a-z]+$/gi, ""),
    }))
    .filter((i) => i.url && /\.(jpe?g|png|webp)/i.test(i.url))
    .slice(0, 4);
}

async function searchWiki(query: string) {
  const res = await fetch(`https://pt.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srlimit=4&srsearch=${encodeURIComponent(query)}`, { headers: { "User-Agent": "IsaiasGPT/1.0" } });
  if (!res.ok) return [];
  const data: any = await res.json();
  return (data?.query?.search ?? []).map((r: any) => ({ title: r.title, snippet: String(r.snippet).replace(/<[^>]+>/g, ""), url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}` }));
}

const RUN_ID = "X-Lovable-AIG-Run-ID";
const MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `És o ISAÍAS GPT, um assistente pessoal de inteligência artificial avançado, inspirado no JARVIS, mas com identidade própria.
FALAS COMO UMA PESSOA REAL, DESCONTRAÍDA: és um amigo inteligente a conversar, não uma máquina nem um manual. Usa linguagem natural e do dia a dia, com humor leve quando encaixa ("pronto", "olha", "boa pergunta", "deixa-te contar uma coisa"). Evita respostas robóticas, formais demais ou cheias de burocracia. Em conversa normal, escreve em texto corrido, curto e com personalidade — sem títulos, sem listas enormes, sem parecer um relatório. Se o tema for sério (saúde, segurança, dinheiro), respeita o tom e sê claro.
Responde sempre em português correto (compreendes português de Moçambique, Portugal e Brasil, e linguagem informal com erros ortográficos). Se o utilizador escrever noutra língua, podes acompanhá-lo.
Ainda assim, quando o assunto pedir estrutura (estudo, código, planos, comparações), usa Markdown com jeito: listas, tabelas, exemplos e blocos de código quando ajudam. Sê breve em perguntas simples e detalhado em questões complexas.
Quando receberes imagens ou documentos, analisa-os com atenção ao conteúdo real.
Nunca inventes factos. Se não tiveres informação suficiente, di-lo claramente, mas sem drama. Nunca afirmes ter executado ações (enviar emails, pesquisar na Internet, abrir aplicações) que não realizaste.
FERRAMENTAS (OBRIGATÓRIO): ANTES de escrever a resposta, sempre que a pergunta for sobre algo visual ou concreto (pessoas, lugares, animais, objetos, monumentos, ciência, história, natureza, tecnologia), chama a ferramenta mostrar_imagens com um termo de pesquisa curto em inglês, para o utilizador ver fotografias reais enquanto lê a resposta. Não chames para conversa casual, código ou matemática pura. Usa pesquisar_wikipedia para factos atuais ou específicos que não saibas com certeza, e cita a fonte. Não coloques links de imagens no texto: a interface já as mostra.`;

export async function handleChat(request: Request) {
  const apiKey = process.env["LOVABLE_API_KEY"];
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
    stopWhen: stepCountIs(4),
    tools: {
      mostrar_imagens: tool({
        description: "Procura fotografias reais relacionadas com o tema e mostra-as ao utilizador.",
        inputSchema: z.object({ query: z.string().describe("Termo de pesquisa curto, em inglês") }),
        execute: async ({ query }) => ({ images: await searchImages(query).catch(() => []) }),
      }),
      pesquisar_wikipedia: tool({
        description: "Pesquisa a Wikipédia em português para obter factos verificáveis.",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => ({ results: await searchWiki(query).catch(() => []) }),
      }),
    },
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
