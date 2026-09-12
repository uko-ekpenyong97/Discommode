import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/** ONE section. Deliberately: it is the case with no stack, no turn and a
 *  single tab, and the mechanics have to reduce to it cleanly. */
export const project03: Project = {
  id: '03',
  title: 'Project 03',
  sections: placeholderSections([{ title: 'Project 03', hue: 96, viewports: 3 }]),
};
