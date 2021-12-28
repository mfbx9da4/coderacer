import { BroadcastMethods } from './BroadcastMethods.ts'
import { serve } from 'https://deno.land/std/http/server.ts'
import { assert, ErrorCode } from './assert.ts'

type RaceId = `race_${string}`
type UserId = `user_${string}`

const serverId = crypto.randomUUID()

const newRaceChannel = new BroadcastChannel('newRace')
const upcomingRaces = new Map<RaceId, UpcomingRace>()
const userSockets: Map<UserId, { userId: UserId; socket: WebSocket; channel: BroadcastChannel }> = new Map()
const races: Map<string, Race> = new Map()

const raceMethods = new BroadcastMethods<{
  joinRace: (data: { requestId: string; user: User; raceId: RaceId }) => void
  progress: (data: { requestId: string; user: User; raceId: RaceId; progress: number }) => void
  ping: (data: { requestId: string; user: User; raceId?: RaceId; t: number }) => void
}>()

type User = { userId: UserId; name?: string }

type UpcomingRace = {
  raceId: RaceId
  startAt: number
}

type Race = {
  raceId: RaceId
  channel: BroadcastChannel
  createdAt: number
  startAt: number
  finishedAt?: number
  winner?: string
  codeSnippet: {
    url: string
    content: string
    startIndex: number
  }
  heartbeatAt: number
  members: Map<UserId, RaceMember>
  toJSON: () => {
    raceId: RaceId
    startAt: number
    createdAt: number
    finishedAt: number | undefined
    winner: string | undefined
    codeSnippet: {
      url: string
      content: string
      startIndex: number
    }
    members: RaceMember[]
  }
}

type RaceMember = {
  name?: string
  userId: UserId
  progress: number
  finishedAt?: number
}

// #region
interface NextRaceInput extends UpcomingRace {
  type: 'race.created'
}
newRaceChannel.onmessage = (e) => {
  const data = e.data as NextRaceInput
  if (data.type === 'race.created') {
    upcomingRaces.set(data.raceId, { raceId: data.raceId, startAt: data.startAt })
  } else {
    throw new Error(`Unknown next race type: ${data.type}`)
  }
}

function broadcastNewRace(nextRace: UpcomingRace) {
  newRaceChannel.postMessage({ type: 'newRace', ...nextRace })
}

function findNextRace() {
  const now = Date.now()
  let validRaceId: RaceId | undefined
  for (const race of upcomingRaces.values()) {
    if (race.startAt > now) {
      validRaceId = race.raceId
    } else if (race.startAt < now) {
      // cleanup expired upcoming races
      upcomingRaces.delete(race.raceId)
    }
  }
  for (const race of races.values()) {
    if (race.startAt > now && race.members.size < 5) {
      validRaceId = race.raceId
    } else if (race.heartbeatAt < now - 1000 * 60 * 10 && race.startAt < now) {
      // cleanup old races
      race.channel.close()
      races.delete(race.raceId)
    }
  }

  return validRaceId
}
// #endregion

function joinOrCreateRace(data: { requestId: string; user: User }) {
  const { user } = data
  const raceId = findNextRace()
  if (raceId) {
    return raceMethods.get(raceId).joinRace({ raceId: raceId, user, requestId: data.requestId })
  }
  createRace(data)
}

function createRace(data: { requestId: string; user: User }) {
  const { user } = data
  const raceId: RaceId = `race_${crypto.randomUUID()}`
  assert(!races.get(raceId), 'Race already exists', ErrorCode.RaceAlreadyExists)

  const methods = { joinRace, progress, ping }
  const channel = raceMethods.expose(raceId, methods)

  const race: Race = {
    raceId,
    channel,
    startAt: Date.now() + 1000 * 13,
    createdAt: Date.now(),
    heartbeatAt: Date.now(),
    //   TODO: fetch from github
    codeSnippet: {
      content: `function attempt(func, ...args) {
  try {
    return func(...args)
  } catch (e) {
    return isError(e) ? e : new Error(e)
  }
}
      `,
      startIndex: 0,
      url: '',
    },
    members: new Map([[user.userId, { ...user, progress: 0 }]]),
    toJSON() {
      return {
        raceId: this.raceId,
        startAt: this.startAt,
        createdAt: this.createdAt,
        finishedAt: this.finishedAt,
        winner: this.winner,
        codeSnippet: this.codeSnippet,
        members: [...this.members.values()],
      }
    },
  }

  console.log('race', JSON.stringify(race))

  races.set(raceId, race)

  sendToUser(user.userId, { type: 'race.created', requestId: data.requestId, race: race.toJSON() })
  broadcastNewRace({ raceId: race.raceId, startAt: race.startAt })
}

