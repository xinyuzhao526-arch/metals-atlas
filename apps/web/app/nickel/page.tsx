import type { Metadata } from "next";
import { NickelDataProduct } from "@/components/NickelDataProduct";

export const metadata: Metadata = {
  title: "Ni 镍供给研究 · Metals Atlas",
  description: "Metals Atlas 镍项目、产量、指引、产能与供给事件研究页面。",
};

export default function NickelPage() { return <NickelDataProduct />; }
