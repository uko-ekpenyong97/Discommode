import type { Project } from '../blocks/types';
import { project02 } from './project-02';
import { project03 } from './project-03';
import { project04 } from './project-04';

/**
 * The registry: project id (the `NN` in `#view-NN`) → its pages. One entry per
 * portfolio card in the manifest; `content.test.ts` holds the two in step.
 */
export const PROJECTS: Project[] = [project02, project03, project04];

/** The project a `#view-NN` hash names, or null if there is no such project. */
export function projectById(id: string): Project | null {
  return PROJECTS.find((p) => p.id === id) ?? null;
}
