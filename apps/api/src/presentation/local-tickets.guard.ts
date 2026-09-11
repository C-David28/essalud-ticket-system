import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
export const LOCAL_TICKETS = Symbol('LOCAL_TICKETS');
import type { LocalTicketsConfig } from '../infrastructure/config';
export type { LocalTicketsConfig } from '../infrastructure/config';
@Injectable()
export class LocalTicketsGuard implements CanActivate {
  constructor(@Inject(LOCAL_TICKETS) private readonly config: LocalTicketsConfig) {}
  canActivate(context: ExecutionContext): boolean {
    const request=context.switchToHttp().getRequest<Request>();
    const key=request.headers['x-local-api-key'];
    if(typeof key!=='string' || !/^[a-f0-9]{64}$/.test(key) ||
       !timingSafeEqual(Buffer.from(key),Buffer.from(this.config.key))) throw new UnauthorizedException();
    return true;
  }
}

