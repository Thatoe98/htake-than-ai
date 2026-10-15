// Creates the first CEO account (before anyone can sign in to create others).
// Usage: npm run seed -- <username> "<Full Name>" <temporary-password>
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { users } from "../src/db/schema";
import { auth, syntheticEmail } from "../src/lib/auth";

async function main() {
  const [username, name, password] = process.argv.slice(2);
  if (!username || !name || !password) {
    console.error('Usage: npm run seed -- <username> "<Full Name>" <temporary-password>');
    process.exitCode = 1;
    return;
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.toLowerCase()));
  if (existing.length) {
    console.log(`User "${username}" already exists, nothing to do.`);
    return;
  }

  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      name,
      email: syntheticEmail(username),
      emailVerified: true,
      username: username.toLowerCase(),
      displayUsername: username,
      role: "ceo",
      mustChangePassword: true,
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });

  console.log(`Created CEO "${username}" (${user.id}). They must change the password at first login.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
