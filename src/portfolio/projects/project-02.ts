import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/** Five sections — the shape a project is expected to take most often, and the
 *  one the notebook was designed against: a full tab column, five hues. */
export const project02: Project = {
  id: '02',
  title: 'Project 02',
  sections: placeholderSections([
    { title: 'Overview', hue: 14, viewports: 2 },
    { title: 'Research', hue: 30, viewports: 4 },
    { title: 'Motion', hue: 200, viewports: 3 },
    { title: 'Build', hue: 150, viewports: 5 },
    { title: 'Outcome', hue: 280, viewports: 1.5 },
  ]),
};
