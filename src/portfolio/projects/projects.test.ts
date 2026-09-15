import { describe, expect, it } from 'vitest';
import { PORTFOLIO } from '../../content';
import { PROJECTS, projectById } from './index';
import { SHEET_SCALES, SHEET_SIZES } from './placeholder';

describe('project registry', () => {
  it('has exactly one project per portfolio card in the manifest', () => {
    expect(PROJECTS.map((p) => p.id)).toEqual(PORTFOLIO.map((item) => item.project));
  });

  it('resolves a `#view-NN` id, and nothing else', () => {
    expect(projectById('02')?.id).toBe('02');
    expect(projectById('01')).toBeNull(); // the magazine is not a project
    expect(projectById('99')).toBeNull();
  });

  it('gives every section a title, a capture per viewport per scale, and blocks', () => {
    for (const project of PROJECTS) {
      expect(project.sections.length).toBeGreaterThan(0);
      for (const section of project.sections) {
        expect(section.title).toBeTruthy();
        expect(section.blocks.length).toBeGreaterThan(0);
        expect(section.sheets.length).toBe(SHEET_SIZES.length * SHEET_SCALES.length);
        for (const sheet of section.sheets) {
          // The size is carried for the same reason every other piece of media
          // carries one — it is the table the generator writes the file from —
          // and here it is also how the right capture is chosen.
          expect(sheet.src).toMatch(/^\/projects\/\d+\/sheet-\d+-\d+(@\dx)?\.webp$/);
          expect(sheet.width).toBeGreaterThan(0);
          expect(sheet.height).toBeGreaterThan(0);
          expect(SHEET_SCALES).toContain(sheet.scale);
          // THE CSS SIZE AND THE SCALE ARE SEPARATE, and the name says both: a
          // 2x capture of a 1632px page is not a 1x capture of a 3264px one.
          expect(sheet.src).toContain(`-${sheet.width}${sheet.scale > 1 ? `@${sheet.scale}x` : ''}.`);
        }
        // Every width, at every scale, and each exactly once.
        expect(section.sheets.map((s) => `${s.width}@${s.scale}`).sort()).toEqual(
          SHEET_SIZES.flatMap((size) => SHEET_SCALES.map((k) => `${size.width}@${k}`)).sort(),
        );
      }
    }
  });

  it('gives every section, viewport and scale its own capture', () => {
    for (const project of PROJECTS) {
      const srcs = project.sections.flatMap((s) => [...s.sheets, ...s.tails]).map((t) => t.src);
      expect(new Set(srcs).size).toBe(srcs.length);
    }
  });

  it('opens every section with a letterhead block', () => {
    // What makes `sheet.webp` a picture of a document rather than a crop.
    for (const project of PROJECTS) {
      for (const section of project.sections) {
        expect(section.blocks[0].type).toBe('letterhead');
      }
    }
  });

  it('does not repeat the title in the blocks — the letterhead carries it', () => {
    for (const project of PROJECTS) {
      for (const section of project.sections) {
        expect(section.blocks.some((b) => b.type === 'title')).toBe(false);
      }
    }
  });

  it('covers the one-section case (03) and the five-section spread (02, 04)', () => {
    // One section: no exit, no second entrance, no turn anywhere.
    expect(projectById('03')!.sections).toHaveLength(1);
    // Five, of uneven length: the short ones go straight from an entrance into
    // an exit, and the long one is long enough to forget there is a sheet.
    expect(projectById('02')!.sections).toHaveLength(5);
    // Card 04 was three — the smallest count with a MIDDLE section — for as
    // long as it was a placeholder whose length was a number somebody typed.
    // Nosey is five, because that is where its copy's own headings fall, and a
    // section break is a content decision rather than a coverage one. The
    // middle-section case is covered by both five-section cards; what is gone
    // is the exact-three case, which was never a case the track has a branch
    // for — `pageTrack` knows first, middle and last.
    expect(projectById('04')!.sections).toHaveLength(5);
  });

  it('puts a video in every project, and the Rive artboard somewhere', () => {
    // A CLIP IS IN ALL OF THEM, because a video is the block with a lifecycle
    // every project actually has: it mounts, plays and pauses as it crosses the
    // viewport, and `pv-verify` walks each section's vertical run asking every
    // clip in view whether it is decoded, running and visible.
    for (const project of PROJECTS) {
      const types = project.sections.flatMap((s) => s.blocks.map((b) => b.type));
      expect(types).toContain('video');
    }
    // THE ARTBOARD IS ASKED OF THE SET, not of each project. It used to be
    // required of every one, which was a fact about there being nothing but
    // placeholders: a real project ships the blocks its content needs, and card
    // 02 opens with two clips where it once opened with the Loop artboard. What
    // has to stay true is that the LAZY-MOUNT PATH is still exercised
    // somewhere, and the placeholders are what exercise it.
    const everything = PROJECTS.flatMap((p) => p.sections.flatMap((s) => s.blocks.map((b) => b.type)));
    expect(everything).toContain('rive');
  });
});
