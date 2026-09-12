import type { Project } from '../blocks/types';
import { longPage, mediumPage, shortPage } from './placeholder';

/** Three pages — the shape a project is expected to take most often. */
export const project02: Project = {
  id: '02',
  title: 'Project 02',
  pages: [
    shortPage('Project 02'),
    longPage('Field Notes'),
    mediumPage('Aftermath'),
  ],
};
