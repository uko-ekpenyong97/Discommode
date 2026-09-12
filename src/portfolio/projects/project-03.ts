import type { Project } from '../blocks/types';
import { mediumPage } from './placeholder';

/** ONE page. Deliberately: it is the case with no stack, no slide and nothing
 *  previewing on the right, and the mechanics have to reduce to it cleanly. */
export const project03: Project = {
  id: '03',
  title: 'Project 03',
  pages: [mediumPage('Project 03')],
};
