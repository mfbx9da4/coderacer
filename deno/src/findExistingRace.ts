import { RaceId } from './types.ts'
import { localRaces } from './races.ts'

export type UpcomingRace = {
  raceId: RaceId
  startAt: number
}

const newRaceChannel = new BroadcastChannel('newRace')
const upcomingRaces = new Map<RaceId, UpcomingRace>()

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

export function broadcastNewRace(nextRace: UpcomingRace) {
  newRaceChannel.postMessage({ type: 'race.created', ...nextRace })
}

export function findExistingRace() {
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
  for (const race of localRaces.values()) {
    if (race.startAt > now && race.members.size < 5) {
      validRaceId = race.raceId
    } else if (race.heartbeatAt < now - 1000 * 60 * 10 && race.startAt < now) {
      // cleanup old races
      race.channel.close()
      localRaces.delete(race.raceId)
    }
  }

  return validRaceId
}
