import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/** EIGHT sections. Also deliberate: at 900px tall the tab column cannot hold
 *  eight tabs at the preferred height, so this is the case that makes them
 *  shrink to fit rather than the column scroll. */
export const project04: Project = {
  id: '04',
  title: 'Project 04',
  sections: placeholderSections([
    { title: 'Brief', hue: 8, viewports: 2 },
    { title: 'Field Notes', hue: 42, viewports: 3 },
    { title: 'Typography', hue: 76, viewports: 2 },
    { title: 'Colour', hue: 120, viewports: 2.5 },
    { title: 'Motion', hue: 186, viewports: 3 },
    { title: 'Systems', hue: 222, viewports: 2 },
    { title: 'Build', hue: 268, viewports: 4 },
    { title: 'Closing', hue: 320, viewports: 1.5 },
  ]),
};
