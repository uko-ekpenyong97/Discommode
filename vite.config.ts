import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * THE PHONE DOOR, at build time (docs/mobile.md). index.html sends a phone to
 * phone.html from an inline script; but the browser's preload scanner would
 * already be fetching the site's module and stylesheet by then. So the site's
 * tags are taken out of the built index.html and handed to that script, which
 * writes them back (`document.write`, so they are parser-inserted, deferred,
 * and render-blocking exactly as before) when it is not a phone. In dev the
 * page keeps its tags, and the script writes nothing.
 */
function phoneDoor(): Plugin {
  return {
    name: 'phone-door',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('index.html') || ctx.filename.endsWith('phone.html')) return html
        const tags: string[] = []
        const out = html.replace(/[ \t]*(<script type="module"[^>]*><\/script>|<link rel="(?:modulepreload|stylesheet)"[^>]*>)\n?/g, (_, tag: string) => {
          tags.push(tag)
          return ''
        })
        if (!tags.length || !out.includes("'__SITE_TAGS__'")) throw new Error('phone-door: no site tags, or no placeholder, in index.html')
        // A string in an inline script: no "</" may close it.
        const literal = JSON.stringify(tags.join('')).replace(/<\//g, '<\\/').replace(/'/g, "\\'")
        return out.replace("'__SITE_TAGS__'", literal)
      },
    },
  }
}

// https://vite.dev/config/
//
// `vite build --mode verify` (`npm run build:verify`, into dist-verify/): a
// production bundle — React's production build, minified, no HMR — that keeps
// the `import.meta.env.DEV` test hooks (`window.__covers`, `__sky…`, the dev
// dock at `?intro`) the verify suites drive. Frame budgets are judged on it
// with `vite preview --outDir dist-verify`; the dev server's per-module
// requests and React's dev build make its frames janky. What ships is `npm run
// build`, which has none of it.
//
// Two pages: index.html, the site, and phone.html, the phone door (src/phone,
// docs/mobile.md), which index.html sends phones to before its own module
// loads.
export default defineConfig(({ mode }) => ({
  plugins: [react(), phoneDoor()],
  build: {
    rolldownOptions: {
      input: { main: 'index.html', phone: 'phone.html' },
    },
    ...(mode === 'verify' && { outDir: 'dist-verify' }),
  },
  ...(mode === 'verify' && {
    define: { 'import.meta.env.DEV': 'true', 'import.meta.env.PROD': 'false' },
  }),
}))
