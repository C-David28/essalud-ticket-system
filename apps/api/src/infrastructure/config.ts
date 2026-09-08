export type ApiConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  host: string; port: number; databaseUrl: string; redisUrl: string;
  corsOrigins: readonly string[]; swaggerEnabled: boolean;
}>;
export function readConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const fail = (field: string): never => { throw new Error('Configuracion invalida o ausente: ' + field); };
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development','test','production'].includes(nodeEnv)) fail('NODE_ENV');
  const port = Number(env.PORT ?? '3001');
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (port === 0 && nodeEnv !== 'test')) fail('PORT');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1','0.0.0.0','::1','::'].includes(host)) fail('HOST');
  const url = (key: string, protocols: string[]) => {
    const raw = env[key]; if (!raw) return fail(key);
    try {
      const parsed = new URL(raw);
      if (!protocols.includes(parsed.protocol) || !parsed.hostname || !parsed.password ||
        (key === 'DATABASE_URL' && !parsed.username)) return fail(key);
      return raw;
    } catch { return fail(key); }
  };
  const databaseUrl = url('DATABASE_URL', ['postgres:', 'postgresql:']);
  const redisUrl = url('REDIS_URL', ['redis:', 'rediss:']);
  const corsOrigins = (env.CORS_ORIGINS ?? '').split(',').filter(Boolean).map(origin => {
    try {
      const parsed = new URL(origin);
      if (!['http:','https:'].includes(parsed.protocol) || parsed.origin !== origin) return fail('CORS_ORIGINS');
      return origin;
    } catch { return fail('CORS_ORIGINS'); }
  });
  const swagger = env.SWAGGER_ENABLED ?? (nodeEnv === 'production' ? 'false' : 'true');
  if (!['true','false'].includes(swagger)) fail('SWAGGER_ENABLED');
  return Object.freeze({ nodeEnv: nodeEnv as ApiConfig['nodeEnv'], host, port, databaseUrl, redisUrl,
    corsOrigins: Object.freeze(corsOrigins), swaggerEnabled: swagger === 'true' });
}
