import { LithiumProjectDetail } from "@/components/LithiumProjectDetail";

export function generateStaticParams() {
  return ["pilgangoora", "greenbushes", "wodgina", "mt-marion", "grota-do-cirilo", "fenix", "rincon", "salar-de-atacama"]
    .map((slug) => ({ slug }));
}

export default async function LithiumProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LithiumProjectDetail slug={slug} />;
}
