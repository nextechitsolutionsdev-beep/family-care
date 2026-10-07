import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { monthlyData, specialties } from "../data/mockData";
import {
  apiGetAppointments,
  apiGetPatients,
  apiGetDoctors,
  isSupabaseConfigured,
} from "../services/supabase";

const COLORS = ["#2ecc71", "#e91e8c", "#667eea", "#f39c12", "#00b894", "#e74c3c", "#3498db", "#9b59b6"];

const weeklyBar = [
  { day: "السبت", مواعيد: 38 },
  { day: "الأحد", مواعيد: 45 },
  { day: "الاثنين", مواعيد: 52 },
  { day: "الثلاثاء", مواعيد: 41 },
  { day: "الأربعاء", مواعيد: 48 },
  { day: "الخميس", مواعيد: 35 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [apts, pts, docs] = await Promise.all([
        apiGetAppointments(),
        apiGetPatients(),
        apiGetDoctors(),
      ]);
      setAppointments(apts);
      setPatients(pts);
      setDoctors(docs);
    };
    load();
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayApts = appointments.filter((a) => a.date === todayStr);

  const doneToday = todayApts.filter((a) => a.status === "مكتمل").length;
  const inProgressToday = todayApts.filter((a) => a.status === "جاري").length;
  const waitingToday = todayApts.filter((a) => a.status === "انتظار").length;
  const availableDoctors = doctors.filter((d) => d.available).length;

  const todayRevenue = todayApts
    .filter((a) => a.status !== "ملغي")
    .reduce((acc, a) => acc + (Number(a.fee) || 0), 0);

  // Group today's specialties for PieChart
  const specCounts = {};
  specialties.forEach((s) => {
    specCounts[s.name] = 0;
  });
  todayApts.forEach((a) => {
    if (a.specialty) {
      specCounts[a.specialty] = (specCounts[a.specialty] || 0) + 1;
    }
  });

  const specPieData = specialties
    .slice(0, 6)
    .map((s) => ({
      name: s.name,
      value: specCounts[s.name] || s.today || 2,
    }));

  const kpis = [
    {
      label: "مواعيد اليوم",
      value: todayApts.length || 8,
      icon: "fa-calendar-day",
      cls: "s-blue",
      clr: "#667eea",
      sub: `${doneToday} مكتمل • ${inProgressToday} جاري`,
    },
    {
      label: "إجمالي المرضى",
      value: patients.length,
      icon: "fa-users",
      cls: "s-green",
      clr: "#2ecc71",
      sub: "سجل المرضى النشطين",
    },
    {
      label: "إيرادات اليوم",
      value: `${(todayRevenue || 3450).toLocaleString()} ج.م`,
      icon: "fa-money-bill-wave",
      cls: "s-teal",
      clr: "#00b894",
      sub: `${todayApts.length} حجز مؤكد`,
    },
    {
      label: "الأطباء المتاحون",
      value: `${availableDoctors} / ${doctors.length}`,
      icon: "fa-user-doctor",
      cls: "s-pink",
      clr: "#e91e8c",
      sub: "جاهزون لاستقبال الحالات",
    },
  ];

  const statusMap = {
    "مكتمل": { clr: "#2ecc71", bg: "#e8f8f0" },
    "جاري": { clr: "#667eea", bg: "#eff0fb" },
    "انتظار": { clr: "#f39c12", bg: "#fff8e1" },
    "مؤكد": { clr: "#2ecc71", bg: "#eafaf1" },
  };

  return (
    <div>
      {/* Top Welcome Bar */}
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: "16px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          border: "1px solid var(--gray-200)",
          boxShadow: "var(--shadow)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(46,204,113,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--primary)",
              fontSize: 20,
            }}
          >
            <i className="fas fa-heart-pulse"></i>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              مرحباً بك في نظام إدارة عيادات فاميلي كير الطبية
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--gray-400)" }}>
              مركز متكامل لـ 14 تخصص طبي، رعاية منزلية وطوارئ 24 ساعة • Since 2019
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-primary" onClick={() => navigate("/appointments")}>
            <i className="fas fa-calendar-plus"></i> حجز كشف سريع
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 22 }}>
        {kpis.map((k, i) => (
          <div key={i} className={`stat-card ${k.cls}`}>
            <div className="stat-icon" style={{ background: `${k.clr}1a` }}>
              <i className={`fas ${k.icon}`} style={{ color: k.clr }}></i>
            </div>
            <div className="stat-num" style={{ fontSize: typeof k.value === "string" ? 22 : 32 }}>
              {k.value}
            </div>
            <div className="stat-label">{k.label}</div>
            <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* Area Chart */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                <i className="fas fa-chart-area" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
                المعدل الشهري للمواعيد والمرضى
              </h3>
              <p>متابعة النمو الشهري للعيادات في عام 2026</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2ecc71" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2ecc71" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e91e8c" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#e91e8c" stopOpacity={0} />
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
                <Area type="monotone" dataKey="appointments" name="المواعيد" stroke="#2ecc71" strokeWidth={2.5} fill="url(#gA)" />
                <Area type="monotone" dataKey="newPatients" name="مرضى جدد" stroke="#e91e8c" strokeWidth={2} fill="url(#gN)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Bar */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                <i className="fas fa-chart-bar" style={{ color: "#667eea", marginLeft: 8 }}></i>
                مواعيد أيام الأسبوع
              </h3>
              <p>توزيع الإقبال حسب أيام عمل العيادة</p>
            </div>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyBar} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fontFamily: "Cairo" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontFamily: "Cairo" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontFamily: "Cairo", borderRadius: 10, border: "none" }} />
                <Bar dataKey="مواعيد" radius={[6, 6, 0, 0]}>
                  {weeklyBar.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Lower Row: Specialties Distribution & Today's Timeline */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* Pie Chart */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                <i className="fas fa-chart-pie" style={{ color: "var(--secondary)", marginLeft: 8 }}></i>
                توزيع الكشوفات على التخصصات
              </h3>
              <p>أعلى التخصصات طلباً اليوم</p>
            </div>
          </div>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={specPieData} cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={3} dataKey="value">
                  {specPieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontFamily: "Cairo", borderRadius: 10, border: "none" }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {specPieData.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--gray-600)" }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: COLORS[i % COLORS.length],
                        display: "inline-block",
                      }}
                    ></span>
                    {s.name}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 13 }}>{s.value} كشف</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                <i className="fas fa-clock" style={{ color: "#f39c12", marginLeft: 8 }}></i>
                جدول استقبال اليوم
              </h3>
              <p>حالات اليوم الحالية في العيادة</p>
            </div>
            <button
              className="tbl-btn"
              style={{ background: "#e8f8f0", color: "#2ecc71" }}
              onClick={() => navigate("/appointments")}
            >
              عرض الكل <i className="fas fa-arrow-left"></i>
            </button>
          </div>
          <div className="card-body" style={{ padding: "0 16px" }}>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {(todayApts.length > 0 ? todayApts : appointments.slice(0, 5)).map((t, i) => {
                const sc = statusMap[t.status] || { clr: "#999", bg: "#f5f5f5" };
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 0",
                      borderBottom: "1px solid var(--gray-100)",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gray-500)", minWidth: 42, direction: "ltr" }}>
                      {t.time}
                    </span>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #667eea, #764ba2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      {t.patient ? t.patient[0] : "م"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{t.patient}</div>
                      <div style={{ fontSize: 11, color: "var(--gray-400)" }}>
                        {t.doctor} • {t.specialty}
                      </div>
                    </div>
                    <span
                      style={{
                        background: sc.bg,
                        color: sc.clr,
                        padding: "2px 10px",
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {t.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}