// Exclusivo de compose.api.yaml. La imagen cloud ejecuta main.js directamente.
try {
  if(process.env.API_CONTAINER_NETWORK!=='true') throw new Error('context');
  for(const [key,host,port] of [['DATABASE_URL','postgres','5432'],['REDIS_URL','redis','6379']]) {
    const url=new URL(process.env[key!]!);url.hostname=host!;url.port=port!;
    process.env[key!]=url.toString();
  }
  require('./main');
} catch {
  console.error('Configuracion del contenedor incompleta. Ejecuta api:setup.');process.exitCode=1;
}
