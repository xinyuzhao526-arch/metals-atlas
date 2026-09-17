import { AdminImportDetail } from "@/components/AdminImportDetail";


export default async function AdminImportPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <AdminImportDetail jobId={jobId} />;
}
