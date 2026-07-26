import { notFound } from "next/navigation";
import { TemplateMapper } from "@/components/editor/template-mapper";
import { TemplateProcessing } from "@/components/editor/template-processing";
import { getTemplateEditorData } from "@/lib/templates";

export default async function SystemTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await getTemplateEditorData(id);
  if (!template) notFound();
  if (["pending", "processing", "failed"].includes(template.catalogStatus)) {
    return <TemplateProcessing template={template} />;
  }
  return <TemplateMapper initialTemplate={template} />;
}
