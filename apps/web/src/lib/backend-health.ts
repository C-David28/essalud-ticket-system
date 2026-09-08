export async function backendHealth(
  base: string,
  request: typeof fetch = fetch,
) {
  try {
    const url = new URL(base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("config");
    const response = await request(new URL("/api/v1/health/ready", url), {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
    const data: unknown = await response.json();
    if (
      !response.ok ||
      !data ||
      typeof data !== "object" ||
      !("status" in data) ||
      data.status !== "ok" ||
      !("checks" in data)
    )
      throw new Error("not-ready");
    const checks = data.checks as Record<string, unknown> | null;
    if (checks?.postgres !== "up" || checks?.redis !== "up")
      throw new Error("not-ready");
    return { status: "ok" } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}
