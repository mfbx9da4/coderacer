<script context="module" lang="ts">
  export const prerender = true
</script>

<script lang="ts">
  import { browser } from '$app/env'
  import { v4 } from '@lukeed/uuid'
  import { onDestroy, onMount } from 'svelte'
  import { quintInOut } from 'svelte/easing'
  import { crossfade } from 'svelte/transition'
  import { DeferredPromise } from '../DeferredPromise'
  import { Socket } from '../lib/socket'
  import { user as userStore } from './userStore'

  const user = $userStore

  const [send, receive] = crossfade({
    duration: (d) => Math.sqrt(d * 200),

    fallback(node, params) {
      const style = getComputedStyle(node)
      const transform = style.transform === 'none' ? '' : style.transform

      return {
        duration: 600,
        easing: quintInOut,
        css: (t) => `
    			transform: ${transform} scale(${t});
    			opacity: ${t}
    		`,
      }
    },
  })

  const uuid = (): string => v4()

  let codeSnippetContent: string = ''
  let codeSnippet: any = ''

  let raceId: string = ''
  let webSocket: Socket
  let progress = 0
  let members: Array<{ userId: string; name?: string; progress: number }> = []
  let serverId: string = ''
  let latency: number = 0

  onMount(() => {
    const currentUrl = new URL(browser ? location.href : 'https://example.com')
    const isProduction = currentUrl.protocol === 'https:' ? true : false
    const wsUrl = isProduction ? 'wss://coderacer.deno.dev/' : 'ws://localhost:8080'
    // const wsUrl = 'wss://coderacer.deno.dev/'

    webSocket = new Socket(wsUrl, {
      onopen: async () => {
        console.log('open')
        request({ type: 'joinOrCreateRace', user })
      },
      onjson: (data) => {
        if (data?.race) {
          codeSnippetContent = data.race.codeSnippet.content
          codeSnippet = data.race.codeSnippet
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
      onreconnect: (e) => {
        console.log('Socket reconnect')
      },
      ping,
    })
  })

  onDestroy(() => {
    console.log('destroy')
    if (webSocket?.ws.OPEN || webSocket?.ws.CONNECTING) {
      webSocket?.close()
    }
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
    console.log('ping')
    const res = await request({ type: 'ping', t: start })
    serverId = res.serverId
    latency = Date.now() - start
  }

  function joinOrCreateRace() {
    request({ type: 'joinOrCreateRace' })
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!e.metaKey) {
      e.preventDefault()
    }
    const expecting = codeSnippetContent[progress]
    if (expecting) {
      if (e.key === expecting) {
        progress++
        if (codeSnippetContent[progress] === '\n') {
          while (/\s/.test(codeSnippetContent[progress])) {
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

<section in:receive={{ key: 'main' }} out:send={{ key: 'main' }}>
  <div>
    Server Id: {serverId}
    Latency: {latency}
    User:
  </div>

  <button on:click={joinOrCreateRace}>Enter a typing race</button>
  {#each members as member}
    <div>{member.name || `Guest (${member.userId.substring(5, 8)})`}</div>
    <progress value={member.progress} max={codeSnippetContent.length} style="width: 100%" />
  {/each}

  <pre style="color: white">
    <span style="color: #50fa7b">{codeSnippetContent.substring(0, progress)}</span><span
      style="background-color: #00768f">{codeSnippetContent.substring(progress, progress + 1)}</span
    ><span style="color: #8e9abe">{codeSnippetContent.substring(progress + 1)}</span>
  </pre>

  <pre style="color: #8e9abe">{JSON.stringify(codeSnippet, null, 2)}</pre>
  <!-- <a target="_blank" href={`${codeSnippet.html_url}#L${codeSnippet.lineNumber}`}>Source</a> -->
</section>

<style>
</style>
