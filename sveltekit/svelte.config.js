import preprocess from 'svelte-preprocess'

import cloudflare from '@sveltejs/adapter-cloudflare'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: preprocess(),

  kit: {
    adapter: cloudflare({}),
    // hydrate the <div id="svelte"> element in src/app.html
    target: '#svelte',
  },
}

export default config
