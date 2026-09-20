import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Marca } from "@/components/marca";
import { FormOnboarding } from "./form";

export default async function Onboarding() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { count } = await supabase.from("usina_membros").select("*", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) redirect("/");

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <Marca className="h-10 w-10" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Cadastre sua usina</h1>
        <p className="mt-1 text-sm text-nevoa">Use o código de convite que a VisioPro enviou. Nome e documento aparecem nas faturas e podem ser mudados depois em Ajustes.</p>
        <FormOnboarding />
      </div>
    </main>
  );
}
