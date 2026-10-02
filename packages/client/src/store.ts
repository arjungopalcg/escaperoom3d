// Client-side mirror of what the server has told us.
import type { ClueContent, ClueKind, PublicScenario, Results, Role, ServerMsg, StateView } from '@crimson/engine';

type LobbyMsg = Extract<ServerMsg, { t: 'lobby' }>;

export interface ClueRead {
  id: string;
  kind: ClueKind;
  title: string;
  content: ClueContent;
}

export interface Settings {
  textSize: 'small' | 'medium' | 'large';
  master: number;
  sfx: number;
  voice: number;
  speech: boolean;
  pushToTalk: boolean;
  invertLook: boolean;
}

const SETTINGS_KEY = 'crimson-gull-settings';

function loadSettings(): Settings {
  const d: Settings = { textSize: 'medium', master: 0.8, sfx: 0.8, voice: 1, speech: true, pushToTalk: false, invertLook: false };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return d;
  }
}

export const store = {
  me: '',
  name: '',
  room: '',
  lobby: undefined as LobbyMsg | undefined,
  scenario: undefined as PublicScenario | undefined,
  roles: {} as Record<string, Role>,
  spawn: {} as Record<string, number>,
  state: undefined as StateView | undefined,
  results: undefined as Results | undefined,
  clues: new Map<string, ClueRead>(),
  settings: loadSettings(),

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* private mode */
    }
  },

  get myRole(): Role {
    return this.roles[this.me] ?? 'deckhand';
  },

  get myView() {
    return this.state?.players.find((p) => p.id === this.me);
  },

  playerName(id: string): string {
    return this.state?.players.find((p) => p.id === id)?.name ?? this.lobby?.players.find((p) => p.id === id)?.name ?? 'Someone';
  },

  isHost(): boolean {
    return this.lobby?.hostId === this.me;
  },
};

export function tokenKey(room: string) {
  return `crimson-gull-token-${room}`;
}
export function saveToken(room: string, token: string) {
  try {
    localStorage.setItem(tokenKey(room), token);
  } catch {
    /* ignore */
  }
}
export function loadToken(room: string): string | undefined {
  try {
    return localStorage.getItem(tokenKey(room)) ?? undefined;
  } catch {
    return undefined;
  }
}
