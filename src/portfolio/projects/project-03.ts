import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/**
 * ONE section. Deliberately: it is the case with no stack, no turn and a single
 * tab, and the mechanics have to reduce to it cleanly.
 *
 * Four viewports, not three: this is the only project with one section, so it
 * is the only place a block that comes late in the placeholder's cycle can be
 * seen at all — and `projects.test.ts` holds every project to carrying the
 * video and the Rive artboard, the two with a lifecycle worth watching.
 */
export const project03: Project = {
  id: '03',
  title: 'Project 03',
  sections: placeholderSections([{ title: 'Project 03', hue: 96, viewports: 4 }]),
};
