import { Project, type ProjectSnapshot } from "@core/projects/project.entity";
import type { ProjectId } from "@core/projects/project.ids";
import type { projects } from "@db/models/projects.model";

type ProjectRow = typeof projects.$inferSelect;
type ProjectInsert = typeof projects.$inferInsert;

export class ProjectMapper {
	static toDomain(row: ProjectRow): Project {
		return Project.reconstitute({
			id: row.id as ProjectId,
			name: row.name,
			slug: row.slug,
			createdAt: row.createdAt,
		});
	}

	static toRow(snapshot: ProjectSnapshot, tenantId: string): ProjectInsert {
		return { ...snapshot, tenantId };
	}
}
