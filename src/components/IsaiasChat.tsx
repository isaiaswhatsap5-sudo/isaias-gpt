import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Paperclip, Mic, Send, Square, Plus, PanelLeft, Volume2, VolumeX, X, FileText, Trash2,
  GraduationCap, Code2, Languages, PenLine, Calculator, ListChecks,
} from "lucide-react";
import logo from "@/assets/isaias-logo.png";

type Convo = { id: string; title: string; messages: UIMessage[]; updatedAt: number };
const STORE = "isaias-convos";
const MAX_FILES = 6;
const WELCOME =
  "Olá! Eu sou o ISAÍAS GPT, o teu assistente pessoal de inteligência artificial. Estou pronto para conversar contigo, responder às tuas perguntas, analisar imagens, ajudar nos teus projetos e encontrar soluções para os teus problemas. O que vamos fazer hoje?";
const SHORTCUTS = [
  { icon: GraduationCap, label: "Estudos", prompt: "Ajuda-me a estudar: explica de forma simples " },
  { icon: Code2, label: "Programar", prompt: "Ajuda-me com este código: " },
  { icon: PenLine, label: "Escrever", prompt: "Escreve um texto sobre " },
  { icon: Languages, label: "Traduzir", prompt: "Traduz para inglês: " },
  { icon: Calculator, label: "Matemática", prompt: "Resolve passo a passo: " },
  { icon: ListChecks, label: "Planear", prompt: "Cria um plano organizado para " },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const readDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

function Core({ active, size = 180 }: { active: boolean; size?: number }) {
  return (
    <div className={`relative ${active ? "core-active" : ""}`} style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border border-primary/30 ring-spin" style={{ borderTopColor: "var(--primary)" }} />
      <div className="absolute inset-[12%] rounded-full border border-dashed border-primary/40 ring-spin-rev" />
      <div className="absolute inset-[24%] rounded-full border border-accent/50 ring-spin" style={{ borderRightColor: "var(--accent)" }} />
      <div className="absolute inset-[30%] rounded-full core-orb" />
    </div>
  );
}

export default function IsaiasChat() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [currentId, setCurrentId] = useState(() => uid());
  const [sidebar, setSidebar] = useState(false);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<(FileUIPart & { name: string })[]>([]);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, stop, setMessages, error } = useChat({ id: currentId, transport });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    try { setConvos(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch {}
    setSidebar(window.innerWidth >= 1024);
  }, []);

  // persist current conversation
  useEffect(() => {
    if (!messages.length || busy) return;
    setConvos((prev) => {
      const firstText = messages[0]!.parts.find((p) => p.type === "text") as { text: string } | undefined;
      const title = (firstText?.text || "Conversa com anexos").slice(0, 48);
      const next = [{ id: currentId, title, messages, updatedAt: Date.now() }, ...prev.filter((c) => c.id !== currentId)];
      try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {
        localStorage.setItem(STORE, JSON.stringify(next.slice(0, 5)));
      }
      return next;
    });
  }, [messages, busy, currentId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // voice mode: speak finished assistant reply
  const lastSpoken = useRef<string>("");
  useEffect(() => {
    if (!voiceMode || busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || lastSpoken.current === last.id) return;
    lastSpoken.current = last.id;
    const text = last.parts.filter((p) => p.type === "text").map((p: any) => p.text).join(" ")
      .replace(/```[\s\S]*?```/g, " (código) ").replace(/[#*_`>|]/g, "");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-PT";
    // Voz estilo J.A.R.V.I.S.: masculina, calma e grave
    const pickVoice = () => {
      const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("pt"));
      if (!voices.length) return;
      const maleHints = ["daniel", "male", "homem", "masculina", "ricardo", "joaquim", "felipe", "luciana".replace("luciana", "")];
      const pick =
        voices.find((v) => maleHints.some((h) => v.name.toLowerCase().includes(h))) ||
        voices.find((v) => v.lang === "pt-PT") ||
        voices[0]!;
      u.voice = pick;
    };
    pickVoice();
    if (!u.voice) speechSynthesis.addEventListener("voiceschanged", pickVoice, { once: true });
    u.rate = 0.95;
    u.pitch = 0.75;
    u.volume = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }, [messages, busy, voiceMode]);

  async function addFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || f.type.startsWith("text/"));
    const room = MAX_FILES - files.length;
    const picked = await Promise.all(
      arr.slice(0, room).map(async (f) => ({ type: "file" as const, mediaType: f.type, url: await readDataUrl(f), filename: f.name, name: f.name })),
    );
    setFiles((p) => [...p, ...picked]);
  }

  function submit(text = input) {
    if (busy || (!text.trim() && !files.length)) return;
    sendMessage({ text: text.trim() || "Analisa estes anexos.", files: files.map(({ name, ...f }) => f) });
    setInput("");
    setFiles([]);
  }

  function newChat() {
    stop();
    setCurrentId(uid());
    setMessages([]);
    setInput("");
    setFiles([]);
    if (window.innerWidth < 1024) setSidebar(false);
  }

  function openChat(c: Convo) {
    stop();
    setCurrentId(c.id);
    setTimeout(() => setMessages(c.messages), 0);
    if (window.innerWidth < 1024) setSidebar(false);
  }

  function deleteChat(id: string) {
    const next = convos.filter((c) => c.id !== id);
    setConvos(next);
    localStorage.setItem(STORE, JSON.stringify(next));
    if (id === currentId) newChat();
  }

  const [transcribing, setTranscribing] = useState(false);
  async function toggleMic() {
    if (listening) return recRef.current?.stop();
    if (!navigator.mediaDevices?.getUserMedia) return alert("Este navegador não permite usar o microfone.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return alert("Acesso ao microfone negado. Permite o microfone nas definições do navegador (ícone do cadeado ao lado do endereço) e tenta outra vez.");
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (!blob.size) return;
      setTranscribing(true);
      try {
        const fd = new FormData();
        const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
        fd.append("file", new File([blob], `voz.${ext}`, { type: blob.type.split(";")[0] || "audio/webm" }));
        const r = await fetch("/api/transcribe", { method: "POST", body: fd });
        const j = await r.json();
        if (j.text) {
          if (voiceMode) submit(j.text);
          else setInput((v) => (v ? v + " " : "") + j.text);
        } else if (j.error) alert(j.error);
      } finally {
        setTranscribing(false);
      }
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  const statusLabel = status === "submitted" ? "A pensar…" : status === "streaming" ? "A responder…" : status === "error" ? "Erro" : listening ? "A ouvir…" : transcribing ? "A transcrever…" : "Online";
  const empty = messages.length === 0;

  return (
    <div className="flex h-dvh overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className={`glass fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-y-0 border-l-0 transition-transform duration-300 lg:static ${sidebar ? "translate-x-0" : "-translate-x-full lg:hidden"}`}>
        <div className="flex items-center gap-2 p-4">
          <img src={logo} alt="" width={36} height={36} className="h-9 w-9" />
          <span className="font-display text-sm font-bold tracking-[0.2em] text-primary">ISAÍAS GPT</span>
          <button onClick={() => setSidebar(false)} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:text-primary lg:hidden" aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <button onClick={newChat} className="mx-4 mb-4 flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-2.5 text-sm font-medium text-primary shadow-glow transition hover:bg-primary/20">
          <Plus size={16} /> Nova conversa
        </button>
        <p className="px-4 pb-2 text-xs uppercase tracking-widest text-muted-foreground">Histórico</p>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {convos.length === 0 && <p className="px-3 text-sm text-muted-foreground">Ainda sem conversas.</p>}
          {convos.map((c) => (
            <div key={c.id} className={`group flex items-center rounded-lg ${c.id === currentId ? "bg-secondary" : "hover:bg-secondary/60"}`}>
              <button onClick={() => openChat(c)} className="flex-1 truncate px-3 py-2 text-left text-sm">{c.title}</button>
              <button onClick={() => deleteChat(c.id)} className="p-2 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100" aria-label="Apagar conversa"><Trash2 size={14} /></button>
            </div>
          ))}
        </nav>
      </aside>
      {sidebar && <div className="fixed inset-0 z-20 bg-background/60 lg:hidden" onClick={() => setSidebar(false)} />}

      {/* Main */}
      <main
        className="relative flex flex-1 flex-col"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button onClick={() => setSidebar((s) => !s)} className="rounded-lg p-2 text-muted-foreground hover:text-primary" aria-label="Menu"><PanelLeft size={20} /></button>
          {!empty && <div className="h-8 w-8"><Core active={busy} size={32} /></div>}
          <h1 className="font-display text-sm font-bold tracking-[0.25em] text-primary">ISAÍAS GPT</h1>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${status === "error" ? "bg-destructive" : "bg-primary"} ${busy || listening ? "animate-pulse" : ""}`} />
            {statusLabel}
          </div>
          <button onClick={() => { setVoiceMode((v) => !v); speechSynthesis.cancel(); }} className={`rounded-lg p-2 transition ${voiceMode ? "text-primary shadow-glow" : "text-muted-foreground hover:text-primary"}`} aria-label="Modo de voz" title="Modo de voz: ler respostas em voz alta">
            {voiceMode ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center px-6 pt-10 text-center">
              <Core active={busy} size={200} />
              <p className="mt-8 text-lg leading-relaxed text-secondary-foreground">{WELCOME}</p>
              <div className="mt-8 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                {SHORTCUTS.map(({ icon: Icon, label, prompt }) => (
                  <button key={label} onClick={() => setInput(prompt)} className="glass flex items-center gap-2 rounded-xl px-4 py-3 text-sm transition hover:border-primary/60 hover:shadow-glow">
                    <Icon size={16} className="text-primary" /> {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground" : "w-full"}>
                    {m.parts.map((p, i) => {
                      if (p.type === "text")
                        return m.role === "user" ? (
                          <p key={i} className="whitespace-pre-wrap">{p.text}</p>
                        ) : (
                          <div key={i} className="prose-isaias"><ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown></div>
                        );
                      if (p.type === "file")
                        return p.mediaType.startsWith("image/") ? (
                          <img key={i} src={p.url} alt={p.filename || "imagem"} className="mb-2 max-h-60 rounded-lg" />
                        ) : (
                          <div key={i} className="mb-2 flex items-center gap-2 text-sm"><FileText size={16} /> {p.filename}</div>
                        );
                      if (p.type === "tool-mostrar_imagens") {
                        const imgs = (p as any).output?.images as { url: string; page: string; title: string }[] | undefined;
                        if ((p as any).state !== "output-available")
                          return <div key={i} className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((k) => <div key={k} className="aspect-square animate-pulse rounded-xl bg-secondary" />)}</div>;
                        if (!imgs?.length) return null;
                        return (
                          <div key={i} className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {imgs.map((im) => (
                              <a key={im.url} href={im.page} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border">
                                <img src={im.url} alt={im.title} loading="lazy" className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
                              </a>
                            ))}
                          </div>
                        );
                      }
                      if (p.type === "tool-pesquisar_wikipedia") {
                        const st = (p as any).state;
                        const res = (p as any).output?.results as { title: string; url: string }[] | undefined;
                        if (st !== "output-available") return <p key={i} className="mb-2 animate-pulse text-xs text-muted-foreground">A pesquisar fontes…</p>;
                        if (!res?.length) return null;
                        return (
                          <div key={i} className="mb-3 flex flex-wrap gap-2">
                            {res.slice(0, 3).map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="rounded-full border border-border px-3 py-1 text-xs text-primary hover:border-primary">📖 {r.title}</a>)}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              ))}
              {status === "submitted" && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground"><Core active size={28} /> A pensar…</div>
              )}
              {error && <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">{error.message || "Ocorreu um erro. Tenta novamente."}</div>}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 m-4 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-background/70 font-display tracking-widest text-primary">
            LARGA OS FICHEIROS AQUI
          </div>
        )}

        {/* Composer */}
        <div className="px-4 pb-4">
          <div className="glass mx-auto max-w-3xl rounded-2xl p-2 shadow-glow">
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2">
                {files.map((f, i) => (
                  <div key={i} className="relative">
                    {f.mediaType.startsWith("image/") ? (
                      <img src={f.url} alt={f.name} className="h-16 w-16 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-16 w-32 items-center gap-1 rounded-lg bg-secondary px-2 text-xs"><FileText size={14} /><span className="truncate">{f.name}</span></div>
                    )}
                    <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground" aria-label="Remover"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
              placeholder="Escreve a tua mensagem…"
              rows={1}
              className="max-h-48 min-h-11 w-full resize-none bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground [field-sizing:content]"
            />
            <div className="flex items-center gap-1">
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,text/*" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES} className="rounded-lg p-2 text-muted-foreground hover:text-primary disabled:opacity-40" aria-label="Anexar"><Paperclip size={18} /></button>
              <button onClick={toggleMic} className={`rounded-lg p-2 ${listening ? "animate-pulse text-primary" : "text-muted-foreground hover:text-primary"}`} aria-label="Microfone" title={listening ? "Toca para parar" : "Falar"}>{listening ? <Square size={18} /> : <Mic size={18} />}</button>
              {listening && <span className="text-xs text-primary">A gravar… toca para enviar</span>}
              <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">Enter para enviar · Shift+Enter nova linha</span>
              {busy ? (
                <button onClick={() => stop()} className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary" aria-label="Parar"><Square size={16} /></button>
              ) : (
                <button onClick={() => submit()} disabled={!input.trim() && !files.length} className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow transition disabled:opacity-40" aria-label="Enviar"><Send size={16} /></button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