function joinRace(data: { requestId: string; user: User; raceId: RaceId }) {
  const { raceId, user } = data
  const race = races.get(raceId)
  assert(race, 'Race not found', ErrorCode.RaceNotFound)
  const existingMember = race.members.get(user.userId)
  const raceMember: RaceMember = {
    ...existingMember,
    ...user,
    progress: existingMember?.progress || 0,
  }
  race.members.set(user.userId, raceMember)
  sendToRaceMembers(race, { type: 'member.joined', requestId: data.requestId, race: race.toJSON() })
}

function ping(data: { requestId: string; t: number; raceId?: RaceId }) {
  const { raceId } = data || {}
  const race = races.get(raceId || '')
  if (race) race.heartbeatAt = Date.now()
}

function progress(data: { requestId: string; user: User; raceId: RaceId; progress: number }) {
  const { raceId, progress, user } = data
  const race = races.get(raceId)
  assert(race, 'race not found', ErrorCode.RaceNotFound)
  const member = race.members.get(user.userId)
  assert(member, 'Member not found', ErrorCode.RaceMemberNotFound)
  member.progress = progress
  if (member.progress === race.codeSnippet.content.length) {
    member.finishedAt = Date.now()
  }
  if (!race.finishedAt && [...race.members.values()].every((x) => x.finishedAt)) {
    // the race has now finished now that everyone has completed it
    race.finishedAt = Date.now()
  }
  sendToRaceMembers(race, { type: 'member.updated', requestId: data.requestId, race: race.toJSON() })
}

function addSocket(socket: WebSocket, user?: User) {
  const userId = user?.userId
  if (!userId) return
  const currentSocket = userSockets.get(userId)?.socket
  if (currentSocket !== socket) {
    const channel = new BroadcastChannel(userId)
    channel.onmessage = (e) => {
      socket.send(JSON.stringify(e.data))
    }

    socket.onclose = () => {
      channel.close()
      userSockets.delete(userId)
    }

    userSockets.set(userId, { userId, socket, channel })
  }
}

function handlePing(socket: WebSocket, data: { requestId: string; t: number; user: User; raceId?: RaceId }) {
  socket.send(JSON.stringify({ type: 'pong', requestId: data.requestId, serverId, t: Date.now() }))
  if (data.raceId) return raceMethods.get(data.raceId).ping(data)
}

await serve(
  (r: Request) => {
    try {
      const { socket, response } = Deno.upgradeWebSocket(r)
      socket.onmessage = (e) => {
        const { type, ...data } = tryJsonParse(e.data)
        try {
          assert(data, 'missing data', e.data)
          addSocket(socket, data.user as User)

          console.log('data', data)

          data.requestId = data.requestId || crypto.randomUUID()

          switch (type) {
            case 'joinOrCreateRace':
              return joinOrCreateRace(data)
            case 'ping':
              return handlePing(socket, data)
            case 'progress':
              return raceMethods.get(data.raceId).progress(data)
            case 'joinRace':
              return raceMethods.get(data.raceId).joinRace(data)
          }
          throw new Error('Unknown message type')
        } catch (error) {
          socket.send(JSON.stringify({ type: 'error', requestId: data.requestId, error: error.message }))
        }
      }
      return response
    } catch {
      return new Response(html(), { headers: { 'Content-type': 'text/html' } })
    }
  },
  { port: 8080 },
)

type WebSocketResponse = {
  type: 'error' | 'pong' | 'member.joined' | 'member.updated' | 'race.created'
  requestId: string
}

function sendToRaceMembers<T extends WebSocketResponse>(race: Race, data: T) {
  for (const member of race.members.values()) {
    sendToUser(member.userId, data)
  }
}

function sendToUser<T extends WebSocketResponse>(userId: UserId, data: T) {
  sendToBroadcastChannel(userId, data)
}

function sendToBroadcastChannel<T extends WebSocketResponse>(channelId: string, data: T) {
  const channel = new BroadcastChannel(channelId)
  channel.postMessage(data)
  channel.close()
}

function tryJsonParse(data: string) {
  try {
    return JSON.parse(data)
  } catch {
    return
  }
}

function html() {
  return /* html */ `
<script>
  const userId =  sessionStorage.getItem('userId') || 'user_' +crypto.randomUUID()
  const protocol = new URL(location.href).protocol === 'http:' ? 'ws://' : 'wss://';
  const log = (str) => {
    console.log(str)
    pre.textContent += str +"\\n"
  }
  let ws = new WebSocket(protocol+location.host)
  ws.onmessage = e => log(JSON.stringify(JSON.parse(e.data), null, 2))
  const ping = () => {
    ws.send(JSON.stringify({ type: 'ping', t: Date.now() }))
    log(JSON.stringify({ type: 'ping', t: Date.now() }))
    setTimeout(ping, 10000)
  }
  setTimeout(() => {
    ping()
    ws.send(JSON.stringify({ type: 'joinOrCreateRace', user: { userId }, requestId: crypto.randomUUID() }))
  }, 1000)
</script>

<input onkeyup="event.key=='Enter'&&ws.send(this.value)"><pre id=pre>`
}
