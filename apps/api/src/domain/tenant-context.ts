export interface TenantContext {
  readonly redAsistencialId: string;
  readonly userId: string;
  readonly requestId: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Valida forma, no autentica. La futura capa de identidad debe autorizar este contexto.
export function tenantContext(input: TenantContext): Readonly<TenantContext> {
  for (const field of ['redAsistencialId', 'userId', 'requestId'] as const) {
    if (typeof input?.[field] !== 'string' || !uuid.test(input[field])) {
      throw new Error('Contexto institucional invalido: ' + field);
    }
  }
  return Object.freeze({
    redAsistencialId: input.redAsistencialId.toLowerCase(),
    userId: input.userId.toLowerCase(),
    requestId: input.requestId.toLowerCase(),
  });
}
