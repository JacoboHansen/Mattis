import { createHmac, timingSafeEqual } from 'node:crypto';

export type BillingStatus =
  | 'inactive'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export type BillingAccount = {
  user_id: string;
  status: BillingStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_base_item_id: string | null;
  stripe_extra_item_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

export type ClientBillingStatus = {
  status: BillingStatus;
  hasAccess: boolean;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

type StripeObject = Record<string, unknown>;

export class BillingConfigurationError extends Error {
  constructor(message = 'Betaling er ikke konfigurert.') {
    super(message);
    this.name = 'BillingConfigurationError';
  }
}

export class BillingAccessError extends Error {
  readonly status = 402;

  constructor(message = 'Aktiver prøveuken for å fortsette med Mattis.') {
    super(message);
    this.name = 'BillingAccessError';
  }
}

function publicSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new BillingConfigurationError('Supabase er ikke konfigurert.');
  return { url, key };
}

function serverSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new BillingConfigurationError(
      'Supabase sin servernøkkel er ikke konfigurert.',
    );
  }
  return { url, key };
}

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw new BillingConfigurationError(
      'Stripe sin servernøkkel er ikke konfigurert.',
    );
  return key;
}

function appUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (!value)
    throw new BillingConfigurationError(
      'Appens offentlige URL er ikke konfigurert.',
    );
  return value.startsWith('http')
    ? value.replace(/\/$/, '')
    : `https://${value}`;
}

function prices() {
  const basePriceId = process.env.STRIPE_BASE_PRICE_ID;
  const extraLearnerPriceId = process.env.STRIPE_EXTRA_LEARNER_PRICE_ID;
  if (!basePriceId || !extraLearnerPriceId) {
    throw new BillingConfigurationError('Stripe-prisene er ikke konfigurert.');
  }
  return { basePriceId, extraLearnerPriceId };
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function messageFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return 'Ukjent feil.';
  const source = payload as Record<string, unknown>;
  const error = source.error;
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return typeof source.message === 'string' ? source.message : 'Ukjent feil.';
}

async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const { url, key } = accessToken
    ? publicSupabaseConfig()
    : serverSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  const payload = await readJson(response);
  if (!response.ok)
    throw new Error(
      `Supabase-feil (${response.status}): ${messageFromPayload(payload)}`,
    );
  return payload as T;
}

export async function getBillingAccount(accessToken: string, userId: string) {
  const payload = await supabaseRequest<BillingAccount[]>(
    `/rest/v1/billing_accounts?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    {},
    accessToken,
  );
  return Array.isArray(payload) ? (payload[0] ?? null) : null;
}

export async function getBillingAccountAdmin(userId: string) {
  const payload = await supabaseRequest<BillingAccount[]>(
    `/rest/v1/billing_accounts?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );
  return Array.isArray(payload) ? (payload[0] ?? null) : null;
}

export async function getBillingAccountByCustomerAdmin(customerId: string) {
  const payload = await supabaseRequest<BillingAccount[]>(
    `/rest/v1/billing_accounts?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`,
  );
  return Array.isArray(payload) ? (payload[0] ?? null) : null;
}

export function isBillingEntitled(account: BillingAccount | null) {
  return account?.status === 'active' || account?.status === 'trialing';
}

export function toClientBillingStatus(
  account: BillingAccount | null,
): ClientBillingStatus {
  const status = account?.status ?? 'inactive';
  return {
    status,
    hasAccess: isBillingEntitled(account),
    trialEnd: account?.trial_end ?? null,
    currentPeriodEnd: account?.current_period_end ?? null,
    cancelAtPeriodEnd: account?.cancel_at_period_end ?? false,
  };
}

export async function requireBillingAccess(
  accessToken: string,
  userId: string,
) {
  const account = await getBillingAccount(accessToken, userId);
  if (!isBillingEntitled(account)) throw new BillingAccessError();
  return account;
}

function encodeFormValue(
  value: unknown,
  prefix: string,
  form: URLSearchParams,
) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      encodeFormValue(item, `${prefix}[${index}]`, form),
    );
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      encodeFormValue(item, `${prefix}[${key}]`, form);
    });
    return;
  }
  form.append(
    prefix,
    typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value),
  );
}

function encodeForm(value: Record<string, unknown>) {
  const form = new URLSearchParams();
  Object.entries(value).forEach(([key, item]) =>
    encodeFormValue(item, key, form),
  );
  return form;
}

async function stripeRequest<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeSecretKey()}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm(body),
  });
  const payload = await readJson(response);
  if (!response.ok)
    throw new Error(
      `Stripe-feil (${response.status}): ${messageFromPayload(payload)}`,
    );
  return payload as T;
}

