import { TenantContext } from './tenant-context';
export const CATEGORIES = ['SOPORTE','REDES','INFRAESTRUCTURA','BIOMEDICO'] as const;
export const PRIORITIES = ['BAJA','MEDIA','ALTA','CRITICA'] as const;
export interface TicketInput {
  centroAsistencialId: string; areaId: string; titulo: string; descripcion: string;
  categoria: string; prioridad: string;
}
export type TicketChanges = Partial<Pick<TicketInput,'titulo'|'descripcion'|'categoria'|'prioridad'>>;
export interface Ticket extends TicketInput {
  redAsistencialId: string; ticketId: string; codigo: string; estado: string; solicitanteId: string;
  createdAt: Date; updatedAt: Date;
}
export interface TicketPage { items: Ticket[]; page: number; pageSize: number; hasMore: boolean }
export class TicketFailure extends Error {
  constructor(readonly kind: 'NOT_FOUND'|'INVALID'|'CONFLICT') { super(kind); }
}
export interface TicketRepository {
  create(context: TenantContext, input: TicketInput): Promise<Ticket>;
  list(context: TenantContext, page: number, pageSize: number): Promise<TicketPage>;
  get(context: TenantContext, id: string): Promise<Ticket>;
  update(context: TenantContext, id: string, input: TicketChanges): Promise<Ticket>;
  delete(context: TenantContext, id: string): Promise<void>;
}

