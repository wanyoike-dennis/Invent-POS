import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const salesData = [
  { day: "Mon", sales: 12500 },
  { day: "Tue", sales: 18200 },
  { day: "Wed", sales: 15000 },
  { day: "Thu", sales: 22100 },
  { day: "Fri", sales: 19800 },
  { day: "Sat", sales: 27500 },
  { day: "Sun", sales: 16400 },
];

const recentSales = [
  {
    id: "#INV-001",
    customer: "John Kamau",
    amount: 2500,
    payment: "M-Pesa",
  },
  {
    id: "#INV-002",
    customer: "Mary Wanjiku",
    amount: 1850,
    payment: "Cash",
  },
  {
    id: "#INV-003",
    customer: "Peter Mwangi",
    amount: 4200,
    payment: "M-Pesa",
  },
  {
    id: "#INV-004",
    customer: "Ann Njeri",
    amount: 1200,
    payment: "Cash",
  },
];

function Dashboard() {
  return (
    <div className="space-y-6">

      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Dashboard
        </h1>

        <p className="text-slate-500 mt-1">
          Here's what's happening with your business today.
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">
            Today's Sales
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-2">
            KES 45,250
          </h2>

          <p className="text-sm text-green-600 mt-2">
            ↑ 12.5% from yesterday
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">
            Orders
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-2">
            128
          </h2>

          <p className="text-sm text-green-600 mt-2">
            ↑ 8.2% from yesterday
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">
            Products
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-2">
            356
          </h2>

          <p className="text-sm text-slate-500 mt-2">
            Active products
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">
            Low Stock
          </p>

          <h2 className="text-2xl font-bold text-red-600 mt-2">
            12
          </h2>

          <p className="text-sm text-red-500 mt-2">
            Products need attention
          </p>
        </div>

      </div>

      {/* Sales chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800">
            Sales Overview
          </h2>

          <p className="text-sm text-slate-500">
            Sales performance for the last 7 days
          </p>
        </div>

        <div className="h-80">

          <ResponsiveContainer width="100%" height="100%">

            <LineChart data={salesData}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="day" />

              <YAxis />

              <Tooltip />

              <Line
                type="monotone"
                dataKey="sales"
                stroke="#2563eb"
                strokeWidth={3}
              />

            </LineChart>

          </ResponsiveContainer>

        </div>

      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent sales */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">

          <div className="p-6 border-b border-slate-200">

            <h2 className="text-lg font-semibold text-slate-800">
              Recent Sales
            </h2>

          </div>

          <div className="divide-y divide-slate-200">

            {recentSales.map((sale) => (

              <div
                key={sale.id}
                className="p-5 flex items-center justify-between"
              >

                <div>
                  <p className="font-medium text-slate-800">
                    {sale.customer}
                  </p>

                  <p className="text-sm text-slate-500">
                    {sale.id} • {sale.payment}
                  </p>
                </div>

                <p className="font-semibold text-slate-800">
                  KES {sale.amount.toLocaleString()}
                </p>

              </div>

            ))}

          </div>

        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">

          <div className="p-6 border-b border-slate-200">

            <h2 className="text-lg font-semibold text-slate-800">
              Quick Actions
            </h2>

          </div>

          <div className="p-6 grid grid-cols-2 gap-4">

            <button className="p-5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
              <p className="font-semibold">
                New Sale
              </p>

              <p className="text-sm mt-1">
                Start a transaction
              </p>
            </button>

            <button className="p-5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition">
              <p className="font-semibold">
                Add Product
              </p>

              <p className="text-sm mt-1">
                Create new product
              </p>
            </button>

            <button className="p-5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 transition">
              <p className="font-semibold">
                Add Expense
              </p>

              <p className="text-sm mt-1">
                Record business expense
              </p>
            </button>

            <button className="p-5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 transition">
              <p className="font-semibold">
                View Reports
              </p>

              <p className="text-sm mt-1">
                Analyze your business
              </p>
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Dashboard;