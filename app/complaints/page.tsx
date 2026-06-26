import ComplaintsParser from "@/components/ComplaintsParser";
import PageShell from "@/components/PageShell";

export default function ComplaintsPage() {
  return (
    <PageShell
      title="Обращения правообладателя"
      description="Проверка артикулов, по которым поступило обращение от юриста правообладателя"
    >
      <ComplaintsParser />
    </PageShell>
  );
}
