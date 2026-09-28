export interface ProjectFilter {
	readonly search?: string;
	readonly slugs?: readonly string[];
	readonly createdAfter?: Date;
}

export type ProjectSortField = "name" | "createdAt";
