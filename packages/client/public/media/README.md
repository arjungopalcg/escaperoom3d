# Story media

Drop finished files here; the game picks them up automatically (nothing to configure).
Missing files fall back to narrated text cards and the browser's built-in voice.

| File | Used for |
| --- | --- |
| `intro.mp4` | Opening cinematic (about 50–60 s), plays before the clock starts |
| `ending-escape.mp4`, `ending-treasure.mp4`, `ending-lost.mp4` | Results screen, one per ending |
| `voice/<key>.mp3` | Recorded lines; see `docs/story-and-media.md` for every key and its text |

Keep each video under ~15 MB (H.264 MP4, 720p) so it loads quickly.
