import { DynamicModule, Module } from '@nestjs/common';
import { CheckReadiness } from './application/check-readiness';
import { ApiConfig } from './infrastructure/config';
import { Database, PrismaTenantUnitOfWork } from './infrastructure/database';
import { RedisProbe } from './infrastructure/redis-probe';
import { HealthController, SystemController } from './presentation/health.controller';
@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module:AppModule,
      controllers:[HealthController,SystemController],
      providers:[
        {provide:Database,useFactory:() => new Database(config.databaseUrl)},
        {provide:RedisProbe,useFactory:() => new RedisProbe(config.redisUrl)},
        {provide:CheckReadiness,useFactory:(db:Database,redis:RedisProbe) => new CheckReadiness(db,redis),inject:[Database,RedisProbe]},
        {provide:PrismaTenantUnitOfWork,useFactory:(db:Database) => new PrismaTenantUnitOfWork(db),inject:[Database]},
      ],
      exports:[Database,PrismaTenantUnitOfWork],
    };
  }
}
