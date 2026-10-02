import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import {
  claimUnownedRepositories,
  createUser,
  getUserByEmail,
  markEmailVerified
} from "./auth.persistence.js";
import { hashPassword } from "./auth.crypto.js";

export async function ensureBootstrapAccount(): Promise<void> {
  const email = env.AUTOPSY_BOOTSTRAP_EMAIL;
  const password = env.AUTOPSY_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    return;
  }

  let user = await getUserByEmail(email);

  if (!user) {
    user = await createUser(
      randomUUID(),
      email,
      await hashPassword(password)
    );

    console.log(`✓ Bootstrap account created for ${user.email}`);
  }

  await markEmailVerified(user.id);

  const claimed = await claimUnownedRepositories(user.id);

  if (claimed > 0) {
    console.log(
      `✓ Claimed ${claimed} legacy repository record(s) for ${user.email}`
    );
  }
}
