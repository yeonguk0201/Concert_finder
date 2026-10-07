import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
test('service worker displays push and opens only same-origin concert details', async () => {
  const handlers={},shown=[],opened=[]
  const context={ URL, self:{ location:{origin:'https://encore.example'}, addEventListener:(name,handler)=>{handlers[name]=handler},
    registration:{showNotification:async (...args)=>{shown.push(args)}},clients:{openWindow:async url=>{opened.push(url)}} } }
  vm.runInNewContext(await readFile(new URL('../public/push-sw.js',import.meta.url),'utf8'),context)
  const waits=[]
  const push=data=>handlers.push({data:{json:()=>data},waitUntil:p=>waits.push(p)})
  push({title:'Band announcement',body:'Festival',url:'/?page=discover&event=concert',tag:'delivery'})
  await Promise.all(waits)
  assert.equal(shown.length,1);assert.equal(shown[0][1].tag,'delivery')
  handlers.notificationclick({notification:{data:shown[0][1].data,close:()=>{}},waitUntil:p=>waits.push(p)})
  await Promise.all(waits)
  assert.equal(opened[0],'https://encore.example/?page=discover&event=concert')
  push({title:'External',url:'https://evil.example/'})
  push({title:'Malformed',url:'https://['})
  push(null)
  assert.equal(shown.length,1)
})
