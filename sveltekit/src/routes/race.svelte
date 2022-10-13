<script context="module" lang="ts">
  export const prerender = true
</script>

<script lang="ts">
  import { browser } from '$app/env'
  import { v4 } from '@lukeed/uuid'
  import { onDestroy, onMount } from 'svelte'
  import type { RaceMember, SerializedRace } from '../../../deno/src/types'
  import { crossfade } from '../lib/crossfade'
  import { DeferredPromise } from '../lib/DeferredPromise'
  import Footer from '../lib/Footer.svelte'
  import { Socket } from '../lib/socket'
  import { user as userStore } from '../lib/userStore'
  import Asdf from './asdf.svelte'

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
  $: finished = progress === codeSnippetContent.length
  $: winner = members.find((m) => m.finishedAt)
  $: youWon = winner?.userId === user?.userId
  $: phase = !raceId
    ? 'loading'
    : finished && youWon
    ? 'won'
    : finished && !youWon
    ? 'finished'
    : timeRemaining === 0
    ? 'playing'
    : timeRemaining < 4
    ? 'get_ready'
    : 'finding_peers'
  $: phaseColor =
    phase === 'won'
      ? 'gold'
      : phase == 'finished'
      ? 'var(--text-color-secondary)'
      : phase === 'playing'
      ? 'var(--green)'
      : phase === 'get_ready'
      ? 'var(--yellow)'
      : 'var(--pink)'

  $: {
    // when the phase swap to playing focus the hidden input
    if (phase === 'playing') {
      hiddenInput.focus()
    }
  }

  onMount(() => {
    const currentUrl = new URL(browser ? location.href : 'https://example.com')
    const isProduction = currentUrl.protocol === 'https:' ? true : false
    const wsUrl = isProduction ? 'wss://coderacer.deno.dev/' : 'ws://localhost:8080'

    const getWordCount = (x: string) => x.split(/\s+/).length - 1

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
              wpm: Math.max(Math.round(completedWords / (((x.finishedAt || Date.now()) - startAt) / 1000 / 60)), 0),
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
    const res = await request({ type: 'ping', t: start })
    serverId = res.serverId
    latency = Date.now() - start
  }

  let hiddenInput: HTMLInputElement
  let hiddenInputValue = ''
  let previousHiddenInputValue = ''

  function handleHiddenInput(e: Event) {
    // keep track of previous hidden input and current hidden input
    // to calculate the delta between the two
    previousHiddenInputValue = hiddenInputValue
    hiddenInputValue = (e.target as HTMLInputElement).value
    if (phase !== 'playing') return
    // if the previous length is less than the current length return
    // to keep the same behavior of the keydown event previously implemented
    if (hiddenInputValue.length < previousHiddenInputValue.length) return
    // replace all the previous value from the current value to get the new key
    const key = hiddenInputValue.replace(previousHiddenInputValue, '')
    const expecting = codeSnippetContent[progress]
    if (expecting) {
      if (key === expecting) {
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

<svelte:window
  on:focus={() => {
    // on window focus focus the input (to avoid losing focus)
    hiddenInput.focus()
  }}
/>

<svelte:head>
  <title>Coderacer</title>
</svelte:head>
<!-- preventing pasting into the input and blurring -->
<input
  bind:this={hiddenInput}
  type="text"
  on:input={handleHiddenInput}
  on:paste|preventDefault|stopPropagation
  on:blur={() => {
    hiddenInput.focus()
  }}
  class="hidden-input"
/>
<section style="padding: 20px">
  <div style="margin: 0 auto; text-align: center; height: 20px">
    {phase === 'won'
      ? 'You won!'
      : phase === 'get_ready'
      ? 'Get ready'
      : phase === 'finding_peers'
      ? 'Waiting for more people...'
      : ' '}
    {#if phase === 'won' || phase === 'finished'}
      <a
        href="/race"
        style="background: none; color: var(--blue)"
        on:click={() => {
          progress = 0
          webSocket.json({ type: 'joinOrCreateRace', user })
        }}>Play another</a
      >
    {/if}
  </div>
  <div
    style="display: flex; margin: 10px auto; border-radius: 50%; border: 8px solid {phaseColor}; width: 150px; height: 150px; justify-content: center; align-items: center"
  >
    <div style="font-size: 40px; color: {phaseColor}">
      {phase === 'loading'
        ? '...'
        : phase === 'finished'
        ? 'END'
        : phase === 'won'
        ? '🏆'
        : timeRemaining
        ? timeRemaining
        : 'GO!'}
    </div>
  </div>

  <div style="margin: 20px 0;">
    {#each members as member, i}
      <!-- <div style="height: 20px; margin-top: 5px" /> -->
      <div style="display: flex; flex-direction: row; margin-top: 15px;">
        <div style="flex: 1;">
          <div>
            {member.name || `Guest (${member.userId.substring(5, 8)})`}<span style="color: var(--text-color-secondary);"
              >{member?.userId === user?.userId ? ' you' : ''}</span
            >
          </div>
          <div style="position: relative; height: 10px; margin-top: 10px">
            <div
              style="position: absolute; border-radius: 10px; width: 100%; background: var(--tertiary-color); height: 10px;"
            />
            <div
              style="position: absolute; border-radius: 10px; width: {member.progressPercent}%; background: {colors[
                i
              ]}; height: 10px; transition: width 0.2s cubic-bezier(0, 1.05, 0.45, 0.54) 0s;"
            />
          </div>
        </div>
        <div style="padding-left: 20px; width: 120px">
          <div style="height: 20px">
            {!member.finishedAt
              ? ''
              : member.place === 1
              ? '1st Place 🏆'
              : member.place === 2
              ? '2nd Place 🥈'
              : member.place === 3
              ? '3rd Place 🥉'
              : `${member.place}th Place`}
          </div>
          <div>{member.wpm} wpm</div>
        </div>
      </div>
    {/each}
  </div>

  <pre style="color: white; background: var(--primary-color); padding: 20px; margin: 0">
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

<div style="position: absolute; bottom: 30px; width: 100%;">
  <Footer />
</div>

<style>
  .hidden-input {
    opacity: 0;
    font-size: 16px;
    position: absolute;
    pointer-events: none;
  }
</style>
