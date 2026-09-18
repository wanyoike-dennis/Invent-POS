import {
  CalendarRange,
  CheckCircle2,
  CreditCard,
  Edit3,
  PackageCheck,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { superAdminFetch } from "../services/api";

type BillingCycle =
  | "monthly"
  | "quarterly"
  | "annual";

type PlanPrice = {
  id: number;
  plan_id: number;
  billing_cycle: BillingCycle;
  amount: number;
  currency?: string;
  is_active: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
};

type PlanFeature = {
  id: number;
  plan_id: number;
  feature_key: string;
  feature_label: string;
  feature_value: string;
  sort_order: number;
};

type SubscriptionPlan = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order?: number;
  prices?: PlanPrice[];
  features?: PlanFeature[];
};

type EditForm = {
  name: string;
  description: string;
  isActive: boolean;
  monthly: string;
  quarterly: string;
  annual: string;
  branchesIncluded: string;
  usersIncluded: string;
  salesInventory: boolean;
  mpesaRecording: boolean;
  customerExpenseTracking: boolean;
  staffRoles: "Basic" | "Advanced";
  multiBranchReports: boolean;
  auditAnalytics: boolean;
  support: "Standard" | "Priority" | "Dedicated";
};

const cycleLabels: Record<BillingCycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

const cycleOrder: BillingCycle[] = [
  "monthly",
  "quarterly",
  "annual",
];

