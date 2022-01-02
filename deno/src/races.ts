import { BroadcastMethods } from './utils/BroadcastMethods.ts'
import { assert, ErrorCode } from './utils/assert.ts'
import { findCodeSnippet } from './findCodeSnippet.ts'
import { broadcastNewRace } from './findExistingRace.ts'
import { sendToRaceMembers, sendToUser } from './userWebSockets.ts'
import { Race, User, RaceId, RaceMember } from './types.ts'

export const localRaces: Map<string, Race> = new Map()
export const globalRaces = new BroadcastMethods<{
  joinRace: (data: { requestId: string; user: User; raceId: RaceId }) => void
  progress: (data: { requestId: string; user: User; raceId: RaceId; progress: number }) => void
  ping: (data: { requestId: string; user: User; raceId?: RaceId; t: number }) => void
}>()

export async function createRace(data: { requestId: string; user: User }) {
  const { user } = data
  const raceId: RaceId = `race_${crypto.randomUUID()}`
  assert(!localRaces.get(raceId), 'Race already exists', ErrorCode.RaceAlreadyExists)

  const methods = { joinRace, progress, ping }
  // this is a key line where we expose these methods to be globally available for this race
  const channel = globalRaces.expose(raceId, methods)

  const race: Race = {
    raceId,
    channel,
    startAt: Date.now() + 1000 * 13,
    createdAt: Date.now(),
    heartbeatAt: Date.now(),
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

  localRaces.set(raceId, race)

  sendToUser(user.userId, { type: 'race.created', requestId: data.requestId, race: race.toJSON() })
  broadcastNewRace({ raceId: race.raceId, startAt: race.startAt })
}

function joinRace(data: { requestId: string; user: User; raceId: RaceId }) {
  const { raceId, user } = data
  const race = localRaces.get(raceId)
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
  const race = localRaces.get(raceId || '')
  if (race) race.heartbeatAt = Date.now()
}

function progress(data: { requestId: string; user: User; raceId: RaceId; progress: number }) {
  const { raceId, progress, user } = data
  const race = localRaces.get(raceId)
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
