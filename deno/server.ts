import { serve } from 'https://deno.land/std/http/server.ts'
import { assert } from './src/utils/assert.ts'
import { findExistingRace } from './src/findExistingRace.ts'
import { addWebSocket } from './src/userWebSockets.ts'
import { globalRaces, createRace } from './src/races.ts'
import { RaceId, User } from './src/types.ts'
import { html } from './src/testHtml.ts'
import { tryJsonParse } from './src/utils/tryJsonParse.ts'

const serverId = crypto.randomUUID()

// TODO: need to do some validation on these handlers

function handleJoinOrCreateRace(data: { requestId: string; user: User }) {
  const { user } = data
  const raceId = findExistingRace()
  if (raceId) {
    const race = globalRaces.get(raceId)
    return race.joinRace({ raceId: raceId, user, requestId: data.requestId })
  }
  return createRace(data)
}

function handleProgress(data: { requestId: string; user: User; raceId: RaceId; progress: number }) {
  return globalRaces.get(data.raceId).progress(data)
}

function handlePing(socket: WebSocket, data: { requestId: string; t: number; user: User; raceId?: RaceId }) {
  socket.send(JSON.stringify({ type: 'pong', requestId: data.requestId, serverId, t: Date.now() }))
  if (data.raceId) return globalRaces.get(data.raceId).ping(data)
}

await serve(
  (r: Request) => {
    try {
      const { socket, response } = Deno.upgradeWebSocket(r)
      socket.onmessage = e => {
        const { type, ...data } = tryJsonParse(e.data)
        try {
          assert(data, 'missing data', e.data)
          addWebSocket(socket, data.user as User)

          data.requestId = data.requestId || crypto.randomUUID()

          switch (type) {
            case 'joinOrCreateRace':
              return handleJoinOrCreateRace(data)
            case 'progress':
              return handleProgress(data)
            case 'ping':
              return handlePing(socket, data)
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
