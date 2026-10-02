import './styles.css';
import { audio } from './audio.ts';
import { net } from './net.ts';
import { Session } from './session.ts';
import { loadToken, saveToken, store } from './store.ts';
import { hideScreens, lobbyChatMessage, rememberedName, showHome, showLobby, showResults, stopLobby } from './ui/screens.ts';
import { voice } from './voice.ts';

document.documentElement.dataset.text = store.settings.textSize;

let session: Session | undefined;
const params = new URLSearchParams(location.search);
const roomParam = params.get('room')?.toUpperCase() ?? undefined;

function home(error?: string) {
  showHome({
    room: roomParam,
    error,
    onCreate: (name) => {
      audio.ensure();
      store.name = name;
      net.connect({ t: 'create', name });
    },
    onJoin: (code, name) => {
      audio.ensure();
      store.name = name;
      net.connect({ t: 'join', room: code, name, token: loadToken(code) });
    },
  });
}

function endSession() {
  session?.dispose();
  session = undefined;
}

net.onStatus = (ok) => session?.hud.setConnected(ok);

net.on((msg) => {
  switch (msg.t) {
    case 'welcome':
      store.me = msg.you;
      store.room = msg.room;
      saveToken(msg.room, msg.token);
      net.setHello({ t: 'join', room: msg.room, name: store.name || rememberedName(), token: msg.token });
      history.replaceState(null, '', `?room=${msg.room}`);
      break;
    case 'lobby':
      store.lobby = msg;
      voice.sync(msg.players.filter((p) => p.connected).map((p) => p.id));
      if (msg.phase === 'lobby') {
        if (session) endSession();
        store.results = undefined;
        showLobby((practice) => net.send({ t: 'start', practice }));
      }
      break;
    case 'start':
      stopLobby();
      endSession();
      store.scenario = msg.scenario;
      store.roles = msg.roles;
      store.spawn = msg.spawn;
      store.state = undefined;
      store.clues.clear();
      hideScreens();
      break;
    case 'state':
      {
        const first = !store.state;
        store.state = msg.s;
        if (first && store.scenario && !session && !store.results) session = new Session();
      }
      break;
    case 'results':
      store.results = msg.r;
      endSession();
      showResults(msg.r, () => net.send({ t: 'playAgain' }));
      break;
    case 'chat':
      if (!session) lobbyChatMessage(msg.name, msg.text);
      break;
    case 'rtc':
      void voice.onSignal(msg.from, msg.data as Parameters<typeof voice.onSignal>[1]);
      break;
    case 'error':
      if (!store.me) {
        net.close();
        home(msg.text);
      } else if (!session) lobbyChatMessage('⚠ Ship', msg.text);
      break;
  }
  session?.handle(msg);
});

// Debug handle for automated tests (?debug in the URL).
if (params.has('debug')) (window as unknown as Record<string, unknown>).crimson = { net, store, get session() { return session; } };

home();
