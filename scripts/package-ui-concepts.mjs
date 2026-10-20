import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Package the review-only prototypes as offline HTML; no build or backend required.
const output = resolve(process.argv[2] || '.validation.local/ui-preview')
const source = new URL('../public/ui-concepts/', import.meta.url)
const read = name => readFile(new URL(name, source), 'utf8')
const [index, css, js, preview, previewCss, previewJs, flowCss, flowJs] = await Promise.all(
  ['index.html', 'studio.css', 'studio.js', 'preview.html', 'preview.css', 'preview.js', 'flow.css', 'flow.js'].map(read),
)
const variants = {}
for (const concept of ['combined', 'poster', 'night', 'personal']) {
  variants[concept] = preview
    .replace('<link rel="stylesheet" href="./preview.css" />', `<style>${previewCss}</style>`)
    .replace('<link rel="stylesheet" href="./flow.css" />', `<style>${flowCss}</style>`)
    .replace('<script src="./preview.js" defer></script>', '')
    .replace('<script src="./flow.js" defer></script>', '')
    .replace('</body>', `<script>${previewJs.replace("const concept = new URLSearchParams(location.search).get('concept')", `const concept = '${concept}'`)}</script><script>${flowJs}</script></body>`)
}
const portableJs = js
  .replace('const frame =', `const variants = ${JSON.stringify(variants)};\nconst frame =`)
  .replace('frame.src = `./preview.html?concept=${concept}`', 'frame.srcdoc = variants[concept]')
  .replace("history.replaceState(null, '', url)", "if (location.protocol !== 'file:') history.replaceState(null, '', url)")
const portable = index
  .replace('<link rel="stylesheet" href="./studio.css" />', `<style>${css}</style>`)
  .replace('<script src="./studio.js" defer></script>', '')
  .replace('src="./preview.html?concept=combined"', '')
  .replace('href="/"', 'href="#preview"')
  .replace('</body>', `<script>${portableJs.replaceAll('</script', '<\\/script')}</script></body>`)
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'encore-ui-studio.html'), portable, 'utf8')
await writeFile(resolve(output, 'encore-combined.html'), variants.combined, 'utf8')
await writeFile(resolve(output, 'encore-page-flow.html'), variants.combined, 'utf8')
console.log(`Packaged UI prototypes: ${output}`)
