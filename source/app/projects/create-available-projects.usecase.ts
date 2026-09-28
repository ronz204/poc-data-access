import { CreateProjectToken } from "@app/projects/project.tokens";
import { ProjectSlugTakenError } from "@core/projects/project.errors";
import type { Transactor } from "@dal/dal.transactor";

export class CreateAvailableProjects {
	constructor(private readonly transactor: Transactor) {}

	async execute(slugs: readonly string[]): Promise<string[]> {
		const created: string[] = [];
		for (const slug of slugs) {
			try {
				await this.transactor.run(CreateProjectToken, (create) =>
					create.execute({ name: slug, slug }),
				);
				created.push(slug);
			} catch (error) {
				if (!(error instanceof ProjectSlugTakenError)) throw error;
			}
		}
		return created;
	}
}
