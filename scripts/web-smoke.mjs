import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  require = createRequire(new URL("apps/web/package.json", root));
let health = true,
  ticketKeySeen = false,
  child;
const backend = createServer((req, res) => {
  if (req.url?.startsWith("/api/v1/tickets")) {
    ticketKeySeen = req.headers["x-local-api-key"] === "a".repeat(64);
    if (!ticketKeySeen) { res.writeHead(401).end(); return; }
    if (req.url === "/api/v1/tickets/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end("event: ticket\ndata: {\"type\":\"ticket.updated\",\"ticketId\":\"demo\"}\n\n");return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({items:[],page:1,pageSize:100,hasMore:false}));return;
  }
  if (req.url !== "/api/v1/health/ready") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(health ? 200 : 503, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: health ? "ok" : "degraded",
      checks: { postgres: "up", redis: health ? "up" : "down" },
    }),
  );
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = Number(process.env.WEB_TEST_PORT ?? 3105);
assert.ok(
  Number.isInteger(port) && port > 1024 && port < 65536,
  "WEB_TEST_PORT invalido",
);
let output = "";
try {
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const address = backend.address();
  child = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: fileURLToPath(new URL("apps/web/", root)),
      windowsHide: true,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        API_BASE_URL: `http://127.0.0.1:${address.port}`,
        TICKETS_LOCAL_KEY: "a".repeat(64),
        TICKETS_LOCAL_CENTRO_ID: "11111111-1111-4111-8111-111111111111",
        TICKETS_LOCAL_AREA_ID: "22222222-2222-4222-8222-222222222222",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.on("error", () => {
    output = "No se pudo iniciar Next.js";
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-6000);
    });
  const base = `http://127.0.0.1:${port}`;
  let started = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Next.js termino antes de iniciar");
    // Esperar el mensaje de ESTE proceso evita validar otro servicio en el mismo puerto.
    if (/Ready in/.test(output)) {
      started = true;
      break;
    }
    await pause(500);
  }
  assert.ok(started, "Next.js no estuvo listo en 60 segundos");
  const get = (path) =>
    fetch(base + path, { signal: AbortSignal.timeout(10000) });
  for (const [path, text] of [
    ["/portal", "¿Qué necesitas reportar?"],
    ["/acceso", "Espacio del personal autorizado"],
    ["/tecnico", "Tablero de atención"],
  ]) {
    const response = await get(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(text));
    assert.ok(html.includes("Demostración local") || html.includes("Acceso local de demostración"));
    assert.ok(!html.includes("Application error"));
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    console.log("PASS: " + path + " renderiza en produccion");
  }
  const home = await fetch(base, { redirect: "manual" });
  assert.ok([307, 308].includes(home.status));
  assert.equal(home.headers.get("location"), "/portal");
  assert.equal((await get("/no-existe")).status, 404);
  let response = await get("/api/backend-health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  health = false;
  response = await get("/api/backend-health");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
  health = true;
  assert.equal((await get("/api/backend-health")).status, 200);
  assert.equal(
    (await fetch(base + "/api/backend-health", { method: "POST" })).status,
    405,
  );
  response=await get("/api/tickets?page=1&pageSize=100");
  assert.equal(response.status,200);assert.equal((await response.json()).items.length,0);assert.equal(ticketKeySeen,true);
  response=await get("/api/tickets/events");assert.equal(response.status,200);
  assert.match(await response.text(),/ticket\.updated/);
  console.log(
    "PASS: indicador de API 200 -> 503 -> 200, redireccion y rutas HTTP",
  );
  console.log(
    "OK: frontend de produccion, proxy protegido y transporte SSE verificados con backend simulado.",
  );
} catch (error) {
  console.error("Fallo web:smoke: " + error.message);
  console.error(output);
  process.exitCode = 1;
} finally {
  if (child?.pid && child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill();
    await stopped;
  }
  backend.closeAllConnections();
  await new Promise((resolve) => backend.close(resolve));
}
