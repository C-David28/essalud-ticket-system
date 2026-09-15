const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,scryptSync,createHash}=require('node:crypto');
const {HmacAccessToken,ScryptPasswordVerifier}=require('../../dist/infrastructure/access-token');
const {principalFromIdentity}=require('../../dist/domain/access');

test('password scrypt, permisos y token firmado conservan tenant, rol y sede',()=>{
 const password='Demo-RAP-2026!',userId=randomUUID(),red=randomUUID(),center=randomUUID();
 const salt=createHash('sha256').update('essalud-demo:'+userId).digest().subarray(0,16);
 const encoded='scrypt$v1$'+salt.toString('hex')+'$'+scryptSync(password,salt,32).toString('hex');
 const verifier=new ScryptPasswordVerifier();assert.equal(verifier.verify(password,encoded),true);assert.equal(verifier.verify('incorrecta-123',encoded),false);
 const principal=principalFromIdentity({userId,username:'tecnico.n1',displayName:'Técnico demo',passwordHash:encoded,
   accesses:[{role:'TECNICO_N1',scope:'SEDE',centerId:center}]},red);
 assert.ok(principal.permissions.includes('tickets:transition'));assert.ok(!principal.permissions.includes('tickets:assign'));
 const tokens=new HmacAccessToken('b'.repeat(64),900),token=tokens.issue(principal),decoded=tokens.verify(token);
 assert.deepEqual(decoded,principal);assert.throws(()=>tokens.verify(token.slice(0,-1)+(token.endsWith('a')?'b':'a')));
});

test('supervisor puede asignar en la red y administrador reúne permisos nacionales',()=>{
 const identity=role=>({userId:randomUUID(),username:'usuario.demo',displayName:'Usuario demo',passwordHash:'',accesses:[{role,scope:role==='ADMIN_GCTIC'?'NACIONAL':'RED',centerId:null}]});
 const supervisor=principalFromIdentity(identity('SUPERVISOR_RED'),randomUUID());assert.ok(supervisor.permissions.includes('tickets:assign'));assert.ok(!supervisor.permissions.includes('tickets:delete'));
 const admin=principalFromIdentity(identity('ADMIN_GCTIC'),randomUUID());assert.ok(admin.permissions.includes('tickets:delete'));assert.ok(admin.permissions.includes('organization:read'));
});
