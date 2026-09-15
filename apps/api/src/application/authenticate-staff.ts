import { AccessTokenPort, AuthenticationFailure, IdentityRepository, PasswordVerifier, principalFromIdentity } from "../domain/access";
import { TenantContext } from "../domain/tenant-context";

export class AuthenticateStaff {
  constructor(private readonly identities:IdentityRepository,private readonly passwords:PasswordVerifier,
    private readonly tokens:AccessTokenPort,private readonly expiresIn:number){}
  async execute(context:TenantContext,username:string,password:string) {
    const identity=await this.identities.find(context,username.toLowerCase());
    if(!identity||!this.passwords.verify(password,identity.passwordHash)) throw new AuthenticationFailure();
    const principal=principalFromIdentity(identity,context.redAsistencialId);
    return {token:this.tokens.issue(principal),expiresIn:this.expiresIn,session:principal};
  }
}
