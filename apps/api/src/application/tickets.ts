import { TicketRepository, TicketInput, TicketChanges, TicketFailure, TicketState } from '../domain/ticket';
import { TenantContext } from '../domain/tenant-context';
export class Tickets {
  constructor(private readonly repository: TicketRepository) {}
  create(context: TenantContext, input: TicketInput) { return this.repository.create(context,input); }
  list(context: TenantContext,page: number,pageSize: number) { return this.repository.list(context,page,pageSize); }
  get(context: TenantContext,id: string) { return this.repository.get(context,id); }
  update(context: TenantContext,id: string,input: TicketChanges) {
    if (Object.keys(input).length===0) throw new TicketFailure('INVALID');
    return this.repository.update(context,id,input);
  }
  transition(context:TenantContext,id:string,state:TicketState,reason:string) {
    return this.repository.transition(context,id,state,reason);
  }
  history(context:TenantContext,id:string) { return this.repository.history(context,id); }
  delete(context: TenantContext,id: string) { return this.repository.delete(context,id); }
}
