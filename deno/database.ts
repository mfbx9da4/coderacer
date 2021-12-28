import * as postgres from 'https://deno.land/x/postgres@v0.14.0/mod.ts'

const databaseUrl =
  Deno.env.get('DATABASE_URL') ||
  'postgres://postgres:ZjHyQ4dTbEzwnvdOoNrLrorgwq3OhoW@db.qwnytzshfbsqiywnajad.supabase.co:6543/postgres'

const pool = new postgres.Pool(databaseUrl, 3, true)

console.time('connect')
export const db = await pool.connect()
console.timeEnd('connect')
console.time('migrate')
try {
  await db.queryObject/* sql */ `
    drop table if exists races;
    drop table if exists race_members;
    create table if not exists races (
      "raceId" varchar(50) primary key,
      "startAt" timestamp(3) not null,
      "createdAt" timestamp(3) not null,
      "finishedAt" timestamp(3),
      "winner" varchar(50),
      "codeSnippet" jsonb not null
    );
    create table if not exists race_members (
      "userId" varchar(50) not null,
      "raceId" varchar(50) not null,
      "score" smallint not null,
      "name" varchar(30),
      "finishedAt" timestamp(3),
      "avatar" varchar(255)
    );
    create index if not exists "raceId_userId__index" on race_members ("raceId", "userId");
    create index if not exists "raceId__index" on race_members ("raceId");
  `
} finally {
  db.release()
}
console.timeEnd('migrate')
