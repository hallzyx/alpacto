/** Deterministic local demo smart-account address (not on-chain). */
export function demoSmartAccountAddress(seed: string): `0x${string}` {
  let h0 = 2166136261;
  let h1 = 2166136261 ^ 0x9e3779b9;
  const input = `alpacto-demo:${seed}`;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 16777619);
    h1 = Math.imul(h1 ^ (c + i), 16777619);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const body = (hex(h0) + hex(h1) + hex(h0 ^ h1) + hex(~h1) + hex(h0 + h1)).slice(0, 40);
  return `0x${body}`;
}
