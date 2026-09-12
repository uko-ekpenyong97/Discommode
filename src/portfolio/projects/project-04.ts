import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/** SEVEN folders — an odd count, deliberately. The last row holds only a left
 *  folder, so it rises on its own and the pile below shows three full rows and
 *  then one. */
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
    { title: 'Closing', hue: 300, viewports: 1.5 },
  ]),
};
