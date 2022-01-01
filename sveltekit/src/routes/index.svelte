<script context="module" lang="ts">
  export const prerender = true
</script>

<script lang="ts">
  import { fly } from 'svelte/transition'
  import { crossfade } from './crossfade'
  import Race from './race.svelte'
  import { user } from './userStore'

  let name = $user.name || ''

  let state: 'initial' | 'enter_name' | 'game' = 'initial'

  const [send, receive] = crossfade()

  function startGame(e: Event) {
    e.preventDefault()
    if (name) {
      user.setName(name)
      state = 'game'
    } else {
      state = 'enter_name'
    }
  }
</script>

<svelte:head>
  <title>Coderacer</title>
</svelte:head>

<div style="display: grid; height: 100vh; grid-template: 1fr / 1fr">
  {#if state === 'initial' || state === 'enter_name'}
    <section out:fly={{ y: -200, duration: 200 }}>
      <h1>Coderacer</h1>
      <h2>Competitive touch typing for programmers</h2>

      <div style="display: grid">
        {#if state === 'initial'}
          <main style="grid-area: 1/1; height: 180px" in:receive={{ key: 'main' }} out:send={{ key: 'main' }}>
            <button class="button" on:click={startGame} tabindex="0" in:receive={{ key: 'a' }} out:send={{ key: 'a' }}>
              Start Game
            </button>
          </main>
        {/if}

        {#if state === 'enter_name'}
          <main style="grid-area: 1/1; height: 180px" in:receive={{ key: 'main' }} out:send={{ key: 'main' }}>
            <form class="enter-name-form" on:submit={startGame}>
              <input
                name="name"
                bind:value={name}
                style="padding: 10px; width: 100%"
                autocomplete="name"
                autofocus
                placeholder="Enter your name"
              />
              <button class="button" in:receive={{ key: 'a' }} out:send={{ key: 'a' }}>Start Game</button>
            </form>
          </main>
        {/if}
      </div>
    </section>
  {/if}

  {#if state === 'game'}
    <main
      in:receive={{ key: 'main' }}
      out:send={{ key: 'main' }}
      style="position: relative; border: 4px solid var(--pink); border-radius: 4px; grid-area: 1/1/1/1; width: calc(100% - 40px); max-width: 1200px; margin: 20px auto;"
    >
      <Race />
    </main>
  {/if}
</div>

<style lang="scss">
  section {
    grid-area: 1/1/2/2;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    height: 63%;
    max-height: 400px;
    flex: 1;
    margin: auto 0;
  }

  h1 {
    font-family: var(--font-mono);
  }

  .enter-name-form {
    justify-content: space-between;
    align-items: center;
    border-radius: 10px;
    display: flex;
    padding: 20px;
    flex-direction: column;
    border: 4px solid var(--pink);
    width: 400px;
    height: 100%;
  }
  .common:hover {
    cursor: pointer;
    user-select: none;
  }

  .button {
    font-size: 20px;
    background: var(--pink);
    color: var(--primary-color);
    width: 250px;
    height: 70px;
    border-radius: 10px;
    &:hover {
      background-color: var(--lighter-pink);
    }
    &:focus {
      border: 1px solid var(--white);
      box-shadow: 0px 0px 4px 1px var(--lightest-pink);
    }
  }
</style>
