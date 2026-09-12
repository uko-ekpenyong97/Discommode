import type { Project } from '../blocks/types';
import { longPage, mediumPage, shortPage } from './placeholder';

/** Three pages again, with different titles, so switching cards is visible. */
export const project04: Project = {
  id: '04',
  title: 'Project 04',
  pages: [
    shortPage('Project 04'),
    longPage('Second Pass'),
    mediumPage('Closing'),
  ],
};
