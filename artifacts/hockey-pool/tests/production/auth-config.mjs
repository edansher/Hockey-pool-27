// Shared guard for both the build and browser. Never log the key or use a
// live tenant. No secret key, Clerk admin API, or account credentials are used.
export function developmentAuth() {
  const key = process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key?.startsWith('pk_test_')) {
    throw new Error('Production smoke requires a development pk_test Clerk publishable key.');
  }
  const host = Buffer.from(key.slice('pk_test_'.length), 'base64').toString().replace(/\$$/, '');
  if (!/^[a-z0-9-]+\.clerk\.accounts\.dev$/.test(host)) {
    throw new Error('Production smoke requires a matching Clerk development frontend host.');
  }
  return { host, origin: `https://${host}` };
}