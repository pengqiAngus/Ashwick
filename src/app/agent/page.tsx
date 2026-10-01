import { AgentEmpty } from "@/components/agent/agent-empty";
import { loadAgentSettings } from "@/lib/agent/settings";
import { isModelConfigured } from "@/lib/agent/provider";

export const dynamic = "force-dynamic";

/** 空白会话入口：页面渲染不触发任何分析 */
export default async function AgentPage() {
  await loadAgentSettings();
  return <AgentEmpty modelConfigured={isModelConfigured()} />;
}
