import { AuthorizedContext } from './access';
export const CATEGORIES = ['SOPORTE','REDES','INFRAESTRUCTURA','BIOMEDICO'] as const;
export const PRIORITIES = ['BAJA','MEDIA','ALTA','CRITICA'] as const;
export const TICKET_STATES = ['ABIERTO','EN_PROCESO','PENDIENTE','RESUELTO','CERRADO'] as const;
export type TicketState = typeof TICKET_STATES[number];
export const TICKET_EVENT_TYPES = ['ticket.created','ticket.updated','ticket.state_changed','ticket.assignment_changed','ticket.deleted'] as const;
export type TicketEventType = typeof TICKET_EVENT_TYPES[number];
export type TicketEvent = Readonly<{
  version: 1;
  eventId: string;
  type: TicketEventType;
  redAsistencialId: string;
  ticketId: string;
  centroAsistencialId:string;
  solicitanteId:string;
  occurredAt: string;
}>;
export interface TicketEventBus {
  publish(event: TicketEvent): Promise<void>;
  subscribe(redAsistencialId: string, listener: (event: TicketEvent) => void): () => void;
}
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
  assignedTo:string|null;assignedAt:Date|null;assignmentMode:'MANUAL'|'AUTOMATICA'|null;
  isDemo:boolean; centroNombre:string; areaNombre:string;
}
export interface SupportTechnician {technicianId:string;name:string;level:'N1'|'N2';maxCapacity:number;activeLoad:number;availableCapacity:number}
export interface TicketAssignment {assignmentId:string;ticketId:string;codigo:string;previousTechnicianId:string|null;
  newTechnicianId:string;assignmentMode:'MANUAL'|'AUTOMATICA';motivo:string;changedBy:string;requestId:string;changedAt:Date}
export interface TicketTransition { transitionId:string; ticketId:string; codigo:string;
  estadoAnterior:TicketState|null; estadoNuevo:TicketState; motivo:string; changedBy:string;
  requestId:string; changedAt:Date; }
export interface TicketPage { items: Ticket[]; page: number; pageSize: number; hasMore: boolean }
export class TicketFailure extends Error {
  constructor(readonly kind: 'NOT_FOUND'|'INVALID'|'CONFLICT') { super(kind); }
}
export interface TicketRepository {
  create(context: AuthorizedContext, input: TicketInput): Promise<Ticket>;
  list(context: AuthorizedContext, page: number, pageSize: number): Promise<TicketPage>;
  get(context: AuthorizedContext, id: string): Promise<Ticket>;
  update(context: AuthorizedContext, id: string, input: TicketChanges): Promise<Ticket>;
  transition(context: AuthorizedContext,id:string,state:TicketState,reason:string): Promise<Ticket>;
  history(context: AuthorizedContext,id:string): Promise<TicketTransition[]>;
  technicians(context:AuthorizedContext):Promise<SupportTechnician[]>;
  assign(context:AuthorizedContext,id:string,technicianId:string,reason:string):Promise<Ticket>;
  autoAssign(context:AuthorizedContext,id:string):Promise<Ticket>;
  assignmentHistory(context:AuthorizedContext,id:string):Promise<TicketAssignment[]>;
  delete(context: AuthorizedContext, id: string): Promise<void>;
}
