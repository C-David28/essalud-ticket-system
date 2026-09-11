import { TenantContext } from './tenant-context';
export const CATEGORIES = ['SOPORTE','REDES','INFRAESTRUCTURA','BIOMEDICO'] as const;
export const PRIORITIES = ['BAJA','MEDIA','ALTA','CRITICA'] as const;
export const TICKET_STATES = ['ABIERTO','EN_PROCESO','PENDIENTE','RESUELTO','CERRADO'] as const;
export type TicketState = typeof TICKET_STATES[number];
export const TICKET_TRANSITIONS: Readonly<Record<TicketState,readonly TicketState[]>> = Object.freeze({
  ABIERTO:Object.freeze(['EN_PROCESO'] as TicketState[]),
  EN_PROCESO:Object.freeze(['PENDIENTE','RESUELTO'] as TicketState[]),
  PENDIENTE:Object.freeze(['EN_PROCESO'] as TicketState[]),
  RESUELTO:Object.freeze(['EN_PROCESO','CERRADO'] as TicketState[]),
  CERRADO:Object.freeze([] as TicketState[]),
});
export interface TicketInput {
  centroAsistencialId: string; areaId: string; titulo: string; descripcion: string;
  categoria: string; prioridad: string;
}
export type TicketChanges = Partial<Pick<TicketInput,'titulo'|'descripcion'|'categoria'|'prioridad'>>;
export interface Ticket extends TicketInput {
  redAsistencialId: string; ticketId: string; codigo: string; estado: TicketState; solicitanteId: string;
  createdAt: Date; updatedAt: Date; resolvedAt: Date|null; closedAt: Date|null;
}
export interface TicketTransition { transitionId:string; ticketId:string; codigo:string;
  estadoAnterior:TicketState|null; estadoNuevo:TicketState; motivo:string; changedBy:string;
  requestId:string; changedAt:Date; }
export interface TicketPage { items: Ticket[]; page: number; pageSize: number; hasMore: boolean }
export class TicketFailure extends Error {
  constructor(readonly kind: 'NOT_FOUND'|'INVALID'|'CONFLICT') { super(kind); }
}
export interface TicketRepository {
  create(context: TenantContext, input: TicketInput): Promise<Ticket>;
  list(context: TenantContext, page: number, pageSize: number): Promise<TicketPage>;
  get(context: TenantContext, id: string): Promise<Ticket>;
  update(context: TenantContext, id: string, input: TicketChanges): Promise<Ticket>;
  transition(context: TenantContext,id:string,state:TicketState,reason:string): Promise<Ticket>;
  history(context: TenantContext,id:string): Promise<TicketTransition[]>;
  delete(context: TenantContext, id: string): Promise<void>;
}
