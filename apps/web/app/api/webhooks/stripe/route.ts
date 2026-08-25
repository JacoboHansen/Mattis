import {
  getBillingAccountByCustomerAdmin,
  releaseStripeEvent,
  retrieveStripeSubscription,
  saveBillingAccountAdmin,
  stripeSubscriptionFields,
  stripeWebhookSecret,
  verifyStripeSignature,
  claimStripeEvent,
} from '../../../../lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  data?: { object?: unknown };
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metadataUserId(value: unknown) {
  const source = record(value);
  const metadata = record(source?.metadata);
  const userId = metadata?.app_user_id;
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
}

function customerId(value: unknown) {
  const source = record(value);
  const customer = source?.customer;
  if (typeof customer === 'string') return customer;
  const nested = record(customer);
  return typeof nested?.id === 'string' ? nested.id : null;
}

async function syncSubscription(subscription: Record<string, unknown>, knownUserId?: string | null) {
  const fields = stripeSubscriptionFields(subscription);
  const customer = fields.stripeCustomerId;
  const account = knownUserId
    ? null
    : customer
      ? await getBillingAccountByCustomerAdmin(customer)
      : null;
  const userId = knownUserId ?? account?.user_id;
  if (!userId) throw new Error('Stripe-abonnementet kunne ikke knyttes til en foreldrebruker.');
  await saveBillingAccountAdmin({ userId, ...fields });
}

async function processEvent(event: StripeEvent) {
  const eventType = typeof event.type === 'string' ? event.type : '';
  const object = event.data?.object;
  const source = record(object);
  if (!source) return;

  if (eventType === 'checkout.session.completed') {
    const subscriptionId = source.subscription;
    if (typeof subscriptionId !== 'string') return;
    const subscription = await retrieveStripeSubscription(subscriptionId);
    await syncSubscription(subscription, metadataUserId(source));
    return;
  }

  if (
    eventType === 'customer.subscription.created' ||
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.deleted'
  ) {
    await syncSubscription(source, metadataUserId(source));
    return;
  }

  if (eventType === 'invoice.paid' || eventType === 'invoice.payment_failed') {
    const subscriptionId = source.subscription;
    if (typeof subscriptionId !== 'string') return;
    const subscription = await retrieveStripeSubscription(subscriptionId);
    await syncSubscription(subscription, metadataUserId(source));
    return;
  }
}

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'), stripeWebhookSecret())) {
    return json({ error: 'Ugyldig Stripe-signatur.' }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return json({ error: 'Webhook-payloaden er ugyldig.' }, 400);
  }

  const eventId = typeof event.id === 'string' ? event.id : '';
  const eventType = typeof event.type === 'string' ? event.type : '';
  if (!eventId || !eventType) return json({ error: 'Webhook-eventet mangler ID eller type.' }, 400);

  let claimed = false;
  try {
    claimed = await claimStripeEvent(eventId, eventType);
    if (!claimed) return json({ received: true, duplicate: true });
    await processEvent(event);
    return json({ received: true });
  } catch (error) {
    if (claimed) await releaseStripeEvent(eventId).catch(() => undefined);
    console.error('Stripe webhook failed', {
      eventId,
      eventType,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'Webhooken kunne ikke behandles.' }, 500);
  }
}
