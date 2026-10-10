import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function worker() {
  const context = vm.createContext({ self: { location: 'https://sedifex.example/sw.js', addEventListener() {}, registration: {}, clients: { matchAll: async () => [] } }, console: { warn() {} }, Date, setTimeout, clearTimeout, URL });
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  return context;
}

test('an offline sale survives exhausted retries and can be recovered explicitly', async () => {
  const ctx = worker();
  const entry = { id: 1, retries: 2, requestType: 'sale', endpoint: 'https://example.com', payload: { saleId: 'sale-1' } };
  let deletes = 0;
  let sends = 0;
  ctx.getQueueEntries = async () => deletes ? [] : [entry];
  ctx.getQueueCount = async () => deletes ? 0 : 1;
  ctx.updateQueueEntry = async (_id, patch) => Object.assign(entry, patch);
  ctx.deleteQueueEntry = async () => { deletes++; };
  ctx.broadcastQueueState = async () => {};
  ctx.notifyClients = () => {};
  ctx.sendQueueEntry = async () => { sends++; throw new Error('offline'); };
  await ctx.processQueue();
  assert.equal(deletes, 0);
  assert.equal(entry.retries, 3);
  await ctx.processQueue();
  assert.equal(sends, 1, 'exhausted failures do not spin through automatic retries');
  ctx.sendQueueEntry = async () => { sends++; };
  await ctx.processQueue(true);
  assert.equal(sends, 2);
  assert.equal(deletes, 1, 'remove the request only after successful delivery');
});

test('queue acknowledgement follows storage commit and precedes network processing', async () => {
  const ctx = worker();
  const events = [];
  ctx.addQueueEntry = async () => { events.push('stored'); };
  ctx.scheduleSync = async () => { events.push('sync'); };
  ctx.broadcastQueueState = async () => {};
  await ctx.handleQueueRequest({ requestType: 'sale' }, { postMessage: message => { assert.equal(message.stored, true); events.push('ack'); } });
  assert.deepEqual(events, ['stored', 'ack', 'sync']);
  ctx.addQueueEntry = async () => { throw new Error('quota exceeded'); };
  const reply = [];
  await assert.rejects(ctx.handleQueueRequest({}, { postMessage: message => reply.push(message.stored) }), /quota exceeded/);
  assert.deepEqual(reply, [false]);
});

test('a restarted worker reports retained exhausted sales as recoverable errors', async () => {
  const ctx = worker();
  ctx.getQueueEntries = async () => [{ id: 1, retries: 3 }];
  let status;
  await ctx.respondQueueStatus({ postMessage: message => { status = message; } });
  assert.equal(status.status, 'error');
  assert.equal(status.pending, 1);
  assert.match(status.error, /retry sync/);
  ctx.getQueueEntries = async () => [];
  await ctx.respondQueueStatus({ postMessage: message => { status = message; } });
  assert.equal(status.status, 'idle');
  assert.equal(status.pending, 0);
});
