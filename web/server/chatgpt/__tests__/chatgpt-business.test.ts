import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { executeTool, tools } from '../chatgpt-tools'
import { memoryDb } from './memory-db'
const now=Timestamp.now()
function seed(){return memoryDb({
 'stores/shop':{ownerUid:'owner',currency:'GHS'},
 'products/product':{storeId:'shop',name:'Soap',price:10,currency:'GHS',stockCount:8},
 'products/other':{storeId:'another',name:'Other',price:10,stockCount:100},
 'stores/shop/integrationBookings/booking':{storeId:'shop',customer:{name:'Client',email:'client@example.com'},serviceId:'service',serviceName:'Massage',quantity:2,paymentAmount:40,currency:'GHS',bookingStatus:'confirmed',status:'confirmed',slotId:'slot',bookingDate:'2027-01-02',bookingTime:'10:00',updatedAt:now},
 'integrationBookings/booking':{storeId:'shop',bookingStatus:'confirmed'},
 'stores/shop/integrationAvailabilitySlots/slot':{serviceId:'service',seatsBooked:2},
 'stores/shop/integrationAvailabilitySlots/newslot':{serviceId:'service',seatsBooked:0,capacity:4,status:'open',startAt:'2027-02-01T10:00:00Z',endAt:'2027-02-01T11:00:00Z',timezone:'Africa/Accra',price:20},
})}
const sale={storeId:'shop',productId:'product',quantity:2,expectedUnitPrice:10,expectedCurrency:'GHS',paymentMethod:'cash',confirmed:true,requestId:'sale-request-1'}
const product={storeId:'shop',name:'Shea Butter Soap',description:'Natural soap',category:'Skincare',price:25.5,currency:'GHS',stockCount:12,sku:'SOAP-25',confirmed:true,requestId:'product-request-1'}
const booking={storeId:'shop',source:'storeBookings',bookingId:'booking'}
const call=(m:ReturnType<typeof memoryDb>,name:string,args:any,uid='owner')=>executeTool(m.db,name,args,uid)
describe('Merchant business tools',()=>{
 it('requires ownership even for inventory, bookings and financial handoffs',async()=>{
  const m=seed()
  for(const [name,args] of [['list_inventory',{storeId:'shop'}],['create_product',product],['record_sale',sale],['get_store_booking',booking],['get_booking_payment_options',booking],['prepare_booking_refund',{...booking,amount:5,reason:'test'}]] as const)await expect(call(m,name,args,'customer')).rejects.toThrow('Store owner')
  expect(m.get('products/product')?.stockCount).toBe(8)
 })
 it('creates an unpublished catalog product with owner approval and prevents duplicate retries',async()=>{
  const m=seed()
  const [first,again]=await Promise.all([call(m,'create_product',product),call(m,'create_product',product)])
  expect(first.productId).toBe(again.productId);expect(again.duplicate).toBe(true)
  expect(first).toMatchObject({name:'Shea Butter Soap',category:'Skincare',price:25.5,currency:'GHS',stockCount:12,status:'draft',published:false})
  expect(m.get('products/'+first.productId)).toMatchObject({storeId:'shop',itemType:'product',status:'draft',isPublished:false,isWebsiteVisible:false,category:'Skincare',stockCount:12,sku:'SOAP-25',currency:'GHS',createdBy:'owner'})
  expect((await call(m,'list_inventory',{storeId:'shop'})).items).toContainEqual(expect.objectContaining({productId:first.productId,name:'Shea Butter Soap',price:25.5,stockCount:12}))
  expect(m.entries().filter(([p])=>p.startsWith('products/'))).toHaveLength(3)
  await expect(call(m,'create_product',{...product,price:30})).rejects.toThrow('different details')
  expect(m.entries().filter(([p])=>p.startsWith('products/'))).toHaveLength(3)
  expect(tools.find(t=>t.name==='create_product')?.securitySchemes[0]).toMatchObject({type:'oauth2',scopes:['inventory:write']})
 })
 it('requires confirmation and validates product details without creating a catalog entry',async()=>{
  const invalid=[{confirmed:false},{name:''},{name:' '.repeat(5)},{price:-1},{price:1.001},{price:Number.POSITIVE_INFINITY},{currency:'EUR'},{stockCount:-1},{stockCount:1.5},{stockCount:1000001},{description:123},{category:24},{sku:42},{requestId:'short'}]
  for(const patch of invalid){
    const m=seed()
    await expect(call(m,'create_product',{...product,...patch})).rejects.toThrow()
    expect(m.entries().filter(([p])=>p.startsWith('products/'))).toHaveLength(2)
  }
 })
 it('defaults unknown stock to null and restricts product creation to the store owner',async()=>{
  const m=seed()
  await expect(call(m,'create_product',product,'customer')).rejects.toThrow('Store owner')
  expect(m.entries().filter(([p])=>p.startsWith('products/'))).toHaveLength(2)
  const {stockCount,category,sku,...rest}=product
  const created=await call(m,'create_product',{...rest,requestId:'product-request-2'})
  expect(created).toMatchObject({category:'General Products',stockCount:null,sku:null})
  expect(m.get('products/'+created.productId)?.stockCount).toBeNull()
 })
 it('records an offline sale atomically and retries without reducing stock twice',async()=>{
  const m=seed(), result=await call(m,'record_sale',sale)
  expect(result.total).toBe(20);expect(result.paymentEvidence).toBe('merchant_reported');expect(m.get('products/product')?.stockCount).toBe(6)
  expect(m.get('sales/'+result.saleId)?.items[0].qty).toBe(2)
  expect(m.get('ledger/'+result.saleId)?.qtyChange).toBe(-2)
  expect((await call(m,'record_sale',sale)).duplicate).toBe(true)
  expect(m.get('products/product')?.stockCount).toBe(6)
  await expect(call(m,'record_sale',{...sale,quantity:3})).rejects.toThrow('different details')
 })
 it('rejects unconfirmed, stale-price, cross-store and overselling requests with no writes',async()=>{
  for(const changes of [{confirmed:false},{expectedUnitPrice:1},{productId:'other'},{quantity:10}]){
   const m=seed();await expect(call(m,'record_sale',{...sale,...changes})).rejects.toThrow();expect(m.get('products/product')?.stockCount).toBe(8);expect(m.entries().filter(([p])=>p.startsWith('sales/'))).toHaveLength(0)
  }
 })
 it('prevents concurrent overselling',async()=>{
  const m=seed();const results=await Promise.allSettled([call(m,'record_sale',{...sale,quantity:5}),call(m,'record_sale',{...sale,quantity:5,requestId:'sale-request-2'})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(m.get('products/product')?.stockCount).toBe(3)
 })
 it('separates currencies and excludes voided and outside-date sales',async()=>{
  const m=seed();const base={storeId:'shop',createdAt:Timestamp.fromDate(new Date('2026-11-03T12:00:00Z')),total:12}
  m.put('sales/a',{...base,currency:'GHS'});m.put('sales/b',{...base,currency:'USD'});m.put('sales/c',{...base,status:'voided'});m.put('sales/d',{...base,storeId:'another'});m.put('sales/e',{...base,createdAt:Timestamp.fromDate(new Date('2026-11-04T00:00:00Z'))})
  const result=await call(m,'summarize_sales',{storeId:'shop',startAt:'2026-11-03T00:00:00Z',endAt:'2026-11-04T00:00:00Z'})
  expect(result.pageTotalsByCurrency).toEqual({GHS:12,USD:12});expect(result.pageSaleCount).toBe(2);expect(result.scope).toBe('this_page_only')
 })
 it('reads legacy bookings without a ChatGPT customer binding',async()=>{
  const m=seed();expect((await call(m,'list_store_bookings',{storeId:'shop',source:'storeBookings'})).bookings).toHaveLength(1)
  expect((await call(m,'get_store_booking',booking)).customer.email).toBe('client@example.com')
 })
 it('cancels and mirrors a booking, releases capacity once and rejects stale revisions',async()=>{
  const m=seed(),current=await call(m,'get_store_booking',booking),args={...booking,expectedRevision:current.revision,action:'cancel',confirmed:true,requestId:'cancel-request-1'}
  expect((await call(m,'manage_store_booking',args)).status).toBe('cancelled');expect(m.get('integrationBookings/booking')?.bookingStatus).toBe('cancelled');expect(m.get('stores/shop/integrationAvailabilitySlots/slot')?.seatsBooked).toBe(0)
  expect((await call(m,'manage_store_booking',args)).duplicate).toBe(true)
  await expect(call(m,'manage_store_booking',{...args,requestId:'cancel-request-2'})).rejects.toThrow('changed')
 })
 it('reschedules with capacity moved atomically, rejects full replacement slots',async()=>{
  const m=seed(),current=await call(m,'get_store_booking',booking)
  const args={...booking,expectedRevision:current.revision,action:'reschedule',newSlotId:'newslot',confirmed:true,requestId:'reschedule-1'}
  m.put('stores/shop/integrationAvailabilitySlots/newslot',{...m.get('stores/shop/integrationAvailabilitySlots/newslot'),seatsBooked:4})
  await expect(call(m,'manage_store_booking',args)).rejects.toThrow('unavailable');expect(m.get('stores/shop/integrationAvailabilitySlots/slot')?.seatsBooked).toBe(2)
  m.put('stores/shop/integrationAvailabilitySlots/newslot',{...m.get('stores/shop/integrationAvailabilitySlots/newslot'),seatsBooked:0})
  expect((await call(m,'manage_store_booking',args)).status).toBe('rescheduled');expect(m.get('stores/shop/integrationAvailabilitySlots/slot')?.seatsBooked).toBe(0);expect(m.get('stores/shop/integrationAvailabilitySlots/newslot')?.seatsBooked).toBe(2)
 })
 it('queues saved-recipient reminders, rejects changed recipients and throttles repeats',async()=>{
  const m=seed(),current=await call(m,'get_store_booking',booking),args={...booking,expectedRevision:current.revision,expectedEmail:'client@example.com',confirmed:true,requestId:'reminder-1'}
  await expect(call(m,'send_booking_reminder',{...args,expectedEmail:'attacker@example.com'})).rejects.toThrow('Recipient')
  const result=await call(m,'send_booking_reminder',args);expect(result.status).toBe('queued');expect(m.get('chatgpt_reminders/'+result.reminderId)?.recipientEmail).toBe('client@example.com')
  expect((await call(m,'send_booking_reminder',args)).duplicate).toBe(true)
  await expect(call(m,'send_booking_reminder',{...args,requestId:'reminder-2'})).rejects.toThrow('15 minutes')
  expect((await call(m,'get_reminder_status',{storeId:'shop',reminderId:result.reminderId})).status).toBe('queued')
 })
 it('exposes only trusted checkout URLs and never claims a refund was issued',async()=>{
  const m=seed();m.put('stores/shop/integrationBookings/booking',{...m.get('stores/shop/integrationBookings/booking'),checkoutUrl:'https://attacker.example/pay'})
  expect((await call(m,'get_booking_payment_options',booking)).checkoutUrl).toBeNull()
  m.put('stores/shop/integrationBookings/booking',{...m.get('stores/shop/integrationBookings/booking'),checkoutUrl:'https://checkout.paystack.com/example'})
  expect((await call(m,'get_booking_payment_options',booking)).paymentCollected).toBe(false)
  const result=await call(m,'prepare_booking_refund',{...booking,amount:5,reason:'Cancellation'});expect(result.refundIssued).toBe(false);expect(result.status).toBe('requires_manual_action')
  expect(tools.find(t=>t.name==='prepare_booking_refund')?.annotations.readOnlyHint).toBe(true)
 })
})
