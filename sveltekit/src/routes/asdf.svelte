<!-- src/routes/asdf.svelte -->
<script>
  import { crossfade } from 'svelte/transition'
  const [send, receive] = crossfade({ duration: 2000 })
  let foo = true
  function toggle() {
    foo = !foo
  }
</script>

<main>
  {#if foo}
    <div>hi</div>
    <div class="container" in:receive={{ key: 'a' }} out:send={{ key: 'a' }} />
    <div class="container hidden">
      <button autofocus in:receive={{ key: 'b' }} out:send={{ key: 'b' }} on:click={toggle}>Go to foo</button>
    </div>
  {:else}
    <div class="container container2" in:receive={{ key: 'a' }} out:send={{ key: 'a' }} />
    <div class="container container2 hidden">
      <button autofocus class="button2" in:receive={{ key: 'b' }} out:send={{ key: 'b' }} on:click={toggle}
        >Go to bar</button
      >
    </div>
  {/if}
</main>

<style>
  /* * {
    border: 1px solid var(--green);
  } */

  main {
    display: grid;
    grid-template: 1fr / 1fr;
    height: 100vh;
    width: 100vw;
  }

  .container {
    border: 1px solid var(--green);
    grid-area: 1/1/1/1;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 400px;
  }
  .container.hidden {
    border: none;
  }
  button:focus {
    outline: 1px solid var(--green);
  }

  .container2 {
    grid-area: 1/1/1/1;
    margin: 200px;
  }
  .button2 {
    justify-self: flex-start;
    align-self: flex-start;
  }
</style>
