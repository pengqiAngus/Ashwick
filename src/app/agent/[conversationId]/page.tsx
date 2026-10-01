import { notFound } from "next/navigation";
import { AgentChat } from "@/components/agent/agent-chat";
import { getConversationView } from "@/lib/agent/persistence";
import { getSymbol } from "@/lib/binance/symbols";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ conversationId: string }> };

/**
 * 会话页：服务端只读取历史；分析由客户端通过明确的 POST 启动。
 * 页面渲染、预加载与刷新都不会触发模型或行情请求。
 */
export default async function ConversationPage({ params }: Props) {
  const { conversationId } = await params;
  const view = await getConversationView(conversationId);
  if (!view) notFound();
  const symbol = view.currentReport?.symbol ?? view.conversation.currentSymbol;
  let pricePrecision = 2;
  if (symbol) {
    const info = await getSymbol(symbol).catch(() => null);
    if (info) pricePrecision = info.pricePrecision;
  }
  return <AgentChat key={view.conversation.id} initialView={view} pricePrecision={pricePrecision} />;
}
