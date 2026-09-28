import type { CreateAvailableProjects } from "@app/projects/create-available-projects.usecase";
import type { CreateProject } from "@app/projects/create-project.usecase";
import type { ListProjects } from "@app/projects/project.queries";
import type { RenameProject } from "@app/projects/rename-project.usecase";
import type { ProjectRepository } from "@core/projects/project.repository";
import { token } from "dockdi";

export const ProjectRepositoryToken = token<ProjectRepository>("ProjectRepository");
export const CreateProjectToken = token<CreateProject>("CreateProject");
export const RenameProjectToken = token<RenameProject>("RenameProject");
export const CreateAvailableProjectsToken =
	token<CreateAvailableProjects>("CreateAvailableProjects");
export const ListProjectsToken = token<ListProjects>("ListProjects");
