"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Marca } from "@/components/marca";
import { Aviso, Botao, Campo } from "@/components/ui";

function Formulario() {
  const router = useRouter();
  const erroLink = useSearchParams().get("erro") === "link";
  const [modo, setModo] = useState<"entrar" | "criar" | "recuperar">("entrar");
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(erroLink ? { tipo: "erro", texto: "O link expirou ou já foi usado. Entre com e-mail e senha." } : null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim();
    const senha = String(f.get("senha") ?? "");
    const supabase = supabaseBrowser();
    setCarregando(true);
    setMsg(null);
    const volta = `${window.location.origin}/auth/callback`;
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setMsg({ tipo: "erro", texto: "E-mail ou senha incorretos." });
      else router.replace("/");
    } else if (modo === "criar") {
      if (senha.length < 8) setMsg({ tipo: "erro", texto: "Use uma senha com pelo menos 8 caracteres." });
      else {
        const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: `${volta}?next=/onboarding` } });
        if (error) setMsg({ tipo: "erro", texto: error.message.includes("registered") ? "Esse e-mail já tem conta. Entre com sua senha." : "Não foi possível criar a conta." });
        else if (data.session) router.replace("/onboarding");
        else setMsg({ tipo: "ok", texto: "Enviamos um link de confirmação para o seu e-mail." });
      }
    } else {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${volta}?next=/definir-senha` });
      setMsg({ tipo: "ok", texto: "Se o e-mail tiver conta, você vai receber um link para criar uma nova senha." });
    }
    setCarregando(false);
  }

  const titulos = { entrar: "Entrar", criar: "Criar conta", recuperar: "Recuperar senha" };
  return (
    <form onSubmit={enviar} className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{titulos[modo]}</h1>
      <Campo rotulo="E-mail">
        <input name="email" type="email" required autoComplete="email" className="campo" />
      </Campo>
      {modo !== "recuperar" ? (
        <Campo rotulo="Senha">
          <input name="senha" type="password" required autoComplete={modo === "entrar" ? "current-password" : "new-password"} className="campo" />
        </Campo>
      ) : null}
      {msg ? <Aviso tipo={msg.tipo}>{msg.texto}</Aviso> : null}
      <Botao className="w-full" disabled={carregando}>
        {carregando ? "Aguarde…" : modo === "recuperar" ? "Enviar link" : titulos[modo]}
      </Botao>
      <div className="flex justify-between text-sm text-nevoa">
        {modo === "entrar" ? (
          <>
            <button type="button" onClick={() => setModo("recuperar")} className="hover:text-texto">Esqueci a senha</button>
            <button type="button" onClick={() => setModo("criar")} className="hover:text-texto">Criar conta da usina</button>
          </>
        ) : (
          <button type="button" onClick={() => setModo("entrar")} className="hover:text-texto">Já tenho conta</button>
        )}
      </div>
    </form>
  );
}

export default function Login() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-3">
          <Marca className="h-10 w-10" />
          <div>
            <p className="text-lg font-semibold leading-tight">VisioPro Solar</p>
            <p className="text-sm text-nevoa">Faturamento da sua usina</p>
          </div>
        </div>
        <Suspense>
          <Formulario />
        </Suspense>
      </div>
    </main>
  );
}
