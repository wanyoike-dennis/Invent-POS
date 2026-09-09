import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCircle2,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { superAdminFetch } from "../services/api";
import { getSubscriptionPrice, type BillingCycle, type SubscriptionPlan } from "../config/subscriptionPricing";

type OrganizationStatus =
  | "active"
  | "trial"
  | "suspended"
  | "expired";

type Organization = {
  id: number;
  name: string;
  slug: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  currency?: string | null;
  status: OrganizationStatus;
  trial_ends_at?: string | null;
  subscription_expires_at?: string | null;
  subscription_plan?: string | null;
  billing_cycle?: string | null;
  user_count?: number;
  active_user_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

type OrganizationUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: number;
  created_at?: string | null;
};

type SubscriptionPayment = {
  id: number;
  plan?: string | null;
  billing_cycle?: string | null;
  amount: number;
  payment_method?: string | null;
  payment_reference?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

const statusStyle: Record<
  OrganizationStatus,
  string
> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700",
  trial:
    "border-blue-200 bg-blue-50 text-blue-700",
  suspended:
    "border-amber-200 bg-amber-50 text-amber-700",
  expired:
    "border-rose-200 bg-rose-50 text-rose-700",
};

function SuperAdminOrganizationDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const organizationId = Number(id);

  const [organization, setOrganization] =
    useState<Organization | null>(null);
  const [users, setUsers] =
    useState<OrganizationUser[]>([]);
  const [payments, setPayments] =
    useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] =
    useState<OrganizationStatus>("active");
  const [trialEndsAt, setTrialEndsAt] =
    useState("");
  const [
    subscriptionExpiresAt,
    setSubscriptionExpiresAt,
  ] = useState("");

  const [showBilling, setShowBilling] =
    useState(false);
  const [recordingPayment, setRecordingPayment] =
    useState(false);
  const [paymentForm, setPaymentForm] =
    useState({
      plan: "starter",
      billingCycle: "monthly",
      amount: "1000",
      paymentMethod: "mpesa",
      paymentReference: "",
      allowPriceOverride: false,
      priceOverrideReason: "",
      periodStart: new Date()
        .toISOString()
        .slice(0, 10),
      periodEnd: "",
    });

  const formatDate = (
    value?: string | null
  ) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString(
      "en-KE",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      }
    );
  };

  const toDateInput = (
    value?: string | null
  ) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date
      .toISOString()
      .slice(0, 10);
  };

  const formatPaymentMethod = (
    value?: string | null
  ) => {
    const method = String(
      value || ""
    ).toLowerCase();

    if (method === "mpesa") {
      return "M-Pesa";
    }

    return value
      ? value.charAt(0).toUpperCase() +
          value.slice(1)
      : "—";
  };

  const calculatePeriodEnd = (
    periodStart: string,
    billingCycle: string
  ) => {
    if (!periodStart) return "";

    const start = new Date(
      `${periodStart}T00:00:00`
    );

    if (Number.isNaN(start.getTime())) {
      return "";
    }

    const end = new Date(start);

    if (billingCycle === "monthly") {
      end.setMonth(end.getMonth() + 1);
    } else if (
      billingCycle === "quarterly"
    ) {
      end.setMonth(end.getMonth() + 3);
    } else if (
      billingCycle === "annual"
    ) {
      end.setFullYear(
        end.getFullYear() + 1
      );
    } else {
      return "";
    }

    end.setDate(end.getDate() - 1);

    const year = end.getFullYear();
    const month = String(
      end.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
      end.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const openBilling = () => {
    if (!organization) return;

    const periodStart = new Date()
      .toISOString()
      .slice(0, 10);

    const billingCycle =
      organization.billing_cycle ||
      "monthly";

    setPaymentForm({
      plan:
        organization.subscription_plan ||
        "starter",
      billingCycle,
      amount: String(
        getSubscriptionPrice(
          (organization.subscription_plan ||
            "starter") as SubscriptionPlan,
          billingCycle as BillingCycle
        )
      ),
      paymentMethod: "mpesa",
      paymentReference: "",
      allowPriceOverride: false,
      priceOverrideReason: "",
      periodStart,
      periodEnd:
        calculatePeriodEnd(
          periodStart,
          billingCycle
        ),
    });

    setShowBilling(true);
  };

  const recordPayment = async () => {
    if (!organization) return;

    const amount = Number(
      paymentForm.amount
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError(
        "Enter a valid payment amount."
      );
      return;
    }

    if (
      !paymentForm.periodStart ||
      !paymentForm.periodEnd
    ) {
      setError(
        "Payment period start and end dates are required."
      );
      return;
    }

    try {
      setRecordingPayment(true);
      setError("");

      const response =
        await superAdminFetch(
          `/api/super-admin/organizations/${organization.id}/subscription-payments`,
          {
            method: "POST",
            body: JSON.stringify({
              plan: paymentForm.plan,
              billingCycle:
                paymentForm.billingCycle,
              amount,
              paymentMethod:
                paymentForm.paymentMethod,
              paymentReference:
                paymentForm.paymentReference ||
                null,
              allowPriceOverride:
                paymentForm.allowPriceOverride,
              priceOverrideReason:
                paymentForm.priceOverrideReason ||
                null,
              periodStart:
                paymentForm.periodStart,
            }),
          }
        );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not record payment"
        );
      }

      setShowBilling(false);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not record payment."
      );
    } finally {
      setRecordingPayment(false);
    }
  };

  const loadData = useCallback(
    async () => {
      if (
        !Number.isInteger(
          organizationId
        ) ||
        organizationId <= 0
      ) {
        setError(
          "Invalid organization ID."
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const [
          organizationResponse,
          usersResponse,
          paymentsResponse,
        ] = await Promise.all([
          superAdminFetch(
            `/api/super-admin/organizations/${organizationId}`
          ),
          superAdminFetch(
            `/api/super-admin/organizations/${organizationId}/users`
          ),
          superAdminFetch(
            `/api/super-admin/organizations/${organizationId}/subscription-payments`
          ),
        ]);

        const organizationData =
          await organizationResponse.json();
        const usersData =
          await usersResponse.json();
        const paymentsData =
          await paymentsResponse.json();

        if (!organizationResponse.ok) {
          throw new Error(
            organizationData.message ||
              "Could not load organization"
          );
        }

        if (!usersResponse.ok) {
          throw new Error(
            usersData.message ||
              "Could not load organization users"
          );
        }

        if (!paymentsResponse.ok) {
          throw new Error(
            paymentsData.message ||
              "Could not load subscription payments"
          );
        }

        setOrganization(
          organizationData
        );
        setUsers(
          Array.isArray(usersData)
            ? usersData
            : []
        );
        setPayments(
          Array.isArray(paymentsData)
            ? paymentsData
            : []
        );

        setStatus(
          organizationData.status ||
            "active"
        );
        setTrialEndsAt(
          toDateInput(
            organizationData.trial_ends_at
          )
        );
        setSubscriptionExpiresAt(
          toDateInput(
            organizationData.subscription_expires_at
          )
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load organization details."
        );
      } finally {
        setLoading(false);
      }
    },
    [organizationId]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveAccess = async () => {
    if (!organization) return;

    try {
      setSaving(true);
      setError("");

      const response =
        await superAdminFetch(
          `/api/super-admin/organizations/${organization.id}/access`,
          {
            method: "PUT",
            body: JSON.stringify({
              status,
              trialEndsAt:
                trialEndsAt || null,
              subscriptionExpiresAt:
                subscriptionExpiresAt ||
                null,
            }),
          }
        );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Could not update organization access"
        );
      }

      await loadData();
    } catch (err) {
      // Keep the UI aligned with the real server state when an
      // invalid lifecycle transition is rejected.
      setStatus(organization.status);
      setTrialEndsAt(
        toDateInput(
          organization.trial_ends_at
        )
      );
      setSubscriptionExpiresAt(
        toDateInput(
          organization.subscription_expires_at
        )
      );

      setError(
        err instanceof Error
          ? err.message
          : "Could not update organization access."
      );
    } finally {
      setSaving(false);
    }
  };

  const totalPaid = useMemo(
    () =>
      payments.reduce(
        (sum, payment) =>
          sum +
          Number(
            payment.amount || 0
          ),
        0
      ),
    [payments]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="mt-4 text-sm text-slate-500">
            Loading organization...
          </p>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen bg-[#F5F7FB] p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error ||
            "Organization not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
          <button
            onClick={() =>
              navigate(
                "/super-admin/dashboard"
              )
            }
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            <ArrowLeft size={17} />
            Dashboard
          </button>

          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <section className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B1F33] text-white">
                <Building2 size={22} />
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600">
                  Organization Account
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[#0B1F33]">
                    {organization.name}
                  </h1>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${
                      statusStyle[
                        organization.status
                      ]
                    }`}
                  >
                    {organization.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {organization.email ||
                    organization.slug}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openBilling}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <WalletCards size={16} />
                Record Payment
              </button>

            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <Users className="mb-3 text-blue-600" size={21} />
            <p className="text-sm text-slate-500">
              Users
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              {organization.active_user_count ??
                0}{" "}
              active
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {organization.user_count ??
                0}{" "}
              total accounts
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <CreditCard className="mb-3 text-emerald-600" size={21} />
            <p className="text-sm text-slate-500">
              Current Plan
            </p>
            <p className="mt-1 text-2xl font-bold capitalize text-[#0B1F33]">
              {organization.subscription_plan ||
                "No plan"}
            </p>
            <p className="mt-1 text-xs capitalize text-slate-400">
              {organization.billing_cycle ||
                "No billing cycle"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <CalendarDays className="mb-3 text-violet-600" size={21} />
            <p className="text-sm text-slate-500">
              {organization.status === "trial"
                ? "Trial Ends"
                : "Subscription Expiry"}
            </p>
            <p className="mt-1 text-xl font-bold text-[#0B1F33]">
              {formatDate(
                organization.status === "trial"
                  ? organization.trial_ends_at
                  : organization.subscription_expires_at
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <CheckCircle2 className="mb-3 text-emerald-600" size={21} />
            <p className="text-sm text-slate-500">
              Total Payments
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0B1F33]">
              KES{" "}
              {totalPaid.toLocaleString(
                "en-KE",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-[#0B1F33]">
              Business Information
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <Phone size={15} />
                  Phone
                </div>
                <p className="mt-2 font-semibold text-slate-700">
                  {organization.phone ||
                    "—"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <Mail size={15} />
                  Email
                </div>
                <p className="mt-2 break-all font-semibold text-slate-700">
                  {organization.email ||
                    "—"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <MapPin size={15} />
                  Address
                </div>
                <p className="mt-2 font-semibold text-slate-700">
                  {organization.address ||
                    "—"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-[#0B1F33]">
              Access Management
            </h2>

            <div className="mt-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    "active",
                    "trial",
                    "suspended",
                    "expired",
                  ] as OrganizationStatus[]
                ).map((option) => {
                  const activeLocked =
                    option === "active" &&
                    organization.status !==
                      "active";

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={activeLocked}
                      onClick={() =>
                        setStatus(option)
                      }
                      title={
                        activeLocked
                          ? "Use Record Payment to activate this organization"
                          : undefined
                      }
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold capitalize transition ${
                        status === option
                          ? statusStyle[
                              option
                            ]
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      } ${
                        activeLocked
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70 hover:bg-slate-100"
                          : ""
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              {organization.status !==
                "active" && (
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-xs font-medium text-blue-700">
                  Active accounts are created through
                  Record Payment so the plan, billing
                  cycle and subscription period remain
                  consistent.
                </div>
              )}

              <div className="mt-4">
                {status === "trial" ? (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Trial End Date
                    </label>
                    <input
                      type="date"
                      value={trialEndsAt}
                      onChange={(e) =>
                        setTrialEndsAt(
                          e.target.value
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                    />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-slate-400">
                        Current Plan
                      </p>
                      <p className="mt-1 text-sm font-semibold capitalize text-slate-700">
                        {organization.subscription_plan ||
                          "No plan"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                      <p className="text-xs font-medium text-slate-400">
                        Subscription Expiry
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {formatDate(
                          organization.subscription_expires_at
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={saveAccess}
                className="mt-4 w-full rounded-xl bg-[#0B1F33] px-4 py-3 text-sm font-semibold text-white hover:bg-[#102A45] disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : "Save Access Changes"}
              </button>
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[#0B1F33]">
                Organization Users
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Account metadata only.
              </p>
            </div>

            <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
              {users.length} users
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">
                    User
                  </th>
                  <th className="px-3 py-3">
                    Role
                  </th>
                  <th className="px-3 py-3">
                    Status
                  </th>
                  <th className="px-3 py-3">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <UserCircle2
                          size={28}
                          className="text-slate-300"
                        />
                        <div>
                          <p className="font-semibold text-slate-700">
                            {user.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="capitalize text-sm font-semibold text-slate-600">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {Number(
                        user.is_active
                      ) === 1 ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-sm text-slate-500">
                      {formatDate(
                        user.created_at
                      )}
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-10 text-center text-sm text-slate-500"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[#0B1F33]">
                Subscription Payment History
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Platform billing records for this organization.
              </p>
            </div>

            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              {payments.length} records
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xl font-bold text-[#0B1F33]">
                      KES{" "}
                      {Number(
                        payment.amount || 0
                      ).toLocaleString(
                        "en-KE",
                        {
                          minimumFractionDigits:
                            2,
                          maximumFractionDigits:
                            2,
                        }
                      )}
                    </p>
                    <p className="mt-1 text-sm capitalize text-slate-500">
                      {payment.plan ||
                        "—"}{" "}
                      ·{" "}
                      {payment.billing_cycle ||
                        "—"}
                    </p>
                  </div>

                  <div className="text-sm text-slate-500">
                    {formatDate(
                      payment.paid_at ||
                        payment.created_at
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-400">
                      Period
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {formatDate(
                        payment.period_start
                      )}{" "}
                      –{" "}
                      {formatDate(
                        payment.period_end
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Method
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {formatPaymentMethod(
                        payment.payment_method
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">
                      Reference
                    </p>
                    <p className="mt-1 break-all text-sm font-semibold text-slate-700">
                      {payment.payment_reference ||
                        "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {payments.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
                <CreditCard
                  size={30}
                  className="mx-auto text-slate-300"
                />
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  No subscription payments yet
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-[#0B1F33]">
            Account Dates
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3.5">
              <Clock3
                size={17}
                className="text-slate-400"
              />
              <p className="mt-3 text-xs text-slate-400">
                Created
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {formatDate(
                  organization.created_at
                )}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <ShieldCheck
                size={17}
                className="text-slate-400"
              />
              <p className="mt-3 text-xs text-slate-400">
                Trial Ends
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {formatDate(
                  organization.trial_ends_at
                )}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              {organization.status ===
              "expired" ? (
                <XCircle
                  size={17}
                  className="text-rose-500"
                />
              ) : organization.status ===
                "suspended" ? (
                <ShieldAlert
                  size={17}
                  className="text-amber-500"
                />
              ) : (
                <CheckCircle2
                  size={17}
                  className="text-emerald-500"
                />
              )}

              <p className="mt-3 text-xs text-slate-400">
                Last Updated
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {formatDate(
                  organization.updated_at
                )}
              </p>
            </div>
          </div>
        </section>
      </main>

      {showBilling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071421]/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">
                  Subscription Billing
                </p>
                <h3 className="mt-1 text-xl font-bold text-[#0B1F33]">
                  {organization.name}
                </h3>
              </div>

              <button
                onClick={() =>
                  setShowBilling(false)
                }
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <XCircle size={19} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Plan
                  </label>
                  <select
                    value={paymentForm.plan}
                    onChange={(e) =>
                      setPaymentForm(
                        (current) => {
                          const nextPlan =
                            e.target.value as SubscriptionPlan;

                          return {
                            ...current,
                            plan: nextPlan,
                            amount:
                              current.allowPriceOverride
                                ? current.amount
                                : String(
                                    getSubscriptionPrice(
                                      nextPlan,
                                      current.billingCycle as BillingCycle
                                    )
                                  ),
                          };
                        }
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="starter">
                      Starter
                    </option>
                    <option value="business">
                      Business
                    </option>
                    <option value="pro">
                      Pro
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Billing Cycle
                  </label>
                  <select
                    value={
                      paymentForm.billingCycle
                    }
                    onChange={(e) =>
                      setPaymentForm(
                        (current) => {
                          const nextCycle =
                            e.target.value;

                          return {
                            ...current,
                            billingCycle:
                              nextCycle,
                            amount:
                              current.allowPriceOverride
                                ? current.amount
                                : String(
                                    getSubscriptionPrice(
                                      current.plan as SubscriptionPlan,
                                      nextCycle as BillingCycle
                                    )
                                  ),
                            periodEnd:
                              calculatePeriodEnd(
                                current.periodStart,
                                nextCycle
                              ),
                          };
                        }
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="monthly">
                      Monthly
                    </option>
                    <option value="quarterly">
                      Quarterly
                    </option>
                    <option value="annual">
                      Annual
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Amount (KES)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.amount}
                  readOnly={
                    !paymentForm.allowPriceOverride
                  }
                  onChange={(e) =>
                    setPaymentForm(
                      (current) => ({
                        ...current,
                        amount:
                          e.target.value,
                      })
                    )
                  }
                  className={`w-full rounded-xl border border-slate-300 px-4 py-3 text-sm ${
                    paymentForm.allowPriceOverride
                      ? "bg-white"
                      : "bg-slate-50 text-slate-700"
                  }`}
                />

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={
                        paymentForm.allowPriceOverride
                      }
                      onChange={(e) =>
                        setPaymentForm(
                          (current) => ({
                            ...current,
                            allowPriceOverride:
                              e.target.checked,
                            amount:
                              e.target.checked
                                ? current.amount
                                : String(
                                    getSubscriptionPrice(
                                      current.plan as SubscriptionPlan,
                                      current.billingCycle as BillingCycle
                                    )
                                  ),
                            priceOverrideReason:
                              e.target.checked
                                ? current.priceOverrideReason
                                : "",
                          })
                        )
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-700">
                        Override official price
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Use only for discounts, negotiated rates or corrections.
                      </span>
                    </span>
                  </label>

                  {paymentForm.allowPriceOverride && (
                    <textarea
                      value={
                        paymentForm.priceOverrideReason
                      }
                      onChange={(e) =>
                        setPaymentForm(
                          (current) => ({
                            ...current,
                            priceOverrideReason:
                              e.target.value,
                          })
                        )
                      }
                      placeholder="Reason for price override"
                      rows={2}
                      className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Payment Method
                  </label>
                  <select
                    value={
                      paymentForm.paymentMethod
                    }
                    onChange={(e) =>
                      setPaymentForm(
                        (current) => ({
                          ...current,
                          paymentMethod:
                            e.target.value,
                        })
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="mpesa">
                      M-Pesa
                    </option>
                    <option value="cash">
                      Cash
                    </option>
                    <option value="bank">
                      Bank
                    </option>
                    <option value="card">
                      Card
                    </option>
                    <option value="other">
                      Other
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Reference
                  </label>
                  <input
                    value={
                      paymentForm.paymentReference
                    }
                    onChange={(e) =>
                      setPaymentForm(
                        (current) => ({
                          ...current,
                          paymentReference:
                            e.target.value,
                        })
                      )
                    }
                    placeholder="M-Pesa code / receipt"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Period Start
                  </label>
                  <input
                    type="date"
                    value={
                      paymentForm.periodStart
                    }
                    onChange={(e) =>
                      setPaymentForm(
                        (current) => {
                          const nextStart =
                            e.target.value;

                          return {
                            ...current,
                            periodStart:
                              nextStart,
                            periodEnd:
                              calculatePeriodEnd(
                                nextStart,
                                current.billingCycle
                              ),
                          };
                        }
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Period End
                  </label>
                  <input
                    type="date"
                    value={
                      paymentForm.periodEnd
                    }
                    readOnly
                    disabled
                    className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">
                    Calculated automatically from the billing cycle.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={recordingPayment}
                onClick={recordPayment}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {recordingPayment
                  ? "Recording..."
                  : "Record Payment & Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminOrganizationDetails;
