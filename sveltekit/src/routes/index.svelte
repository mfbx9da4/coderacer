<script context="module" lang="ts">
  export const prerender = true
</script>

<script lang="ts">
  // import Counter from '$lib/Counter.svelte';
  import { browser, prerendering } from '$app/env'
  import Sockette from 'sockette'
  import { onMount } from 'svelte'

  // let codeSnippet: Array<Array<string>> = []
  let codeSnippet: string = ''

  let raceId: string = ''
  let webSocket: Sockette
  let progress = 0
  let members = []
  if (!prerendering && browser) {
    console.log('here')
    const currentUrl = new URL(browser ? location.href : 'https://example.com')
    const isProduction = currentUrl.protocol === 'https:' ? true : false
    const wsUrl = isProduction ? 'wss://coderacer.deno.dev/' : 'ws://localhost:8080/ws'

    webSocket = new Sockette(wsUrl, {
      timeout: 5e3,
      maxAttempts: 10,
      onopen: (e) => {
        request({ type: 'ping', t: Date.now() })
        request({ type: 'joinOrCreateRace' })
      },
      onmessage: (e) => {
        console.log('e.data', e.data)
        const data = JSON.parse(e.data)
        if (data.race) {
          codeSnippet = data.race.codeSnippet.content
          raceId = data.race.raceId
          members = data.race.members
        }
      },
      onreconnect: (e) => console.log('Reconnecting...', e),
      onmaximum: (e) => console.log('Stop Attempting!', e),
      onclose: (e) => console.log('Closed!', e),
      onerror: (e) => console.log('Error:', e),
    })
  }

  const uuid = () => crypto.randomUUID()

  const userId = browser ? sessionStorage.getItem('userId') || 'user_' + uuid() : ''
  if (browser) sessionStorage.setItem('userId', userId)
  const user = { name: 'Deno', userId }

  function request<T extends { type: string }>(data: T) {
    webSocket.json({ user, ...data, requestId: uuid() })
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
</script>

<svelte:window on:keydown={handleKeyDown} />

<svelte:head>
  <title>Home</title>
</svelte:head>

<section>
  <!-- <button on:click={joinOrCreateRace}>Enter a typing race</button> -->
  {#each members as member}
    <div>{member.name}</div>
    <progress value={member.progress} max={codeSnippet.length} style="width: 100%" />
  {/each}

  <pre style="color: white">
    <span style="color: green">{codeSnippet.substring(0, progress)}</span><span style="background-color: blue"
      >{codeSnippet.substring(progress, progress + 1)}</span
    ><span>{codeSnippet.substring(progress + 1)}</span>
  </pre>
</section>

<style>
</style>
