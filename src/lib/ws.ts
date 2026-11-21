export function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export interface ManagedSocket {
  send: (payload: unknown) => void;
  close: () => void;
}

export function createCbtSocket(options: {
  onOpen: (ws: WebSocket) => void;
  onMessage: (data: Record<string, unknown>) => void;
  onStatusChange?: (connected: boolean) => void;
}): ManagedSocket {
  let ws: WebSocket | null = null;
  let closedByUser = false;
  let reconnectTimer: number | null = null;
  const queue: string[] = [];

  const connect = () => {
    if (closedByUser) return;
    ws = new WebSocket(getWebSocketUrl());

    ws.onopen = () => {
      options.onStatusChange?.(true);
      if (ws) {
        options.onOpen(ws);
        while (queue.length > 0 && ws.readyState === WebSocket.OPEN) {
          const item = queue.shift();
          if (item) ws.send(item);
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data));
        options.onMessage(parsed);
      } catch {
        // Ignore malformed payloads
      }
    };

    ws.onclose = () => {
      options.onStatusChange?.(false);
      if (!closedByUser) {
        reconnectTimer = window.setTimeout(connect, 1500);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    send(payload: unknown) {
      const serialized = JSON.stringify(payload);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      } else {
        queue.push(serialized);
      }
    },
    close() {
      closedByUser = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      ws?.close();
    },
  };
}