async function stripeGet<T>(path: string) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    cache: 'no-store',
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeSecretKey()}:`).toString('base64')}`,
    },
  });
  const payload = await readJson(response);
  if (!response.ok)
    throw new Error(
      `Stripe-feil (${response.status}): ${messageFromPayload(payload)}`,
    );
  return payload as T;
}

type StripeCustomer = { id: string };
type StripeCheckoutSession = { id: string; url?: string | null };
type StripePortalSession = { url: string };

async function createCustomer(email: string | undefined, userId: string) {
  return stripeRequest<StripeCustomer>('/customers', {
    ...(email ? { email } : {}),
    metadata: { app_user_id: userId },
  });
}

export async function createCheckoutSession(input: {
  userId: string;
  email?: string;
  learnerCount: number;
  customerId?: string | null;
  onboarding?: boolean;
}) {
  const { basePriceId, extraLearnerPriceId } = prices();
  const customerId =
    input.customerId ?? (await createCustomer(input.email, input.userId)).id;
  const extraLearners = Math.max(0, Math.min(input.learnerCount - 1, 20));
  const lineItems = [
    { price: basePriceId, quantity: 1 },
    ...(extraLearners > 0
      ? [{ price: extraLearnerPriceId, quantity: extraLearners }]
      : []),
  ];
  const baseUrl = appUrl();
  const onboardingParam = input.onboarding ? '&onboarding=1' : '';
  const session = await stripeRequest<StripeCheckoutSession>(
    '/checkout/sessions',
    {
      mode: 'subscription',
      customer: customerId,
      client_reference_id: input.userId,
      // Mattis uses standard Stripe Billing, not Stripe Managed Payments.
      // Explicitly disable it so Checkout does not require product tax codes.
      managed_payments: { enabled: false },
      line_items: lineItems,
      success_url: `${baseUrl}/billing?status=success${onboardingParam}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing?status=cancelled${input.onboarding ? '&onboarding=1' : ''}`,
      billing_address_collection: 'auto',
      payment_method_collection: 'always',
      subscription_data: {
        trial_period_days: 7,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata: { app_user_id: input.userId },
      },
      metadata: { app_user_id: input.userId },
    },
  );
  if (!session.url) throw new Error('Stripe returnerte ingen Checkout-lenke.');
  return { url: session.url, customerId };
}

export async function createCustomerPortalSession(customerId: string) {
  const session = await stripeRequest<StripePortalSession>(
    '/billing_portal/sessions',
    {
      customer: customerId,
      return_url: `${appUrl()}/parent`,
    },
  );
  return session.url;
}

