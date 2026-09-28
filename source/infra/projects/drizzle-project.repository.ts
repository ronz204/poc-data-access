import type { Project } from "@core/projects/project.entity";
import { ProjectNotFoundError, ProjectSlugTakenError } from "@core/projects/project.errors";
import type { ProjectId } from "@core/projects/project.ids";
import type { ProjectRepository } from "@core/projects/project.repository";
import { ViolationTranslator } from "@dal/dal.translator";
import type { Executor } from "@db/helpers/executor.helper";
import { ProjectConstraints, projects } from "@db/models/projects.model";
import { ProjectMapper } from "@infra/projects/project.mapper";
import { eq } from "drizzle-orm";

export class DrizzleProjectRepository implements ProjectRepository {
	constructor(
		private readonly tx: Executor,
		private readonly tenantId: string,
	) {}

	async find(id: ProjectId): Promise<Project> {
		const [row] = await this.tx.select().from(projects).where(eq(projects.id, id));
		if (!row) throw new ProjectNotFoundError(id);
		return ProjectMapper.toDomain(row);
	}

	async add(project: Project): Promise<void> {
		const row = ProjectMapper.toRow(project.snapshot(), this.tenantId);
		await ViolationTranslator.translate(this.tx.insert(projects).values(row), {
			[ProjectConstraints.slug]: () => new ProjectSlugTakenError(row.slug),
		});
	}

	async update(project: Project): Promise<void> {
		const { id, ...changes } = ProjectMapper.toRow(project.snapshot(), this.tenantId);
		await ViolationTranslator.translate(
			this.tx
				.update(projects)
				.set(changes)
				.where(eq(projects.id, id as ProjectId)),
			{ [ProjectConstraints.slug]: () => new ProjectSlugTakenError(changes.slug) },
		);
	}
}
