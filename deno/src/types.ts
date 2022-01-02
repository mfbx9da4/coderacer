import { CodeSnippet } from './findCodeSnippet.ts'

export type { CodeSnippet }
export type RaceId = `race_${string}`
export type UserId = `user_${string}`

export type User = { userId: UserId; name?: string }

export type Race = {
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
export type RaceMember = {
  name?: string
  userId: UserId
  progress: number
  finishedAt?: number
}

export type SerializedRace = ReturnType<Race['toJSON']>
