const API_URL = "http://localhost:5000";

type ApiOptions = RequestInit & {
  skipAuth?: boolean;
};

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

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  return response;
}