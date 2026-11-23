import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { modulePages } from './scripts/module-pages.ts'
import { forumPages } from './scripts/forum-pages.ts'
import { sitePages } from './scripts/site-pages.ts'
import { elekloaderSite } from './scripts/elekloader-vendor.ts'
import { moduleReleases } from './scripts/module-releases'
import { octatrackPublishedDownloads } from './scripts/octatrack-published-downloads.ts'
import { seo } from './scripts/seo.ts'
import { buildLoadProbe } from './sdk/machines/zoom-ms-70cdr/dev/load-probe.ts'

export default defineConfig(({ command, mode }) => {
 const api = loadEnv(mode, process.cwd(), 'VITE_').VITE_COMMUNITY_API_URL
 const probeLabel = command === 'serve' ? process.env.MODWERK_ZOOM_PROBE_LABEL : undefined
 if (probeLabel && !/^D[A-Z0-9]{3}$/.test(probeLabel)) throw new Error('Use a four-character Zoom development label, for example D003.')
 const zoomProbe = probeLabel ? { label: probeLabel, patch: buildLoadProbe(process.env.MODWERK_ZOOM_C6X_PREFIX ?? 'tic6x-elf-') } : null
 const origin = api ? new URL(api).origin : ''
 if (api && !['https:', 'http:'].includes(new URL(api).protocol)) throw new Error('Invalid community API protocol.')
 const csp = `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${origin}; media-src 'self' blob: ${origin}; font-src 'self'; worker-src 'self'; manifest-src 'self'; connect-src 'self' ${origin}; frame-src https://www.youtube-nocookie.com https://ko-fi.com https://w.soundcloud.com; base-uri 'self'; form-action 'none'; object-src 'none'`
 return {
  define: { __MODWERK_ZOOM_PROBE__: JSON.stringify(zoomProbe) },
  plugins: [react(), modulePages(), forumPages(api), sitePages(), seo(), octatrackPublishedDownloads(), moduleReleases(), elekloaderSite(process.cwd()), { name:'static-security-policy', transformIndexHtml() {
   // GitHub Pages does not apply Cloudflare's _headers file. Vite HMR needs a separate dev policy.
   return command === 'build' ? [
    { tag:'meta', attrs:{ 'http-equiv':'Content-Security-Policy', content:csp }, injectTo:'head-prepend' },
    { tag:'meta', attrs:{ name:'referrer', content:'no-referrer' }, injectTo:'head-prepend' },
    ...(origin ? [{ tag:'link', attrs:{ rel:'preconnect', href:origin, crossorigin:'anonymous' }, injectTo:'head' as const }, { tag:'link', attrs:{ rel:'alternate', type:'application/atom+xml', title:'Modwerk community', href:new URL('forum/feed.xml', api.replace(/\/?$/, '/')).href }, injectTo:'head' as const }] : []),
   ] : []
  } }],
  base: './',
  server: { fs: { deny: ['.env', '.env.*', '.dev.vars', '.dev.vars.*', '**/*.crt', '**/*.pem', '**/*.key', '**/*.bin', '**/*.syx', '**/.git/**', '**/downloads/**', '**/out/**'] }, port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8788' } },
  build: { sourcemap: false },
 }
})
