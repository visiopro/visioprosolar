"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Marca } from "@/components/marca";
import { Aviso, Botao, Campo } from "@/components/ui";

export default function DefinirSenha() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const senha = String(f.get("senha"));
    if (senha.length < 8) return setErro("Use pelo menos 8 caracteres.");
    if (senha !== f.get("confirmar")) return setErro("As senhas não conferem.");
    setCarregando(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) setErro("Não foi possível salvar a senha. Abra o link do e-mail novamente.");
    else router.replace("/");
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <form onSubmit={salvar} className="w-full max-w-sm space-y-4">
        <Marca className="h-10 w-10" />
        <h1 className="text-2xl font-semibold tracking-tight">Crie sua senha</h1>
        <Campo rotulo="Nova senha">
          <input name="senha" type="password" required autoComplete="new-password" className="campo" />
        </Campo>
        <Campo rotulo="Repita a senha">
          <input name="confirmar" type="password" required autoComplete="new-password" className="campo" />
        </Campo>
        {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
        <Botao className="w-full" disabled={carregando}>
          Salvar senha
        </Botao>
      </form>
    </main>
  );
}
