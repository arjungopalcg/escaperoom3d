// Story media bundled with this build (see public/media/README.md). Filled in by vite.config.ts.
declare const __MEDIA__: string[];
const files = new Set<string>(typeof __MEDIA__ === 'undefined' ? [] : __MEDIA__);

/** URL of a media file if this build has it, e.g. mediaUrl('intro.mp4'). */
export function mediaUrl(name: string): string | undefined {
  return files.has(name) ? `media/${name}` : undefined;
}