export async function retrieveStripeSubscription(subscriptionId: string) {
  return stripeGet<StripeObject>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

export async function syncExtraLearnerQuantity(
  account: BillingAccount,
  learnerCount: number,
) {
  if (!account.stripe_subscription_id) return;
  const { extraLearnerPriceId } = prices();
  const extraLearners = Math.max(0, Math.min(learnerCount - 1, 20));
  const items: Array<Record<string, unknown>> = [];
  if (account.stripe_extra_item_id) {
    items.push(
      extraLearners > 0
        ? { id: account.stripe_extra_item_id, quantity: extraLearners }
        : { id: account.stripe_extra_item_id, deleted: true },
    );
  } else if (extraLearners > 0) {
    items.push({ price: extraLearnerPriceId, quantity: extraLearners });
  }
  if (!items.length) return;
  await stripeRequest(
    `/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}`,
    {
      items,
      proration_behavior: 'create_prorations',
    },
  );
}

/**
 * Ask Stripe to create an invoice for the extra learner before the learner is
 * created in Mattis. `pending_if_incomplete` keeps the subscription change
 * from becoming effective until the invoice is paid.
 */
export async function requestExtraLearnerPayment(
  account: BillingAccount,
  learnerCount: number,
  pendingLearnerId: string,
) {
  if (!account.stripe_subscription_id) {
    throw new Error('Stripe-abonnementet mangler.');
  }
  const { extraLearnerPriceId } = prices();
  const extraLearners = Math.max(0, Math.min(learnerCount - 1, 20));
  if (extraLearners < 1)
    throw new Error('Det finnes ingen ekstra elev å fakturere.');
  const items: Array<Record<string, unknown>> = account.stripe_extra_item_id
    ? [{ id: account.stripe_extra_item_id, quantity: extraLearners }]
    : [{ price: extraLearnerPriceId, quantity: extraLearners }];
  const subscription = await stripeRequest<StripeObject>(
    `/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}`,
    {
      items,
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
      metadata: { pending_learner_id: pendingLearnerId },
      expand: ['latest_invoice'],
    },
  );
  const invoice =
    subscription.latest_invoice &&
    typeof subscription.latest_invoice === 'object'
      ? (subscription.latest_invoice as StripeObject)
      : null;
  const invoiceId =
    typeof subscription.latest_invoice === 'string'
      ? subscription.latest_invoice
      : typeof invoice?.id === 'string'
        ? invoice.id
        : null;
  return {
    invoiceId,
    paymentUrl:
      typeof invoice?.hosted_invoice_url === 'string'
        ? invoice.hosted_invoice_url
        : null,
    paid: invoice?.status === 'paid',
    subscriptionId:
      typeof subscription.id === 'string'
        ? subscription.id
        : account.stripe_subscription_id,
  };
}

export async function saveBillingAccountAdmin(input: {
  userId: string;
  status?: BillingStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeBaseItemId?: string | null;
  stripeExtraItemId?: string | null;
  currentPeriodEnd?: string | null;
  trialEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const body: Record<string, unknown> = {
    user_id: input.userId,
    updated_at: new Date().toISOString(),
  };
  if (input.status !== undefined) body.status = input.status;
  if (input.stripeCustomerId !== undefined)
    body.stripe_customer_id = input.stripeCustomerId;
  if (input.stripeSubscriptionId !== undefined) {
    body.stripe_subscription_id = input.stripeSubscriptionId;
  }
  if (input.stripeBaseItemId !== undefined)
    body.stripe_base_item_id = input.stripeBaseItemId;
  if (input.stripeExtraItemId !== undefined)
    body.stripe_extra_item_id = input.stripeExtraItemId;
  if (input.currentPeriodEnd !== undefined)
    body.current_period_end = input.currentPeriodEnd;
  if (input.trialEnd !== undefined) body.trial_end = input.trialEnd;
  if (input.cancelAtPeriodEnd !== undefined)
    body.cancel_at_period_end = input.cancelAtPeriodEnd;
  const payload = await supabaseRequest<BillingAccount[]>(
    '/rest/v1/billing_accounts?on_conflict=user_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(body),
    },
  );
  return Array.isArray(payload) ? (payload[0] ?? null) : null;
}

export async function claimStripeEvent(id: string, type: string) {
  const payload = await supabaseRequest<StripeObject[]>(
    '/rest/v1/stripe_webhook_events',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ id, event_type: type }),
    },
  );
  return Array.isArray(payload) && payload.length > 0;
}

export async function releaseStripeEvent(id: string) {
  await supabaseRequest(
    `/rest/v1/stripe_webhook_events?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    },
  );
}

export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
) {
  if (!header) return false;
  const parts = new Map(
    header.split(',').flatMap((part) => {
      const [key, value] = part.split('=', 2);
      return key && value ? [[key, value] as const] : [];
    }),
  );
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (
    !Number.isFinite(timestamp) ||
    !signature ||
    Math.abs(Date.now() / 1000 - timestamp) > 300
  ) {
    return false;
  }
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const received = Buffer.from(signature, 'hex');
  const computed = Buffer.from(expected, 'hex');
  return (
    received.length === computed.length && timingSafeEqual(received, computed)
  );
}

export function stripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
    throw new BillingConfigurationError(
      'Stripe webhook-secret er ikke konfigurert.',
    );
  return secret;
}

export function stripeSubscriptionFields(subscription: StripeObject) {
  const items =
    subscription.items &&
    typeof subscription.items === 'object' &&
    !Array.isArray(subscription.items)
      ? (((subscription.items as StripeObject).data as unknown[] | undefined) ??
        [])
      : [];
  const { basePriceId, extraLearnerPriceId } = prices();
  let baseItemId: string | null = null;
  let extraItemId: string | null = null;
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const source = item as StripeObject;
    const price = source.price;
    const priceId =
      typeof price === 'string'
        ? price
        : price && typeof price === 'object' && !Array.isArray(price)
          ? (price as StripeObject).id
          : null;
    if (typeof source.id !== 'string' || typeof priceId !== 'string') continue;
    if (priceId === basePriceId) baseItemId = source.id;
    if (priceId === extraLearnerPriceId) extraItemId = source.id;
  }
  const timestamp = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value)
      ? new Date(value * 1000).toISOString()
      : null;
  return {
    status: (typeof subscription.status === 'string'
      ? subscription.status
      : 'inactive') as BillingStatus,
    stripeCustomerId:
      typeof subscription.customer === 'string' ? subscription.customer : null,
    stripeSubscriptionId:
      typeof subscription.id === 'string' ? subscription.id : null,
    stripeBaseItemId: baseItemId,
    stripeExtraItemId: extraItemId,
    currentPeriodEnd: timestamp(subscription.current_period_end),
    trialEnd: timestamp(subscription.trial_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
  };
}
