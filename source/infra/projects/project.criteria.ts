import type { ProjectFilter, ProjectSortField } from "@app/projects/project.filters";
import { projects } from "@db/models/projects.model";
import { Criteria } from "@infra/shared/criteria.helper";
import { and, gt, ilike, inArray, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export class ProjectCriteria {
	static readonly sortable = {
		name: projects.name,
		createdAt: projects.createdAt,
	} satisfies Record<ProjectSortField, AnyPgColumn>;

	static where(filter: ProjectFilter): SQL | undefined {
		return and(
			filter.search ? ilike(projects.name, `%${Criteria.escapeLike(filter.search)}%`) : undefined,
			filter.slugs?.length ? inArray(projects.slug, [...filter.slugs]) : undefined,
			filter.createdAfter ? gt(projects.createdAt, filter.createdAfter) : undefined,
		);
	}
}
