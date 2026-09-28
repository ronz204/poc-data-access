import { Project } from "@core/projects/project.entity";
import type { ProjectId } from "@core/projects/project.ids";
import type { ProjectRepository } from "@core/projects/project.repository";
import { Chronicler } from "@dal/dal.chronicler";

export interface CreateProjectInput {
	readonly name: string;
	readonly slug: string;
}

export class CreateProject {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly chronicler: Chronicler,
	) {}

	async execute(input: CreateProjectInput): Promise<ProjectId> {
		const project = Project.create(input.name, input.slug);
		await this.projects.add(project);
		await this.chronicler.record({
			action: "project.created",
			entity: "projects",
			entityId: project.id,
			changes: Chronicler.created({ name: input.name, slug: input.slug }),
		});
		return project.id;
	}
}
