import { notFound } from "next/navigation";
import { SupplyResearch } from "@/components/SupplyResearch";
import { tinConfig } from "@/lib/tin-iron-data";
export const dynamicParams = false;
export function generateStaticParams() { return tinConfig.projects.map(p => ({ slug: p.id })); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
 const { slug } = await params;
 if (!tinConfig.projects.some(p => p.id === slug)) notFound();
 return <SupplyResearch config={tinConfig} projectId={slug} />;
}
