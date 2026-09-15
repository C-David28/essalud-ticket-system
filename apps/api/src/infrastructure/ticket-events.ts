import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { TicketEvent, TicketEventBus, TICKET_EVENT_TYPES } from '../domain/ticket';

const CHANNEL_PREFIX='essalud:tickets:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

@Injectable()
export class RedisTicketEvents implements TicketEventBus,OnModuleInit,OnApplicationShutdown {
  private readonly logger=new Logger(RedisTicketEvents.name);
  private readonly sourceId=randomUUID();
  private readonly publisher:Redis;
  private readonly subscriber:Redis;
  private readonly listeners=new Map<string,Set<(event:TicketEvent)=>void>>();
  constructor(redisUrl:string) {
    const options={lazyConnect:true,maxRetriesPerRequest:2,enableReadyCheck:true};
    this.publisher=new Redis(redisUrl,options);
    this.subscriber=new Redis(redisUrl,options);
    this.publisher.on('error',()=>this.logger.warn('Publicador Redis temporalmente no disponible'));
    this.subscriber.on('error',()=>this.logger.warn('Suscriptor Redis temporalmente no disponible'));
  }
  async onModuleInit() {
    await Promise.all([this.publisher.connect(),this.subscriber.connect()]);
    this.subscriber.on('pmessage',(_pattern,channel,message)=>this.receive(channel,message));
    await this.subscriber.psubscribe(CHANNEL_PREFIX+'*');
  }
  private receive(channel:string,message:string) {
    try {
      const envelope=JSON.parse(message) as {sourceId?:unknown;event?:unknown};
      if(envelope.sourceId===this.sourceId||!this.valid(envelope.event)) return;
      const event=envelope.event;
      if(channel!==CHANNEL_PREFIX+event.redAsistencialId) return;
      this.deliver(event);
    } catch { this.logger.warn('Evento de tickets Redis descartado por formato invalido'); }
  }
  private valid(value:unknown):value is TicketEvent {
    if(!value||typeof value!=='object') return false;
    const event=value as Partial<TicketEvent>;
    return event.version===1&&UUID.test(event.eventId??'')&&UUID.test(event.ticketId??'')&&
      UUID.test(event.redAsistencialId??'')&&UUID.test(event.centroAsistencialId??'')&&UUID.test(event.solicitanteId??'')&&
      typeof event.occurredAt==='string'&&!Number.isNaN(Date.parse(event.occurredAt))&&
      TICKET_EVENT_TYPES.includes(event.type as TicketEvent['type']);
  }
  private deliver(event:TicketEvent) {
    for(const listener of this.listeners.get(event.redAsistencialId)??[]) {
      try {listener(event);} catch {this.logger.warn('Suscriptor local de tickets descarto un evento');}
    }
  }
  async publish(event:TicketEvent) {
    this.deliver(event);
    try {
      await this.publisher.publish(CHANNEL_PREFIX+event.redAsistencialId,JSON.stringify({sourceId:this.sourceId,event}));
    } catch { this.logger.warn('Cambio confirmado; Redis no pudo propagarlo a otras instancias'); }
  }
  subscribe(redAsistencialId:string,listener:(event:TicketEvent)=>void) {
    const listeners=this.listeners.get(redAsistencialId)??new Set<(event:TicketEvent)=>void>();
    listeners.add(listener);this.listeners.set(redAsistencialId,listeners);
    return ()=>{listeners.delete(listener);if(!listeners.size)this.listeners.delete(redAsistencialId);};
  }
  async onApplicationShutdown() {
    this.listeners.clear();
    for(const client of [this.subscriber,this.publisher]) {
      if(client.status==='end') continue;
      try {await client.quit();} catch {client.disconnect();}
    }
  }
}
