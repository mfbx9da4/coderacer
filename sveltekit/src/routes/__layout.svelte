<script lang="ts">
  // import Header from '$lib/header/Header.svelte'
  import '../app.css'
</script>

<!-- <Header /> -->

<!-- <main> -->
<slot />
<!-- </main> -->

<!-- <footer>Made with love</footer> -->
<style>
  main {
    flex: 1;
    display: grid;
    /* display: flex; */
    /* flex-direction: column; */
    /* padding: 1rem; */
    width: 100%;
    max-width: 1024px;
    margin: 0 auto;
    box-sizing: border-box;
  }

  footer {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 40px;
    color: var(--text-color);
  }

  @media (min-width: 480px) {
    footer {
      padding: 40px 0;
    }
  }
</style>
