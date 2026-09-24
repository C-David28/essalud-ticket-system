import { GetOrganizationCatalog } from './application/get-organization-catalog';
import { PrismaOrganizationRepository } from './infrastructure/organization-repository';
import { OrganizationController } from './presentation/organization.controller';
import { PublicOrganizationController } from './presentation/public-organization.controller';
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
import { AuthenticateStaff } from './application/authenticate-staff';
import { PrismaIdentityRepository } from './infrastructure/access-repository';
import { HmacAccessToken, ScryptPasswordVerifier } from './infrastructure/access-token';
import { ACCESS_TOKEN, AccessGuard, PermissionGuard } from './presentation/access.guard';
import { AuthController } from './presentation/auth.controller';
@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module:AppModule,
      controllers:[HealthController,SystemController,...(config.localTickets ? [AuthController,TicketsController,OrganizationController,PublicOrganizationController] : [])],
      providers:[
        ...(config.localTickets ? [{provide:LOCAL_TICKETS,useValue:config.localTickets},LocalTicketsGuard,
          {provide:ACCESS_TOKEN,useFactory:()=>new HmacAccessToken(config.localTickets!.tokenSecret,config.localTickets!.tokenTtlSeconds)},
          AccessGuard,PermissionGuard,
          {provide:AuthenticateStaff,useFactory:(uow:PrismaTenantUnitOfWork,tokens:HmacAccessToken)=>
            new AuthenticateStaff(new PrismaIdentityRepository(uow),new ScryptPasswordVerifier(),tokens,config.localTickets!.tokenTtlSeconds),
            inject:[PrismaTenantUnitOfWork,ACCESS_TOKEN]},
          {provide:RedisTicketEvents,useFactory:()=>new RedisTicketEvents(config.redisUrl)},
          {provide:GetOrganizationCatalog,useFactory:(uow:PrismaTenantUnitOfWork)=>
            new GetOrganizationCatalog(new PrismaOrganizationRepository(uow)),inject:[PrismaTenantUnitOfWork]},
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
