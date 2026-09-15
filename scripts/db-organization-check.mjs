import { readFileSync } from "node:fs";
import { postgres, run } from "./lib/postgres.mjs";
run(() => {
  const output = postgres(readFileSync(new URL("../infra/postgres/verify-organization.sql", import.meta.url), "utf8"));
  if (!output.includes("OK: 13 verificaciones de estructura organizacional; datos ficticios revertidos."))
    throw new Error("La verificación organizacional no devolvió la confirmación esperada.");
});
