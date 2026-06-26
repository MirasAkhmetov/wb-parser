import SellerParser from "@/components/SellerParser";
import PageShell from "@/components/PageShell";

export default function HomePage() {
  return (
    <PageShell
      title="Парсер продавца"
      description="Вставьте ссылку на продавца, получите все товары и скачайте Excel"
    >
      <SellerParser />
    </PageShell>
  );
}
