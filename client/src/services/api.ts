//const API_URL = "http://localhost:5000";
//const API_URL = "https://6f7c-41-90-137-114.ngrok-free.app";
const API_URL = "";

type ApiOptions = RequestInit & {
  skipAuth?: boolean;
};

const ACCESS_BLOCK_CODES = new Set([
  "ORGANIZATION_SUSPENDED",
  "ORGANIZATION_EXPIRED",
  "ORGANIZATION_TRIAL_EXPIRED",
  "ORGANIZATION_SUBSCRIPTION_EXPIRED",
  "ORGANIZATION_MISSING",
  "USER_DEACTIVATED",
]);

function clearTenantSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

async function handleTenantAccessResponse(
  response: Response
) {
  if (response.status === 401) {
    clearTenantSession();

    if (window.location.pathname !== "/login") {
      sessionStorage.setItem(
        "loginMessage",
        "Your session has expired. Please log in again."
      );
      window.location.replace("/login");
    }

    return;
  }

  if (response.status !== 403) {
    return;
  }

  try {
    const data = await response.clone().json();

    if (ACCESS_BLOCK_CODES.has(data?.code)) {
      clearTenantSession();

      sessionStorage.setItem(
        "loginMessage",
        data?.message ||
          "Your organization account cannot access Invent POS."
      );

      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
  } catch {
    // Leave ordinary 403 responses alone.
    // Components may still read and handle the original response.
  }
}

export async function apiFetch(
  endpoint: string,
  options: ApiOptions = {}
) {
  const token = localStorage.getItem("token");
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (!options.skipAuth && token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`
    );
  }

  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      ...options,
      headers,
    }
  );

  if (!options.skipAuth) {
    await handleTenantAccessResponse(response);
  }

  return response;
}

export async function superAdminFetch(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = localStorage.getItem("superAdminToken");
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`
    );
  }

  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      ...options,
      headers,
    }
  );

  if (response.status === 401) {
    localStorage.removeItem("superAdminToken");
    localStorage.removeItem("superAdminUser");

    if (
      window.location.pathname !==
      "/super-admin/login"
    ) {
      window.location.replace(
        "/super-admin/login"
      );
    }
  }

  return response;
}
