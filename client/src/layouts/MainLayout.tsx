import { Outlet, Link, useLocation } from "react-router-dom";

function MainLayout() {
  const location = useLocation();

  const navigation = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Products", path: "/products" },
    { name: "Inventory", path: "/inventory" },
    { name: "Sales", path: "/sales" },
    { name: "Customers", path: "/customers" },
    { name: "Suppliers", path: "/suppliers" },
    { name: "Expenses", path: "/expenses" },
    { name: "Reports", path: "/reports" },
    { name: "Settings", path: "/settings" },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex">

      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white min-h-screen">

        <div className="p-6">
          <h1 className="text-2xl font-bold">
            Invent POS
          </h1>

          <p className="text-sm text-slate-400 mt-1">
            Business Management
          </p>
        </div>

        <nav className="px-4 space-y-2">

          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-4 py-3 rounded-lg transition ${
                location.pathname === item.path
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {item.name}
            </Link>
          ))}

        </nav>

        <div className="absolute bottom-6 px-4 w-64">
          <button className="w-full px-4 py-3 rounded-lg text-left text-slate-300 hover:bg-slate-800">
            Logout
          </button>
        </div>

      </aside>

      {/* Main section */}
      <div className="flex-1">

        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">

          <div>
            <h2 className="font-semibold text-slate-800">
              Invent POS
            </h2>
          </div>

          <div className="flex items-center gap-3">

            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">
                Admin User
              </p>

              <p className="text-xs text-slate-500">
                Administrator
              </p>
            </div>

            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
              AD
            </div>

          </div>

        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>

      </div>

    </div>
  );
}

export default MainLayout;