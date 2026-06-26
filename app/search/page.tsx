import KeywordSearchTab from "@/components/KeywordSearchTab";
import PageShell from "@/components/PageShell";

export default function SearchPage() {
  return (
    <PageShell
      title="Поиск ИП / ТОО"
      description="Поиск всех продавцов по ключевым словам с юридическими названиями"
    >
      <KeywordSearchTab />
    </PageShell>
  );
}
