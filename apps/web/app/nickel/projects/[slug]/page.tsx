import { NickelProjectDetail } from "@/components/NickelProjectDetail";

export function generateStaticParams() {
  return ["onca-puma","voiseys-bay","sudbury","murrin-murrin","weda-bay","sorowako","nova","western-australia-nickel"].map((slug) => ({ slug }));
}

export default async function NickelProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <NickelProjectDetail slug={slug} />;
}
