import { describe, expect, it } from 'vitest';
import { PORTFOLIO } from '../../content';
import { PROJECTS, projectById } from './index';
import { CAPTURE_HEIGHT, CAPTURE_SCALE, PAGE_BUCKETS } from '../pageBuckets';

describe('project registry', () => {
  it('has exactly one project per portfolio card in the manifest', () => {
    expect(PROJECTS.map((p) => p.id)).toEqual(PORTFOLIO.map((item) => item.project));
  });

  it('resolves a `#view-NN` id, and nothing else', () => {
    expect(projectById('02')?.id).toBe('02');
    expect(projectById('01')).toBeNull(); // the magazine is not a project
    expect(projectById('99')).toBeNull();
  });

  it('gives every section a title, a capture per page bucket, and blocks', () => {
    for (const project of PROJECTS) {
      expect(project.sections.length).toBeGreaterThan(0);
      for (const section of project.sections) {
        expect(section.title).toBeTruthy();
        expect(section.blocks.length).toBeGreaterThan(0);
        for (const list of [section.sheets, section.tails]) {
          for (const sheet of list) {
            // The name says the bucket and the scale, which is how the file is
            // found; the page width in it would move with a margin dial.
            expect(sheet.src).toMatch(/^\/projects\/\d+\/(sheet|tail)-\d+-\d+@\dx\.webp$/);
            expect(sheet.src).toContain(`-${sheet.bucket}@${sheet.scale}x.`);
            expect(sheet.width).toBeLessThan(sheet.bucket);
            expect(sheet.height).toBe(CAPTURE_HEIGHT);
            expect(sheet.scale).toBe(CAPTURE_SCALE);
          }
          // Every bucket, each exactly once.
          expect(list.map((s) => s.bucket)).toEqual([...PAGE_BUCKETS]);
        }
      }
    }
  });

  it('gives every section and bucket its own capture', () => {
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

  it('gives every card its copy’s own sections — five each, of uneven length', () => {
    // Five, of uneven length: the short ones go straight from an entrance into
    // an exit, and the long one is long enough to forget there is a sheet.
    expect(projectById('02')!.sections).toHaveLength(5);
    // Card 03 was ONE section for as long as it was a placeholder: the case
    // with no exit, no second entrance and no turn anywhere. Drex is five,
    // split at its copy's own section breaks. The one-section case is a
    // `pageTrack` case and stays covered in `pageTrack.test.ts`; what is gone
    // is a browser walking one.
    expect(projectById('03')!.sections).toHaveLength(5);
    // Card 04 was three — the smallest count with a MIDDLE section — for as
    // long as it was a placeholder whose length was a number somebody typed.
    // Nosey is five, because that is where its copy's own headings fall, and a
    // section break is a content decision rather than a coverage one. The
    // middle-section case is covered by both five-section cards; what is gone
    // is the exact-three case, which was never a case the track has a branch
    // for — `pageTrack` knows first, middle and last.
    expect(projectById('04')!.sections).toHaveLength(5);
  });

  it('puts a video in every project', () => {
    // A CLIP IS IN ALL OF THEM, because a video is the block with a lifecycle
    // every project actually has: it mounts, plays and pauses as it crosses the
    // viewport, and `pv-verify` walks each section's vertical run asking every
    // clip in view whether it is decoded, running and visible.
    for (const project of PROJECTS) {
      const types = project.sections.flatMap((s) => s.blocks.map((b) => b.type));
      expect(types).toContain('video');
    }
    // THE ARTBOARD IS NO LONGER ASKED OF ANYTHING. It was asked of the set,
    // and the placeholders at card 03 were the only thing on it — no real
    // project ships one. Drex replaced the last of them, so the Rive block's
    // lazy-mount path has no page left to run on; see "Not done" in
    // docs/portfolio-view.md. The check comes back with the first real page
    // that has an artboard on it.
  });
});
