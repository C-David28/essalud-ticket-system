import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AccessPermission, AccessPrincipal, AccessTokenPort, AuthenticationFailure, can, requesterPrincipal } from "../domain/access";
import { LOCAL_TICKETS, LocalTicketsConfig } from "./local-tickets.guard";

export const ACCESS_TOKEN=Symbol("ACCESS_TOKEN");
const PERMISSIONS=Symbol("PERMISSIONS");
const AUTHENTICATED=Symbol("AUTHENTICATED");
export type AccessRequest=Request&{requestId?:string;principal?:AccessPrincipal};
export const RequirePermission=(permission:AccessPermission)=>SetMetadata(PERMISSIONS,permission);
export const RequireAuthenticated=()=>SetMetadata(AUTHENTICATED,true);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(ACCESS_TOKEN) private readonly tokens:AccessTokenPort,
    @Inject(LOCAL_TICKETS) private readonly local:LocalTicketsConfig){}
  canActivate(context:ExecutionContext):boolean {
    const request=context.switchToHttp().getRequest<AccessRequest>(),authorization=request.headers.authorization;
    if(authorization===undefined){request.principal=requesterPrincipal(this.local.redAsistencialId,this.local.userId);return true;}
    const match=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization);
    if(!match)throw new UnauthorizedException();
    try {request.principal=this.tokens.verify(match[1]!);if(request.principal.redAsistencialId!==this.local.redAsistencialId)throw new AuthenticationFailure();return true;}
    catch(error){if(error instanceof AuthenticationFailure)throw new UnauthorizedException();throw error;}
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector:Reflector){}
  canActivate(context:ExecutionContext):boolean {
    const permission=this.reflector.getAllAndOverride<AccessPermission>(PERMISSIONS,[context.getHandler(),context.getClass()]);
    const authenticated=this.reflector.getAllAndOverride<boolean>(AUTHENTICATED,[context.getHandler(),context.getClass()]);
    const principal=context.switchToHttp().getRequest<AccessRequest>().principal;
    if(!principal)throw new UnauthorizedException();
    if(authenticated&&!principal.authenticated)throw new UnauthorizedException();
    if(permission&&!can(principal,permission))throw new ForbiddenException();
    return true;
  }
}
