import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/isaias-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — ISAÍAS GPT" },
      { name: "description", content: "Entra ou cria a tua conta para conversar com o ISAÍAS GPT." },
      { property: "og:title", content: "Entrar — ISAÍAS GPT" },
      { property: "og:description", content: "Entra ou cria a tua conta para conversar com o ISAÍAS GPT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "A senha precisa de pelo menos 6 caracteres").max(72),
  name: z.string().trim().max(60).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset" | "new-password">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setMode("new-password");
      return;
    }
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/", replace: true }); });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (mode === "new-password") {
      const validPassword = z.string().min(6, "A senha precisa de pelo menos 6 caracteres").max(72).safeParse(password);
      if (!validPassword.success) return setMsg({ ok: false, text: validPassword.error.issues[0]!.message });
      setLoading(true);
      try {
        const { error } = await supabase.auth.updateUser({ password: validPassword.data });
        if (error) throw error;
        setMsg({ ok: true, text: "Senha alterada com sucesso. A entrar…" });
        navigate({ to: "/", replace: true });
      } catch (err) {
        setMsg({ ok: false, text: (err as Error).message });
      } finally {
        setLoading(false);
      }
      return;
    }
    if (mode === "reset") {
      const validEmail = z.string().trim().email("Email inválido").safeParse(email);
      if (!validEmail.success) return setMsg({ ok: false, text: "Introduz um email válido." });
      setLoading(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(validEmail.data, {
          redirectTo: window.location.origin + "/auth",
        });
        if (error) throw error;
        setMsg({ ok: true, text: "Se existir uma conta com esse email, receberás um link para redefinir a senha. Verifica também o spam." });
      } catch (err) {
        setMsg({ ok: false, text: (err as Error).message });
      } finally {
        setLoading(false);
      }
      return;
    }
    const parsed = schema.safeParse({ email, password, name: mode === "up" ? name : undefined });
    if (!parsed.success) return setMsg({ ok: false, text: parsed.error.issues[0]!.message });
    setLoading(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password });
        if (error) throw new Error(error.message.includes("Invalid") ? "Email ou senha errados." : error.message.includes("confirm") ? "Confirma primeiro o teu email (vê a caixa de entrada)." : error.message);
        navigate({ to: "/", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { display_name: parsed.data.name || undefined } },
        });
        if (error) throw new Error(error.message.includes("registered") ? "Este email já tem conta. Entra em vez disso." : error.message);
        if (data.session) navigate({ to: "/", replace: true });
        else setMsg({ ok: true, text: "Conta criada! Enviámos um email de confirmação — abre o link e depois entra aqui." });
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full rounded-xl border border-border bg-background/60 px-4 py-3 outline-none focus:border-primary";
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 text-foreground">
      <form onSubmit={submit} className="glass w-full max-w-sm space-y-4 rounded-2xl p-6 shadow-glow">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src={logo} alt="" width={56} height={56} className="h-14 w-14" />
          <h1 className="font-display text-lg font-bold tracking-[0.25em] text-primary">ISAÍAS GPT</h1>
          <p className="text-sm text-muted-foreground">{mode === "in" ? "Entra na tua conta" : mode === "up" ? "Cria a tua conta" : mode === "reset" ? "Recuperar senha" : "Escolher nova senha"}</p>
        </div>
        {mode === "up" && <input className={input} placeholder="O teu nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
        <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        {mode !== "reset" && <input className={input} type="password" placeholder={mode === "new-password" ? "Nova senha" : "Senha"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} required />}
        {msg && <p className={`text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
        <button disabled={loading} className="w-full rounded-xl bg-primary py-3 font-medium text-primary-foreground shadow-glow disabled:opacity-50">
          {loading ? "Aguarda…" : mode === "in" ? "Entrar" : mode === "up" ? "Criar conta" : mode === "reset" ? "Enviar link de recuperação" : "Guardar nova senha"}
        </button>
        {mode === "in" && <button type="button" onClick={() => { setMode("reset"); setMsg(null); }} className="w-full text-sm text-muted-foreground hover:text-primary">Esqueceste a senha?</button>}
        <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }} className="w-full text-sm text-muted-foreground hover:text-primary">
          {mode === "in" ? "Ainda não tens conta? Cria uma" : mode === "up" ? "Já tens conta? Entra" : "Voltar para entrar"}
        </button>
      </form>
    </div>
  );
}
