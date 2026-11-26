/**
 * @file ImportQuestions.tsx
 * @project zhixu
 * @module 题库导入
 * @description 上传或粘贴 JSON、示例展示、预览与确认导入。
 * @logic 输入统一进入编辑区，变更内容或覆盖选项后重新预览，通过校验后提交同一份数据。
 * @dependencies lib/question-import, lib/api, hooks/use-resource, components/ui
 * @index_tags questions, import, preview, examples
 * @author holic512
 */
import {useState,type ChangeEvent} from 'react';
import {Copy,Download} from 'lucide-react';
import {QUESTION_IMPORT_LIMITS} from '../../../shared/contracts';
import type {ImportPreview,ImportResult} from '../../../shared/api-types';
import {api} from '../lib/api';
import {download} from '../lib/format';
import {formatQuestionImportError,parseQuestionImport,questionFileToJson,QUESTION_IMPORT_EXAMPLE,QUESTION_IMPORT_EXAMPLE_JSON,type ImportPayload} from '../lib/question-import';
import {useAction} from '../hooks/use-resource';
import {Button} from './ui/button';
import {Input,Textarea} from './ui/input';
import {Checkbox} from './ui/checkbox';
import {Feedback} from './ui/alert';
import {FormField,FormActions} from './ui/form';

export function ImportQuestions({onDone}:{onDone:(result:ImportResult)=>Promise<void>}){
 const action=useAction(),copy=useAction();
 const [content,setContent]=useState(''),[filename,setFilename]=useState(''),[overwrite,setOverwrite]=useState(false);
 const [preview,setPreview]=useState<{result:ImportPreview;payload:ImportPayload}|null>(null);

 function clearPreview(){setPreview(null);action.clear();}
 function selectFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];if(!file)return;
  event.target.value='';clearPreview();setContent('');setFilename('');
  void action.execute(async()=>{
   if(file.size>QUESTION_IMPORT_LIMITS.maxBytes)throw new Error('文件超过 5 MiB，请拆分后重试');
   setContent(questionFileToJson(file.name,await file.text()));setFilename(file.name);
  });
 }
 function previewImport(){
  setPreview(null);
  void action.execute(async()=>{
   const payload=parseQuestionImport(content,overwrite),result=await requestImport<ImportPreview>({...payload,preview:true});
   setPreview({payload,result});
  });
 }

 return <div className="question-import">
  <section aria-label="导入内容">
   <FormField label="选择文件" hint={`支持 JSON 和 CSV，单次最多 ${QUESTION_IMPORT_LIMITS.maxItems} 题、5 MiB。上传后可在下方编辑。`}><Input type="file" accept=".json,.csv,application/json,text/csv" disabled={action.pending} onChange={selectFile}/></FormField>
   {filename&&<p className="question-import-filename muted">已读取：{filename}</p>}
   <FormField label="题库 JSON" hint={'可直接粘贴题目数组或 {"items": [...]}，也可使用本地题库导出的 JSON。'}><Textarea className="code-editor question-import-editor" rows={17} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="在此粘贴题库 JSON，或先选择文件" value={content} disabled={action.pending} onChange={event=>{setContent(event.target.value);setFilename('');clearPreview();}}/></FormField>
   <label className="check-field"><Checkbox checked={overwrite} disabled={action.pending} onCheckedChange={value=>{setOverwrite(value===true);clearPreview();}}/>覆盖已有题目的答案</label>
   <p className="question-import-policy muted">默认跳过重复题。覆盖后会保留答案修改记录。</p>
   <Feedback error={action.error||(preview?.result.invalid.length?`共 ${preview.result.total} 题，有效 ${preview.result.valid} 题。第 ${preview.result.invalid.join('、')} 题答案与题型或选项不匹配，请修正后重新预览。`:undefined)} message={preview&&!preview.result.invalid.length?`预览通过：共 ${preview.result.total} 题，有效 ${preview.result.valid} 题。`:undefined}/>
   <FormActions>
    <Button variant="outline" disabled={!content.trim()||action.pending} onClick={previewImport}>{action.pending?'处理中…':'预览导入'}</Button>
    <Button variant="default" disabled={!preview||Boolean(preview.result.invalid.length)||action.pending} onClick={()=>{if(preview)void action.execute(async()=>{await onDone(await requestImport<ImportResult>({...preview.payload,preview:false}));});}}>确认导入</Button>
   </FormActions>
  </section>
  <section className="question-import-guide" aria-label="JSON 格式说明">
   <div className="question-import-example-heading"><h3>JSON 格式示例</h3><div className="row-actions">
    <Button size="sm" disabled={copy.pending} onClick={()=>copy.execute(()=>navigator.clipboard.writeText(QUESTION_IMPORT_EXAMPLE_JSON),'示例已复制')}><Copy data-icon="inline-start" size={14}/>复制示例</Button>
    <Button size="sm" onClick={()=>download('知序-题库导入示例.json',QUESTION_IMPORT_EXAMPLE)}><Download data-icon="inline-start" size={14}/>下载示例</Button>
   </div></div>
   <Feedback error={copy.error} message={copy.message}/>
   <pre className="question-import-example mono" tabIndex={0} aria-label="单选、多选、判断和填空的 JSON 示例"><code>{QUESTION_IMPORT_EXAMPLE_JSON}</code></pre>
   <dl className="question-import-rules">
    <dt><code>title</code></dt><dd>必填，题干文本。</dd>
    <dt><code>type</code></dt><dd><code>single</code> 单选、<code>multiple</code> 多选、<code>judgement</code> 判断、<code>completion</code> 填空。</dd>
    <dt><code>options</code></dt><dd>选择题必填，使用选项文本数组。</dd>
    <dt><code>answer</code></dt><dd>必填。单选填选项文本；多选用文本数组；判断填“正确”或“错误”；填空按空位顺序填写。多选和多空也支持用 <code>#</code> 分隔。</dd>
    <dt><code>course</code></dt><dd>可选，课程名称。</dd>
    <dt><code>images</code></dt><dd>可选，图片地址数组。</dd>
   </dl>
  </section>
 </div>;
}

async function requestImport<T>(payload:ImportPayload&{preview:boolean}):Promise<T>{
 try{return await api<T>('/admin/import','POST',payload);}
 catch(error){throw new Error(formatQuestionImportError(error));}
}
