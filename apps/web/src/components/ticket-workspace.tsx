"use client";
import { useEffect, useRef, useState, type FormEvent, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCheck,
  CheckCircle2,
  Circle,
  CircleDashed,
  ClipboardList,
  Clock3,
  HardDrive,
  Info,
  Monitor,
  MapPin,
  Network,
  Plus,
  Search,
  Stethoscope,
  Ticket,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ticketScope, useTickets } from "@/components/providers";
import { isTicketId, ticketStateKey, type TicketFilters, type TicketView } from "@/lib/ticket-client";
import { CategoryAssistance } from "@/components/category-assistance";
import {
  CATEGORIES,
  PRIORITIES,
  formatDate,
  validateDraft,
  type Category,
  type DemoTicket,
  type TicketDraft,
  type TicketStatus,
} from "@/lib/demo-tickets";
import { getPublicOrganizationCatalog } from "@/lib/organization-client";
import type { StaffSession } from "@/lib/staff-session";

const categoryIcons: Record<Category, ComponentType<{ size?: number }>> = {
  "Soporte técnico": Monitor,
  "Redes y conectividad": Network,
  Infraestructura: HardDrive,
  "Equipamiento biomédico": Stethoscope,
};
const stateClasses: Record<TicketStatus, string> = {
  Abierto: "open",
  "En Proceso": "progress",
  Pendiente: "pending",
  Resuelto: "resolved",
  Cerrado: "closed",
};
const statusIcons = {
  Abierto: Circle,
  "En Proceso": CircleDashed,
  Pendiente: Clock3,
  Resuelto: CheckCircle2,
  Cerrado: CheckCheck,
};
const nextStatuses: Record<TicketStatus, readonly TicketStatus[]> = {
  Abierto: ["En Proceso"],
  "En Proceso": ["Pendiente", "Resuelto"],
  Pendiente: ["En Proceso"],
  Resuelto: ["En Proceso", "Cerrado"],
  Cerrado: [],
};
const activeStatuses: readonly TicketStatus[] = ["Abierto", "En Proceso", "Pendiente"];
const historyStatuses: readonly TicketStatus[] = ["Resuelto", "Cerrado"];
function Status({ status }: { status: TicketStatus }) {
  const Icon = statusIcons[status];
  return (
    <span className={"status-badge " + stateClasses[status]}>
      <Icon size={13} />
      {status}
    </span>
  );
}
function Priority({ value }: { value: DemoTicket["priority"] }) {
  return (
    <span className={"priority " + value.toLowerCase()}>
      <span />
      {value}
    </span>
  );
}
function Empty({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <Search size={30} />
      <h3>No encontramos solicitudes</h3>
      <p>Prueba con otra palabra o cambia los filtros.</p>
      <Button variant="outline" onClick={reset}>
        Limpiar filtros
      </Button>
    </div>
  );
}
const emptyDraft = (category: Category = CATEGORIES[0]): TicketDraft => ({
  title: "",
  description: "",
  category,
  center: "",
  area: "",
  priority: "Media",
});

