// Opening story before the clock starts: plays media/intro.mp4 when present (e.g. made in
// Google Flow), otherwise narrated story cards over the live 3D scene.
import { PROLOGUE } from '@crimson/engine';
import { audio } from '../audio.ts';
import { mediaUrl } from '../media.ts';
import { clear, fmtTime, h } from './dom.ts';

export function showIntro(startsAt: number, serverNow: () => number, onDone: () => void) {
  let finished = false;
  let timer = 0;
  const card = h('div', { class: 'intro-card' });
  const countdown = h('span');
  const video = h('video', { class: 'intro-video hidden', playsinline: true, preload: 'auto' }) as HTMLVideoElement;
  const wrap = h(
    'div',
    { class: 'intro', role: 'dialog', 'aria-label': 'Story intro' },
    video,
    card,
    h('div', { class: 'intro-foot' }, countdown, h('button', { class: 'btn small', on: { click: () => finish() } }, 'Skip intro ⏭')),
  );
  document.body.append(wrap);

  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    video.pause();
    audio.hush();
    wrap.classList.add('intro-out');
    setTimeout(() => wrap.remove(), 600);
    onDone();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'Space') {
      window.removeEventListener('keydown', onKey);
      finish();
    }
  };
  window.addEventListener('keydown', onKey);

  timer = window.setInterval(() => {
    const left = startsAt - serverNow();
    countdown.textContent = left > 0 ? `The water starts rising in ${fmtTime(left)}` : '';
    if (left <= 0) finish();
  }, 250);

  // Story cards, each spoken by the narrator or the captain.
  let i = 0;
  const nextCard = () => {
    if (finished || i >= PROLOGUE.length) return;
    const line = PROLOGUE[i++];
    clear(card).append(h('p', { class: line.who === 'captain' ? 'intro-line captain' : 'intro-line' }, line.text));
    if (i === PROLOGUE.length) card.append(h('div', { class: 'intro-tag' }, '“Every crew gets a different ship.”'));
    let advanced = false;
    const go = () => {
      if (advanced) return;
      advanced = true;
      setTimeout(nextCard, 700);
    };
    audio.speak(line.text, line.who, go);
    // Keep moving even if speech is off or silent.
    setTimeout(go, Math.max(4500, line.text.length * 75));
  };

  const src = mediaUrl('intro.mp4');
  if (!src) return nextCard();
  video.src = src;
  video.addEventListener('loadeddata', () => {
    if (finished) return;
    card.classList.add('hidden');
    video.classList.remove('hidden');
    void video.play().catch(() => {
      // Autoplay with sound refused: start muted, the subtitles carry the story.
      video.muted = true;
      void video.play();
    });
  });
  video.addEventListener('ended', finish);
  video.addEventListener('error', () => nextCard(), { once: true });
}
