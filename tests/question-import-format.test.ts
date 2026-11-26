import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTION_IMPORT_LIMITS} from '../shared/contracts.js';
import {canonicalAnswer,prepare} from '../server/search.js';
import {formatQuestionImportError,parseQuestionImport,questionFileToJson,QUESTION_IMPORT_EXAMPLE,QUESTION_IMPORT_EXAMPLE_JSON} from '../web/src/lib/question-import.js';

test('JSON import accepts arrays, wrapped items, exports and UTF-8 BOM without changing answers',()=>{
 for(const text of [JSON.stringify(QUESTION_IMPORT_EXAMPLE.items),QUESTION_IMPORT_EXAMPLE_JSON,JSON.stringify({format:'ocs-answer-hub-v2',...QUESTION_IMPORT_EXAMPLE}),'\uFEFF'+QUESTION_IMPORT_EXAMPLE_JSON]){
  const parsed=parseQuestionImport(text,true);
  assert.deepEqual(parsed,{items:QUESTION_IMPORT_EXAMPLE.items,overwrite:true});
 }
 assert.deepEqual(QUESTION_IMPORT_EXAMPLE.items.map(item=>canonicalAnswer(item.answer,prepare(item))),['2','2#3','正确','1000#100']);
});

test('JSON import rejects empty, malformed and unsupported roots with actionable errors',()=>{
 for(const text of ['',' \n '])assert.throws(()=>parseQuestionImport(text),/上传.*粘贴/);
 for(const text of ['{','```json\n[]\n```'])assert.throws(()=>parseQuestionImport(text),/JSON 格式不正确/);
 for(const value of [null,true,42,'text',{}, {items:{}},{items:null}])assert.throws(()=>parseQuestionImport(JSON.stringify(value)),/题目数组/);
 for(const text of ['[]','{"items":[]}'])assert.throws(()=>parseQuestionImport(text),/至少添加一道题/);
});

test('JSON import enforces row and serialized UTF-8 request limits',()=>{
 const item=QUESTION_IMPORT_EXAMPLE.items[0];
 assert.equal(parseQuestionImport(JSON.stringify(Array(QUESTION_IMPORT_LIMITS.maxItems).fill(item))).items.length,500);
 assert.throws(()=>parseQuestionImport(JSON.stringify(Array(QUESTION_IMPORT_LIMITS.maxItems+1).fill(item))),/最多导入 500 题/);
 const large=JSON.stringify([{title:'容量测试',type:'completion',answer:'中'.repeat(QUESTION_IMPORT_LIMITS.maxBytes/2)}]);
 assert.ok(large.length<QUESTION_IMPORT_LIMITS.maxBytes);
 assert.throws(()=>parseQuestionImport(large),/请求超过 5 MiB/);
});

test('CSV upload converts quoted commas, escaped quotes, multiline cells and BOM into editable JSON',()=>{
 const csv='\uFEFFtitle,type,options,course,answer\r\n"选择 ",single,"A. 甲\nB. 乙","课程,一",甲\r\n"他说""正确""",judgement,,,正确\r\n';
 const {items}=parseQuestionImport(questionFileToJson('题库.CSV',csv));
 assert.deepEqual(items,[{title:'选择 ',type:'single',options:'A. 甲\nB. 乙',course:'课程,一',answer:'甲'},{title:'他说"正确"',type:'judgement',options:'',course:'',answer:'正确'}]);
 assert.throws(()=>questionFileToJson('broken.csv','title,answer\n"未闭合,正确'),/CSV 引号未闭合/);
 assert.equal(questionFileToJson('题库.json','\uFEFF'+QUESTION_IMPORT_EXAMPLE_JSON),QUESTION_IMPORT_EXAMPLE_JSON);
});

test('JSON import errors name one-based question rows and fields while retaining the request id',()=>{
 const error=Object.assign(new Error('输入格式不正确（请求编号：test-request）'),{fields:{'items.0.title':'required','items.1.answer.0':'invalid','items.1.answer.1':'invalid','items.2.type':'invalid'}});
 const message=formatQuestionImportError(error);
 assert.match(message,/test-request/);
 assert.match(message,/第 1 题的题干/);
 assert.match(message,/第 2 题的答案/);
 assert.match(message,/第 3 题的题型/);
 assert.equal(message.split('第 2 题').length,2);
 assert.match(formatQuestionImportError(Object.assign(new Error('too large'),{status:413})),/5 MiB/);
 assert.equal(formatQuestionImportError(new Error('请求失败')),'请求失败');
});
