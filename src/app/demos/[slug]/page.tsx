import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoExperience } from "@/components/demo-experience";
import { DEMOS, getDemo } from "@/lib/catalog";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return DEMOS.map((demo) => ({ slug: demo.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const demo = getDemo(slug);
  if (!demo) return { title: "Demo" };
  return { title: demo.title, description: demo.summary };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  if (!getDemo(slug)) notFound();
  return <DemoExperience slug={slug} />;
}
