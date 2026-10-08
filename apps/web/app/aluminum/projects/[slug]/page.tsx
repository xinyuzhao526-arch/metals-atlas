import { AluminumProjectDetail } from "@/components/AluminumProjectDetail";
export function generateStaticParams(){return ["weipa","gove","paragominas","juruti","worsley","alunorte","al-taweelah","guinea-alumina-corporation"].map(slug=>({slug}));}
export default async function AluminumProjectPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <AluminumProjectDetail slug={slug}/>;}
