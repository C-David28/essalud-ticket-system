import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const workspace=resolve(root,'ml/outputs/model-environment');
const command=process.argv[2];
const environmentPython=resolve(workspace,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const candidates=[...(command==='setup'?[]:[[environmentPython,[]]]),
  ...(process.env.ML_PYTHON?[[process.env.ML_PYTHON,[]]]:
    [...(process.platform==='win32'?[['py',['-3.12']]]:[]),['python3.12',[]],['python',[]]])];
const selected=candidates.find(([program,args])=>{
  const result=spawnSync(program,[...args,'-c','import sys;sys.exit(0 if sys.version_info[:2]==(3,12) else 1)'],{cwd:root,encoding:'utf8'});
  return !result.error&&result.status===0;
});
if(!selected) throw new Error('Instala Python 3.12 y ejecuta npm run ml:model:setup. Puedes indicar su ruta mediante ML_PYTHON.');
const [program,prefix]=selected;
let args;
switch(command) {
  case 'setup': args=['ml/modeling/bootstrap.py','--workspace',workspace]; break;
  case 'check': args=['ml/modeling/release.py','--phase','check']; break;
  case 'test': args=['-m','unittest','discover','-s','ml/test','-p','test_model.py','-v']; break;
  case 'rebuild': args=['ml/modeling/release.py','--phase','build','--output',resolve(root,'ml/outputs',`model-rebuild-${new Date().toISOString().replace(/[:.]/g,'-')}`)]; break;
  default: throw new Error('Comando ML desconocido.');
}
const result=spawnSync(program,[...prefix,'-B',...args],{cwd:root,stdio:'inherit'});
if(result.error) throw result.error;
process.exit(result.status??1);
