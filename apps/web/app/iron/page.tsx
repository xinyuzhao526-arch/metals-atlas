import type { Metadata } from "next";
import { SupplyResearch } from "@/components/SupplyResearch";
import { ironConfig } from "@/lib/tin-iron-data";
export const metadata: Metadata = { title: "铁 供给研究 · Metals Atlas", description: "铁 供应资产、生产阶段与官方来源证据。" };
export default function Page() { return <SupplyResearch config={ironConfig} />; }
