import type { NextConfig } from "next";

const config: NextConfig = {
  // mupdf (desbloqueio de PDF com senha) usa WebAssembly: fica fora do bundle e o .wasm vai junto
  serverExternalPackages: ["mupdf"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // O gerador de PDF carrega as fontes padrão (Helvetica, Courier) dinamicamente;
  // sem isso a Vercel não copia esses arquivos e o PDF falha com "Cannot find module".
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/pdfkit/js/standard-fonts/**/*", "./node_modules/pdfkit/js/data/**/*", "./node_modules/mupdf/dist/*.wasm", "./node_modules/mupdf/dist/*.js"],
  },
};

export default config;
