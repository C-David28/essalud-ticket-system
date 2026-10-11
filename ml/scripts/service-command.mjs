import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const command=process.argv[2];
const workspace=resolve(root,'ml/outputs/service-environment');
const envPath=resolve(root,'ml/outputs/service.env');
const venvPython=base=>resolve(base,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');

function localEnvironment() {
  if(!existsSync(envPath)) throw new Error('Ejecuta npm run ml:service:setup primero.');
  const text=readFileSync(envPath,'utf8');
  const matches=[...text.matchAll(/^ML_SERVICE_TOKEN=([a-f0-9]{64})\r?$/gm)];
  if(matches.length!==1) throw new Error('ML_SERVICE_TOKEN local inválido; no se mostraron claves.');
  const docs=text.match(/^ML_DOCS_ENABLED=(true|false)\r?$/m)?.[1]??'false';
  return {...process.env, ML_SERVICE_TOKEN:matches[0][1], ML_DOCS_ENABLED:docs};
}

async function check() {
  const env=localEnvironment();
  const origin=new URL(process.env.ML_SERVICE_BASE_URL??'http://127.0.0.1:8001');
  if(origin.protocol!=='http:'||!['127.0.0.1','localhost'].includes(origin.hostname)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
    throw new Error('Esta verificación 4.6 admite solo el servicio HTTP local.');
  async function request(path,status,body,authorized=true) {
    const response=await fetch(new URL(path,origin), {method:body?'POST':'GET',redirect:'error',
      headers:{...(authorized?{'X-ML-Token':env.ML_SERVICE_TOKEN}:{}),...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
    if(response.status!==status) throw new Error(`Verificación ${path}: HTTP ${response.status}; esperado ${status}.`);
    const data=await response.json();
    if(!response.headers.get('x-request-id')) throw new Error('Falta correlación HTTP.');
    return data;
  }
  const live=await request('/health/live',200);
  const ready=await request('/health/ready',200);
  const model=await request('/v1/model',200);
  if(live.status!=='ok'||ready.checks?.model!=='up'||model.model_version!=='ticket-category-model-v1.0.0') throw new Error('Salud o versión inesperada.');
  await request('/v1/model',401,undefined,false);
  await request('/v1/predict',422,{titulo:'x',descripcion:'corta'});
  const examples=[
    ['SOPORTE','La aplicación no abre','Al iniciar el programa de ofimática aparece un error y se cierra; otros programas de la computadora funcionan.'],
    ['REDES','Sin conexión en el consultorio','Varias computadoras muestran cable de red desconectado y no acceden a internet; el switch tiene los puertos apagados.'],
    ['INFRAESTRUCTURA','Goteras en el techo del área','El agua de lluvia ingresa por el techo y moja el piso. Se requiere revisar la cobertura y reparar la filtración.'],
    ['BIOMEDICO','Monitor de signos sin lectura','El monitor multiparámetro no registra la saturación con el sensor conectado y muestra una alarma técnica del equipo.'],
  ];
  const predictions=[];
  for(const [expected,titulo,descripcion] of examples) {
    const result=await request('/v1/predict',200,{titulo,descripcion});
    if(result.categoria_sugerida!==expected||!Number.isFinite(result.score)||result.probability!==null||result.operational_threshold!==null||result.score_type!=='raw_decision_margin_not_probability'||result.model_version!==model.model_version)
      throw new Error(`Predicción o contrato inesperado para el ejemplo ${expected}.`);
    predictions.push({expected,...result});
    console.log(`OK: ${expected}; margen=${result.score.toFixed(6)} (no probabilidad).`);
  }
  const receipt={checked_at:new Date().toISOString(),origin:origin.origin,model_version:model.model_version,live,ready,predictions,checks:['live','ready','model','auth','validation','four_predictions']};
  writeFileSync(resolve(root,'ml/outputs/service-check.json'),`${JSON.stringify(receipt,null,2)}\n`);
  console.log('ML_SERVICE_CHECK_OK: salud, autenticación, validación y cuatro predicciones reales.');
}

try {
  if(command==='setup') {
    mkdirSync(resolve(root,'ml/outputs'),{recursive:true});
    if(!existsSync(envPath)) writeFileSync(envPath,`ML_SERVICE_TOKEN=${randomBytes(32).toString('hex')}\nML_DOCS_ENABLED=true\n`,{flag:'wx',mode:0o600});
    localEnvironment();
    console.log('OK: configuración local ML disponible; token conservado y fuera de Git.');
  } else if(command==='check') await check();
  else {
    const preparing=command==='setup-python';
    const candidates=preparing?
      [...(process.env.ML_PYTHON?[[process.env.ML_PYTHON,[]]]:[]),[venvPython(resolve(root,'ml/outputs/model-environment')),[]],...(process.platform==='win32'?[['py',['-3.12']]]:[]),['python3.12',[]],['python',[]]]:
      [...(process.env.ML_SERVICE_PYTHON?[[process.env.ML_SERVICE_PYTHON,[]]]:[]),[venvPython(workspace),[]]];
    const selected=candidates.find(([program,args])=>{const result=spawnSync(program,[...args,'-c','import sys;sys.exit(0 if sys.version_info[:2]==(3,12) else 1)'],{cwd:root,encoding:'utf8'});return !result.error&&result.status===0;});
    if(!selected) throw new Error('Para ejecución sin Docker: instala Python 3.12 y ejecuta npm run ml:service:python:setup.');
    const [program,prefix]=selected;
    const temp=resolve(workspace,'tmp');mkdirSync(temp,{recursive:true});
    let args,env={...process.env,TEMP:temp,TMP:temp};
    if(command==='setup-python') args=['ml/service/bootstrap.py','--workspace',workspace];
    else if(command==='start') {args=['-m','ml.service.serve'];env={...env,...localEnvironment()};}
    else if(command==='test') args=['-m','unittest','discover','-s','ml/service/test','-p','test_*.py','-v'];
    else if(command==='smoke') {args=['-m','ml.service.smoke'];env={...env,...localEnvironment()};}
    else throw new Error('Comando ML service desconocido.');
    const result=spawnSync(program,[...prefix,'-B',...args],{cwd:root,stdio:'inherit',env});
    if(result.error) throw new Error('No se pudo ejecutar el proceso ML local.');
    process.exitCode=result.status??1;
  }
} catch(error) {
  // Messages are controlled here; do not print URL headers, token or request bodies.
  console.error(command==='check'?'Fallo ML service check; revisar estado, versión y logs del servicio.':error.message);
  process.exitCode=1;
}
