import { notFound } from "next/navigation";
import { SupplyResearch } from "@/components/SupplyResearch";
import { ironConfig } from "@/lib/tin-iron-data";
export const dynamicParams = false;
export function generateStaticParams() { return ironConfig.projects.map(p => ({ slug: p.id })); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 if (!ironConfig.projects.some(p => p.id === slug)) notFound();
 return <SupplyResearch config={ironConfig} projectId={slug} />;
}
