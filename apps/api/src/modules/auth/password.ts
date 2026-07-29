import argon2 from "argon2";

export const argon2idOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export interface PasswordVerifier {
  // eslint-disable-next-line no-unused-vars -- Concrete implementations receive the stored hash and submitted password.
  verify(hash: string, password: string): Promise<boolean>;
}

// This is a fixed, valid Argon2id PHC value generated with argon2idOptions.
// It lets failed lookups and disabled users consume the same verification work.
export const dummyPasswordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$U/HabkDrfN44K8f8wgHLP4tucVFX1v5lK6mAPSmMdBE";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argon2idOptions);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export const argon2PasswordVerifier: PasswordVerifier = {
  verify: verifyPassword,
};
