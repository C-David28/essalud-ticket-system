import { AccessRole, AccessScope, IdentityRecord, IdentityRepository } from "../domain/access";
import { TenantContext } from "../domain/tenant-context";
import { PrismaTenantUnitOfWork } from "./database";

type IdentityRow={userId:string;username:string;displayName:string;passwordHash:string;role:string;scope:string;centerId:string|null};
export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly uow:PrismaTenantUnitOfWork){}
  async find(context:TenantContext,username:string):Promise<IdentityRecord|null> {
    const rows=await this.uow.run(context,tx=>tx.$queryRaw<IdentityRow[]>`
      SELECT u.usuario_id AS "userId",u.username,u.display_name AS "displayName",u.password_hash AS "passwordHash",
        r.codigo AS role,r.alcance AS scope,a.centro_asistencial_id AS "centerId"
      FROM app.usuarios_institucionales u
      JOIN app.usuario_accesos a ON a.red_asistencial_id=u.red_asistencial_id AND a.usuario_id=u.usuario_id AND a.activo
      JOIN app.roles_institucionales r ON r.red_asistencial_id=a.red_asistencial_id AND r.role_id=a.role_id AND r.activo
      LEFT JOIN app.centros_asistenciales c ON c.red_asistencial_id=a.red_asistencial_id
        AND c.centro_asistencial_id=a.centro_asistencial_id
      WHERE u.red_asistencial_id=${context.redAsistencialId}::uuid AND u.username=${username} AND u.activo
        AND (a.centro_asistencial_id IS NULL OR c.activo)
      ORDER BY r.codigo,a.centro_asistencial_id`);
    if(!rows.length)return null;
    const first=rows[0]!;
    return {userId:first.userId,username:first.username,displayName:first.displayName,passwordHash:first.passwordHash,
      accesses:rows.map(row=>({role:row.role as AccessRole,scope:row.scope as AccessScope,centerId:row.centerId}))};
  }
}
