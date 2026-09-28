import type { ProjectFilter, ProjectSortField } from "@app/projects/project.filters";
import type { ProjectSummary } from "@app/projects/project.views";
import type { Page, Paging, Sorting } from "@app/shared/paging.type";

export interface ListProjectsParams {
	readonly filter: ProjectFilter;
	readonly sorting: Sorting<ProjectSortField>;
	readonly paging: Paging;
}

export interface ListProjects {
	execute(params: ListProjectsParams): Promise<Page<ProjectSummary>>;
}
