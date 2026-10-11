import { Logger } from '@nestjs/common';
import { ASSISTANCE_MODEL_VERSION, CategoryClassifier, CategoryInput, CategoryPrediction } from '../domain/category-classification';
import { CATEGORIES } from '../domain/ticket';
import type { MlAssistanceConfig } from './config';

export class HttpCategoryClassifier implements CategoryClassifier {
  private readonly logger=new Logger('CategoryAssistance');
  constructor(private readonly config:MlAssistanceConfig) {}
  async classify(input:CategoryInput):Promise<CategoryPrediction> {
    try {
      const response=await fetch(new URL('/v1/predict',this.config.baseUrl!),{
        method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-ML-Token':this.config.token!},
        body:JSON.stringify({titulo:input.titulo,descripcion:input.descripcion}),
        signal:AbortSignal.timeout(this.config.timeoutMs),
      });
      if(!response.ok||response.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json'||!response.body)
        throw new Error('ML_UNAVAILABLE');
      const reader=response.body.getReader();let total=0;const chunks:Uint8Array[]=[];
      try {
        for(;;){const chunk=await reader.read();if(chunk.done)break;
          total+=chunk.value.byteLength;if(total>4096){void reader.cancel().catch(()=>{});throw new Error('ML_INVALID_RESPONSE');}
          chunks.push(chunk.value);}
      } finally {reader.releaseLock();}
      const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('ML_INVALID_RESPONSE');
      const data=value as Record<string,unknown>;
      const fields=['categoria_sugerida','score','score_type','probability','operational_threshold','model_version'];
      if(Object.keys(data).length!==fields.length||!fields.every(key=>Object.hasOwn(data,key))||
        !CATEGORIES.includes(data.categoria_sugerida as typeof CATEGORIES[number])||typeof data.score!=='number'||!Number.isFinite(data.score)||
        data.score_type!=='raw_decision_margin_not_probability'||data.probability!==null||data.operational_threshold!==null||
        data.model_version!==ASSISTANCE_MODEL_VERSION)throw new Error('ML_INVALID_RESPONSE');
      return {category:data.categoria_sugerida as typeof CATEGORIES[number],score:data.score,modelVersion:ASSISTANCE_MODEL_VERSION};
    } catch {
      this.logger.warn({event:'category_assistance_unavailable'});
      throw new Error('ML_UNAVAILABLE');
    }
  }
}
