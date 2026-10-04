import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// `vite build --mode verify` (`npm run build:verify`, into dist-verify/): a
// production bundle — React's production build, minified, no HMR — that keeps
// the `import.meta.env.DEV` test hooks (`window.__covers`, `__sky…`, the dev
// dock at `?intro`) the verify suites drive. Frame budgets are judged on it
// with `vite preview --outDir dist-verify`; the dev server's per-module
// requests and React's dev build make its frames janky. What ships is `npm run
// build`, which has none of it.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  ...(mode === 'verify' && {
    define: { 'import.meta.env.DEV': 'true', 'import.meta.env.PROD': 'false' },
    build: { outDir: 'dist-verify' },
  }),
}))
