export interface SmsNotificationConfig {
  phone: string;
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: string;
}

export interface EmailNotificationConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
}

export interface NotificationConfig {
  channels: Array<"sms" | "email">;
  sms: SmsNotificationConfig | null;
  email: EmailNotificationConfig | null;
  missingSms: string[];
  missingEmail: string[];
  appUrl: string;
}

function enabled(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

function required(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function parsePort(raw: string | undefined): number {
  const port = Number.parseInt(raw ?? "465", 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 465;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.length > 8 ? `${phone.slice(0, 6)}****${phone.slice(-4)}` : "****";
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@", 2);
  if (!domain) return "***";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function getNotificationConfig(): NotificationConfig {
  const smsFields = [
    ["ALERT_SMS_PHONE", required("ALERT_SMS_PHONE")],
    ["TENCENTCLOUD_SECRET_ID", required("TENCENTCLOUD_SECRET_ID")],
    ["TENCENTCLOUD_SECRET_KEY", required("TENCENTCLOUD_SECRET_KEY")],
    ["TENCENT_SMS_SDK_APP_ID", required("TENCENT_SMS_SDK_APP_ID")],
    ["TENCENT_SMS_SIGN_NAME", required("TENCENT_SMS_SIGN_NAME")],
    ["TENCENT_SMS_TEMPLATE_ID", required("TENCENT_SMS_TEMPLATE_ID")],
  ] as const;
  const missingSms: string[] = smsFields.filter(([, value]) => !value).map(([name]) => name);
  const phone = smsFields[0][1];
  if (phone && !/^\+86\d{11}$/.test(phone)) missingSms.push("ALERT_SMS_PHONE(+861xxxxxxxxxx)");

  const emailFields = [
    ["SMTP_HOST", required("SMTP_HOST")],
    ["SMTP_USER", required("SMTP_USER")],
    ["SMTP_PASS", required("SMTP_PASS")],
    ["ALERT_EMAIL_FROM", required("ALERT_EMAIL_FROM") ?? required("SMTP_USER")],
    ["ALERT_EMAIL_TO", required("ALERT_EMAIL_TO")],
  ] as const;
  const missingEmail: string[] = emailFields.filter(([, value]) => !value).map(([name]) => name);
  const emailTo = emailFields[4][1];
  if (emailTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) missingEmail.push("ALERT_EMAIL_TO(邮箱格式)");

  const sms = enabled(process.env.ALERT_SMS_ENABLED) && missingSms.length === 0 && phone
    ? {
        phone,
        secretId: smsFields[1][1]!,
        secretKey: smsFields[2][1]!,
        sdkAppId: smsFields[3][1]!,
        signName: smsFields[4][1]!,
        templateId: smsFields[5][1]!,
        region: required("TENCENT_SMS_REGION") ?? "ap-guangzhou",
      }
    : null;

  const email = enabled(process.env.ALERT_EMAIL_ENABLED) && missingEmail.length === 0 && emailTo
    ? {
        host: emailFields[0][1]!,
        port: parsePort(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE?.trim().toLowerCase() !== "false",
        user: emailFields[1][1]!,
        pass: emailFields[2][1]!.replace(/\s+/g, ""),
        from: emailFields[3][1]!,
        to: emailTo,
      }
    : null;

  const requested = (process.env.ALERT_CHANNELS ?? "sms,email")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is "sms" | "email" => value === "sms" || value === "email");

  return {
    channels: [...new Set(requested)].filter((channel) => (channel === "sms" ? sms != null : email != null)),
    sms,
    email,
    missingSms,
    missingEmail,
    appUrl: (process.env.ALERT_APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, ""),
  };
}

export function notificationConfigStatus(config = getNotificationConfig()) {
  const rawPhone = required("ALERT_SMS_PHONE");
  const rawEmail = required("ALERT_EMAIL_TO");
  return {
    channels: config.channels,
    sms: { enabled: config.sms != null, recipient: maskPhone(rawPhone), missing: config.missingSms },
    email: { enabled: config.email != null, recipient: maskEmail(rawEmail), missing: config.missingEmail },
    appUrl: config.appUrl,
  };
}
