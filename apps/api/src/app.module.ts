import { Tickets } from './application/tickets';
import { PrismaTicketRepository } from './infrastructure/ticket-repository';
import { TicketsController } from './presentation/tickets.controller';
import { LOCAL_TICKETS, LocalTicketsGuard } from './presentation/local-tickets.guard';
import { DynamicModule, Module } from '@nestjs/common';
import { CheckReadiness } from './application/check-readiness';
import { ApiConfig } from './infrastructure/config';
import { Database, PrismaTenantUnitOfWork } from './infrastructure/database';
import { RedisProbe } from './infrastructure/redis-probe';
import { RedisTicketEvents } from './infrastructure/ticket-events';
import { HealthController, SystemController } from './presentation/health.controller';
@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module:AppModule,
      controllers:[HealthController,SystemController,...(config.localTickets ? [TicketsController] : [])],
      providers:[
        ...(config.localTickets ? [{provide:LOCAL_TICKETS,useValue:config.localTickets},LocalTicketsGuard,
          {provide:RedisTicketEvents,useFactory:()=>new RedisTicketEvents(config.redisUrl)},
          {provide:Tickets,useFactory:(uow:PrismaTenantUnitOfWork,events:RedisTicketEvents)=>
            new Tickets(new PrismaTicketRepository(uow),events),inject:[PrismaTenantUnitOfWork,RedisTicketEvents]}] : []),
        {provide:Database,useFactory:() => new Database(config.databaseUrl)},
        {provide:RedisProbe,useFactory:() => new RedisProbe(config.redisUrl)},
        {provide:CheckReadiness,useFactory:(db:Database,redis:RedisProbe) => new CheckReadiness(db,redis),inject:[Database,RedisProbe]},
        {provide:PrismaTenantUnitOfWork,useFactory:(db:Database) => new PrismaTenantUnitOfWork(db),inject:[Database]},
      ],
      exports:[Database,PrismaTenantUnitOfWork],
    };
  }
}
