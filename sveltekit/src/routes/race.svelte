<script context="module" lang="ts">
  export const prerender = true
</script>

<script lang="ts">
  import { browser } from '$app/env'
  import { v4 } from '@lukeed/uuid'
  import { onDestroy, onMount } from 'svelte'
  import { DeferredPromise } from '../DeferredPromise'
  import { Socket } from '../lib/socket'
  import { crossfade } from './crossfade'
  import { user as userStore } from './userStore'
  import type { RaceMember, SerializedRace } from '../../../deno/server'
  import { xlink_attr } from 'svelte/internal'
  import { get } from 'svelte/store'

  const user = $userStore

  const [send, receive] = crossfade()

  const uuid = (): string => v4()

  let codeSnippetContent: string = ''
  let codeSnippet: SerializedRace['codeSnippet'] | undefined
  let wordCount: number = 0
  let raceId: string = ''
  let webSocket: Socket
  let progress = 0
  let members: Array<RaceMember & { progressPercent: number; wpm: number; place: number }> = []
  let serverId: string = ''
  let latency: number = 0
  let startAt: number = 0
  let now = Date.now()
  function scheduleUpdateNow() {
    setTimeout(() => {
      now = Date.now()
      scheduleUpdateNow()
    }, 1000)
  }
  scheduleUpdateNow()
  $: timeRemaining = Math.round(Math.max(startAt - now, 0) / 1000)
  $: phase = timeRemaining === 0 ? 'playing' : timeRemaining < 4 ? 'get_ready' : 'finding_peers'
  $: phaseColor = phase == 'playing' ? 'var(--green)' : phase === 'get_ready' ? 'var(--yellow)' : 'var(--pink)'
  $: finished = progress === codeSnippetContent.length
  $: winner = members.find((m) => m.finishedAt)
  $: youWon = winner?.userId === user?.userId

  onMount(() => {
    const currentUrl = new URL(browser ? location.href : 'https://example.com')
    const isProduction = currentUrl.protocol === 'https:' ? true : false
    const wsUrl = isProduction ? 'wss://coderacer.deno.dev/' : 'ws://localhost:8080'

    const getWordCount = (x: string) => x.split(/\s+/).length

    webSocket = new Socket(wsUrl, {
      onopen: async () => {
        console.log('Socket open')
        request({ type: 'joinOrCreateRace', user })
      },
      onjson: (data) => {
        if (data?.race) {
          const race: SerializedRace = data?.race
          codeSnippetContent = race.codeSnippet.content
          wordCount = getWordCount(codeSnippetContent)
          codeSnippet = race.codeSnippet
          raceId = race.raceId
          startAt = race.startAt
          const formattedMembers = race.members
          const myIndex = formattedMembers.findIndex((x) => x.userId === user?.userId)
          if (myIndex > -1) {
            const [me] = formattedMembers.splice(myIndex, 1)
            formattedMembers.unshift(me)
          }

          const sortedMembers = formattedMembers.sort((a, b) => {
            if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt
            if (a.finishedAt) return -1
            if (b.finishedAt) return 1
            return 0
          })

          members = formattedMembers.map((x) => {
            const completedWords = getWordCount(codeSnippetContent.substring(0, x.progress))
            return {
              ...x,
              progressPercent: Math.round((x.progress / codeSnippetContent.length) * 100),
              wpm: Math.max(Math.round(completedWords / ((Date.now() - startAt) / 1000 / 60)), 0),
              place: sortedMembers.indexOf(x) + 1,
            }
          })
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

  function handleKeyDown(e: KeyboardEvent) {
    if (phase !== 'playing') return
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

  const colors = ['var(--pink)', 'var(--yellow)', 'var(--blue)', 'var(--green)', 'var(--purple)']
</script>

<svelte:window on:keydown={handleKeyDown} />

<svelte:head>
  <title>Home</title>
</svelte:head>

<section style="padding: 20px">
  <!-- 
    Need countdown
    Need finding users
    Need wpm
    Need success state
    Need connection status
    Need if got enough users start the game already (updateGame)
    Need to restore game on refresh if already in game
    Need fake users
    Need animals
   -->

  <div style="margin: 0 auto; text-align: center; height: 20px">
    {phase === 'get_ready' ? 'Get ready' : phase === 'finding_peers' ? 'Waiting for more people...' : ' '}
  </div>
  <div
    style="display: flex; margin: 10px auto; border-radius: 50%; border: 8px solid {phaseColor}; width: 150px; height: 150px; justify-content: center; align-items: center"
  >
    <div style="font-size: 40px; color: {phaseColor}">
      {timeRemaining || 'GO!'}
    </div>
  </div>

  <!-- {#each Array(5) as _, i} -->
  {#each members as member, i}
    <div style="height: 20px; margin-top: 5px">
      {#if members[i]}
        {members[i].name || `Guest (${members[i].userId.substring(5, 8)})`}<span
          style="color: var(--text-color-secondary);">{members[i]?.userId === user?.userId ? ' you' : ''}</span
        >
      {/if}
    </div>
    <div style="display: flex; flex-direction: row">
      <div style="position: relative; height: 10px; margin-top: 10px; flex: 1;">
        <div
          style="position: absolute; border-radius: 10px; width: 100%; background: var(--tertiary-color); height: 10px;"
        />
        <div
          style="position: absolute; border-radius: 10px; width: {members[i].progressPercent}%; background: {colors[
            i
          ]}; height: 10px; transition: width 0.2s cubic-bezier(0, 1.05, 0.45, 0.54) 0s;"
        />
      </div>
      <div style="padding-left: 20px">
        <div>{members[i].wpm} wpm</div>
        <div>{member?.finishedAt ? `${members[i].place} place` : ''}</div>
      </div>
    </div>
  {/each}

  <pre style="color: white; background: var(--primary-color); padding: 20px;">
    <span style="color: #50fa7b">{codeSnippetContent.substring(0, progress)}</span><span
      style="background-color: #00768f">{codeSnippetContent.substring(progress, progress + 1)}</span
    ><span style="color: #8e9abe">{codeSnippetContent.substring(progress + 1)}</span>
  </pre>

  <!-- show code snippet avatar url who wrote it and link to source code -->
  {#if codeSnippet}
    <div style="border: 1px solid var(--primary-color); margin: 40px 0; " />

    <h3 style="padding-bottom: 20px; font-size: 25px;">Coded by</h3>
    <div style="display: flex">
      <a
        style="display: flex; flex-direction: column; align-items: center;"
        target="_blank"
        rel="noreferrer"
        href={codeSnippet.owner.url}
      >
        <img
          style="borer-radius: 50%"
          width="100"
          height="100"
          src={codeSnippet.owner.avatar_url}
          alt={codeSnippet.owner.name}
        />
        <div style="padding-top: 10px;">{codeSnippet.owner.name}</div>
      </a>
      <div style="display: flex; padding-left: 20px; flex-direction: column">
        <div>
          <a
            style="font-size: 20px;"
            target="_blank"
            href={codeSnippet?.html_url ? `${codeSnippet.html_url}#L${codeSnippet.lineNumber}` : '#'}
            ><span style="color: var(--white)">{codeSnippet.repository.name}</span>/{codeSnippet.path}</a
          >
        </div>
        <div style="padding-top: 5px;">
          <a
            target="_blank"
            style="color: var(--text-color-secondary)"
            href={codeSnippet?.html_url ? `${codeSnippet.html_url}#L${codeSnippet.lineNumber}` : '#'}
            >{codeSnippet.repository.description || ''}</a
          >
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
</style>
