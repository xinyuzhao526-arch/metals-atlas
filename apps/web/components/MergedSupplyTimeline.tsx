"use client";
import {useMemo,useState} from "react";
import newsJson from "@/data/news.json";

type NewsItem={id:string;metal_id:string;title:string;organization:string;material_url:string;publication_date:string;source_level?:"media"|"official";source_type?:string;event_tag?:string};
export type CuratedTimelineEvent={id:string;date:string;kind:string;projectId:string;projectName:string;headline:string;summary:string;sourceId?:string};
type Props={metal:"cu"|"li"|"ni"|"al"|"sn"|"fe";curated:CuratedTimelineEvent[];projects:{id:string;name:string;aliases?:string[]}[];selectedProjectId?:string|null;onSelectProject?:(id:string)=>void;onOpenSource?:(id:string)=>void};

export function MergedSupplyTimeline({metal,curated,projects,selectedProjectId,onSelectProject,onOpenSource}:Props){
 const[filter,setFilter]=useState<"all"|"verified"|"official"|"media">("all");
 const news=(newsJson.items as NewsItem[]).filter(item=>item.metal_id===`metal-${metal}`);
 const merged=useMemo(()=>{
  const verified=curated.map(e=>({...e,level:"verified" as const,url:null as string|null,organization:"A级官方材料"}));
  const captured=news.map(item=>{const official=item.source_level==="official"||item.source_type==="official_company_news"||item.source_type==="company_regulatory_announcement";const hay=item.title.toLowerCase().replaceAll("’", "'");const project=projects.find(p=>[p.name,...(p.aliases??[])].some(name=>name.length>3&&hay.includes(name.toLowerCase().replaceAll("’", "'"))));return{id:item.id,date:item.publication_date,kind:item.event_tag||"媒体快讯",projectId:project?.id??"",projectName:project?.name??"行业事件",headline:item.title,summary:official?`${item.organization} · 自动收录的公司公告，事件与数值尚待人工核读。`:`${item.organization} · 公开媒体快讯，尚待回溯公司或监管机构原始材料。`,sourceId:undefined,level:official?"official" as const:"media" as const,url:item.material_url,organization:item.organization}});
  return [...verified,...captured].sort((a,b)=>b.date.localeCompare(a.date));
 },[curated,news,projects]);
 const shown=merged.filter(item=>filter==="all"||item.level===filter);
 return <aside className="event-stream merged-timeline"><div className="section-heading"><div><span>02 / 供给动态</span><h2>统一时间流</h2></div><p>官方事件、公司公告与媒体快讯 · 日期倒序</p></div><div className="timeline-filters" aria-label="时间流筛选">{([['all','全部'],['verified','已核验'],['official','公司公告'],['media','媒体快讯']] as const).map(([key,label])=><button key={key} type="button" className={filter===key?"active":""} onClick={()=>setFilter(key)}>{label}<span>{merged.filter(x=>key==='all'||x.level===key).length}</span></button>)}</div><p className="timeline-scroll-hint">每日 4 次自动检查 · 向下滚动浏览更多</p><div key={filter} className="event-stream-list" tabIndex={0} role="region" aria-label="供给动态，可上下滚动">{shown.length===0&&<p className="timeline-empty">暂无此类动态</p>}{shown.map(item=><article key={`${item.level}-${item.id}`} className={`stream-event ${item.level} ${item.projectId&&selectedProjectId===item.projectId?"active":""}`} onClick={()=>item.projectId&&onSelectProject?.(item.projectId)}><time>{item.date}</time><div className="event-kind">{item.kind}</div><div className={`source-level ${item.level}`}>{item.level==="verified"?"A 级 · 已核验":item.level==="official"?"公司公告 · 待核读":"媒体 · 待回溯"}</div><h3>{item.projectName}</h3><h4>{item.headline}</h4><p>{item.summary}</p>{item.level==="verified"&&item.sourceId&&<button className="evidence-link" type="button" onClick={e=>{e.stopPropagation();onOpenSource?.(item.sourceId!)}}>官方来源 ↗</button>}{item.level!=="verified"&&item.url&&<a className="evidence-link" href={item.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>{item.level==="official"?"公告原文 ↗":"媒体原文 ↗"}</a>}</article>)}</div></aside>;
}
