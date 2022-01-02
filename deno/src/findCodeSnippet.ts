import { assert, ErrorCode } from './utils/assert.ts'
import { Base64 } from 'https://deno.land/x/bb64/mod.ts'
import { config } from 'https://deno.land/x/dotenv/mod.ts'
import { isProduction } from './utils/isProduction.ts'
import { isDefined } from './utils/isDefined.ts'
import { choice } from './utils/choice.ts'

export type CodeSnippet = {
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

type FileContents = {
  sha: string
  node_id: string
  size: string
  url: string
  content: string
  encoding: string
}

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
  'user:gaearon',
  'user:jaredpalmer',
  'user:TomerAberbach',
]

export async function findCodeSnippet(): Promise<CodeSnippet> {
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

    const files = (await filesResult.json().then(x => x.items)) as Array<File>
    const snippet = await Promise.race(
      files.map(async file => {
        // console.log('file', file.repository)
        const res = await fetch(file.git_url, { headers: { Authorization: authHeader } })
        const json = (await res.json()) as FileContents
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
    console.info('snippet', snippet?.html_url, 'took', Date.now() - start)
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

// populate the cache on startup
await findCodeSnippet()
