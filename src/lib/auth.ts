import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { db } from "../db";
import * as schema from "../db/schema";

/** Accounts are created by the CEO with a username; Better Auth still wants an email. */
export const syntheticEmail = (name: string) => `${name.toLowerCase()}@users.htake.local`;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  user: {
    modelName: "users",
    additionalFields: {
      teamId: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, defaultValue: "my", input: true },
      mustChangePassword: { type: "boolean", required: false, defaultValue: true, input: false },
      noticeAcceptedAt: { type: "date", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // accounts are admin-created only (A-1)
    minPasswordLength: 8,
  },
  advanced: {
    database: { generateId: "uuid" },
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
  plugins: [
    username(),
    admin({
      roles: { ceo: adminAc, content_writer: userAc, employee: userAc },
      adminRoles: ["ceo"],
      defaultRole: "employee",
    }),
    nextCookies(), // keep last
  ],
});

export type Session = typeof auth.$Infer.Session;
