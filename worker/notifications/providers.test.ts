import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailNotificationConfig } from "@worker/notifications/config";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));

import { sendEmail } from "@worker/notifications/providers";

const config: EmailNotificationConfig = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  user: "sender@example.com",
  pass: "test-password",
  from: "sender@example.com",
  to: "recipient@example.com",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue({ address: "192.0.2.1", family: 4 });
  mocks.sendMail.mockResolvedValue({ messageId: "message-1" });
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
});

describe("sendEmail", () => {
  it.each([{ port: 465, secure: true }, { port: 587, secure: false }])(
    "connects using IPv4 while preserving the TLS hostname on port $port",
    async ({ port, secure }) => {
      const result = await sendEmail({ ...config, port, secure }, "subject", "body");
      expect(mocks.lookup).toHaveBeenCalledWith("smtp.gmail.com", { family: 4 });
      expect(mocks.createTransport).toHaveBeenCalledWith({
        host: "192.0.2.1",
        port,
        secure,
        tls: { servername: "smtp.gmail.com" },
        auth: { user: config.user, pass: config.pass },
      });
      expect(mocks.sendMail).toHaveBeenCalledWith({ from: config.from, to: config.to, subject: "subject", text: "body" });
      expect(result.providerMessageId).toBe("message-1");
      expect(mocks.close).toHaveBeenCalledOnce();
    },
  );

  it("closes the transport when sending fails", async () => {
    mocks.sendMail.mockRejectedValue(new Error("send failed"));
    await expect(sendEmail(config, "subject", "body")).rejects.toThrow("send failed");
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("does not send when IPv4 resolution fails", async () => {
    mocks.lookup.mockRejectedValue(new Error("DNS failed"));
    await expect(sendEmail(config, "subject", "body")).rejects.toThrow("DNS failed");
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
});
