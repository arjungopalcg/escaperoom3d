// WebSocket client with automatic reconnect and server clock sync.
import type { ClientMsg, ServerMsg } from '@crimson/engine';

type Handler = (msg: ServerMsg) => void;

export class Net {
  private ws?: WebSocket;
  private handlers: Handler[] = [];
  private hello?: ClientMsg;
  private retry = 0;
  private closedByUser = false;
  private pingTimer?: number;
  private offsets: number[] = [];
  /** serverTime ≈ Date.now() + offset */
  offset = 0;
  connected = false;
  onStatus?: (connected: boolean) => void;

  on(h: Handler) {
    this.handlers.push(h);
  }

  connect(hello: ClientMsg) {
    this.hello = hello;
    this.closedByUser = false;
    this.open();
  }

  /** Update the hello message used on reconnect (e.g. once we have a token). */
  setHello(hello: ClientMsg) {
    this.hello = hello;
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.onStatus?.(true);
      if (this.hello) ws.send(JSON.stringify(this.hello));
      this.ping();
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.ping(), 4000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'pong') {
        const now = Date.now();
        const rtt = now - msg.c;
        this.offsets.push(msg.s - (msg.c + rtt / 2));
        if (this.offsets.length > 7) this.offsets.shift();
        const sorted = [...this.offsets].sort((a, b) => a - b);
        this.offset = sorted[Math.floor(sorted.length / 2)];
        return;
      }
      for (const h of this.handlers) h(msg);
    };
    ws.onclose = () => {
      this.connected = false;
      this.onStatus?.(false);
      clearInterval(this.pingTimer);
      if (this.closedByUser) return;
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
  }

  private ping() {
    this.send({ t: 'ping', c: Date.now() });
  }

  serverNow(): number {
    return Date.now() + this.offset;
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}

export const net = new Net();
