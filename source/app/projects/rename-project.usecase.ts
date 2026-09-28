import type { ProjectId } from "@core/projects/project.ids";
import type { ProjectRepository } from "@core/projects/project.repository";
import { Chronicler } from "@dal/dal.chronicler";

export class RenameProject {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly chronicler: Chronicler,
	) {}

	async execute(id: ProjectId, name: string): Promise<void> {
		const project = await this.projects.find(id);
		const before = project.snapshot();

		project.rename(name);
		await this.projects.update(project);

		await this.chronicler.record({
			action: "project.renamed",
			entity: "projects",
			entityId: id,
			changes: Chronicler.diff(before, project.snapshot()),
		});
	}
}
