import { ASSISTANCE_MIN_MARGIN, ASSISTANCE_POLICY_VERSION, CategoryAssistance, CategoryClassifier, CategoryInput } from '../domain/category-classification';

export class SuggestCategory {
  constructor(private readonly classifier:CategoryClassifier|null) {}
  async execute(input:CategoryInput):Promise<CategoryAssistance> {
    if(!this.classifier)return {status:'disabled',suggestion:null};
    try {
      const prediction=await this.classifier.classify(input);
      if(prediction.score<ASSISTANCE_MIN_MARGIN)return {status:'abstained',suggestion:null};
      return {status:'suggested',suggestion:{...prediction,scoreType:'raw_decision_margin_not_probability',
        probability:null,policyVersion:ASSISTANCE_POLICY_VERSION}};
    } catch {
      // Optional assistance cannot affect create/update or the core readiness check.
      return {status:'unavailable',suggestion:null};
    }
  }
}
