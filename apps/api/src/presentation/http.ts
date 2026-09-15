import { TicketFailure } from '../domain/ticket';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { ApiConfig } from '../infrastructure/config';
type RequestWithId = Request & { requestId?: string };
@Catch()
export class PublicExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const status = error instanceof TicketFailure ? ({NOT_FOUND:404,INVALID:400,CONFLICT:409}[error.kind]) : error instanceof HttpException ? error.getStatus() :
      (typeof error === 'object' && error !== null && 'status' in error &&
        (error.status === 400 || error.status === 413) ? error.status : 500);
    const messages: Record<number,string> = {
      400:'Solicitud invalida',401:'No autenticado',403:'Acceso denegado',
      404:'Recurso no encontrado',409:'Conflicto de datos',413:'Solicitud demasiado grande',500:'Error interno',
    };
    response.status(status).json({ statusCode:status, message:messages[status] ?? 'Solicitud no disponible',
      requestId:request.requestId ?? randomUUID() });
  }
}
export function configureHttp(app: INestApplication, config: ApiConfig, accessLogs=true): void {
  const logger = new Logger('HTTP');
  app.setGlobalPrefix('api/v1');
  app.use((req:RequestWithId,res:Response,next:NextFunction) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('Cache-Control','no-store');
    const start = performance.now();
    if (accessLogs) res.on('finish', () => logger.log({
      requestId:req.requestId, method:req.method, path:req.path,
      status:res.statusCode, durationMs:Math.round(performance.now()-start),
    }));
    next();
  });
  app.use(helmet());
  app.use(json({limit:'128kb'}));
  app.enableCors({
    origin:(origin:string|undefined, callback:(error:Error|null,allow:boolean)=>void) => callback(null, !origin || config.corsOrigins.includes(origin)),
    credentials:false, methods:config.localTickets ? ['GET','HEAD','OPTIONS','POST','PATCH','DELETE'] : ['GET','HEAD','OPTIONS'],
  });
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.useGlobalFilters(new PublicExceptionFilter());
  if (config.swaggerEnabled) {
    const options = new DocumentBuilder().setTitle('EsSalud Ticket API')
      .setDescription('Subetapa 3.2: tickets y estructura organizacional configurable por tenant.')
      .setVersion('0.7.0').addApiKey({type:'apiKey',in:'header',name:'X-Local-Api-Key'},'local-key').build();
    SwaggerModule.setup('docs',app,() => SwaggerModule.createDocument(app,options), {
      jsonDocumentUrl:'docs-json', swaggerOptions:{persistAuthorization:false},
    });
  }
}
