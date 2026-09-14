import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/**
 * FIVE sections, of deliberately uneven length. The spread is the point: 1.5vp
 * and 2vp are the short runs that stress the entrance-straight-into-exit path,
 * and 5vp is the one long enough to forget there is a sheet involved.
 */
export const project02: Project = {
  id: '02',
  title: 'Project 02',
  ref: 'DISCOMMODE · 2026',
  sections: placeholderSections('02', [
    { title: 'Overview', viewports: 2 },
    { title: 'Research', viewports: 4 },
    { title: 'Motion', viewports: 3 },
    { title: 'Build', viewports: 5 },
    { title: 'Outcome', viewports: 1.5 },
  ]),
};
