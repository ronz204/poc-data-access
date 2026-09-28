import { InvalidProjectNameError } from "@core/projects/project.errors";
import type { ProjectId } from "@core/projects/project.ids";
import { Identity } from "@core/shared/identity.helper";

export interface ProjectSnapshot {
	readonly id: ProjectId;
	readonly name: string;
	readonly slug: string;
	readonly createdAt: Date;
}

export class Project {
	private constructor(private state: ProjectSnapshot) {}

	static create(name: string, slug: string): Project {
		Project.ensureName(name);
		return new Project({ id: Identity.next<ProjectId>(), name, slug, createdAt: new Date() });
	}

	static reconstitute(snapshot: ProjectSnapshot): Project {
		return new Project(snapshot);
	}

	get id(): ProjectId {
		return this.state.id;
	}

	rename(name: string): void {
		Project.ensureName(name);
		this.state = { ...this.state, name };
	}

	snapshot(): ProjectSnapshot {
		return this.state;
	}

	private static ensureName(name: string): void {
		if (name.trim().length === 0) throw new InvalidProjectNameError(name);
	}
}
