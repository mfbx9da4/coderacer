<script context="module" lang="ts">
  export const prerender = true
</script>

<script lang="ts">
  import { quintOut } from 'svelte/easing'
  import { crossfade } from 'svelte/transition'
  import { goto } from '$app/navigation'

  import { user } from './userStore'

  let name = $user.name || ''

  let state: 'initial' | 'enter_name' = 'initial'

  const [send, receive] = crossfade({
    // duration: (d) => Math.sqrt(d * 200),
    // easing: quintOut,
    duration: 10000,
    easing: (x) => x,
  })

  console.log('name', name)

  function startGame() {
    console.log('name', name)
    if (name) {
      user.setName(name)
      goto('/race')
    } else {
      state = 'enter_name'
    }
  }
</script>

<svelte:head>
  <title>Home</title>
</svelte:head>

<section>
  <h1>Typeracer</h1>
  <h2>Competitive touch typing for programmers</h2>
  <div class="container">
    {#if state === 'initial'}
      <button
        class="common button"
        on:click={startGame}
        in:receive={{ key: 'cta' }}
        out:send={{ key: 'cta' }}
        tabindex="0"
      >
        <div in:receive={{ key: 'cta-text' }} out:send={{ key: 'cta-text' }}>Start Game</div>
      </button>
    {/if}

    {#if state === 'enter_name'}
      <div
        tabindex="0"
        class="common output"
        on:click={startGame}
        in:receive={{ key: 'cta' }}
        out:send={{ key: 'cta' }}
      >
        <!-- <a href="/race">Enter your name</a> -->
        <label>
          Enter your name:
          <input name="name" bind:value={name} autocomplete="name" autofocus placeholder="Enter your name" />
        </label>
        <button class="common button" in:receive={{ key: 'cta-text' }} out:send={{ key: 'cta-text' }}>Start Game</button
        >
      </div>
    {/if}
  </div>
</section>

<style lang="scss">
  section {
    text-align: center;
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
  * {
    /* border: 1px solid $green; */
  }

  .container {
    display: grid;
    height: 200px;
  }

  .common {
    justify-content: center;
    border-radius: 10px;
    grid-area: 1/1/2/2;
    display: flex;
    padding: 20px;
    margin: 0 auto;
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
    &:hover {
      background-color: var(--lighter-pink);
    }
    &:focus {
      border: 1px solid var(--white);
      box-shadow: 0px 0px 4px 1px var(--lightest-pink);
    }
  }

  .output {
    border: 4px solid var(--pink);
    height: 200px;
    width: 400px;
    margin: 0 auto;
  }
</style>
