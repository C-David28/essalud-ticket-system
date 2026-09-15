import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { ACCESS_PERMISSIONS, ACCESS_ROLES, AccessPermission, AccessPrincipal, AccessScope, AccessTokenPort, AuthenticationFailure } from "../domain/access";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scopes=new Set<AccessScope>(["PROPIO","SEDE","RED","NACIONAL"]);
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
export class ScryptPasswordVerifier {
  verify(password:string,encoded:string):boolean {
    const parts=encoded.split("$");
    const salt=parts[2]??"",hash=parts[3]??"";
    if(parts.length!==4||parts[0]!=="scrypt"||parts[1]!=="v1"||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(hash)) return false;
    const actual=scryptSync(password,Buffer.from(salt,"hex"),32),expected=Buffer.from(hash,"hex");
    return timingSafeEqual(actual,expected);
  }
}
export class HmacAccessToken implements AccessTokenPort {
  private readonly key:Buffer;
  constructor(secret:string,private readonly ttlSeconds:number){this.key=Buffer.from(secret,"hex")}
  private signature(value:string){return createHmac("sha256",this.key).update(value).digest("base64url")}
  issue(principal:AccessPrincipal):string {
    const now=Math.floor(Date.now()/1000),header=encode({alg:"HS256",typ:"JWT"});
    const payload=encode({iss:"essalud-ticket-api",aud:"local-staff",tid:principal.redAsistencialId,sub:principal.userId,name:principal.displayName,
      roles:principal.roles,scope:principal.scope,centers:principal.centerIds,permissions:principal.permissions,iat:now,exp:now+this.ttlSeconds});
    const unsigned=header+"."+payload;return unsigned+"."+this.signature(unsigned);
  }
  verify(token:string):AccessPrincipal {
    try {
      const [header,payload,signature,...rest]=token.split(".");
      if(rest.length||!header||!payload||!signature)throw new Error();
      const unsigned=header!+"."+payload!;
      const expected=Buffer.from(this.signature(unsigned)),actual=Buffer.from(signature!);
      if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new Error();
      const parsedHeader=JSON.parse(Buffer.from(header,"base64url").toString("utf8"));
      const parsed=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
      const now=Math.floor(Date.now()/1000);
      if(parsedHeader.alg!=="HS256"||parsedHeader.typ!=="JWT"||parsed.iss!=="essalud-ticket-api"||parsed.aud!=="local-staff"||!uuid.test(parsed.tid)||!uuid.test(parsed.sub)||
        typeof parsed.name!=="string"||parsed.name.length<3||!Array.isArray(parsed.roles)||!parsed.roles.length||
        !parsed.roles.every((role:unknown)=>ACCESS_ROLES.includes(role as never))||!scopes.has(parsed.scope)||
        !Array.isArray(parsed.centers)||!parsed.centers.every((center:unknown)=>typeof center==="string"&&uuid.test(center))||
        !Array.isArray(parsed.permissions)||!parsed.permissions.every((permission:unknown)=>ACCESS_PERMISSIONS.includes(permission as never))||
        !Number.isInteger(parsed.iat)||!Number.isInteger(parsed.exp)||parsed.iat>now+30||parsed.exp<=now)throw new Error();
      return Object.freeze({authenticated:true,redAsistencialId:parsed.tid.toLowerCase(),userId:parsed.sub.toLowerCase(),displayName:parsed.name,
        roles:Object.freeze(parsed.roles),scope:parsed.scope,centerIds:Object.freeze(parsed.centers.map((id:string)=>id.toLowerCase())),
        permissions:Object.freeze(parsed.permissions as AccessPermission[])});
    } catch {throw new AuthenticationFailure()}
  }
}
