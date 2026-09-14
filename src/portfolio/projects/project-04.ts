import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/**
 * THREE sections — the smallest count with a MIDDLE one, which is the only kind
 * of section that has a sheet unroll behind it and its own sheet unroll in
 * front of the next.
 *
 * Four viewports on that middle one rather than three: with a cycle offset per
 * section, four is where this project first reaches the Rive block, and
 * `projects.test.ts` holds every project to carrying it.
 */
export const project04: Project = {
  id: '04',
  title: 'Project 04',
  ref: 'DISCOMMODE · 2026',
  sections: placeholderSections('04', [
    { title: 'Brief', viewports: 2 },
    { title: 'Field Notes', viewports: 4 },
    { title: 'Closing', viewports: 1.5 },
  ]),
};
