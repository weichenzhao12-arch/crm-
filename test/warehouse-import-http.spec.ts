// @vitest-environment node
import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { openLocalDatabase } from '../scripts/local-database'
import { localWarehouse } from '../scripts/local-warehouse'
import { warehouseCloud } from '../functions/warehouse-cloud'
import { warehouseFields } from '../src/features/warehouse/model'
import { d1Adapter } from './d1-test-adapter'

it.each(['local', 'cloud'])('atomically merges full-parameter rows, protects locks and export rights (%s)', async (mode) => {
  const db = openLocalDatabase(process.cwd(), ':memory:')
  const server = createServer(localWarehouse(db))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const adapter = d1Adapter(db)
  for (const id of ['owner', 'sales-1', 'sales-2']) db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(id,id,'2050-01-01T00:00:00.000Z')
  db.prepare('UPDATE users SET permissions=? WHERE id=?').run(JSON.stringify({warehouseRead:true,warehouseImport:true,warehouseReceive:true}), 'sales-2')
  async function request(path='/', body?:unknown, actor='owner', key=crypto.randomUUID()) {
    const options = {method:body?'POST':'GET',headers:{Authorization:`Bearer ${actor}`,'Content-Type':'application/json','Idempotency-Key':key},body:body?JSON.stringify(body):undefined}
    const response = mode === 'cloud' ? await warehouseCloud(new Request(`${base}/api/local-warehouse${path}`,options),adapter) : await fetch(base+path,options)
    return {status:response.status,data:await response.json()}
  }
  try {
    const exported=(await request('/export')).data.stocks
    const source=exported.find((stock:any)=>stock.id==='demo-a')
    const row={...Object.fromEntries(warehouseFields.map(([key])=>[key,source[key]])),width:source.width,length:source.length,receiveRolls:2,receiveRemnants:[{meters:7,count:1}]}
    expect((await request('/export',undefined,'sales-1')).status).toBe(403)
    expect((await request('/import',{rows:[row],reason:'无导入权限'},'sales-1')).status).toBe(403)
    const lock=await request('/orders',{receiver:'锁库测试',date:'2026-11-16',lines:[{stockId:source.id,kind:'roll',meters:25,count:1,price:null,packaging:''}]})
    expect(lock.status).toBe(200)
    const key=crypto.randomUUID(),body={rows:[row,{...row,receiveRolls:3,receiveRemnants:[]}],reason:'表格合并入库测试'}
    expect((await request('/import',body,'owner',key)).status).toBe(200)
    expect((await request('/import',body,'owner',key)).status).toBe(200)
    let stocks=(await request('/export')).data.stocks
    expect(stocks.filter((stock:any)=>stock.code===source.code)).toHaveLength(1)
    expect(stocks.find((stock:any)=>stock.id===source.id)).toMatchObject({rolls:source.rolls+5,reservedRolls:1,availableRolls:source.rolls+4,remnants:{7:2}})
    const before=JSON.stringify(stocks)
    expect((await request('/import',{rows:[row,{...row,code:'OTHER',receiveRolls:-1}],reason:'不允许部分入库'})).status).toBe(400)
    expect(JSON.stringify((await request('/export')).data.stocks)).toBe(before)
    const metadata={...row,receiveRolls:0,receiveRemnants:[],supplier:'内部供应商',location:'A-01',remark:'不对外显示'}
    expect((await request('/import',{rows:[metadata],reason:'补充内部资料'},'sales-2')).status).toBe(403)
    expect((await request('/import',{rows:[metadata],reason:'补充内部资料'})).status).toBe(200)
    stocks=(await request('/export')).data.stocks
    expect(stocks.find((stock:any)=>stock.id===source.id).supplier).toBe('内部供应商')
    const salesStock=(await request('/',undefined,'sales-1')).data.stocks.find((stock:any)=>stock.id===source.id)
    expect(salesStock.supplier).toBeUndefined()
    expect(salesStock.remark).toBeUndefined()
    const variant={...row,height:'不同草高',receiveRolls:1,receiveRemnants:[]}
    expect((await request('/import',{rows:[variant],reason:'参数不同单独建规格'})).status).toBe(200)
    expect((await request('/export')).data.stocks.filter((stock:any)=>stock.code===source.code)).toHaveLength(2)
  }
  finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));db.close() }
})
