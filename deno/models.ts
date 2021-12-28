import { db } from './database.ts'

interface Race {
  raceId: string
  createdAt: Date
  startAt: Date
  finishedAt?: Date
  winner?: string
  codeSnippet: {
    url: string
    content: string
    startIndex: number
  }
}

type RaceMember = {
  raceId: string
  userId: string
  score: number
  finishedAt?: Date
  name: string
}
const raceMemberKeys: Readonly<Array<keyof RaceMember>> = ['raceId', 'userId', 'score', 'finishedAt', 'name'] as const

export async function insertRace(race: Race) {
  // insert into races table
  try {
    const res = await db.queryObject<Race>(
      /* sql */ `insert into races ( "raceId", "createdAt", "startAt", "codeSnippet") values ($1, $2, $3, $4) returning *`,
      race['raceId'],
      race['createdAt'],
      race['startAt'],
      race['codeSnippet'],
    )
    return res.rows[0]
  } catch (error) {
    console.error('insert race failed', Object.entries(error))
    throw error
  }
}

export async function insertRaceMember(raceMember: RaceMember) {
  const colNames = raceMemberKeys.map((x) => `"${x}"`).join(', ')
  const params = raceMemberKeys.map((_, i) => `$${i + 1}`)
  const values = raceMemberKeys.map((x) => raceMember[x])
  try {
    const res = await db.queryObject<RaceMember>(
      /* sql */ `insert into races (${colNames}) values (${params}) returning *`,
      ...values,
    )
    return res.rows[0]
  } catch (error) {
    console.error('insert race failed', Object.entries(error))
    throw error
  }
}

export async function updateRaceMemberScore(partial: Pick<RaceMember, 'raceId' | 'userId'>, score: number) {
  const values = [partial['raceId'], partial['userId'], score]
  try {
    const res = await db.queryObject<RaceMember>(
      /* sql */ `update races where "raceId" = $1 and "userId" = $2 set score = $3 returning *`,
      ...values,
    )
    return res.rows[0]
  } catch (error) {
    console.error('insert race failed', Object.entries(error))
    throw error
  }
}
