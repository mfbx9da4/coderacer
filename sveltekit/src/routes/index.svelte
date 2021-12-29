<script context="module" lang="ts">
  export const prerender = true
</script>

<script lang="ts">
  // import Counter from '$lib/Counter.svelte';
  import { browser, prerendering } from '$app/env'
  import Sockette from 'sockette'
  import { DeferredPromise } from '../DeferredPromise'
  import { onDestroy, onMount } from 'svelte'
  import { Socket } from './socket'

  const uuid = (): string => crypto.randomUUID()

  // const userId = browser ? sessionStorage.getItem('userId') || 'user_' + uuid() : ''
  // if (browser) sessionStorage.setItem('userId', userId)

  let user: { userId: string; name?: string }

  let codeSnippet: string = ''

  let raceId: string = ''
  let webSocket: Socket
  let progress = 0
  let members: Array<{ userId: string; name?: string; progress: number }> = []
  let serverId: string = ''
  let latency: number = 0

  onMount(() => {
    if (localStorage.getItem('user')) {
      user = JSON.parse(localStorage.getItem('user'))
    } else {
      user = { userId: uuid() }
    }
    localStorage.setItem('user', JSON.stringify(user))

    const currentUrl = new URL(browser ? location.href : 'https://example.com')
    const isProduction = currentUrl.protocol === 'https:' ? true : false
    // const wsUrl = isProduction ? 'wss://coderacer.deno.dev/' : 'ws://localhost:8080/ws'
    const wsUrl = 'wss://coderacer.deno.dev/'

    webSocket = new Socket(wsUrl, {
      onopen: async () => {
        console.log('open')
        ping()
        request({ type: 'joinOrCreateRace', user })
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 15000))
          ping()
        }
      },
      onjson: (data) => {
        if (data?.race) {
          codeSnippet = data.race.codeSnippet.content
          raceId = data.race.raceId
          members = data.race.members
        }
        if (data?.type === 'pong') {
          serverId = data.instanceId
        }
      },
      onerror: (e) => {
        console.log('Socket error', e)
      },
      onclose: (e) => {
        console.log('Socket closed', e)
      },
    })
  })
  onDestroy(() => {
    webSocket?.close()
  })

  function request<T extends { type: string }, Res = any>(data: T) {
    const promise = new DeferredPromise<Res>()
    const requestId = uuid()
    const listener = (e: MessageEvent<any>) => {
      if (!promise.isPending) return webSocket.ws.removeEventListener('message', listener)
      const parsed = tryJsonParse(e.data)
      if (!parsed) promise.reject(new Error(`Failed to parse "${e.data}"`))
      if (parsed.requestId !== requestId) return
      if (e.data.error) {
        promise.reject(parsed)
      } else {
        promise.resolve(parsed)
      }
      webSocket.ws.removeEventListener('message', listener)
    }
    webSocket.ws.addEventListener('message', listener)
    webSocket.json({ user, ...data, requestId })
    return promise.promise
  }

  async function ping() {
    const start = Date.now()
    const res = await request({ type: 'ping', t: start })
    serverId = res.serverId
    latency = Date.now() - start
  }

  function joinOrCreateRace() {
    request({ type: 'joinOrCreateRace' })
  }

  function handleKeyDown(e: KeyboardEvent) {
    const expecting = codeSnippet[progress]
    if (expecting) {
      if (e.key === expecting) {
        progress++
        if (codeSnippet[progress] === '\n') {
          while (/\s/.test(codeSnippet[progress])) {
            progress++
          }
        }
        request({ type: 'progress', progress, raceId })
      }
    }
  }

  function tryJsonParse(data: string) {
    try {
      return JSON.parse(data)
    } catch {
      return
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<svelte:head>
  <title>Home</title>
</svelte:head>

<section>
  <div>
    Server Id: {serverId}
    Latency: {latency}
  </div>

  <button on:click={joinOrCreateRace}>Enter a typing race</button>
  {#each members as member}
    <div>{member.name || `Guest (${member.userId.substring(5, 8)})`}</div>
    <progress value={member.progress} max={codeSnippet.length} style="width: 100%" />
  {/each}

  <pre style="color: white">
    <span style="color: #50fa7b">{codeSnippet.substring(0, progress)}</span><span style="background-color: #00768f"
      >{codeSnippet.substring(progress, progress + 1)}</span
    ><span style="color: #8e9abe">{codeSnippet.substring(progress + 1)}</span>
  </pre>
</section>

<style>
</style>
