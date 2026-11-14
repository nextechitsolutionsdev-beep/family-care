// Build docs/family-care-user-guide-ar.pdf from docs/USER_GUIDE.md.
// Chromium (Playwright) shapes Arabic and lays out RTL natively and embeds the font. Two passes: the first
// finds the page of every section (invisible markers read back with pypdf), the second prints the contents with
// those page numbers. Every page is then rendered to output/playwright/guide-pages/ for review.
// Requires: Playwright Chromium, Python with pypdf and pypdfium2, Windows fonts (Tahoma).
// Usage: node scripts/build-user-guide.mjs
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';

const SOURCE='docs/USER_GUIDE.md',OUT='docs/family-care-user-guide-ar.pdf',WORK='output/playwright/guide-build';
const FONT='C:/Windows/Fonts/tahoma.ttf',FONT_BOLD='C:/Windows/Fonts/tahomabd.ttf';
for(const font of [FONT,FONT_BOLD])if(!existsSync(font))throw new Error(`missing font ${font}`);
mkdirSync(WORK,{recursive:true});

const escape=value=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// Section numbers become a separate badge: a leading "1." mixes badly with right-to-left text.
const numbered=value=>{const m=/^(\d+)\.\s+(.*)$/.exec(value);return m?`<span class="num">${m[1]}</span>${inline(m[2])}`:inline(value);};
const inline=value=>escape(value)
 .replace(/`([^`]+)`/g,'<code dir="ltr">$1</code>')
 .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
 .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,'<a href="$2">$1</a>')
 .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1')
 .replace(/(https?:\/\/[^\s<]+)(?![^<]*<\/a>)/g,'<bdi dir="ltr">$1</bdi>');

function convert(markdown){
 const lines=markdown.replaceAll('\r\n','\n').split('\n');
 const sections=[];const body=[];let title='',meta=[];let i=0;
 const flushList=(items,ordered,start=1)=>body.push(`<${ordered?`ol start="${start}"`:'ul'}>${items.map(item=>`<li>${inline(item)}</li>`).join('')}</${ordered?'ol':'ul'}>`);
 while(i<lines.length){
  const line=lines[i];
  if(line.startsWith('# ')){title=line.slice(2);i++;continue;}
  if(line.startsWith('## المحتويات')){i++;while(i<lines.length&&!lines[i].startsWith('## '))i++;continue;}
  if(/^\[نسخة PDF/.test(line)){i++;continue;}
  if(!sections.length&&line.startsWith('**الإصدار:**')){meta.push(inline(line));i++;continue;}
  if(line.startsWith('## ')){const index=sections.length;sections.push(line.slice(3));body.push(`<h2 id="s${index}"${/^\d+\.\s+قائمة/.test(line.slice(3))?' class="page"':''}><span class="mark">QQS${String(index).padStart(2,'0')}QQ</span>${numbered(line.slice(3))}</h2>`);i++;continue;}
  if(line.startsWith('### ')){body.push(`<h3>${inline(line.slice(4))}</h3>`);i++;continue;}
  if(line.startsWith('> ')){const note=[];while(i<lines.length&&lines[i].startsWith('>')){note.push(lines[i].replace(/^>\s?/,''));i++;}body.push(`<div class="note">${note.map(n=>`<p>${inline(n)}</p>`).join('')}</div>`);continue;}
  if(line.startsWith('|')){const rows=[];while(i<lines.length&&lines[i].startsWith('|')){rows.push(lines[i]);i++;}
   const cells=row=>row.replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
   const [head,,...rest]=rows;
   body.push(`<table><thead><tr>${cells(head).map(c=>`<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map(r=>`<tr>${cells(r).map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);continue;}
  const image=/^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
  if(image){body.push(`<figure><img src="${pathToFileURL(resolve('docs',image[2])).href}" alt=""/><figcaption>${inline(image[1])}</figcaption></figure>`);i++;continue;}
  if(/^\d+\. /.test(line)){const start=Number(/^(\d+)\./.exec(line)[1]);const items=[];while(i<lines.length&&/^\d+\. /.test(lines[i])){items.push(lines[i].replace(/^\d+\. /,''));i++;}flushList(items,true,start);continue;}
  if(line.startsWith('- ')){const items=[];while(i<lines.length&&lines[i].startsWith('- ')){items.push(lines[i].slice(2));i++;}flushList(items,false);continue;}
  if(!line.trim()){i++;continue;}
  const para=[];while(i<lines.length&&lines[i].trim()&&!/^(#|>|\||- |\d+\. |!\[)/.test(lines[i])){para.push(lines[i]);i++;}
  body.push(`<p>${inline(para.join(' '))}</p>`);
 }
 return {title,meta,sections,body:body.join('\n')};
}

function html({title,meta,sections,body},pages){
 const toc=sections.map((name,index)=>`<li><a href="#s${index}"><span class="toc-name">${numbered(name)}</span><span class="toc-dots"></span><span class="toc-page">${pages?.[index]??'00'}</span></a></li>`).join('');
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:Guide;src:url('${pathToFileURL(FONT).href}');font-weight:400}
@font-face{font-family:Guide;src:url('${pathToFileURL(FONT_BOLD).href}');font-weight:700}
@page{size:A4;margin:18mm 16mm 20mm}
*{box-sizing:border-box}
body{font-family:Guide,Tahoma,sans-serif;color:#21342D;font-size:10.4pt;line-height:1.75;margin:0;font-variant-numeric:tabular-nums}
.cover{height:240mm;display:flex;flex-direction:column;justify-content:center;gap:10mm;break-after:page;border-inline-start:6px solid #20664E;padding-inline-start:12mm}
.cover h1{font-size:28pt;color:#173F33;margin:0;line-height:1.3}.cover .meta{font-size:12pt;color:#5B6B62}.cover .meta p{margin:2mm 0}
.toc{break-after:page;font-size:9.8pt}.toc h2{margin-top:0}
.toc ol{list-style:none;padding:0;margin:0}.toc li{margin:.7mm 0}.toc a{display:flex;color:#21342D;text-decoration:none;gap:2mm;align-items:baseline}
.toc-dots{flex:1;border-bottom:1px dotted #9AAE9F;transform:translateY(-1.2mm)}.toc-page{min-width:8mm;text-align:left;font-weight:700}
h2{font-size:15pt;color:#173F33;border-bottom:2px solid #D7E2D9;padding-bottom:1.5mm;margin:9mm 0 3mm;break-after:avoid;break-before:auto}
h2.page{break-before:page;margin-top:0}
h3{font-size:12pt;color:#20664E;margin:5mm 0 2mm;break-after:avoid}
p{margin:1.5mm 0 2.5mm}p:has(> strong:only-child){break-after:avoid}ol,ul{margin:1mm 0 3mm;padding-inline-start:7mm}li{margin:.8mm 0}
code{font-family:Consolas,monospace;font-size:9.4pt;background:#F1F4EF;padding:0 1.2mm;border-radius:2px;unicode-bidi:isolate}
bdi{unicode-bidi:isolate}a{color:#20664E}
table{width:100%;border-collapse:collapse;margin:2mm 0 4mm;font-size:9.6pt;break-inside:auto}
th{background:#EDF4EE;color:#173F33;text-align:start;font-weight:700}th,td{border:1px solid #D7E2D9;padding:1.6mm 2.2mm;vertical-align:top}
tr{break-inside:avoid}thead{display:table-header-group}
.note{background:#FBF5E9;border:1px solid #E4D8B7;border-inline-start:4px solid #9A651D;padding:2mm 4mm;margin:3mm 0;break-inside:avoid}
figure{margin:3mm 0 5mm;text-align:center;break-inside:avoid}figure img{max-width:100%;max-height:74mm;border:1px solid #D7E2D9;border-radius:3px}
figcaption{font-size:9pt;color:#5B6B62;margin-top:1.5mm}
.mark{color:#fff;font-size:1px;letter-spacing:0}
.num{display:inline-block;min-width:7mm;margin-inline-end:2.5mm;padding:0 1.5mm;border-radius:3px;background:#20664E;color:#fff;text-align:center;font-size:.85em}
.toc .num{min-width:6mm;background:#EDF4EE;color:#173F33}
</style></head><body>
<section class="cover"><div><h1>${inline(title)}</h1></div><div class="meta">${meta.map(m=>`<p>${m}</p>`).join('')}<p>للمالك وموظفي الاستقبال والأطباء</p></div></section>
<section class="toc"><h2>المحتويات</h2><ol>${toc}</ol></section>
${body}
</body></html>`;
}

const footer=`<div style="width:100%;font-family:Tahoma;font-size:8px;color:#5B6B62;text-align:center;direction:rtl;padding:0 16mm">فاميلي كير — دليل الاستخدام · صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></div>`;
async function print(document,file){
 const path=resolve(WORK,'guide.html');writeFileSync(path,document);
 const browser=await chromium.launch();
 try{const page=await browser.newPage();await page.goto(pathToFileURL(path).href,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.pdf({path:file,format:'A4',printBackground:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:footer,margin:{top:'18mm',bottom:'20mm',left:'16mm',right:'16mm'}});
 }finally{await browser.close();}
}
function python(code,...args){
 const run=spawnSync('python',['-c',code,...args],{encoding:'utf8'});
 if(run.status!==0)throw new Error(run.stderr||run.stdout);
 return run.stdout;
}

const parsed=convert(readFileSync(SOURCE,'utf8'));
const draft=resolve(WORK,'draft.pdf');
await print(html(parsed),draft);
const found=JSON.parse(python(`import sys,json,re
from pypdf import PdfReader
pages={}
for n,page in enumerate(PdfReader(sys.argv[1]).pages,1):
  for m in re.findall(r'QQS(\\d\\d)QQ',page.extract_text() or ''):pages.setdefault(int(m),n)
print(json.dumps(pages))`,draft));
const pages=parsed.sections.map((_,index)=>found[index]);
if(pages.some(page=>!page))throw new Error(`section pages not found: ${JSON.stringify(found)}`);
await print(html(parsed,pages),OUT);
// The final layout must match the draft (contents numbers are the same width), so verify it again.
const verify=JSON.parse(python(`import sys,json,re
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);pages={}
for n,page in enumerate(r.pages,1):
  for m in re.findall(r'QQS(\\d\\d)QQ',page.extract_text() or ''):pages.setdefault(int(m),n)
print(json.dumps({'pages':pages,'count':len(r.pages)}))`,OUT));
for(const [index,page] of pages.entries())if(verify.pages[index]!==page)throw new Error(`section ${index} moved from page ${page} to ${verify.pages[index]}`);
const shots='output/playwright/guide-pages';if(existsSync(shots))rmSync(shots,{recursive:true});mkdirSync(shots,{recursive:true});
python(`import sys,pypdfium2 as pdfium
pdf=pdfium.PdfDocument(sys.argv[1])
for i in range(len(pdf)):
  pdf[i].render(scale=1.4).to_pil().save(f"{sys.argv[2]}/page-{i+1:02d}.png")`,OUT,shots);
console.log(`${OUT}: ${verify.count} pages; contents ${JSON.stringify(pages)}; page images in ${shots}/`);
