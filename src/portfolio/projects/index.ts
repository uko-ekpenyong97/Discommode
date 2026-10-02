import type { Project } from '../blocks/types';
import { drex } from './drex';
import { nosey } from './nosey';
import { riveSite } from './rive-site';

/**
 * The registry: project id (the `NN` in `#view-NN`) → its pages. One entry per
 * portfolio card in the manifest; `content.test.ts` holds the two in step.
 */
export const PROJECTS: Project[] = [riveSite, drex, nosey];

/** The project a `#view-NN` hash names, or null if there is no such project. */
export function projectById(id: string): Project | null {
  return PROJECTS.find((p) => p.id === id) ?? null;
}
