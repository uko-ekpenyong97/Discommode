import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/** Six folders — three full rows, which is the shape the stack was designed
 *  against: a read pile, an open folder and an unread pile all on screen. */
export const project02: Project = {
  id: '02',
  title: 'Project 02',
  sections: placeholderSections([
    // The hues alternate rather than run round the wheel: at 12% lightness two
    // neighbouring hues are the same colour, and the pile reads by colour as
    // much as by label.
    { title: 'Overview', hue: 14, viewports: 2 },
    { title: 'Research', hue: 200, viewports: 4 },
    { title: 'Motion', hue: 42, viewports: 3 },
    { title: 'Build', hue: 150, viewports: 5 },
    { title: 'Outcome', hue: 280, viewports: 1.5 },
    { title: 'Appendix', hue: 330, viewports: 2.5 },
  ]),
};
