import test from 'node:test';
import assert from 'node:assert/strict';
import {workspace} from './support/workspace.js';
import {QUESTION_IMPORT_LIMITS} from '../shared/contracts.js';
import {QUESTION_IMPORT_EXAMPLE,parseQuestionImport} from '../web/src/lib/question-import.js';

test('question import previews, validates, persists and respects duplicate policy and capacity',{timeout:120000},async t=>{
 for(const name of ['info','warn','error'] as const)t.mock.method(console,name,()=>{});
 const fixture=await workspace(),{request,pool}=fixture;
 const counts=async()=>{
  const result=await pool.query<{questions:number;versions:number}>('SELECT (SELECT count(*)::int FROM questions) questions,(SELECT count(*)::int FROM answer_versions) versions');
  return result.rows[0];
 };
 try{
  await t.test('the page example previews without writes and imports four canonical answer types',async()=>{
   const preview=await request('POST','/api/admin/import',QUESTION_IMPORT_EXAMPLE);
   assert.equal(preview.statusCode,200,preview.body);
   assert.deepEqual(preview.json(),{total:4,valid:4,invalid:[]});
   assert.deepEqual(await counts(),{questions:0,versions:0});
   const result=await request('POST','/api/admin/import',{...QUESTION_IMPORT_EXAMPLE,preview:false});
   assert.equal(result.statusCode,200,result.body);assert.deepEqual(result.json(),{imported:4});
   const rows=(await pool.query<{type:string;answer:string}>('SELECT type,answer FROM questions')).rows;
   assert.deepEqual(Object.fromEntries(rows.map(row=>[row.type,row.answer])),{single:'2',multiple:'2#3',judgement:'正确',completion:'1000#100'});
   assert.deepEqual(await counts(),{questions:4,versions:4});
  });
  await t.test('duplicates skip by default, explicit overwrite records a revision, and exports round trip',async()=>{
   const items=[{...QUESTION_IMPORT_EXAMPLE.items[0],answer:'3'}];
   assert.equal((await request('POST','/api/admin/import',{items,preview:false})).statusCode,200);
   assert.equal((await pool.query("SELECT answer FROM questions WHERE type='single'")).rows[0].answer,'2');
   assert.deepEqual(await counts(),{questions:4,versions:4});
   assert.equal((await request('POST','/api/admin/import',{items,preview:false,overwrite:true})).statusCode,200);
   assert.equal((await pool.query("SELECT answer FROM questions WHERE type='single'")).rows[0].answer,'3');
   assert.deepEqual(await counts(),{questions:4,versions:5});
   const versions=await pool.query('SELECT operation FROM answer_versions ORDER BY id DESC LIMIT 1');
   assert.equal(versions.rows[0].operation,'导入题目');
   const exported=await request('GET','/api/admin/export'),parsed=parseQuestionImport(exported.body);
   assert.equal((await request('POST','/api/admin/import',{...parsed,preview:false})).statusCode,200);
   assert.deepEqual(await counts(),{questions:4,versions:5});
  });
  await t.test('invalid fields are located by row and invalid answers prevent all writes',async()=>{
   const malformed=await request('POST','/api/admin/import',{items:[{answer:'正确'},{title:'缺少答案',answer:null}]});
   assert.equal(malformed.statusCode,400);
   assert.ok(malformed.json().fields['items.0.title']);assert.ok(malformed.json().fields['items.1.answer']);
   const items=[{title:'不会因第二题无效而入库',type:'completion',answer:'答案'},{...QUESTION_IMPORT_EXAMPLE.items[0],answer:'没有此选项'}];
   const preview=await request('POST','/api/admin/import',{items});
   assert.deepEqual(preview.json(),{total:2,valid:1,invalid:[2]});
   assert.equal((await request('POST','/api/admin/import',{items,preview:false})).statusCode,400);
   assert.deepEqual(await counts(),{questions:4,versions:5});
  });
  await t.test('500 rows and requests above the old 256 KiB limit are supported only for import',async()=>{
   const item=QUESTION_IMPORT_EXAMPLE.items[2];
   const boundary=await request('POST','/api/admin/import',{items:Array(QUESTION_IMPORT_LIMITS.maxItems).fill(item)});
   assert.equal(boundary.statusCode,200,boundary.body);assert.equal(boundary.json().total,500);
   assert.equal((await request('POST','/api/admin/import',{items:Array(QUESTION_IMPORT_LIMITS.maxItems+1).fill(item)})).statusCode,400);
   const payload={items:Array.from({length:100},(_,index)=>({title:`容量题 ${index} ${'中'.repeat(1000)}`,type:'completion',answer:'答案'}))};
   assert.ok(Buffer.byteLength(JSON.stringify(payload))>256*1024);
   const larger=await request('POST','/api/admin/import',payload);
   assert.equal(larger.statusCode,200,larger.body);assert.equal(larger.json().valid,100);
   assert.equal((await request('POST','/api/admin/questions',payload)).statusCode,413);
   const tooLarge={items:Array(500).fill({title:'中'.repeat(4000),type:'completion',answer:'答案'})};
   assert.ok(Buffer.byteLength(JSON.stringify(tooLarge))>QUESTION_IMPORT_LIMITS.maxBytes);
   assert.equal((await request('POST','/api/admin/import',tooLarge)).statusCode,413);
   assert.deepEqual(await counts(),{questions:4,versions:5});
  });
  await t.test('ordinary users cannot import into the shared question bank',async()=>{
   const member=await fixture.signup('import-member');
   assert.equal((await request('POST','/api/admin/import',{...QUESTION_IMPORT_EXAMPLE,preview:false},member.headers)).statusCode,403);
   assert.deepEqual(await counts(),{questions:4,versions:5});
  });
 }finally{await fixture.close();}
});
