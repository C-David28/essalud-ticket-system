import { readFileSync } from "node:fs";
import { postgres, run } from "./lib/postgres.mjs";
run(() => {
  const output=postgres(readFileSync(new URL("../infra/postgres/verify-access.sql",import.meta.url),"utf8"));
  if(!output.includes("OK: 16 verificaciones de acceso institucional; datos ficticios revertidos."))
    throw new Error("La verificación de acceso no devolvió la confirmación esperada.");
});
