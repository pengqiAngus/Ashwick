import { SymbolSearch } from "@/components/search/symbol-search";
import { TextRevealCard } from "@/components/ui/text-reveal-card";

const LINE = "我们终将化为灰烬，所以请把杠杆拉满！！！";

export default function HomePage() {
  return (
    <section className="flex flex-1 flex-col items-center px-4 pt-[clamp(4rem,16vh,10rem)] pb-16">
      <div className="flex w-full max-w-200 flex-col gap-8 items-center">
        <TextRevealCard text={LINE} revealText={LINE} className="w-full" />
        <div className="w-full sm:w-[unset]">
          <h1 className="sr-only">搜索加密货币交易对</h1>
          <SymbolSearch />
        </div>
      </div>
    </section>
  );
}
