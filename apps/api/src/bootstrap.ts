import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ApiConfig } from './infrastructure/config';
import { configureHttp } from './presentation/http';
export async function createApplication(config:ApiConfig, quiet=false) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    bodyParser:false, logger: quiet ? false : new ConsoleLogger({json:true}), abortOnError:false,
  });
  configureHttp(app,config,!quiet);
  return app;
}
