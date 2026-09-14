import type { Project } from '../blocks/types';
import { placeholderSections } from './placeholder';

/**
 * ONE section. Deliberately: no exit, no second entrance, no turn anywhere, and
 * the mechanics have to reduce to it cleanly — `maxPosition` is its own bottom
 * and the track is one segment plus the entrance in front of it.
 *
 * Five viewports, not three: this is the only project with one section, so it
 * is the only place a block that comes late in the placeholder's cycle can be
 * seen at all — and `projects.test.ts` holds every project to carrying the
 * video and the Rive artboard, the two with a lifecycle worth watching.
 */
export const project03: Project = {
  id: '03',
  title: 'Project 03',
  ref: 'DISCOMMODE · 2026',
  sections: placeholderSections('03', [{ title: 'Project 03', viewports: 5 }]),
};
