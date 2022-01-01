import { quintInOut } from 'svelte/easing'
import { crossfade as crossfadeSvelte } from 'svelte/transition'

export function crossfade() {
  return crossfadeSvelte({
    duration: (d) => Math.sqrt(d * 200),
    // duration: 2000,
    // easing: (x) => x,

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
}
