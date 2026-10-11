import { CATEGORIES } from './ticket';

export const ASSISTANCE_MODEL_VERSION = 'ticket-category-model-v1.0.0';
export const ASSISTANCE_POLICY_VERSION = 'category-assistance-policy-v1.0.0';
// Frozen using development OOF only; empirical assistance rule, not a probability.
export const ASSISTANCE_MIN_MARGIN = -0.06;
export type CategoryInput = Readonly<{titulo:string;descripcion:string}>;
export type CategoryPrediction = Readonly<{
  category:typeof CATEGORIES[number];score:number;modelVersion:typeof ASSISTANCE_MODEL_VERSION;
}>;
export interface CategoryClassifier {
  classify(input:CategoryInput):Promise<CategoryPrediction>;
}
export type CategoryAssistance =
  | {status:'suggested';suggestion:CategoryPrediction & {
      scoreType:'raw_decision_margin_not_probability';probability:null;policyVersion:typeof ASSISTANCE_POLICY_VERSION}}
  | {status:'abstained'|'unavailable'|'disabled';suggestion:null};
