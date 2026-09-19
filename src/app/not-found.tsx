import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 text-center">
      <div>
        <p className="text-xl font-semibold">Página não encontrada</p>
        <p className="mt-1 text-sm text-nevoa">O endereço pode ter mudado ou o registro não é da sua usina.</p>
        <Link href="/" className="mt-5 inline-block text-sol hover:underline">Voltar ao painel</Link>
      </div>
    </main>
  );
}
