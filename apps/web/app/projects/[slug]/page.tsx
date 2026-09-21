import { PublicProjectDetail } from "@/components/PublicProjectDetail";
import { publicData } from "@/lib/public-data";

export function generateStaticParams() {
  return publicData.projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicProjectDetail slug={slug} />;
}
