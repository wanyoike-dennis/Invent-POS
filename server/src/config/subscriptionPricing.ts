export type SubscriptionPlan =
  | "starter"
  | "business"
  | "pro";

export type BillingCycle =
  | "monthly"
  | "quarterly"
  | "annual";

export const SUBSCRIPTION_PRICING: Record<
  SubscriptionPlan,
  Record<BillingCycle, number>
> = {
  starter: {
    monthly: 1000,
    quarterly: 2700,
    annual: 10000,
  },
  business: {
    monthly: 2000,
    quarterly: 5400,
    annual: 20000,
  },
  pro: {
    monthly: 3500,
    quarterly: 9500,
    annual: 35000,
  },
};

export function getSubscriptionPrice(
  plan: SubscriptionPlan,
  cycle: BillingCycle
) {
  return SUBSCRIPTION_PRICING[plan][cycle];
}
