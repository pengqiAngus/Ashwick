import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type { EmailNotificationConfig, SmsNotificationConfig } from "@worker/notifications/config";

export interface ProviderResult {
  providerMessageId?: string;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: crypto.BinaryLike, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function utcDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export async function sendSms(config: SmsNotificationConfig, params: string[]): Promise<ProviderResult> {
  const host = "sms.tencentcloudapi.com";
  const service = "sms";
  const action = "SendSms";
  const version = "2021-01-11";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = utcDate(timestamp);
  const body = JSON.stringify({
    SmsSdkAppId: config.sdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: params,
    PhoneNumberSet: [config.phone],
  });
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(body)}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`;
  const secretDate = hmac(`TC3${config.secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign).digest("hex");
  const authorization = `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": config.region,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => null)) as {
    Response?: { Error?: { Code?: string; Message?: string }; RequestId?: string; SendStatusSet?: Array<{ Code?: string; Message?: string; SerialNo?: string }> };
  } | null;
  const result = json?.Response;
  if (!response.ok || result?.Error) throw new Error(`腾讯云短信失败：${result?.Error?.Message ?? `HTTP ${response.status}`}`);
  const status = result?.SendStatusSet?.[0];
  if (!status || status.Code !== "Ok") throw new Error(`腾讯云短信失败：${status?.Message ?? "未知错误"}`);
  return { providerMessageId: status.SerialNo ?? result?.RequestId };
}

export async function sendEmail(config: EmailNotificationConfig, subject: string, text: string): Promise<ProviderResult> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  try {
    const info = await transport.sendMail({ from: config.from, to: config.to, subject, text });
    return { providerMessageId: info.messageId };
  } finally {
    transport.close();
  }
}