function money(
  amount?: number,
  currency = "KES"
) {
  return `${currency} ${Number(
    amount || 0
  ).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function priceFor(
  plan: SubscriptionPlan,
  cycle: BillingCycle
) {
  return (plan.prices || []).find(
    (price) =>
      price.billing_cycle === cycle &&
      price.is_active
  );
}

function featureFor(
  plan: SubscriptionPlan,
  key: string
) {
  return (
    (plan.features || []).find(
      (feature) =>
        feature.feature_key === key
    )?.feature_value || ""
  );
}

function featureEnabled(
  plan: SubscriptionPlan,
  key: string
) {
  return (
    featureFor(plan, key) === "included"
  );
}

function SuperAdminPlans() {
  const navigate = useNavigate();

  const [plans, setPlans] = useState<
    SubscriptionPlan[]
  >([]);
  const [loading, setLoading] =
    useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] =
    useState("");

  const [editingPlan, setEditingPlan] =
    useState<SubscriptionPlan | null>(
      null
    );
  const [saving, setSaving] =
    useState(false);

  const [editForm, setEditForm] =
    useState<EditForm>({
      name: "",
      description: "",
      isActive: true,
      monthly: "",
      quarterly: "",
      annual: "",
      branchesIncluded: "1",
      usersIncluded: "1",
      salesInventory: true,
      mpesaRecording: true,
      customerExpenseTracking: false,
      staffRoles: "Basic",
      multiBranchReports: false,
      auditAnalytics: false,
      support: "Standard",
    });

  const logout = useCallback(() => {
    localStorage.removeItem(
      "superAdminToken"
    );
    localStorage.removeItem(
      "superAdminUser"
    );
    navigate("/super-admin/login", {
      replace: true,
    });
  }, [navigate]);

  const loadPlans = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response =
          await superAdminFetch(
            "/api/super-admin/plans"
          );

        if (response.status === 401) {
          logout();
          return;
        }

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              "Could not load subscription plans"
          );
        }

        setPlans(
          Array.isArray(data)
            ? data
            : []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load subscription plans."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [logout]
  );

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const activePlans = useMemo(
    () =>
      plans.filter(
        (plan) => plan.is_active
      ).length,
    [plans]
  );

  const activePrices = useMemo(
    () =>
      plans.reduce(
        (total, plan) =>
          total +
          (plan.prices || []).filter(
            (price) =>
              price.is_active
          ).length,
        0
      ),
    [plans]
  );

  const featureRows = useMemo(() => {
    const rows = new Map<string, { label: string; sort_order: number }>();

    plans.forEach((plan) => {
      (plan.features || []).forEach((feature) => {
        if (!rows.has(feature.feature_key)) {
          rows.set(feature.feature_key, {
            label: feature.feature_label,
            sort_order: feature.sort_order,
          });
        }
      });
    });

    return Array.from(rows.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [plans]);

  const featureValue = (plan: SubscriptionPlan, key: string) =>
    (plan.features || []).find((feature) => feature.feature_key === key)
      ?.feature_value || "—";

  const renderFeatureValue = (value: string) => {
    if (value === "included") {
      return (
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
          <CheckCircle2 size={16} /> Included
        </span>
      );
    }

    if (value === "not_included") {
      return <span className="font-semibold text-slate-400">—</span>;
    }

    return <span className="font-semibold text-[#0B1F33]">{value}</span>;
  };

  const openEdit = (
    plan: SubscriptionPlan
  ) => {
    setError("");
    setSuccess("");

    setEditingPlan(plan);

    setEditForm({
      name: plan.name,
      description:
        plan.description || "",
      isActive: plan.is_active,
      monthly: String(
        priceFor(
          plan,
          "monthly"
        )?.amount ?? ""
      ),
      quarterly: String(
        priceFor(
          plan,
          "quarterly"
        )?.amount ?? ""
      ),
      annual: String(
        priceFor(
          plan,
          "annual"
        )?.amount ?? ""
      ),
      branchesIncluded:
        featureFor(
          plan,
          "branches_included"
        ) || "1",
      usersIncluded:
        featureFor(
          plan,
          "users_included"
        ) || "1",
      salesInventory:
        featureEnabled(
          plan,
          "sales_inventory"
        ),
      mpesaRecording:
        featureEnabled(
          plan,
          "mpesa_recording"
        ),
      customerExpenseTracking:
        featureEnabled(
          plan,
          "customer_expense_tracking"
        ),
      staffRoles:
        featureFor(
          plan,
          "staff_roles"
        ) === "Advanced"
          ? "Advanced"
          : "Basic",
      multiBranchReports:
        featureEnabled(
          plan,
          "multi_branch_reports"
        ),
      auditAnalytics:
        featureEnabled(
          plan,
          "audit_analytics"
        ),
      support:
        featureFor(
          plan,
          "support"
        ) === "Dedicated"
          ? "Dedicated"
          : featureFor(
              plan,
              "support"
            ) === "Priority"
          ? "Priority"
          : "Standard",
    });
  };

  const closeEdit = () => {
    if (saving) return;
    setEditingPlan(null);
  };

  const savePlan = async () => {
    if (!editingPlan) return;

    const monthly = Number(
      editForm.monthly
    );
    const quarterly = Number(
      editForm.quarterly
    );
    const annual = Number(
      editForm.annual
    );

    if (!editForm.name.trim()) {
      setError(
        "Plan name is required."
      );
      return;
    }

    if (
      !Number.isFinite(monthly) ||
      monthly <= 0 ||
      !Number.isFinite(quarterly) ||
      quarterly <= 0 ||
      !Number.isFinite(annual) ||
      annual <= 0
    ) {
      setError(
        "Monthly, quarterly and annual prices must all be greater than 0."
      );
      return;
    }

    const branchesIncluded = Number(
      editForm.branchesIncluded
    );
    const usersIncluded = Number(
      editForm.usersIncluded
    );

    if (
      !Number.isInteger(branchesIncluded) ||
      branchesIncluded < 1
    ) {
      setError(
        "Branches included must be a whole number greater than 0."
      );
      return;
    }

    if (
      !Number.isInteger(usersIncluded) ||
      usersIncluded < 1
    ) {
      setError(
        "Users included must be a whole number greater than 0."
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response =
        await superAdminFetch(
          `/api/super-admin/plans/${editingPlan.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              name:
                editForm.name.trim(),
              description:
                editForm.description.trim(),
              isActive:
                editForm.isActive,
              prices: {
                monthly,
                quarterly,
                annual,
              },
              features: {
                branches_included:
                  String(branchesIncluded),
                users_included:
                  String(usersIncluded),
                sales_inventory:
                  editForm.salesInventory
                    ? "included"
                    : "not_included",
                mpesa_recording:
                  editForm.mpesaRecording
                    ? "included"
                    : "not_included",
                customer_expense_tracking:
                  editForm.customerExpenseTracking
                    ? "included"
                    : "not_included",
                staff_roles:
                  editForm.staffRoles,
                multi_branch_reports:
                  editForm.multiBranchReports
                    ? "included"
                    : "not_included",
                audit_analytics:
                  editForm.auditAnalytics
                    ? "included"
                    : "not_included",
                support:
                  editForm.support,
              },
            }),
          }
        );

      if (response.status === 401) {
        logout();
        return;
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not update subscription plan"
        );
      }

      setEditingPlan(null);
      setSuccess(
        `${data.plan?.name || editForm.name} updated successfully.`
      );

      await loadPlans(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update subscription plan."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 py-7 lg:px-8 lg:py-8 xl:px-10">

      <main className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Plan Management
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0B1F33]">
              Subscription Plans
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Configure pricing, plan limits and subscription features across Invent POS.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => loadPlans(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/super-admin/billing")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              <CreditCard size={16} />
              Billing & Revenue
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
            {success}
          </div>
        )}

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <PackageCheck
              size={20}
              className="mb-3 text-blue-600"
            />
            <p className="text-sm text-slate-500">
              Total Plans
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              {plans.length}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <CheckCircle2
              size={20}
              className="mb-3 text-emerald-600"
            />
            <p className="text-sm text-slate-500">
              Active Plans
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              {activePlans}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <CalendarRange
              size={20}
              className="mb-3 text-violet-600"
            />
            <p className="text-sm text-slate-500">
              Active Prices
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              {activePrices}
            </p>
          </article>
        </section>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="text-center">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
              <p className="mt-4 text-sm text-slate-500">
                Loading subscription
                plans...
              </p>
            </div>
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <PackageCheck
              size={34}
              className="mx-auto text-slate-300"
            />
            <p className="mt-3 font-semibold text-slate-700">
              No subscription plans found
            </p>
          </div>
        ) : (
          <section className="grid gap-5 xl:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_6px_22px_rgba(15,23,42,0.05)]"
              >
                <div className="border-b border-slate-100 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-[#0B1F33]">
                          {plan.name}
                        </h2>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                            plan.is_active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-100 text-slate-500"
                          }`}
                        >
                          {plan.is_active
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        {plan.code}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openEdit(plan)
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      <Edit3
                        size={15}
                      />
                      Edit
                    </button>
                  </div>

                  <p className="mt-4 min-h-[44px] text-sm leading-6 text-slate-500">
                    {plan.description ||
                      "No plan description."}
                  </p>
                </div>

                <div className="px-5 py-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    Current Pricing
                  </p>

                  <div className="space-y-2.5">
                    {cycleOrder.map(
                      (cycle) => {
                        const price =
                          priceFor(
                            plan,
                            cycle
                          );

                        return (
                          <div
                            key={cycle}
                            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-700">
                                {
                                  cycleLabels[
                                    cycle
                                  ]
                                }
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {cycle ===
                                "monthly"
                                  ? "Billed every month"
                                  : cycle ===
                                    "quarterly"
                                  ? "Billed every 3 months"
                                  : "Billed every 12 months"}
                              </p>
                            </div>

                            <p className="text-base font-bold text-[#0B1F33]">
                              {price
                                ? money(
                                    price.amount,
                                    price.currency ||
                                      "KES"
                                  )
                                : "—"}
                            </p>
                          </div>
                        );
                      }
                    )}
                  </div>

                  <p className="mt-4 text-xs leading-5 text-slate-400">
                    Existing payment records keep
                    their original amounts. New
                    prices apply to future billing.
                  </p>
                </div>
              </article>
            ))}
          </section>
        )}

        {!loading && plans.length > 0 && featureRows.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_6px_22px_rgba(15,23,42,0.05)]">
            <div className="border-b border-slate-100 px-5 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                Plan Entitlements
              </p>
              <h2 className="mt-1 text-xl font-bold text-[#0B1F33]">
                Features & Limits
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Current database-backed entitlements for Starter, Business and Pro.
                Edit a plan to change its features and limits. POS enforcement will be added separately.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border-b border-slate-200 px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      Feature / Limit
                    </th>
                    {plans.map((plan) => (
                      <th
                        key={plan.id}
                        className="border-b border-slate-200 px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500"
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {featureRows.map((row) => (
                    <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                        {row.label}
                      </td>
                      {plans.map((plan) => (
                        <td key={`${plan.id}-${row.key}`} className="px-5 py-4 text-sm">
                          {renderFeatureValue(featureValue(plan, row.key))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071421]/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                  Edit Subscription Plan
                </p>
                <h3 className="mt-1 text-xl font-bold text-[#0B1F33]">
                  {editingPlan.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Update plan details, official
                  prices, features and limits.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Plan Name
                </label>
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm(
                      (current) => ({
                        ...current,
                        name:
                          e.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={
                    editForm.description
                  }
                  onChange={(e) =>
                    setEditForm(
                      (current) => ({
                        ...current,
                        description:
                          e.target.value,
                      })
                    )
                  }
                  className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={
                      editForm.isActive
                    }
                    onChange={(e) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          isActive:
                            e.target.checked,
                        })
                      )
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />

                  <span>
                    <span className="block text-sm font-semibold text-slate-700">
                      Plan available for billing
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Turning this off prevents
                      this plan from being used
                      as an active official
                      billing option. Existing
                      subscriptions are not
                      deleted.
                    </span>
                  </span>
                </label>
              </div>

              <div>
                <p className="mb-3 text-sm font-bold text-[#0B1F33]">
                  Official Prices
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                  {cycleOrder.map(
                    (cycle) => (
                      <div key={cycle}>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                          {
                            cycleLabels[
                              cycle
                            ]
                          }{" "}
                          (KES)
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={
                            editForm[
                              cycle
                            ]
                          }
                          onChange={(e) =>
                            setEditForm(
                              (
                                current
                              ) => ({
                                ...current,
                                [cycle]:
                                  e.target
                                    .value,
                              })
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <p className="text-sm font-bold text-[#0B1F33]">
                  Features & Limits
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  These values are stored in the plan entitlement database and
                  will become the source of truth when POS enforcement is enabled.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Branches Included
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={editForm.branchesIncluded}
                      onChange={(e) =>
                        setEditForm((current) => ({
                          ...current,
                          branchesIncluded: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Users Included
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={editForm.usersIncluded}
                      onChange={(e) =>
                        setEditForm((current) => ({
                          ...current,
                          usersIncluded: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Staff Roles & Permissions
                    </label>
                    <select
                      value={editForm.staffRoles}
                      onChange={(e) =>
                        setEditForm((current) => ({
                          ...current,
                          staffRoles: e.target.value as "Basic" | "Advanced",
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="Basic">Basic</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Support Level
                    </label>
                    <select
                      value={editForm.support}
                      onChange={(e) =>
                        setEditForm((current) => ({
                          ...current,
                          support: e.target.value as
                            | "Standard"
                            | "Priority"
                            | "Dedicated",
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Priority">Priority</option>
                      <option value="Dedicated">Dedicated</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    ["salesInventory", "Sales, receipts & inventory"],
                    ["mpesaRecording", "M-Pesa payment recording"],
                    ["customerExpenseTracking", "Customer & expense tracking"],
                    ["multiBranchReports", "Multi-branch reports"],
                    ["auditAnalytics", "Audit logs & advanced analytics"],
                  ].map(([field, label]) => (
                    <label
                      key={field}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(
                          editForm[field as keyof EditForm]
                        )}
                        onChange={(e) =>
                          setEditForm((current) => ({
                            ...current,
                            [field]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="text-sm font-semibold text-slate-700">
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-xs leading-5 text-amber-800">
                Changing a price does not
                rewrite historical payment
                records. The previous price is
                closed in the database and the
                new price becomes effective for
                future billing.
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5">
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={savePlan}
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Save size={16} />
                {saving
                  ? "Saving..."
                  : "Save Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminPlans;
