import type { Metadata } from "next";
import { LithiumDataProduct } from "@/components/LithiumDataProduct";

export const metadata: Metadata = {
  title: "Li 锂供给研究 · Metals Atlas",
  description: "Metals Atlas 锂项目、产量、指引、储量与供给事件研究页面。",
};

export default function LithiumPage() {
  return <LithiumDataProduct />;
}
