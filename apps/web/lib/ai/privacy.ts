export type GatewayProviderOptions = {
  gateway: {
    zeroDataRetention: true;
  };
};

/**
 * Request-level ZDR is only available on supported Vercel plans.
 * Keep it opt-in so the closed PoC can run on Hobby with synthetic data,
 * then enable it without a code change before real pupil data is allowed.
 */
export function gatewayProviderOptions(
  env: Record<string, string | undefined> = process.env,
): GatewayProviderOptions | undefined {
  return env.MATTIS_AI_ZDR?.trim().toLowerCase() === 'true'
    ? { gateway: { zeroDataRetention: true } }
    : undefined;
}