export function TicketWorkspace({ mode,access,initialTicket,initialCenterId }: { mode: "portal" | "tecnico";access?:StaffSession;initialTicket?:string;initialCenterId?:string }) {
  const tech = mode === "tecnico";
  const canAssign=tech&&!!access?.permissions.includes("tickets:assign"),canTransition=tech&&!!access?.permissions.includes("tickets:transition");
  const [search, setSearch] = useState("");
  const [listState, setListState] = useState<{view: TicketView; search: string; status: TicketStatus | "";
    centerId: string; priority: DemoTicket["priority"] | ""; category: Category | ""; page: number}>(() => ({
      view: "active", search: "", status: "", centerId: initialCenterId && isTicketId(initialCenterId) ? initialCenterId : "",
      priority: "", category: "", page: 1,
    }));
  const {view, status, centerId: center, priority, category, page} = listState;
  const [selected, setSelected] = useState<string | null>(initialTicket ?? null);
  const filters: TicketFilters = {view, search: listState.search, status, centerId: center, priority, category};
  const {tickets, summary, summaryError, detail, detailLoading, detailError, hasMore, fetching,
    technicians,add,move,assign,autoAssign,realtime,loading,error:loadError,busy,refresh}=useTickets({
      technical:tech,canAssign,scope:ticketScope(access),filters,summaryFilters:{...filters,view:"all"},page,selectedTicketId:selected,
    });
  const organization=useQuery({queryKey:["public-organization"],queryFn:getPublicOrganizationCatalog,staleTime:60000});
  const centers=organization.data?.centers??[];
  const [createOpen, setCreateOpen] = useState(false),
    [draft, setDraft] = useState<TicketDraft>(emptyDraft),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [message, setMessage] = useState("");
  const [nextStatus, setNextStatus] = useState<TicketStatus | "">("");
  const [reason, setReason] = useState("");
  const [technicianId,setTechnicianId]=useState(""),[assignmentReason,setAssignmentReason]=useState("");
  const lastDetailTrigger = useRef<HTMLButtonElement | null>(null);
  const lastTicketId = useRef<string>("");
  const visible = tickets;
  const viewStatuses = view === "history" ? historyStatuses : activeStatuses;
  useEffect(() => {
    const timer = setTimeout(() => setListState(old => old.search===search.trim().slice(0,100)?old:
      ({...old, search: search.trim().slice(0,100), page: 1})), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { if(initialTicket) setSelected(initialTicket); }, [initialTicket]);
  function changeFilter(next: Partial<typeof listState>) { setListState(old => ({...old,...next,page:1})); }
  useEffect(() => {
    setNextStatus(detail ? (nextStatuses[detail.status][0] ?? "") : "");
    setReason("");
    setTechnicianId(detail?.assigneeId??technicians[0]?.technicianId??"");
    setAssignmentReason("");
  }, [detail?.id, detail?.status, detail?.assigneeId, technicians[0]?.technicianId]);
  function reset() {
    setSearch("");
    changeFilter({search:"",status:"",centerId:"",priority:"",category:""});
  }
  function openCreate(category?: Category) {
    const first=centers[0],area=first?.areas[0];
    setDraft({...emptyDraft(category),center:first?.name??"",centerId:first?.centerId,area:area?.name??"",areaId:area?.areaId});
    setErrors({});
    setCreateOpen(true);
  }
  function showDetail(ticket: DemoTicket, trigger: HTMLButtonElement) {
    lastDetailTrigger.current = trigger;
    lastTicketId.current = ticket.id;
    setSelected(ticket.ticketId);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateDraft(draft);
    if(!draft.centerId)next.center="Selecciona una sede.";
    if(!draft.areaId)next.area="Selecciona un área.";
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById("draft-" + Object.keys(next)[0])?.focus();
      return;
    }
    try {
      const ticket = await add(draft);
      setCreateOpen(false);
      setSearch("");
      changeFilter({view:"active",search:"",status:"",centerId:"",priority:"",category:""});
      setMessage(ticket.id + " creada y guardada en PostgreSQL.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear la solicitud.");
    }
  }
  async function changeState() {
    if (!detail || !nextStatus) return;
    if (reason.trim().length < 5 || reason.trim().length > 500) {
      setMessage("Escribe un motivo de 5 a 500 caracteres.");
      return;
    }
    try {
      await move(detail.ticketId, nextStatus, reason.trim());
      setMessage(detail.id + " cambió a " + nextStatus + " y el tablero fue notificado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar el estado.");
    }
  }
  async function manualAssignment() {
    if(!detail||!technicianId)return;
    if(assignmentReason.trim().length<5){setMessage("Escribe un motivo de asignación de al menos 5 caracteres.");return;}
    try {await assign(detail.ticketId,technicianId,assignmentReason.trim());
      setMessage(detail.id+" fue asignado manualmente y el tablero fue actualizado.");}
    catch(error){setMessage(error instanceof Error?error.message:"No se pudo asignar el ticket.");}
  }
  async function automaticAssignment() {
    if(!detail)return;
    try {await autoAssign(detail.ticketId);setMessage(detail.id+" fue asignado al técnico con menor carga.");}
    catch(error){setMessage(error instanceof Error?error.message:"No hay capacidad disponible.");}
  }
  function field(key: keyof TicketDraft, value: string) {
    setDraft((old) => ({ ...old, [key]: value }));
  }
  const error = (key: string) =>
    errors[key] ? (
      <span id={"error-" + key} className="field-error">
        {errors[key]}
      </span>
    ) : null;
  return (
    <div className="workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {tech ? "GESTIÓN DE ATENCIONES" : "PORTAL PÚBLICO DE SOPORTE"}
          </div>
          <h1>{tech ? "Tablero de atención" : "¿Qué necesitas reportar?"}</h1>
          <p>
            {tech
              ? `Sesión: ${access?.displayName??"personal autorizado"}. Solo se muestran las sedes permitidas.`
              : "Reporta una incidencia sin crear una cuenta y conserva tu código de atención."}
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (open) {
              const first=centers[0],area=first?.areas[0];
              setDraft({...emptyDraft(),center:first?.name??"",centerId:first?.centerId,area:area?.name??"",areaId:area?.areaId});
              setErrors({});
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus />
              Reportar incidencia
            </Button>
          </DialogTrigger>
          <DialogContent>
            <div className="dialog-heading">
              <span className="eyebrow">{tech ? "REGISTRO TÉCNICO DE DEMOSTRACIÓN" : "REPORTE SIN INICIO DE SESIÓN"}</span>
              <DialogTitle>Reportar una incidencia</DialogTitle>
              <DialogDescription>
                {tech ? "Registra un caso ficticio para comprobar el flujo operativo." :
                  "No necesitas iniciar sesión. Usa información ficticia; recibirás un código para identificar la solicitud."}
              </DialogDescription>
            </div>
            <form onSubmit={submit} noValidate className="request-form">
              <label htmlFor="draft-title">
                ¿Qué necesitas resolver?
                <Input
                  id="draft-title"
                  value={draft.title}
                  onChange={(e) => field("title", e.target.value)}
                  maxLength={120}
                  placeholder="Ej. La impresora no responde"
                  aria-invalid={!!errors.title}
                  aria-describedby={errors.title ? "error-title" : undefined}
                  required
                />
                {error("title")}
              </label>
              <label htmlFor="draft-description">
                Describe el problema
                <textarea
                  id="draft-description"
                  value={draft.description}
                  onChange={(e) => field("description", e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Indica qué ocurre y desde cuándo, usando un caso ficticio."
                  className="field"
                  aria-invalid={!!errors.description}
                  aria-describedby={
                    errors.description ? "error-description" : undefined
                  }
                  required
                />
                {error("description")}
              </label>
              <CategoryAssistance
                title={draft.title}
                description={draft.description}
                open={createOpen}
                busy={busy}
                onAccept={(category) => field("category", category)}
              />
              <div className="form-grid">
                <label htmlFor="draft-category">
                  Categoría
                  <select
                    id="draft-category"
                    value={draft.category}
                    onChange={(e) => field("category", e.target.value)}
                    className="field"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  {error("category")}
                </label>
                <label htmlFor="draft-priority">
                  Prioridad
                  <select
                    id="draft-priority"
                    value={draft.priority}
                    onChange={(e) => field("priority", e.target.value)}
                    className="field"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  {error("priority")}
                </label>
                <label htmlFor="draft-center">
                  Centro local
                  <select
                    id="draft-center"
                    value={draft.centerId??""}
                    onChange={(e) => {const site=centers.find(item=>item.centerId===e.target.value),area=site?.areas[0];
                      setDraft(old=>({...old,centerId:site?.centerId,center:site?.name??"",areaId:area?.areaId,area:area?.name??""}));}}
                    className="field"
                    disabled={organization.isPending||!centers.length}
                  >
                    {centers.map((c) => (
                      <option key={c.centerId} value={c.centerId}>{c.name}</option>
                    ))}
                  </select>
                  {error("center")}
                </label>
                <label htmlFor="draft-area">
                  Área
                  <select
                    id="draft-area"
                    value={draft.areaId??""}
                    onChange={(e) => {const area=centers.find(item=>item.centerId===draft.centerId)?.areas.find(item=>item.areaId===e.target.value);
                      setDraft(old=>({...old,areaId:area?.areaId,area:area?.name??""}));}}
                    className="field"
                    aria-invalid={!!errors.area}
                    aria-describedby={errors.area ? "error-area" : undefined}
                    required
                    disabled={!draft.centerId}
                  >
                    {(centers.find(item=>item.centerId===draft.centerId)?.areas??[]).map(area=><option key={area.areaId} value={area.areaId}>{area.name}</option>)}
                  </select>
                  {error("area")}
                </label>
              </div>
              <div className="form-footer">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Guardando…" : "Enviar solicitud"}
                  <ArrowRight />
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {!tech && (
        <section className="public-journey" aria-label="Cómo funciona el portal">
          <div><span>1</span><strong>Describe la incidencia</strong><small>Completa solo los datos necesarios.</small></div>
          <div><span>2</span><strong>Recibe tu código</strong><small>Guárdalo para identificar la atención.</small></div>
          <div><span>3</span><strong>Sigue el avance</strong><small>Consulta los cambios de tu solicitud.</small></div>
        </section>
      )}
      {message && (
        <div className="feedback" role="status">
          <CheckCircle2 size={18} />
          <span>{message}</span>
          <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {!tech && (
        <>
          <section id="reportar" className="category-grid" aria-label="Categorías de soporte">
            {CATEGORIES.map((category, i) => {
              const Icon = categoryIcons[category];
              return (
                <button
                  key={category}
                  className="category-card"
                  onClick={() => openCreate(category)}
                >
                  <span className={"category-icon tone-" + i}>
                    <Icon size={22} />
                  </span>
                  <span>
                    {category}
                    <small>
                      {
                        [
                          "Equipos, impresoras y aplicaciones",
                          "Internet, red y comunicaciones",
                          "Energía y espacios de trabajo",
                          "Revisión y mantenimiento",
                        ][i]
                      }
                    </small>
                  </span>
                  <ArrowUpRight size={17} className="category-arrow" />
                </button>
              );
            })}
          </section>
          <section
            className="summary-grid"
            aria-label="Resumen de mis solicitudes"
          >
            <div>
              <span className="summary-icon">
                <Ticket size={21} />
              </span>
              <div>
                <span>Total de solicitudes</span>
                <strong>{summary?.total??"—"}</strong>
              </div>
              <small>Guardadas en PostgreSQL local</small>
            </div>
            <div>
              <span className="summary-icon blue">
                <Clock3 size={21} />
              </span>
              <div>
                <span>En atención</span>
                <strong>{summary?.active??"—"}</strong>
              </div>
              <small>Abiertas, en proceso o pendientes</small>
            </div>
            <div>
              <span className="summary-icon green">
                <CheckCircle2 size={21} />
              </span>
              <div>
                <span>Atendidas</span>
                <strong>{summary?.history??"—"}</strong>
              </div>
              <small>Resueltas o cerradas</small>
            </div>
          </section>
        </>
      )}
      <div id={tech ? undefined : "mis-solicitudes"} className={tech ? "board-section" : "portal-columns"}>
        <section className="ticket-section" aria-labelledby="ticket-list-title">
          <div className="section-heading">
            <div>
              <h2 id="ticket-list-title">
                {tech ? "Solicitudes autorizadas" : "Mis solicitudes"}
                <span>{(view==="history"?summary?.history:summary?.active)??"—"}</span>
              </h2>
              <p>
                {tech
                  ? "Datos locales · actualización en tiempo real"
                  : "Consulta el detalle y el avance de tus solicitudes."}
              </p>
            </div>
            {tech && (
              <div className="board-live">
                <span className={"live-indicator " + realtime} role="status">
                  <span />
                  {realtime === "live" ? "Tiempo real activo" : realtime === "reconnecting" ? "Reconectando" : "Conectando"}
                </span>
                <span className="view-label"><ClipboardList size={16} />{view==="history"?"Vista historial":"Vista Kanban"}</span>
              </div>
            )}
          </div>
          <div className="ticket-view-tabs" aria-label="Vista de solicitudes">
            <Button variant={view==="active"?"default":"outline"} aria-pressed={view==="active"}
              onClick={()=>changeFilter({view:"active",status:""})}>Trabajo activo <span>{summary?.active??"—"}</span></Button>
            <Button variant={view==="history"?"default":"outline"} aria-pressed={view==="history"}
              onClick={()=>changeFilter({view:"history",status:""})}>Historial <span>{summary?.history??"—"}</span></Button>
          </div>
          {summaryError&&<p role="alert" className="field-error">{summaryError}</p>}
          <div className="filters">
            <div className="search-field">
              <Search size={18} />
              <Input
                aria-label="Buscar solicitudes"
                placeholder="Buscar por código o descripción…"
                value={search}
                maxLength={100}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {tech ? (
              <>
                <select
                  className="field filter-select"
                  aria-label="Filtrar por centro"
                  value={center}
                  onChange={(e) => changeFilter({centerId:e.target.value})}
                >
                  <option value="">Todos los centros</option>
                  {centers.filter(c=>!access||access.scope!=="SEDE"||access.centerIds.includes(c.centerId)).map((c) => (
                    <option key={c.centerId} value={c.centerId}>{c.name}</option>
                  ))}
                </select>
                <select
                  className="field filter-select"
                  aria-label="Filtrar por prioridad"
                  value={priority}
                  onChange={(e) => changeFilter({priority:e.target.value as DemoTicket["priority"]|""})}
                >
                  <option value="">Todas las prioridades</option>
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <select className="field filter-select" aria-label="Filtrar por categoría" value={category}
                  onChange={e=>changeFilter({category:e.target.value as Category|""})}>
                  <option value="">Todas las categorías</option>{CATEGORIES.map(item=><option key={item}>{item}</option>)}
                </select>
              </>
            ) : null}
              <select
                className="field filter-select"
                aria-label="Filtrar por estado"
                value={status}
                onChange={(e) => changeFilter({status:e.target.value as TicketStatus|""})}
              >
                <option value="">Todos los estados</option>
                {viewStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
          </div>
          {tech&&!!technicians.length&&<div className="workload-strip" aria-label="Carga activa por técnico">
            {technicians.map(technician=><div key={technician.technicianId}>
              <span>{technician.name}<small>{technician.level}</small></span>
              <strong>{technician.activeLoad}/{technician.maxCapacity}</strong>
            </div>)}
          </div>}
          {tech && (
            <div className="board-meta">
              <span role="status">{visible.length} solicitudes en esta página · Página {page}</span>
            </div>
          )}
          {loading ? (
            <div className="empty-state" role="status"><Clock3 size={30} /><h3>Cargando solicitudes</h3></div>
          ) : loadError ? (
            <div className="empty-state" role="alert"><Info size={30} /><h3>API local no disponible</h3>
              <p>{loadError}</p><Button variant="outline" onClick={() => void refresh()}>Reintentar</Button></div>
          ) : !visible.length ? (
            <Empty reset={reset} />
          ) : tech&&view==="active" ? (
            <div className="kanban" aria-label="Tablero Kanban" tabIndex={0}>
              {activeStatuses.map((s) => {
                const Icon = statusIcons[s];
                const rows = visible.filter((t) => t.status === s);
                return (
                  <section
                    key={s}
                    className={"kanban-column " + stateClasses[s]}
                    aria-label={s}
                  >
                    <div className="column-heading">
                      <Icon size={16} />
                      <h3>{s}</h3>
                      <span>{summary?.byState[ticketStateKey[s]]??"—"}</span>
                    </div>
                    <div className="column-body">
                      {rows.map((ticket) => {
                        const CategoryIcon = categoryIcons[ticket.category];
                        return (
                          <button
                            className="kanban-card"
                            key={ticket.id}
                            data-ticket-id={ticket.id}
                            onClick={(e) => showDetail(ticket, e.currentTarget)}
                            aria-label={
                              "Ver " + ticket.id + ": " + ticket.title
                            }
                          >
                            <div className="card-meta">
                              <span>{ticket.id}</span>
                              <Priority value={ticket.priority} />
                            </div>
                            <h4>{ticket.title}</h4>
                            <p>
                              <Building2 size={14} />
                              {ticket.center}
                            </p>
                            <span className="card-category">
                              <CategoryIcon size={13} />
                              {ticket.category}
                            </span>
                            <div className="card-bottom">
                              <span className="assignee">
                                <span
                                  className={
                                    "avatar " +
                                    (!ticket.assignee ? "unassigned" : "")
                                  }
                                >
                                  {ticket.assignee
                                    ? ticket.assignee.split(/\s+/).slice(-2).map(part=>part[0]).join("").toUpperCase()
                                    : "—"}
                                </span>
                                {ticket.assignee ?? "Sin asignar"}
                              </span>
                              <time dateTime={ticket.createdAt}>
                                {formatDate(ticket.createdAt)}
                              </time>
                            </div>
                          </button>
                        );
                      })}
                      {!rows.length && (
                        <p className="column-empty">Sin solicitudes en esta página</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : tech ? (
            <div className="history-table-wrap"><table className="history-table" aria-label="Historial de solicitudes">
              <thead><tr><th>Solicitud</th><th>Estado</th><th>Prioridad</th><th>Registrada</th></tr></thead>
              <tbody>{visible.map(ticket=><tr key={ticket.ticketId}><td>
                <button className="history-ticket" data-ticket-id={ticket.id} onClick={e=>showDetail(ticket,e.currentTarget)}
                  aria-label={"Ver "+ticket.id+": "+ticket.title}><strong>{ticket.id}</strong><span>{ticket.title}</span><small>{ticket.center} · {ticket.area}</small></button>
              </td><td><Status status={ticket.status}/></td><td><Priority value={ticket.priority}/></td>
                <td><time dateTime={ticket.createdAt}>{formatDate(ticket.createdAt)}</time></td></tr>)}</tbody>
            </table></div>
          ) : (
            <div className="ticket-list">
              <div className="list-labels" aria-hidden="true">
                <span>SOLICITUD</span>
                <span>ESTADO</span>
                <span>PRIORIDAD</span>
                <span />
              </div>
              {visible.map((ticket) => {
                const Icon = categoryIcons[ticket.category];
                return (
                  <button
                    className="ticket-row"
                    key={ticket.id}
                    data-ticket-id={ticket.id}
                    onClick={(e) => showDetail(ticket, e.currentTarget)}
                    aria-label={"Ver " + ticket.id + ": " + ticket.title}
                  >
                    <div className="ticket-main">
                      <span className="ticket-icon">
                        <Icon size={21} />
                      </span>
                      <div>
                        <div className="ticket-reference">
                          {ticket.id}
                          <span>·</span>
                          <time dateTime={ticket.createdAt}>
                            {formatDate(ticket.createdAt)}
                          </time>
                        </div>
                        <h3>{ticket.title}</h3>
                        <p>
                          {ticket.center} · {ticket.area}
                        </p>
                      </div>
                    </div>
                    <Status status={ticket.status} />
                    <Priority value={ticket.priority} />
                    <ArrowRight size={17} />
                  </button>
                );
              })}
              <div className="list-footnote">
                {visible.length} solicitudes en esta página · Vista solicitante
              </div>
            </div>
          )}
          <nav className="ticket-pagination" aria-label="Paginación de solicitudes">
            <Button variant="outline" disabled={page===1||fetching} onClick={()=>setListState(old=>({...old,page:old.page-1}))}>Anterior</Button>
            <span>Página {page} · Hasta 25 solicitudes</span>
            <Button variant="outline" disabled={!hasMore||fetching} onClick={()=>setListState(old=>({...old,page:old.page+1}))}>Siguiente</Button>
          </nav>
        </section>
        {!tech && (
          <aside className="help-panel">
            <span className="help-icon">
              <Info size={23} />
            </span>
            <h2>
              Una buena descripción
              <br />
              agiliza la atención
            </h2>
            <p>
              Cuéntanos qué equipo o servicio presenta el problema y qué
              comprobaciones realizaste.
            </p>
            <div className="help-divider" />
            <strong>Antes de registrar</strong>
            <ul>
              <li>Identifica el centro y el área.</li>
              <li>Describe el problema con claridad.</li>
              <li>Usa solo información ficticia en esta demostración.</li>
            </ul>
            <span className="help-caption">
              Tus solicitudes, en un solo lugar.
            </span>
          </aside>
        )}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = lastDetailTrigger.current?.isConnected
              ? lastDetailTrigger.current
              : document.querySelector<HTMLButtonElement>(
                  '[data-ticket-id="' + lastTicketId.current + '"]',
                );
            trigger?.focus();
          }}
        >
          {!detail&&<>
            <DialogTitle>Detalle de solicitud</DialogTitle>
            <DialogDescription>{detailLoading?"Cargando la solicitud…":detailError||"La solicitud no está disponible."}</DialogDescription>
            {detailError&&<p role="alert">{detailError}</p>}
            <Button variant="outline" onClick={()=>setSelected(null)}>Cerrar detalle</Button>
          </>}
          {detail && (
            <>
              <div className="dialog-heading">
                <span className="eyebrow">
                  {detail.id} · SOLICITUD LOCAL
                </span>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.center} · {detail.area}
                </DialogDescription>
                {detail.isDemo&&<span className="demo-data-badge">DATO DEMO</span>}
              </div>
              <div className="detail-badges">
                <Status status={detail.status} />
                <Priority value={detail.priority} />
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Categoría</dt>
                  <dd>{detail.category}</dd>
                </div>
                <div>
                  <dt>Registrada</dt>
                  <dd>{formatDate(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>Centro local</dt>
                  <dd>{detail.center}</dd>
                </div>
                <div>
                  <dt>Asignación</dt>
                  <dd>{detail.assignee ?? "Sin asignar"}</dd>
                </div>
              </dl>
              <section className="detail-description">
                <h3>Descripción</h3>
                <p>{detail.description}</p>
              </section>
              {tech&&detail.centerId&&<Link className="map-detail-link" href={"/mapa?sede="+encodeURIComponent(detail.centerId)+"&ticket="+encodeURIComponent(detail.ticketId)}>
                <MapPin size={16}/> Ver sede en el mapa
              </Link>}
              {tech && canAssign && (
                <div className="demo-change assignment-control">
                  <strong>Asignación técnica</strong>
                  <p>Actual: {detail.assignee??"Sin asignar"}{detail.assignmentMode?" · "+(detail.assignmentMode==="AUTOMATICA"?"Automática":"Manual"):""}</p>
                  {!["Resuelto","Cerrado"].includes(detail.status)&&<>
                    <label htmlFor="ticket-technician">Técnico
                      <select id="ticket-technician" className="field" value={technicianId}
                        onChange={event=>setTechnicianId(event.target.value)} disabled={busy||!technicians.length}>
                        {technicians.map(technician=><option key={technician.technicianId} value={technician.technicianId}>
                          {technician.name} · {technician.activeLoad}/{technician.maxCapacity}
                        </option>)}
                      </select>
                    </label>
                    <label htmlFor="assignment-reason">Motivo de asignación
                      <Input id="assignment-reason" value={assignmentReason} maxLength={500}
                        onChange={event=>setAssignmentReason(event.target.value)} placeholder="Ej. Especialista disponible en turno" />
                    </label>
                    <div className="assignment-actions">
                      <Button variant="outline" onClick={()=>void automaticAssignment()} disabled={busy||!!detail.assigneeId}>Asignar por menor carga</Button>
                      <Button onClick={()=>void manualAssignment()} disabled={busy||!technicianId||assignmentReason.trim().length<5}>Asignar manualmente</Button>
                    </div>
                  </>}
                </div>
              )}
              {tech && canTransition && (
                <div className="demo-change">
                  <label htmlFor="demo-status">
                    Siguiente estado
                    <select
                      id="demo-status"
                      className="field"
                      value={nextStatus}
                      disabled={!nextStatuses[detail.status].length || busy}
                      onChange={(e) => setNextStatus(e.target.value as TicketStatus)}
                    >
                      {!nextStatuses[detail.status].length && <option value="">Estado terminal</option>}
                      {nextStatuses[detail.status].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  {!!nextStatuses[detail.status].length && (
                    <>
                      <label htmlFor="state-reason">
                        Motivo
                        <textarea id="state-reason" className="field" rows={3} maxLength={500}
                          value={reason} onChange={(e) => setReason(e.target.value)}
                          placeholder="Describe brevemente la atención realizada" />
                      </label>
                      <Button onClick={() => void changeState()} disabled={busy || reason.trim().length < 5}>
                        {busy ? "Guardando…" : "Guardar cambio"}
                      </Button>
                    </>
                  )}
                  <p>El cambio queda auditado y se envía a los tableros conectados.</p>
                </div>
              )}
              <div className="form-footer">
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Cerrar detalle
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
