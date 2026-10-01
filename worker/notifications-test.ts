import "dotenv/config";

import { getNotificationConfig } from "@worker/notifications/config";
import { buildAlertMessage } from "@worker/notifications/message";
import { sendEmail, sendSms } from "@worker/notifications/providers";

async function main() {
  const config = getNotificationConfig();
  if (config.channels.length === 0) throw new Error("没有完整配置任何通知渠道，请检查 Railway Variables");
  const message = buildAlertMessage({
    symbol: "TESTUSDT",
    baseAsset: "TEST",
    quoteAsset: "USDT",
    price: "123.45",
    low: "120",
    high: "130",
    triggeredAt: new Date(),
    appUrl: config.appUrl,
  });
  if (config.sms) {
    await sendSms(config.sms, message.smsParams);
    console.log("[notifications] 测试短信发送成功");
  }
  if (config.email) {
    await sendEmail(config.email, `测试｜${message.subject}`, `这是一封 Ashwick 测试提醒。\n\n${message.text}`);
    console.log("[notifications] 测试邮件发送成功");
  }
}

main().catch((error) => {
  console.error("[notifications] 测试发送失败:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
