import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // 允许在没有数据库的环境下执行 prisma generate / validate
    url: process.env.DATABASE_URL ?? "postgresql://record:record@localhost:5432/ashwick?schema=public",
  },
});
