import { AdminProjectDetail } from "@/components/AdminProjectDetail";

export function generateStaticParams() {
  return process.env.STATIC_EXPORT === "1" ? [{ projectRef: "__not-published" }] : [];
}

export default async function AdminProjectPage({ params }: { params: Promise<{ projectRef: string }> }) {
  const { projectRef } = await params;
  return <AdminProjectDetail projectRef={projectRef} />;
}
