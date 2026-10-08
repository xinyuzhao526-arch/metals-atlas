import type { Metadata } from "next";
import { AluminumDataProduct } from "@/components/AluminumDataProduct";

export const metadata: Metadata = {title:"Al 铝供给研究 · Metals Atlas",description:"Metals Atlas 铝土矿、氧化铝项目、产量、产能与供给事件研究页面。"};
export default function AluminumPage(){return <AluminumDataProduct/>;}
