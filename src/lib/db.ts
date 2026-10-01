import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const store = globalThis as unknown as { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("缺少环境变量 DATABASE_URL，请参考 .env.example 配置数据库连接");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** 惰性单例，避免构建阶段或未配置数据库时提前建立连接 */
export function getDb(): PrismaClient {
  if (!store.__prisma) store.__prisma = createClient();
  return store.__prisma;
}
