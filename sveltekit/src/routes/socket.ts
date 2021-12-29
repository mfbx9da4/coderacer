function noop() {}

// export type JsonPrimitive = string | number | boolean | null
// export type JsonObject = { [member: string]: JsonValue }
// export type JsonArray = Array<JsonValue>
// export type Json = JsonPrimitive | JsonObject | JsonArray

function tryJsonParse(value: string) {
  try {
    return JSON.parse(value)
  } catch {}
}

export interface SocketOptions {
  protocols?: string | string[]
  retryInterval?: number
  maxAttempts?: number
  onopen?: (ev: Event) => unknown
  onmessage?: (ev: MessageEvent) => unknown
  onjson?: (data: any) => unknown
  onreconnect?: (ev: Event | CloseEvent | ErrorEvent) => unknown
  onmaximum?: (ev: Event | CloseEvent | ErrorEvent) => unknown
  onclose?: (ev: CloseEvent) => unknown
  onerror?: (ev: Event) => unknown
  /** This callback will be executed periodically to keep the connection alive */
  ping?: (socket: Socket) => unknown
  /** How often the ping should be callback should be executed */
  pingInterval?: number
}

enum ErrorCodes {
  NormalClosure = 1000,
  GoingAway = 1001,
  NoStatusReceived = 1005,
}

export class Socket {
  opts: Required<SocketOptions>
  ws: WebSocket
  url: string
  heartbeat: ReturnType<typeof heartbeat>
  private timer: ReturnType<typeof setTimeout> | undefined = 1
  private num = 0

  constructor(url: string, opts: SocketOptions) {
    this.opts = {
      protocols: [],
      retryInterval: 1000,
      pingInterval: 15000,
      maxAttempts: Infinity,
      onopen: noop,
      onjson: noop,
      onmessage: noop,
      onreconnect: noop,
      onmaximum: noop,
      onclose: noop,
      onerror: noop,
      ping: noop,
      ...opts,
    }
    this.url = url
    this.ws = this.open()
    this.heartbeat = heartbeat(() => this.opts.ping(this), this.opts.pingInterval)
  }

  open() {
    const ws = new WebSocket(this.url, this.opts.protocols || [])
    this.ws = ws

    ws.onmessage = (e) => {
      this.opts.onmessage(e)
      const data = tryJsonParse(e.data)
      if (data) this.opts.onjson(data)
    }

    ws.onopen = (e) => {
      this.opts.onopen(e)
      this.num = 0
      this.heartbeat.start()
    }

    ws.onclose = (e) => {
      // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
      const skipReconnect = [ErrorCodes.NormalClosure, ErrorCodes.GoingAway, ErrorCodes.NoStatusReceived]
      if (!skipReconnect.includes(e.code)) this.reconnect(e)
      this.opts.onclose(e)
      this.heartbeat.stop()
    }

    ws.onerror = (e) => {
      if ((e as any)?.code === 'ECONNREFUSED') {
        return this.reconnect(e)
      }
      this.opts.onerror(e)
    }
    return ws
  }

  reconnect(e: CloseEvent | Event | ErrorEvent) {
    if (this.timer && this.num++ < this.opts.maxAttempts) {
      // the first time retry immediately
      const retryInterval = this.num === 1 ? 0 : this.opts.retryInterval
      this.timer = setTimeout(() => {
        this.opts.onreconnect(e)
        this.open()
      }, retryInterval)
    } else {
      this.opts.onmaximum(e)
    }
  }

  json(x: unknown) {
    this.ws.send(JSON.stringify(x))
  }

  send(x: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.ws.send(x)
  }

  close(code?: number | undefined, reason?: string | undefined) {
    clearTimeout(this.timer)
    this.timer = undefined
    this.ws.close(code || ErrorCodes.NormalClosure, reason)
  }
}

function heartbeat(ping: () => unknown, pingInterval: number) {
  let pingTimeout: ReturnType<typeof setTimeout> | undefined
  function start() {
    if (pingTimeout) return
    ping()
    schedulePing()
  }
  function schedulePing() {
    pingTimeout = setTimeout(() => {
      ping()
      schedulePing()
    }, pingInterval)
  }
  function stop() {
    if (!pingTimeout) return
    clearTimeout(pingTimeout)
    pingTimeout = undefined
  }
  return { start, stop }
}
