import { ProjectDetailView } from "@/components/ProjectDetailView";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProjectDetailView slug={slug} />;
}

