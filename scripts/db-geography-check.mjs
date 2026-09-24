import { readFileSync } from "node:fs";
import { postgres } from "./lib/postgres.mjs";
try {
  const output=postgres(readFileSync(new URL("../infra/postgres/verify-geography.sql",import.meta.url),"utf8"));
  if(!output.includes("OK: 12 verificaciones geograficas; datos ficticios revertidos."))
    throw new Error("La verificación geográfica no devolvió la confirmación esperada.");
  console.log("OK: ubicación opcional, validación, RLS y auditoría geográfica.");
} catch(error){console.error("Fallo db:geography:check:",error.message);process.exitCode=1;}
