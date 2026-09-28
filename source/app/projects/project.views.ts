import type { ProjectId } from "@core/projects/project.ids";

export interface ProjectSummary {
	readonly id: ProjectId;
	readonly name: string;
	readonly slug: string;
	readonly taskCount: number;
	readonly createdAt: Date;
}
