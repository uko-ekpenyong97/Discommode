import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/** Six folders — three full rows, which is the shape the stack was designed
 *  against: a read pile, an open folder and an unread pile all on screen. */
export const project02: Project = {
  id: '02',
  title: 'Project 02',
  sections: placeholderSections([
    { title: 'Overview', hue: 14, viewports: 2 },
    { title: 'Research', hue: 30, viewports: 4 },
    { title: 'Motion', hue: 200, viewports: 3 },
    { title: 'Build', hue: 150, viewports: 5 },
    { title: 'Outcome', hue: 280, viewports: 1.5 },
    { title: 'Appendix', hue: 330, viewports: 2.5 },
  ]),
};
