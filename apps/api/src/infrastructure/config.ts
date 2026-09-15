import { tenantContext } from '../domain/tenant-context';
export interface LocalTicketsConfig { key:string;redAsistencialId:string;userId:string;tokenSecret:string;tokenTtlSeconds:number }
export type ApiConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  applicationEnvironment:'demo'|'development'|'institutional';siteResolutionMode:'configured'|'network';
  host: string; port: number; databaseUrl: string; redisUrl: string;
  corsOrigins: readonly string[]; swaggerEnabled: boolean; localTickets?: LocalTicketsConfig;
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
  const applicationEnvironment=env.APP_ENVIRONMENT??(env.TICKETS_LOCAL_ENABLED==='true'?'demo':nodeEnv==='production'?'institutional':'development');
  if(!['demo','development','institutional'].includes(applicationEnvironment))fail('APP_ENVIRONMENT');
  const siteResolutionMode=env.SITE_RESOLUTION_MODE??'configured';
  if(!['configured','network'].includes(siteResolutionMode))fail('SITE_RESOLUTION_MODE');
  let localTickets: LocalTicketsConfig | undefined;
  if (env.TICKETS_LOCAL_ENABLED && !['true','false'].includes(env.TICKETS_LOCAL_ENABLED)) fail('TICKETS_LOCAL_ENABLED');
  if (env.TICKETS_LOCAL_ENABLED === 'true') {
    if (applicationEnvironment!=='demo'||nodeEnv === 'production' || env.RAILWAY_PROJECT_ID || env.VERCEL) fail('TICKETS_LOCAL_ENABLED: solo demo local');
    if(siteResolutionMode!=='configured')fail('SITE_RESOLUTION_MODE: adaptador network no configurado');
    if (!['127.0.0.1','::1'].includes(host) && !(env.API_CONTAINER_NETWORK==='true' && host==='0.0.0.0')) fail('HOST: solo loopback o Compose local');
    if (!/^[a-f0-9]{64}$/.test(env.TICKETS_LOCAL_KEY ?? '')) fail('TICKETS_LOCAL_KEY');
    if (!/^[a-f0-9]{64}$/.test(env.ACCESS_TOKEN_SECRET ?? '')||env.ACCESS_TOKEN_SECRET===env.TICKETS_LOCAL_KEY) fail('ACCESS_TOKEN_SECRET');
    const tokenTtlSeconds=Number(env.ACCESS_TOKEN_TTL_SECONDS??'900');
    if(!Number.isInteger(tokenTtlSeconds)||tokenTtlSeconds<300||tokenTtlSeconds>3600)fail('ACCESS_TOKEN_TTL_SECONDS');
    try {
      const context = tenantContext({redAsistencialId:env.TICKETS_LOCAL_RED_ID!,userId:env.TICKETS_LOCAL_USER_ID!,requestId:'00000000-0000-4000-8000-000000000001'});
      localTickets = Object.freeze({key:env.TICKETS_LOCAL_KEY!,redAsistencialId:context.redAsistencialId,userId:context.userId,
        tokenSecret:env.ACCESS_TOKEN_SECRET!,tokenTtlSeconds});
    } catch { fail('TICKETS_LOCAL_RED_ID/TICKETS_LOCAL_USER_ID'); }
  }
  return Object.freeze({ localTickets, nodeEnv: nodeEnv as ApiConfig['nodeEnv'],
    applicationEnvironment:applicationEnvironment as ApiConfig['applicationEnvironment'],siteResolutionMode:siteResolutionMode as ApiConfig['siteResolutionMode'],host, port, databaseUrl, redisUrl,
    corsOrigins: Object.freeze(corsOrigins), swaggerEnabled: swagger === 'true' });
}
