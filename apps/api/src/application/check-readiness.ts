import { DependencyProbe, Readiness } from '../domain/health';
export class CheckReadiness {
  constructor(private readonly postgres: DependencyProbe, private readonly redis: DependencyProbe, private readonly timeoutMs=2500) {}
  async execute(): Promise<Readiness> {
    const safe = async (probe: DependencyProbe) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          probe.check().catch(() => false),
          new Promise<boolean>(resolve => { timer=setTimeout(() => resolve(false),this.timeoutMs); }),
        ]);
      } catch { return false; }
      finally { if (timer) clearTimeout(timer); }
    };
    const [postgres, redis] = await Promise.all([safe(this.postgres), safe(this.redis)]);
    return {
      status: postgres && redis ? 'ok' : 'degraded',
      checks: { postgres: postgres ? 'up' : 'down', redis: redis ? 'up' : 'down' },
    };
  }
}
