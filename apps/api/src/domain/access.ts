import { TenantContext } from "./tenant-context";

export const ACCESS_ROLES=["SOLICITANTE","TECNICO_N1","TECNICO_N2","SUPERVISOR_RED","ADMIN_GCTIC"] as const;
export type AccessRole=typeof ACCESS_ROLES[number];
export type AccessScope="PROPIO"|"SEDE"|"RED"|"NACIONAL";
export const ACCESS_PERMISSIONS=["tickets:create","tickets:list","tickets:read","tickets:update","tickets:transition",
  "tickets:history","tickets:assign","tickets:technicians","tickets:delete","tickets:events","organization:read"] as const;
export type AccessPermission=typeof ACCESS_PERMISSIONS[number];
export type AccessPrincipal=Readonly<{
  authenticated:boolean;redAsistencialId:string;userId:string;displayName:string;roles:readonly AccessRole[];
  scope:AccessScope;centerIds:readonly string[];permissions:readonly AccessPermission[];
}>;
export type AuthorizedContext=TenantContext & {readonly principal:AccessPrincipal};
export type IdentityRecord={userId:string;username:string;displayName:string;passwordHash:string;
  accesses:Array<{role:AccessRole;scope:AccessScope;centerId:string|null}>};
export interface IdentityRepository {find(context:TenantContext,username:string):Promise<IdentityRecord|null>}
export interface PasswordVerifier {verify(password:string,encoded:string):boolean}
export interface AccessTokenPort {issue(principal:AccessPrincipal):string;verify(token:string):AccessPrincipal}
export class AuthenticationFailure extends Error {constructor(){super("AUTHENTICATION_FAILED")}}

const rolePermissions:Record<AccessRole,readonly AccessPermission[]>={
  SOLICITANTE:["tickets:create","tickets:list","tickets:read","tickets:events"],
  TECNICO_N1:["tickets:create","tickets:list","tickets:read","tickets:update","tickets:transition","tickets:history","tickets:events","organization:read"],
  TECNICO_N2:["tickets:create","tickets:list","tickets:read","tickets:update","tickets:transition","tickets:history","tickets:events","organization:read"],
  SUPERVISOR_RED:["tickets:create","tickets:list","tickets:read","tickets:update","tickets:transition","tickets:history","tickets:assign","tickets:technicians","tickets:events","organization:read"],
  ADMIN_GCTIC:[...ACCESS_PERMISSIONS],
};
const rank:Record<AccessScope,number>={PROPIO:0,SEDE:1,RED:2,NACIONAL:3};
export function principalFromIdentity(identity:IdentityRecord,redAsistencialId:string):AccessPrincipal {
  if(!identity.accesses.length||identity.accesses.some(access=>!ACCESS_ROLES.includes(access.role)||!(access.scope in rank)||
    (access.scope==='SEDE')!==Boolean(access.centerId))) throw new AuthenticationFailure();
  const roles=[...new Set(identity.accesses.map(access=>access.role))];
  const scope=identity.accesses.map(access=>access.scope).sort((a,b)=>rank[b]-rank[a])[0]!;
  const centerIds=[...new Set(identity.accesses.flatMap(access=>access.centerId?[access.centerId]:[]))];
  const permissions=[...new Set(roles.flatMap(role=>rolePermissions[role]))];
  return Object.freeze({authenticated:true,redAsistencialId,userId:identity.userId,displayName:identity.displayName,
    roles:Object.freeze(roles),scope,centerIds:Object.freeze(centerIds),permissions:Object.freeze(permissions)});
}
export function requesterPrincipal(redAsistencialId:string,userId:string):AccessPrincipal {
  return Object.freeze({authenticated:false,redAsistencialId,userId,displayName:"Solicitante público de demostración",
    roles:Object.freeze(["SOLICITANTE"] as AccessRole[]),scope:"PROPIO",centerIds:Object.freeze([] as string[]),
    permissions:Object.freeze([...rolePermissions.SOLICITANTE])});
}
export function can(principal:AccessPrincipal,permission:AccessPermission){return principal.permissions.includes(permission)}
