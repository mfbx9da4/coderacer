import { BroadcastMethods } from './BroadcastMethods.ts'
import { serve } from 'https://deno.land/std/http/server.ts'
import { assert, ErrorCode } from './assert.ts'
import { Base64 } from 'https://deno.land/x/bb64/mod.ts'
import { config } from 'https://deno.land/x/dotenv/mod.ts'

// there is probably a better way of working out if in production mode
const isProduction = Boolean(Deno.env.get('github_client_id'))
const github_client_id = Deno.env.get('github_client_id') || config().github_client_id
const github_client_secret = Deno.env.get('github_client_secret') || config().github_client_secret

const snippetCache: Array<CodeSnippet> = []

const goodUsers = [
  'user:steveruizok',
  'user:lukeed',
  'user:Rich-Harris',
  'user:evanw',
  'user:jakearchibald',
  'user:surma',
]

export const choice = <T>(array: Array<T> | Readonly<Array<T>>): T | undefined =>
  array[Math.round(Math.random() * (array.length - 1))]

export function isDefined<T>(x: T): x is Exclude<T, undefined> {
  return Boolean(x)
}

async function findCodeSnippet(): Promise<CodeSnippet> {
  if (snippetCache.length) {
    return snippetCache.pop()!
  }

  try {
    const start = Date.now()
    const goodUser = choice(goodUsers)
    const params = Object.entries({
      q: `function language:typescript language:javascript ${goodUser}`,
      sort: choice(['indexed', undefined]),
      per_page: isProduction ? 30 : 2,
      page: choice([1, 2, 3])!,
    })
      .filter(([_, value]) => isDefined(value))
      .map(([key, value]) => `${key}=${encodeURIComponent(value!)}`)
      .join('&')
    const authHeader = `Basic ${Base64.fromString(`${github_client_id}:${github_client_secret}`)}`
    const filesResult = await fetch(`https://api.github.com/search/code?${params}`, {
      headers: { Authorization: authHeader },
    })
    type File = {
      name: string
      path: string
      sha: string
      url: string
      git_url: string
      html_url: string
      repository: {
        name: string
        description: string
        owner: { login: string; avatar_url: string; html_url: string }
      }
      score: string
    }
    const files = (await filesResult.json().then(x => x.items)) as Array<File>
    const snippet = await Promise.race(
      files.map(async file => {
        // console.log('file', file.repository)
        const res = await fetch(file.git_url, { headers: { Authorization: authHeader } })
        const json = (await res.json()) as FileContents
        type FileContents = {
          sha: string
          node_id: string
          size: string
          url: string
          content: string
          encoding: string
        }

        const content = Base64.fromBase64String(json.content).toString()
        const match = (regex: RegExp) => {
          let snippet: CodeSnippet | undefined
          for (const validMatch of [...content.matchAll(regex)].reverse()) {
            if (typeof validMatch?.index === 'number') {
              snippet = {
                content: content.substring(validMatch.index, validMatch.index + (isProduction ? 250 : 20)),
                startIndex: validMatch.index,
                url: file.url,
                html_url: file.html_url,
                name: file.name,
                path: file.path,
                repository: {
                  name: file.repository.name,
                  description: file.repository.description,
                },
                owner: {
                  avatar_url: file.repository.owner.avatar_url,
                  url: file.repository.owner.html_url,
                  name: file.repository.owner.login,
                },
                lineNumber: content.substring(0, validMatch.index).split('\n').length,
              }
              snippetCache.push(snippet)
            }
          }
          return snippet
        }
        const ans =
          match(/^export function/gm) ||
          match(/^export async function/gm) ||
          match(/^export default function/gm) ||
          match(/^function/gm) ||
          match(/^async function/gm) ||
          match(/^export class /gm) ||
          match(/^module\.exports = function/gm)
        return ans
      }),
    )
    // console.log('snippet', snippet, snippet?.html_url, 'took', Date.now() - start)
    assert(snippet, ErrorCode.NoSnippetFound)
    return snippet
  } catch (error) {
    console.error('findCodeSnippet:failed', error)
    return {
      content: `function hello() { console.log('hello') }`,
      startIndex: 0,
      url: '',
      html_url: '',
      name: '',
      path: '',
      repository: { name: '', description: '' },
      owner: { avatar_url: '', url: '', name: '' },
      lineNumber: 0,
    }
  }
}

await findCodeSnippet()

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

type CodeSnippet = {
  content: string
  startIndex: number
  url: string
  html_url: string
  name: string
  path: string
  repository: { name: string; description: string }
  owner: { name: string; avatar_url: string; url: string }
  lineNumber: number
}

type Race = {
  raceId: RaceId
  channel: BroadcastChannel
  createdAt: number
  startAt: number
  finishedAt?: number
  winner?: string
  codeSnippet: CodeSnippet
  heartbeatAt: number
  members: Map<UserId, RaceMember>
  toJSON: () => Exclude<Race, 'toJSON' | 'channel' | 'heartbeatAt'> & {
    members: RaceMember[]
  }
}

export type SerializedRace = ReturnType<Race['toJSON']>

export type RaceMember = {
  name?: string
  userId: UserId
  progress: number
  finishedAt?: number
}

// #region
interface NextRaceInput extends UpcomingRace {
  type: 'race.created'
}
newRaceChannel.onmessage = e => {
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
    const race = raceMethods.get(raceId)
    return race.joinRace({ raceId: raceId, user, requestId: data.requestId })
  }
  createRace(data)
}

async function createRace(data: { requestId: string; user: User }) {
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
    codeSnippet: await findCodeSnippet(),
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
      } as any
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
  if (!race.finishedAt && [...race.members.values()].every(x => x.finishedAt)) {
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
    const destroy = () => {
      channel.close()
      userSockets.delete(userId)
    }

    channel.onmessage = e => {
      try {
        socket.send(JSON.stringify(e.data))
      } catch (error) {
        console.error('Failed to send to socket', e.data, error)
        destroy()
      }
    }

    socket.onclose = destroy

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
      socket.onmessage = e => {
        const { type, ...data } = tryJsonParse(e.data)
        try {
          assert(data, 'missing data', e.data)
          addSocket(socket, data.user as User)

          // console.log('[request]', data)

          data.requestId = data.requestId || crypto.randomUUID()

          switch (type) {
            case 'joinOrCreateRace':
              return joinOrCreateRace(data)
            case 'ping':
              return handlePing(socket, data)
            case 'progress':
              return raceMethods.get(data.raceId).progress(data)
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
