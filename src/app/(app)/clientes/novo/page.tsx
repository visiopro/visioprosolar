import { Cabecalho, Cartao } from "@/components/ui";
import { FormCliente } from "@/components/form-cliente";

export default function NovoCliente() {
  return (
    <div className="max-w-2xl">
      <Cabecalho titulo="Novo cliente" />
      <Cartao className="p-5 sm:p-6">
        <FormCliente />
      </Cartao>
    </div>
  );
}
