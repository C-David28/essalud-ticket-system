import { createHash, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const username=/^[a-z0-9][a-z0-9._-]{2,119}$/;
const roleCode=/^[A-Z][A-Z0-9_]{2,29}$/;
const supportedRoles=new Set(["SOLICITANTE","TECNICO_N1","TECNICO_N2","SUPERVISOR_RED","ADMIN_GCTIC"]);
const sql=value=>"'"+value.replaceAll("'","''")+"'";
const required=(value,label,min,max)=>{
  if(typeof value!=="string"||value.trim().length<min||value.trim().length>max) throw new Error("Configuración de acceso inválida: "+label);
  return value.trim();
};
const id=(value,label)=>{
  if(typeof value!=="string"||!uuid.test(value)) throw new Error("Configuración de acceso inválida: "+label);
  return value;
};
const passwordHash=(password,userId)=>{
  const salt=createHash("sha256").update("essalud-demo:"+userId).digest().subarray(0,16);
  return "scrypt$v1$"+salt.toString("hex")+"$"+scryptSync(password,salt,32).toString("hex");
};

export function loadAccessConfig(env,source=new URL("../../config/access.demo.json",import.meta.url)) {
  const config=JSON.parse(readFileSync(source,"utf8"));
  if(config.version!==1||!Array.isArray(config.users)||config.users.length===0) throw new Error("Versión de acceso no soportada");
  const tokens={
    "$DEMO_TECH_USER_ID":id(env.TICKETS_DEMO_TECH_USER_ID,"usuario técnico"),
    "$DEMO_SUPERVISOR_USER_ID":id(env.TICKETS_DEMO_SUPERVISOR_USER_ID,"usuario supervisor"),
    "$DEMO_ADMIN_USER_ID":id(env.TICKETS_DEMO_ADMIN_USER_ID,"usuario administrador"),
    "$LOCAL_CENTER_ID":id(env.TICKETS_LOCAL_CENTRO_ID,"centro local"),
  };
  const password=required(env.TICKETS_DEMO_PASSWORD,"contraseña demo",12,100);
  const seenUsers=new Set(),seenNames=new Set(),seenAccess=new Set();
  const users=config.users.map((user,index)=>{
    const userId=id(tokens[user.id]??user.id,"usuario "+index);
    const name=required(user.username,"username",3,120).toLowerCase();
    if(!username.test(name)||seenUsers.has(userId)||seenNames.has(name)||!Array.isArray(user.accesses)||!user.accesses.length)
      throw new Error("Usuario demo duplicado o inválido");
    seenUsers.add(userId);seenNames.add(name);
    const accesses=user.accesses.map((access,accessIndex)=>{
      const accessId=id(access.id,"acceso "+accessIndex),role=required(access.role,"rol",3,30);
      if(!roleCode.test(role)||!supportedRoles.has(role)||seenAccess.has(accessId)) throw new Error("Acceso demo duplicado o inválido");
      seenAccess.add(accessId);
      const centerId=access.centerId===undefined?null:id(tokens[access.centerId]??access.centerId,"centro de acceso");
      return {accessId,role,centerId};
    });
    return {userId,username:name,displayName:required(user.displayName,"nombre visible",3,160),
      passwordHash:passwordHash(password,userId),accesses};
  });
  return {redId:id(env.TICKETS_LOCAL_RED_ID,"red local"),users};
}

export function accessSeedSql(env,source) {
  const config=loadAccessConfig(env,source);
  const userIds=config.users.map(user=>sql(user.userId)+"::uuid").join(",");
  const accessIds=config.users.flatMap(user=>user.accesses).map(access=>sql(access.accessId)+"::uuid").join(",");
  const statements=[
    "UPDATE app.usuario_accesos SET activo=false WHERE red_asistencial_id="+sql(config.redId)+"::uuid AND access_id NOT IN ("+accessIds+") AND activo;",
    "UPDATE app.usuarios_institucionales SET activo=false WHERE red_asistencial_id="+sql(config.redId)+"::uuid AND usuario_id NOT IN ("+userIds+") AND activo;",
  ];
  for(const user of config.users) {
    statements.push("INSERT INTO app.usuarios_institucionales(red_asistencial_id,usuario_id,username,display_name,password_hash,activo) VALUES ("+
      [sql(config.redId)+"::uuid",sql(user.userId)+"::uuid",sql(user.username),sql(user.displayName),sql(user.passwordHash),"true"].join(",")+
      ") ON CONFLICT(red_asistencial_id,usuario_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,password_hash=EXCLUDED.password_hash,activo=true;");
    for(const access of user.accesses) statements.push("INSERT INTO app.usuario_accesos(red_asistencial_id,access_id,usuario_id,role_id,centro_asistencial_id,activo) SELECT "+
      [sql(config.redId)+"::uuid",sql(access.accessId)+"::uuid",sql(user.userId)+"::uuid","r.role_id",access.centerId?sql(access.centerId)+"::uuid":"NULL","true"].join(",")+
      " FROM app.roles_institucionales r WHERE r.red_asistencial_id="+sql(config.redId)+"::uuid AND r.codigo="+sql(access.role)+" AND r.activo"+
      " ON CONFLICT(red_asistencial_id,access_id) DO UPDATE SET usuario_id=EXCLUDED.usuario_id,role_id=EXCLUDED.role_id,centro_asistencial_id=EXCLUDED.centro_asistencial_id,activo=true;");
  }
  statements.push("DO $seed$ BEGIN IF (SELECT count(*) FROM app.usuario_accesos WHERE red_asistencial_id="+
    sql(config.redId)+"::uuid AND access_id IN ("+accessIds+") AND activo)<>"+config.users.flatMap(user=>user.accesses).length+
    " THEN RAISE EXCEPTION 'No se pudieron resolver todos los roles demo'; END IF; END $seed$;");
  return statements.join("\n    ");
}
