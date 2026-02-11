// Helper functions for consistent password handling 

const hashPassword = (password: string): Promise<string> => {
  return Bun.password.hash(password);
};

const verifyPassword = async (
  password: string,
  hash: string
): Promise<{ isValid: boolean; needsRehash: boolean }> => {
  // Check if this is an Argon2id hash (starts with $argon2)
  if (hash.startsWith('$argon2')) {
    const isValid = await Bun.password.verify(password, hash);
    return { isValid, needsRehash: false };
  }

  // Legacy single-SHA256 hash (password from client is already SHA256'd)
  const isLegacyHash = hash === password;

  return {
    isValid: isLegacyHash,
    needsRehash: isLegacyHash
  };
};

export { hashPassword, verifyPassword };
