import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Save,
  Settings2,
  UserPlus,
  Users,
  Pencil,
  KeyRound,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "../services/api";

type Organization = {
  id: number;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  receipt_footer: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

type OrganizationForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  receipt_footer: string;
  currency: string;
};

const emptyForm: OrganizationForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  receipt_footer: "",
  currency: "KES",
};

type StaffUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "manager" | "cashier";
  organization_id: number;
  created_at: string;
};

type StaffForm = {
  name: string;
  email: string;
  password: string;
  role: "manager" | "cashier" | "admin";
};

const emptyStaffForm: StaffForm = {
  name: "",
  email: "",
  password: "",
  role: "cashier",
};

function Settings() {
  const storedUser = localStorage.getItem("user");

  let userRole = "";

  try {
    const user = storedUser ? JSON.parse(storedUser) : null;
    userRole = String(user?.role || "").toLowerCase();
  } catch {
    userRole = "";
  }

  const isAdmin = userRole === "admin";

  const [organization, setOrganization] =
    useState<Organization | null>(null);

  const [formData, setFormData] =
    useState<OrganizationForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffMessage, setStaffMessage] = useState("");
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editingStaff, setEditingStaff] =
    useState<StaffUser | null>(null);
  const [resettingStaff, setResettingStaff] =
    useState<StaffUser | null>(null);
  const [staffForm, setStaffForm] =
    useState<StaffForm>(emptyStaffForm);
  const [newPassword, setNewPassword] = useState("");

  const fetchOrganization = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await apiFetch(
        "/api/organization"
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to load organization settings"
        );
      }

      const org = data as Organization;

      setOrganization(org);

      setFormData({
        name: org.name || "",
        phone: org.phone || "",
        email: org.email || "",
        address: org.address || "",
        receipt_footer: org.receipt_footer || "",
        currency: org.currency || "KES",
      });
    } catch (error) {
      console.error(
        "Load organization settings error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Could not load organization settings."
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    if (!isAdmin) return;

    try {
      setStaffLoading(true);
      setStaffError("");

      const response = await apiFetch("/api/auth/users");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to load staff users"
        );
      }

      setStaff(Array.isArray(data) ? data : []);
    } catch (error) {
      setStaffError(
        error instanceof Error
          ? error.message
          : "Could not load staff users."
      );
    } finally {
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganization();

    if (isAdmin) {
      fetchStaff();
    }
  }, []);

  const handleChange = (
    field: keyof OrganizationForm,
    value: string
  ) => {
    setSuccessMessage("");

    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSave = async () => {

    if (!isAdmin) {
      setError(
        "Only an Admin can update organization settings."
      );
      return;
    }

    const businessName = formData.name.trim();

    if (!businessName) {
      setError("Business name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const response = await apiFetch(
        "/api/organization",
        {
          method: "PUT",
          body: JSON.stringify({
            name: businessName,
            phone: formData.phone.trim(),
            email: formData.email.trim(),
            address: formData.address.trim(),
            receipt_footer:
              formData.receipt_footer.trim(),
            currency: formData.currency,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to save organization settings"
        );
      }

      const updatedOrganization =
        data.organization as Organization;

      setOrganization(updatedOrganization);

      setFormData({
        name: updatedOrganization.name || "",
        phone: updatedOrganization.phone || "",
        email: updatedOrganization.email || "",
        address: updatedOrganization.address || "",
        receipt_footer:
          updatedOrganization.receipt_footer || "",
        currency:
          updatedOrganization.currency || "KES",
      });

      setSuccessMessage(
        data.message ||
          "Organization settings updated successfully"
      );

      // Keep the logged-in user's local organization display in sync.
      try {
        const currentStoredUser =
          localStorage.getItem("user");

        if (currentStoredUser) {
          const currentUser =
            JSON.parse(currentStoredUser);

          const updatedUser = {
            ...currentUser,
            organization: {
              ...(currentUser.organization || {}),
              id: updatedOrganization.id,
              name: updatedOrganization.name,
              slug: updatedOrganization.slug,
              currency: updatedOrganization.currency,
            },
          };

          localStorage.setItem(
            "user",
            JSON.stringify(updatedUser)
          );
        }
      } catch (storageError) {
        console.error(
          "Could not update stored organization name:",
          storageError
        );
      }
    } catch (error) {
      console.error(
        "Save organization settings error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Could not save organization settings."
      );
    } finally {
      setSaving(false);
    }
  };

  const openAddStaff = () => {
    setStaffError("");
    setStaffMessage("");
    setEditingStaff(null);
    setStaffForm(emptyStaffForm);
    setShowAddStaff(true);
  };

  const openEditStaff = (user: StaffUser) => {
    setStaffError("");
    setStaffMessage("");
    setShowAddStaff(false);
    setEditingStaff(user);
    setStaffForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
    });
  };

  const closeStaffForm = () => {
    setShowAddStaff(false);
    setEditingStaff(null);
    setStaffForm(emptyStaffForm);
  };

  const handleStaffSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    const name = staffForm.name.trim();
    const email = staffForm.email.trim();

    if (!name || !email) {
      setStaffError("Name and email are required.");
      return;
    }

    if (!editingStaff && staffForm.password.length < 6) {
      setStaffError(
        "Password must be at least 6 characters."
      );
      return;
    }

    try {
      setStaffBusy(true);
      setStaffError("");
      setStaffMessage("");

      const response = await apiFetch(
        editingStaff
          ? `/api/auth/users/${editingStaff.id}`
          : "/api/auth/users",
        {
          method: editingStaff ? "PUT" : "POST",
          body: JSON.stringify(
            editingStaff
              ? {
                  name,
                  email,
                  role: staffForm.role,
                }
              : {
                  name,
                  email,
                  password: staffForm.password,
                  role: staffForm.role,
                }
          ),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to save staff user"
        );
      }

      setStaffMessage(
        data.message ||
          (editingStaff
            ? "User updated successfully"
            : "User created successfully")
      );

      closeStaffForm();
      await fetchStaff();
    } catch (error) {
      setStaffError(
        error instanceof Error
          ? error.message
          : "Could not save staff user."
      );
    } finally {
      setStaffBusy(false);
    }
  };

  const handleResetPassword = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!resettingStaff) return;

    if (newPassword.length < 6) {
      setStaffError(
        "Password must be at least 6 characters."
      );
      return;
    }

    try {
      setStaffBusy(true);
      setStaffError("");
      setStaffMessage("");

      const response = await apiFetch(
        `/api/auth/users/${resettingStaff.id}/password`,
        {
          method: "PUT",
          body: JSON.stringify({
            password: newPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to reset password"
        );
      }

      setStaffMessage(
        data.message || "Password reset successfully"
      );
      setResettingStaff(null);
      setNewPassword("");
    } catch (error) {
      setStaffError(
        error instanceof Error
          ? error.message
          : "Could not reset password."
      );
    } finally {
      setStaffBusy(false);
    }
  };

  const handleDeleteStaff = async (user: StaffUser) => {
    const confirmed = window.confirm(
      `Remove ${user.name} from this organization?`
    );

    if (!confirmed) return;

    try {
      setStaffBusy(true);
      setStaffError("");
      setStaffMessage("");

      const response = await apiFetch(
        `/api/auth/users/${user.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to delete user"
        );
      }

      setStaffMessage(
        data.message || "User deleted successfully"
      );
      await fetchStaff();
    } catch (error) {
      setStaffError(
        error instanceof Error
          ? error.message
          : "Could not delete staff user."
      );
    } finally {
      setStaffBusy(false);
    }
  };

  const formatDate = (value: string | undefined) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#246BFD]" />
          <p className="mt-4 text-sm text-slate-500">
            Loading organization settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#18C8E8]">
            Organization Configuration
          </p>

          <h1 className="text-2xl font-bold text-[#071827]">
            Settings
          </h1>

          <p className="mt-1 max-w-2xl text-slate-500">
            Manage the business information and receipt
            preferences used by this organization in Invent POS.
          </p>
        </div>

        {organization && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Organization
            </p>

            <p className="mt-1 font-semibold text-[#071827]">
              {organization.name}
            </p>

            <p className="mt-0.5 text-xs text-slate-500">
              {organization.slug}
            </p>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="font-medium text-amber-800">
            Read-only settings
          </p>

          <p className="mt-1 text-sm text-amber-700">
            Only an Admin can update organization settings.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-medium text-red-700">
            {error}
          </p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <CheckCircle2
            size={20}
            className="mt-0.5 shrink-0 text-emerald-600"
          />

          <div>
            <p className="font-medium text-emerald-800">
              Settings saved
            </p>

            <p className="mt-0.5 text-sm text-emerald-700">
              {successMessage}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* BUSINESS INFORMATION */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-200 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#246BFD]/10 text-[#246BFD]">
              <Building2 size={20} />
            </div>

            <div>
              <h2 className="font-semibold text-[#071827]">
                Business Information
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                These details identify this organization across
                Invent POS.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Business Name *
              </label>

              <div className="relative">
                <Building2
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="text"
                  value={formData.name}
                  disabled={!isAdmin || saving}
                  onChange={(e) =>
                    handleChange(
                      "name",
                      e.target.value
                    )
                  }
                  placeholder="e.g. Invent Solutions"
                  className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Phone Number
              </label>

              <div className="relative">
                <Phone
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="tel"
                  value={formData.phone}
                  disabled={!isAdmin || saving}
                  onChange={(e) =>
                    handleChange(
                      "phone",
                      e.target.value
                    )
                  }
                  placeholder="e.g. 0712345678"
                  className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Business Email
              </label>

              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="email"
                  value={formData.email}
                  disabled={!isAdmin || saving}
                  onChange={(e) =>
                    handleChange(
                      "email",
                      e.target.value
                    )
                  }
                  placeholder="e.g. info@business.co.ke"
                  className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Address / Location
              </label>

              <div className="relative">
                <MapPin
                  size={18}
                  className="absolute left-3.5 top-3.5 text-slate-400"
                />

                <textarea
                  rows={3}
                  value={formData.address}
                  disabled={!isAdmin || saving}
                  onChange={(e) =>
                    handleChange(
                      "address",
                      e.target.value
                    )
                  }
                  placeholder="e.g. Kikuyu, Kiambu County"
                  className="w-full resize-none rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>
          </div>
        </section>

        {/* POS PREFERENCES */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-200 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
              <Settings2 size={20} />
            </div>

            <div>
              <h2 className="font-semibold text-[#071827]">
                POS Preferences
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Core defaults used by the organization.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Currency
              </label>

              <div className="relative">
                <CreditCard
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <select
                  value={formData.currency}
                  disabled={!isAdmin || saving}
                  onChange={(e) =>
                    handleChange(
                      "currency",
                      e.target.value
                    )
                  }
                  className="w-full appearance-none rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="KES">
                    KES — Kenyan Shilling
                  </option>
                </select>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                Invent POS currently supports KES only.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">
                Organization ID
              </p>

              <p className="mt-2 text-2xl font-bold text-[#071827]">
                {organization?.id ?? "—"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Used internally for tenant isolation.
              </p>
            </div>
          </div>
        </section>

        {/* RECEIPT SETTINGS */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-200 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ReceiptText size={20} />
            </div>

            <div>
              <h2 className="font-semibold text-[#071827]">
                Receipt Settings
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Configure the message displayed at the bottom
                of customer receipts.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Receipt Footer
              </label>

              <div className="relative">
                <FileText
                  size={18}
                  className="absolute left-3.5 top-3.5 text-slate-400"
                />

                <textarea
                  rows={5}
                  value={formData.receipt_footer}
                  disabled={!isAdmin || saving}
                  onChange={(e) =>
                    handleChange(
                      "receipt_footer",
                      e.target.value
                    )
                  }
                  placeholder="e.g. Thank you for shopping with us!"
                  className="w-full resize-none rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <p className="mt-2 text-xs text-slate-500">
                This text will later be used on generated
                receipts for this organization.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Receipt Preview
              </p>

              <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
                <div className="text-center">
                  <p className="font-bold text-[#071827]">
                    {formData.name ||
                      "Business Name"}
                  </p>

                  {formData.phone && (
                    <p className="mt-1 text-xs text-slate-500">
                      {formData.phone}
                    </p>
                  )}

                  {formData.address && (
                    <p className="mt-1 text-xs text-slate-500">
                      {formData.address}
                    </p>
                  )}
                </div>

                <div className="my-4 border-t border-dashed border-slate-300" />

                <div className="space-y-2 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Sample Item</span>
                    <span>
                      {formData.currency} 100
                    </span>
                  </div>

                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Total</span>
                    <span>
                      {formData.currency} 100
                    </span>
                  </div>
                </div>

                <div className="my-4 border-t border-dashed border-slate-300" />

                <p className="text-center text-xs text-slate-500">
                  {formData.receipt_footer ||
                    "Thank you for your business!"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* USERS & STAFF */}
        {isAdmin && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Users size={20} />
                </div>

                <div>
                  <h2 className="font-semibold text-[#071827]">
                    Users & Staff
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Manage Admins, Managers and Cashiers for this organization.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openAddStaff}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1D5EEA]"
              >
                <UserPlus size={17} />
                Add Staff
              </button>
            </div>

            <div className="p-5">
              {staffError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {staffError}
                </div>
              )}

              {staffMessage && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {staffMessage}
                </div>
              )}

              {(showAddStaff || editingStaff) && (
                <form
                  onSubmit={handleStaffSubmit}
                  className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-[#071827]">
                        {editingStaff
                          ? "Edit Staff Member"
                          : "Add Staff Member"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        This user will belong only to {organization?.name || "this organization"}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeStaffForm}
                      className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Full Name
                      </label>
                      <input
                        value={staffForm.name}
                        onChange={(e) =>
                          setStaffForm((current) => ({
                            ...current,
                            name: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                        placeholder="Staff member name"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Email
                      </label>
                      <input
                        type="email"
                        value={staffForm.email}
                        onChange={(e) =>
                          setStaffForm((current) => ({
                            ...current,
                            email: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                        placeholder="staff@example.com"
                      />
                    </div>

                    {!editingStaff && (
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Temporary Password
                        </label>
                        <input
                          type="password"
                          value={staffForm.password}
                          onChange={(e) =>
                            setStaffForm((current) => ({
                              ...current,
                              password: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                          placeholder="Minimum 6 characters"
                        />
                      </div>
                    )}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Role
                      </label>
                      <select
                        value={staffForm.role}
                        onChange={(e) =>
                          setStaffForm((current) => ({
                            ...current,
                            role: e.target.value as StaffForm["role"],
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#246BFD] focus:ring-2 focus:ring-[#246BFD]/15"
                      >
                        <option value="cashier">Cashier</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeStaffForm}
                      className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={staffBusy}
                      className="rounded-xl bg-[#246BFD] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1D5EEA] disabled:opacity-50"
                    >
                      {staffBusy
                        ? "Saving..."
                        : editingStaff
                          ? "Save Changes"
                          : "Create User"}
                    </button>
                  </div>
                </form>
              )}

              {resettingStaff && (
                <form
                  onSubmit={handleResetPassword}
                  className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-amber-900">
                        Reset Password
                      </h3>
                      <p className="mt-1 text-sm text-amber-700">
                        Set a new password for {resettingStaff.name}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setResettingStaff(null);
                        setNewPassword("");
                      }}
                      className="rounded-lg p-2 text-amber-600 hover:bg-amber-100"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) =>
                        setNewPassword(e.target.value)
                      }
                      placeholder="New password (minimum 6 characters)"
                      className="flex-1 rounded-xl border border-amber-300 bg-white px-4 py-3 outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={staffBusy}
                      className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {staffBusy ? "Resetting..." : "Reset Password"}
                    </button>
                  </div>
                </form>
              )}

              {staffLoading ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Loading staff users...
                </div>
              ) : staff.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
                  <Users
                    size={30}
                    className="mx-auto text-slate-300"
                  />
                  <p className="mt-3 font-medium text-slate-700">
                    No staff users found
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-3">User</th>
                        <th className="px-3 py-3">Role</th>
                        <th className="px-3 py-3">Created</th>
                        <th className="px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((user) => (
                        <tr
                          key={user.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-3 py-4">
                            <p className="font-medium text-[#071827]">
                              {user.name}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">
                              {user.email}
                            </p>
                          </td>

                          <td className="px-3 py-4">
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                              {user.role}
                            </span>
                          </td>

                          <td className="px-3 py-4 text-sm text-slate-500">
                            {formatDate(user.created_at)}
                          </td>

                          <td className="px-3 py-4">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                title="Edit user"
                                onClick={() => openEditStaff(user)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                              >
                                <Pencil size={17} />
                              </button>

                              <button
                                type="button"
                                title="Reset password"
                                onClick={() => {
                                  setStaffError("");
                                  setStaffMessage("");
                                  setResettingStaff(user);
                                  setNewPassword("");
                                }}
                                className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-600"
                              >
                                <KeyRound size={17} />
                              </button>

                              <button
                                type="button"
                                title="Delete user"
                                disabled={staffBusy}
                                onClick={() => handleDeleteStaff(user)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ORGANIZATION INFO */}
        {organization && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Building2 size={19} />
              </div>

              <div>
                <h2 className="font-semibold text-[#071827]">
                  Organization Record
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Internal organization information.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Slug
                </p>
                <p className="mt-1 font-medium text-slate-700">
                  {organization.slug}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Created
                </p>
                <p className="mt-1 font-medium text-slate-700">
                  {formatDate(
                    organization.created_at
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Last Updated
                </p>
                <p className="mt-1 font-medium text-slate-700">
                  {formatDate(
                    organization.updated_at
                  )}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* SAVE BAR */}
        <div className="sticky bottom-4 z-20">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-[#071827]">
                Organization Settings
              </p>

              <p className="mt-0.5 text-sm text-slate-500">
                {isAdmin
                  ? "Save changes to update this organization only."
                  : "You have read-only access to these settings."}
              </p>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={!isAdmin || saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#246BFD] px-5 py-3 font-semibold text-white transition hover:bg-[#1D5EEA] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={18} />

              {saving
                ? "Saving..."
                : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
