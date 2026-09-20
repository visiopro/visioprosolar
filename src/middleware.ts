import type { NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/middleware";

export const middleware = (request: NextRequest) => atualizarSessao(request);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
