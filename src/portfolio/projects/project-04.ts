import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/** SEVEN folders — an odd count, deliberately. The last row holds only a left
 *  folder, so it rises on its own and the pile below shows three full rows and
 *  then one. */
export const project04: Project = {
  id: '04',
  title: 'Project 04',
  sections: placeholderSections([
    // Alternating, for the same reason as 02: adjacent hues have to be
    // tellable apart at 12% lightness, and a run round the wheel is not.
    { title: 'Brief', hue: 8, viewports: 2 },
    { title: 'Field Notes', hue: 196, viewports: 3 },
    { title: 'Typography', hue: 46, viewports: 2 },
    { title: 'Colour', hue: 262, viewports: 2.5 },
    { title: 'Motion', hue: 96, viewports: 3 },
    { title: 'Systems', hue: 320, viewports: 2 },
    { title: 'Closing', hue: 160, viewports: 1.5 },
  ]),
};
