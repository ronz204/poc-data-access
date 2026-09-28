import type { Project } from "@core/projects/project.entity";
import type { ProjectId } from "@core/projects/project.ids";

export interface ProjectRepository {
	find(id: ProjectId): Promise<Project>;
	add(project: Project): Promise<void>;
	update(project: Project): Promise<void>;
}
