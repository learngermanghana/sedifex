const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const ts=require('typescript')
const {createHash}=require('node:crypto')
const source=fs.readFileSync(path.join(__dirname,'../src/chatgptBookingReminder.ts'),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
function setup(){
 const store={ownerUid:'owner'},booking={storeId:'shop',bookingStatus:'confirmed',status:'confirmed',bookingDate:'2027-01-02',bookingTime:'10:00',customer:{name:'Client',email:'client@example.com'},serviceName:'Massage'},user={disabled:false},sent=[],updates=[]
 const revision=createHash('sha256').update(JSON.stringify([null,booking.bookingStatus,booking.status,booking.bookingDate,booking.bookingTime,undefined])).digest('hex')
 const request={storeId:'shop',uid:'owner',bookingId:'booking',bookingPath:'stores/shop/integrationBookings/booking',revision,recipientEmail:'client@example.com'}
 const exports={}
 vm.runInNewContext(code,{exports,require:(id)=>{
  if(id==='firebase-functions/v1')return {firestore:{document:()=>({onCreate:f=>f})}}
  if(id==='node:crypto')return require(id)
  if(id==='firebase-admin/auth')return {getAuth:()=>({getUser:async()=>user})}
  if(id==='./firestore')return {admin:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}}},defaultDb:{collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>store})})}),doc:()=>({get:async()=>({exists:true,data:()=>booking})})}}
  if(id==='./notifications')return {queueBrandedNotification:async payload=>{sent.push(payload);return {ok:true,deliveries:1}}}
  throw Error(id)
 }})
 return {store,booking,user,request,sent,updates,run:()=>exports.deliverChatgptBookingReminder({id:'request-id',data:()=>request,ref:{update:async data=>updates.push(data)}})}
}
;(async()=>{
 const ok=setup();await ok.run();assert.equal(ok.sent.length,1);assert.equal(ok.sent[0].customer.email,'client@example.com');assert.equal(ok.sent[0].eventType,'booking.reminder');assert.equal(ok.updates[0].status,'processed')
 for(const change of [s=>s.store.ownerUid='another',s=>s.user.disabled=true,s=>s.booking.customer.email='other@example.com',s=>s.booking.bookingStatus='cancelled',s=>s.booking.bookingDate='2027-02-02',s=>s.request.bookingPath='private/secret']){
  const s=setup();change(s);await s.run();assert.equal(s.sent.length,0);assert.equal(s.updates[0].status,'failed')
 }
 console.log('ChatGPT reminder delivery: saved recipient, owner, disabled account, schedule/status changes and path isolation passed')
})().catch(e=>{console.error(e);process.exitCode=1})
