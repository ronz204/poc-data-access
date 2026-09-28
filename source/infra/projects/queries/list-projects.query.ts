import type { ListProjects, ListProjectsParams } from "@app/projects/project.queries";
import type { ProjectSummary } from "@app/projects/project.views";
import type { Page } from "@app/shared/paging.type";
import type { Executor } from "@db/helpers/executor.helper";
import { projects } from "@db/models/projects.model";
import { tasks } from "@db/models/tasks.model";
import { ProjectCriteria } from "@infra/projects/project.criteria";
import { Paginator } from "@infra/shared/paginator.helper";
import { and, count, eq } from "drizzle-orm";

export class DrizzleListProjects implements ListProjects {
	constructor(private readonly tx: Executor) {}

	async execute({ filter, sorting, paging }: ListProjectsParams): Promise<Page<ProjectSummary>> {
		const column = ProjectCriteria.sortable[sorting.field];

		const rows = await this.tx
			.select({
				id: projects.id,
				name: projects.name,
				slug: projects.slug,
				taskCount: count(tasks.id),
				createdAt: projects.createdAt,
			})
			.from(projects)
			.leftJoin(tasks, eq(tasks.projectId, projects.id))
			.where(
				and(
					ProjectCriteria.where(filter),
					Paginator.after(projects, projects.id, column, sorting.direction, paging),
				),
			)
			.groupBy(projects.id)
			.orderBy(...Paginator.order(projects.id, column, sorting.direction))
			.limit(paging.limit + 1);

		return Paginator.page(rows as ProjectSummary[], paging.limit);
	}
}
