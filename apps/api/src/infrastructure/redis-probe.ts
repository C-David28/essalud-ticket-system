import Redis from 'ioredis';
import { OnApplicationShutdown } from '@nestjs/common';
import { DependencyProbe } from '../domain/health';
export class RedisProbe implements DependencyProbe, OnApplicationShutdown {
  readonly client: Redis;
  constructor(url: string) {
    this.client = new Redis(url, { family: 0, connectTimeout: 1500, commandTimeout: 1500,
      maxRetriesPerRequest: 0, enableOfflineQueue: false,
      retryStrategy: () => 1000 });
    this.client.on('error', () => { /* No imprimir URI ni contrasena. */ });
  }
  async check(): Promise<boolean> {
    if (this.client.status !== 'ready') return false;
    try { return await this.client.ping() === 'PONG'; } catch { return false; }
  }
  onApplicationShutdown(): void { this.client.disconnect(); }
}
