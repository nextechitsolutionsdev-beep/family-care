import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import { monthlyData, specialties } from "../data/mockData";
import {
  getStoredAppointments,
  getStoredPatients,
  exportToExcel,
} from "../utils/storage";

const COLORS = ["#2ecc71", "#e91e8c", "#667eea", "#f39c12", "#00b894", "#e74c3c", "#3498db", "#9b59b6"];

export default function Reports() {
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    setAppointments(getStoredAppointments());
    setPatients(getStoredPatients());
  }, []);

  const totalRevenue = monthlyData.reduce((a, m) => a + m.revenue, 0);
  const totalApts = monthlyData.reduce((a, m) => a + m.appointments, 0);
  const totalNew = monthlyData.reduce((a, m) => a + m.newPatients, 0);
  const avgPerDay = Math.round(totalApts / 274);

  // Group appointments by specialty from stored data
  const specRevenueMap = {};
  specialties.forEach((s) => {
    specRevenueMap[s.name] = s.today * 350 + 1200;
  });

  appointments.forEach((a) => {
    if (a.specialty && a.status !== "ملغي") {
      specRevenueMap[a.specialty] = (specRevenueMap[a.specialty] || 0) + (Number(a.fee) || 200);
    }
  });

  const revenueBySpec = specialties.slice(0, 8).map((s) => ({
    name: s.name,
    value: specRevenueMap[s.name] || 2500,
  }));

  const maxRev = Math.max(...revenueBySpec.map((s) => s.value));

  const handleExportFullReport = () => {
    const reportData = monthlyData.map((m) => ({
      "الشهر": m.month,
      "إجمالي المواعيد": m.appointments,
      "الإيرادات المحصلة (ج.م)": m.revenue,
      "المرضى الجدد": m.newPatients,
      "متوسط الإيراد لكل مريض": Math.round(m.revenue / m.appointments),
    }));
    exportToExcel(reportData, `تقرير_أداء_عيادات_فاميلي_كير_2026.csv`);
  };

  return (
    <div>
      {/* Top Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "var(--gray-900)" }}>
            التقارير المالية والتشغيلية للمركز
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--gray-400)" }}>
            إحصاءات الإيرادات، تدفق المرضى ومعدلات الحجز
          </p>
        </div>
        <button className="btn-primary" onClick={handleExportFullReport}>
          <i className="fas fa-file-excel"></i> تصدير التقرير المالي الشامل (Excel)
        </button>
      </div>

      {/* KPI Cards */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 22 }}>
        {[
          { label: "إجمالي الإيرادات السنوية", value: `${totalRevenue.toLocaleString()} ج.م`, icon: "fa-money-bill-wave", cls: "s-green", clr: "#2ecc71" },
          { label: "إجمالي المواعيد المسجلة", value: totalApts, icon: "fa-calendar-check", cls: "s-blue", clr: "#667eea" },
          { label: "سجل المرضى الجدد", value: totalNew, icon: "fa-user-plus", cls: "s-teal", clr: "#00b894" },
          { label: "متوسط الكشوفات اليومي", value: `${avgPerDay} كشف/يوم`, icon: "fa-chart-line", cls: "s-pink", clr: "#e91e8c" },
        ].map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`}>
            <div className="stat-icon" style={{ background: `${s.clr}1a` }}>
              <i className={`fas ${s.icon}`} style={{ color: s.clr }}></i>
            </div>
            <div className="stat-num" style={{ fontSize: typeof s.value === "string" && s.value.length > 8 ? 18 : 26 }}>
              {s.value}
            </div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* Monthly Revenue Chart */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                <i className="fas fa-chart-line" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
                مسار الإيرادات الشهرية لعام 2026
              </h3>
              <p>تطور الدخل المالي للمركز (ج.م)</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2ecc71" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2ecc71" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "Cairo" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontFamily: "Cairo" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    fontFamily: "Cairo",
                    borderRadius: 10,
                    border: "none",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                  }}
                />
                <Legend wrapperStyle={{ fontFamily: "Cairo", fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" name="الإيراد (ج.م)" stroke="#2ecc71" strokeWidth={2.5} fill="url(#gR)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue Distribution by Specialty */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                <i className="fas fa-chart-pie" style={{ color: "var(--secondary)", marginLeft: 8 }}></i>
                توزيع دخل العيادات حسب التخصص
              </h3>
              <p>مساهمة التخصصات الطبية في إيراد المركز</p>
            </div>
          </div>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ResponsiveContainer width="48%" height={210}>
              <PieChart>
                <Pie data={revenueBySpec} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={3} dataKey="value">
                  {revenueBySpec.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontFamily: "Cairo", borderRadius: 10, border: "none" }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, maxHeight: 210, overflowY: "auto", paddingLeft: 4 }}>
              {revenueBySpec.map((s, i) => (
                <div key={i} style={{ marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gray-700)", fontWeight: 600 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: COLORS[i % COLORS.length],
                          display: "inline-block",
                        }}
                      ></span>
                      {s.name}
                    </span>
                    <strong style={{ fontSize: 12, color: "var(--gray-900)" }}>
                      {(s.value / 1000).toFixed(1)}k ج.م
                    </strong>
                  </div>
                  <div className="prog-bar">
                    <div
                      className="prog-fill"
                      style={{ width: `${(s.value / maxRev) * 100}%`, background: COLORS[i % COLORS.length] }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}