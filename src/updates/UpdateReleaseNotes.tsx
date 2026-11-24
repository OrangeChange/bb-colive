import { Fragment } from 'react';
function inline(text:string){return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,index)=>part.startsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:part.startsWith('`')?<code key={index}>{part.slice(1,-1)}</code>:<Fragment key={index}>{part}</Fragment>);}
export function UpdateReleaseNotes({notes}:{notes:string}){
  const lines=notes.split(/\r?\n/),content=[];
  for(let index=0;index<lines.length;index++){
    const line=lines[index].trim();if(!line)continue;
    if(/^#{1,6}\s/.test(line)){content.push(<h4 key={index}>{inline(line.replace(/^#{1,6}\s+/,''))}</h4>);continue;}
    if(/^[-*]\s/.test(line)){const start=index,items=[];while(index<lines.length&&/^[-*]\s/.test(lines[index].trim())){items.push(<li key={index}>{inline(lines[index].trim().replace(/^[-*]\s+/,''))}</li>);index++;}index--;content.push(<ul key={start}>{items}</ul>);continue;}
    content.push(<p key={index}>{inline(line)}</p>);
  }
  return <div className="software-update-notes">{content}</div>;
}
