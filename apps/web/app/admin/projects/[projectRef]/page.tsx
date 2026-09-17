import { AdminProjectDetail } from "@/components/AdminProjectDetail";


export default async function AdminProjectPage({ params }: { params: Promise<{ projectRef: string }> }) {
  const { projectRef } = await params;
  return <AdminProjectDetail projectRef={projectRef} />;
}
