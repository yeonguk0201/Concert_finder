import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedEndpoint, dispatchNotifications, pushOutcome } from '../scripts/notification-worker.mjs'

test('worker destination restrictions and error classification', () => {
  assert.ok(allowedEndpoint('https://web.push.apple.com/a'))
  for (const url of ['https://localhost/a','https://fcm.googleapis.com.evil.test/a','http://fcm.googleapis.com/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a']) assert.equal(allowedEndpoint(url),false)
  assert.equal(pushOutcome({statusCode:410}).outcome,'invalid_device')
  assert.equal(pushOutcome({statusCode:503}).outcome,'retry')
  assert.equal(pushOutcome({statusCode:429}).outcome,'retry')
  assert.equal(pushOutcome({statusCode:401}).outcome,'failed')
  assert.equal(pushOutcome(new Error('timeout')).error_code,'UNKNOWN_OUTCOME')
})
test('worker reauthorizes every send and records results without leaking or sending stale targets', async () => {
  const calls=[], sent=[]
  const rpc=async (name,args) => {
    calls.push({name,args})
    if(name==='claim_notification_batch') return [{id:'one',lease_token:'lease1'},{id:'two',lease_token:'lease2'},{id:'three',lease_token:'lease3'}]
    if(name==='authorize_notification') return args.delivery_id==='one' ? null : { subscription:{endpoint:'https://fcm.googleapis.com/push'}, title:'Concert',body:'Band',concertId:'concert',tag:args.delivery_id,ttl:30 }
  }
  const result=await dispatchNotifications({rpc,send:async (...args)=>{sent.push(args);if(sent.length===2)throw {statusCode:410}}})
  assert.equal(sent.length,2)
  assert.equal(result.skipped,1);assert.equal(result.sent,1);assert.equal(result.invalid_device,1)
  assert.equal(sent[0][2].TTL,30)
  assert.equal(JSON.parse(sent[0][1]).url,'/?page=discover&event=concert')
  assert.equal(calls.filter(c=>c.name==='finish_notification').length,2)
})

test('edge batch bounds concurrency to two and waits for pending sends after an RPC failure', async () => {
  let inFlight = 0, maximum = 0, finished = 0
  const rpc = async (name, args) => {
    if (name === 'claim_notification_batch') return Array.from({ length: 10 }, (_, i) => ({ id: String(i), lease_token: 'lease' }))
    if (name === 'authorize_notification') return { subscription: { endpoint: 'https://fcm.googleapis.com/push' }, title: '', body: '', tag: args.delivery_id }
    if (name === 'finish_notification') { finished++; if (args.delivery_id === '0') throw new Error('RPC_FAILED') }
  }
  const send = async () => {
    inFlight++; maximum = Math.max(maximum, inFlight)
    await new Promise(resolve => setTimeout(resolve, 1))
    inFlight--
  }
  await assert.rejects(dispatchNotifications({ rpc, send, concurrency: 2 }), /RPC_FAILED/)
  assert.equal(maximum, 2)
  assert.equal(inFlight, 0)
  assert.equal(finished, 10)
  await assert.rejects(dispatchNotifications({ rpc, send, concurrency: 3 }), /INVALID_CONCURRENCY/)
})
