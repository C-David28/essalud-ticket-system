export interface DependencyProbe { check(): Promise<boolean>; }
export type Readiness = {
  status: 'ok' | 'degraded';
  checks: { postgres: 'up' | 'down'; redis: 'up' | 'down' };
};
