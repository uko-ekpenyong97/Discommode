import { PORTFOLIO } from '../../content';
import type { Project } from '../blocks/types';
import { placeholderBlocks } from './placeholder';

/**
 * Project id → its blocks. Derived from the manifest so the two can't drift:
 * every portfolio card in `CONTENT` has a project here, and adding a card
 * without giving it content is a visible placeholder rather than a blank sheet.
 *
 * All three currently share `placeholderBlocks`, differing only in title — the
 * real content lands one project at a time.
 */
export const PROJECTS: Project[] = PORTFOLIO.map((item) => ({
  id: item.project!,
  blocks: placeholderBlocks(`Project ${item.project}`),
}));

/** Position of a project id within the neighbour-strip ring, or -1. */
export function projectIndex(id: string): number {
  return PROJECTS.findIndex((p) => p.id === id);
}
