import { AdminImportDetail } from "@/components/AdminImportDetail";

export function generateStaticParams() {
  return process.env.STATIC_EXPORT === "1" ? [{ jobId: "__not-published" }] : [];
}

export default async function AdminImportPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <AdminImportDetail jobId={jobId} />;
}
