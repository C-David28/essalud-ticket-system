import { OrganizationRepository } from "../domain/organization";
import { TenantContext } from "../domain/tenant-context";

export class GetOrganizationCatalog {
  constructor(private readonly repository: OrganizationRepository) {}
  execute(context: TenantContext) {
    return this.repository.catalog(context);
  }
}
