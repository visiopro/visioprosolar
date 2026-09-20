import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // O gerador de PDF carrega as fontes padrão (Helvetica, Courier) dinamicamente;
  // sem isso a Vercel não copia esses arquivos e o PDF falha com "Cannot find module".
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/pdfkit/js/standard-fonts/**/*", "./node_modules/pdfkit/js/data/**/*"],
  },
};

export default config;
