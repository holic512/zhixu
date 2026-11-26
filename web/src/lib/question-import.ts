/**
 * @file question-import.ts
 * @project zhixu
 * @module 题库导入边界
 * @description 题库 JSON 示例、文件转换、导入解析与字段错误展示。
 * @logic 文件统一转换为可编辑 JSON，检查容器和容量后交由服务端校验题目内容。
 * @dependencies shared/contracts, shared/api-types
 * @index_tags questions, import, json, csv
 * @author holic512
 */
import {QUESTION_IMPORT_LIMITS} from '../../../shared/contracts';
import type {ApiError,QuestionWrite} from '../../../shared/api-types';

export const QUESTION_IMPORT_EXAMPLE:{items:QuestionWrite[]}={items:[
 {title:'1 + 1 等于多少？',type:'single',options:['1','2','3','4'],answer:'2',course:'基础数学'},
 {title:'以下哪些数是质数？',type:'multiple',options:['2','3','4','6'],answer:['2','3'],course:'基础数学'},
 {title:'1 + 1 = 2。',type:'judgement',answer:'正确',course:'基础数学'},
 {title:'1 千米等于____米，1 米等于____厘米。',type:'completion',answer:['1000','100'],course:'基础数学'}
]};
export const QUESTION_IMPORT_EXAMPLE_JSON=JSON.stringify(QUESTION_IMPORT_EXAMPLE,null,2);
export type ImportPayload={items:unknown[];overwrite:boolean};

export function parseQuestionImport(text:string,overwrite=false):ImportPayload{
 const content=text.trim();
 if(!content)throw new Error('请上传题库文件或粘贴 JSON 内容');
 let raw:unknown;
 try{raw=JSON.parse(content);}catch{throw new Error('JSON 格式不正确，请检查双引号、逗号和括号，并移除 Markdown 代码块标记');}
 const items:unknown=Array.isArray(raw)?raw:raw&&typeof raw==='object'?(raw as {items?:unknown}).items:undefined;
 if(!Array.isArray(items))throw new Error('请使用题目数组或 {"items": [...]} 格式');
 if(!items.length)throw new Error('没有可导入的题目，请至少添加一道题');
 if(items.length>QUESTION_IMPORT_LIMITS.maxItems)throw new Error(`单次最多导入 ${QUESTION_IMPORT_LIMITS.maxItems} 题，请拆分后重试`);
 const payload={items:items as unknown[],overwrite};
 if(new TextEncoder().encode(JSON.stringify({...payload,preview:false})).byteLength>QUESTION_IMPORT_LIMITS.maxBytes)throw new Error('导入请求超过 5 MiB，请拆分后重试');
 return payload;
}

export function questionFileToJson(filename:string,text:string):string{
 const content=text.replace(/^\uFEFF/,'');
 return filename.toLowerCase().endsWith('.csv')?JSON.stringify({items:parseCsv(content)},null,2):content;
}

export function formatQuestionImportError(error:unknown):string{
 const message=error instanceof Error?error.message:'导入失败，请重试',details=error as ApiError|null;
 if(details?.status===413)return '导入请求超过 5 MiB，请拆分后重试';
 if(!details?.fields)return message;
 const fields:Record<string,string>={title:'题干',type:'题型',options:'选项',answer:'答案',course:'课程',images:'图片地址'};
 const issues=Object.keys(details.fields).map(path=>{
  const [,index,field]=/^items\.(\d+)(?:\.([^\.]+))?/.exec(path)??[];
  return index!==undefined?`第 ${Number(index)+1} 题${field?`的${fields[field]??field}`:''}格式不正确`:path==='items'?'题目列表格式不正确':`${path} 格式不正确`;
 });
 return `${message}\n${[...new Set(issues)].join('；')}。请对照右侧示例修正后重新预览。`;
}

function parseCsv(text:string){
 const rows:string[][]=[];let row:string[]=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
  else if(!quote&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}
  else cell+=c;
 }
 if(quote)throw new Error('CSV 引号未闭合，请修正文件后重试');
 row.push(cell.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);
 const headers=rows.shift()?.map(x=>x.trim())??[];
 return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
