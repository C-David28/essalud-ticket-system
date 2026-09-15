import { OrganizationRepository } from "../domain/organization";
import { AuthorizedContext } from "../domain/access";

export class GetOrganizationCatalog {
  constructor(private readonly repository: OrganizationRepository) {}
  execute(context: AuthorizedContext) {
    return this.repository.catalog(context);
  }
}
