import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { isSupabaseConfigured } from "../services/supabase";

const today = new Date().toLocaleDateString("ar-EG", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default function Layout({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sideOpen, setSideOpen] = useState(false);

  const isDoctor = user?.role === "doctor";
  const isReceptionist = user?.role === "receptionist";

  const navItems = isDoctor
    ? [
        { section: "عيادتي وحالات اليوم" },
        { path: "/doctor-portal", icon: "fa-stethoscope", label: "كشف وحالات اليوم", badge: "مباشر" },
        { section: "الملفات الطبية" },
        { path: "/patients", icon: "fa-users", label: "سجل ملفات المرضى" },
        { section: "المركز" },
        { path: "/specialties", icon: "fa-hospital-user", label: "دليل التخصصات والخدمات" },
      ]
    : isReceptionist
    ? [
        { section: "حجز وتسجيل المرضى" },
        { path: "/appointments", icon: "fa-calendar-check", label: "حجز المواعيد والكشوفات", badge: "الرئيسية" },
        { path: "/patients", icon: "fa-users", label: "سجل وبيانات المرضى" },
        { section: "العيادات المتاحة" },
        { path: "/specialties", icon: "fa-stethoscope", label: "دليل التخصصات والأطباء", badge: "14" },
      ]
    : [
        { section: "الرئيسية" },
        { path: "/", icon: "fa-chart-pie", label: "لوحة التحكم" },
        { section: "إدارة المواعيد والعيادات" },
        { path: "/appointments", icon: "fa-calendar-check", label: "المواعيد والحجوزات", badge: "جديد" },
        { path: "/doctor-portal", icon: "fa-stethoscope", label: "بوابة الطبيب (معاينة)" },
        { section: "إدارة المركز" },
        { path: "/patients", icon: "fa-users", label: "سجل المرضى" },
        { path: "/doctors", icon: "fa-user-doctor", label: "كادر الأطباء" },
        { path: "/specialties", icon: "fa-stethoscope", label: "التخصصات والخدمات", badge: "14" },
        { section: "التقارير" },
        { path: "/reports", icon: "fa-chart-bar", label: "التقارير والإحصاء" },
      ];

  const pageTitle =
    {
      "/": { title: "لوحة التحكم", sub: "مرحباً بك، ملخص تشغيل المركز اليوم" },
      "/doctor-portal": {
        title: "عيادتي وحالات اليوم",
        sub: "متابعة أدوار الكشف، نداء المريض، وتدوين الروشتة والتقرير الطبي",
      },
      "/appointments": {
        title: isReceptionist ? "شاشة تسجيل وحجز المرضى" : "إدارة المواعيد والحجوزات",
        sub: isReceptionist
          ? "حجز المرضى عند الأطباء، تنظيم أدوار الكشف وطباعة التذاكر والإيصالات"
          : "حجز ومتابعة كشوفات العيادات والخدمات المنزلية",
      },
      "/patients": { title: "سجل المرضى", sub: "الملفات الطبية، التاريخ المرضي وبيانات التواصل" },
      "/doctors": { title: "كادر الأطباء", sub: "إدارة عيادات وجداول الأطباء والاستشاريين" },
      "/specialties": { title: "التخصصات والخدمات", sub: "14 تخصص طبي، رعاية منزلية وطوارئ 24 ساعة" },
      "/reports": { title: "التقارير والإحصاء", sub: "تحليلات الأداء المالي والتشغيلي" },
    }[location.pathname] || { title: "Family Care Medical Center", sub: "Since 2019" };

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={"sidebar " + (sideOpen ? "open" : "")}>
        <div className="sidebar-top">
          <img
            src="/logo.jpg"
            alt="Family Care Logo"
            style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--primary)" }}
          />
          <h3>Family Care Medical Center</h3>
          <span>مركز فاميلي كير ~ Since 2019</span>
          <div style={{ marginTop: 8 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(233,30,140,0.18)",
                color: "#ff70a6",
                borderRadius: 20,
                padding: "2px 10px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <i className="fas fa-phone-alt"></i> 01001695023
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, i) =>
            item.section ? (
              <div key={i} className="nav-group-title">
                {item.section}
              </div>
            ) : (
              <button
                key={item.path}
                className={"nav-link " + (location.pathname === item.path ? "active" : "")}
                onClick={() => {
                  navigate(item.path);
                  setSideOpen(false);
                }}
              >
                <i className={"fas " + item.icon}></i>
                {item.label}
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            )
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-row">
            <div
              className="user-av"
              style={{
                background: isDoctor
                  ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
                  : isReceptionist
                  ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                  : undefined,
              }}
            >
              {isDoctor ? (
                <i className="fas fa-user-doctor" style={{ fontSize: 13 }}></i>
              ) : isReceptionist ? (
                <i className="fas fa-id-card-clip" style={{ fontSize: 13 }}></i>
              ) : (
                "A"
              )}
            </div>
            <div className="user-meta">
              <h4>
                {user?.name ||
                  (isDoctor
                    ? "د. أحمد كمال الدين"
                    : isReceptionist
                    ? "موظف الاستقبال"
                    : "المدير العام")}
              </h4>
              <p
                style={{
                  color: isDoctor ? "#c4b5fd" : isReceptionist ? "#93c5fd" : undefined,
                }}
              >
                {user?.title ||
                  (isDoctor
                    ? "استشاري الباطنة والكبد"
                    : isReceptionist
                    ? "تسجيل وحجز المرضى"
                    : "مدير المركز")}
              </p>
            </div>
            <button className="logout-btn" onClick={onLogout} title="تسجيل الخروج">
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Hamburger button for mobile */}
            <button
              className="icon-btn mobile-menu-btn"
              onClick={() => setSideOpen(!sideOpen)}
              title="القائمة"
            >
              <i className="fas fa-bars"></i>
            </button>

            <div>
              <h2>{pageTitle.title}</h2>
              <p>{pageTitle.sub}</p>
            </div>
          </div>

          <div className="topbar-right">
            {/* User Role Badge */}
            {isDoctor ? (
              <span
                style={{
                  fontSize: 11.5,
                  background: "#faf5ff",
                  color: "#6b21a8",
                  border: "1px solid #e9d5ff",
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="بوابة الطبيب المعالج"
              >
                <i className="fas fa-user-doctor" style={{ color: "#9333ea" }}></i>
                عيادة: {user?.name || "د. أحمد كمال الدين"}
              </span>
            ) : isReceptionist ? (
              <span
                style={{
                  fontSize: 11.5,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  border: "1px solid #bfdbfe",
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="صلاحيات حجز وتسجيل المرضى"
              >
                <i className="fas fa-id-card-clip" style={{ color: "#2563eb" }}></i>
                موظف حجز واستقبال
              </span>
            ) : (
              <span
                style={{
                  fontSize: 11.5,
                  background: "#ecfdf5",
                  color: "#047857",
                  border: "1px solid #a7f3d0",
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="صلاحيات المدير العام (كامل الصلاحيات والتقارير)"
              >
                <i className="fas fa-crown" style={{ color: "#059669" }}></i>
                المدير العام
              </span>
            )}

            {/* Database Status Indicator */}
            {isSupabaseConfigured ? (
              <span
                style={{
                  fontSize: 11.5,
                  background: "#ecfdf5",
                  color: "#059669",
                  border: "1px solid #a7f3d0",
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="متصل بقاعدة بيانات Supabase السحابية"
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }}></span>
                سوبابيز سحابي
              </span>
            ) : (
              <span
                style={{
                  fontSize: 11.5,
                  background: "#fffbeb",
                  color: "#d97706",
                  border: "1px solid #fde68a",
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="يعمل حالياً في الوضع المحلي (LocalStorage)"
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b" }}></span>
                تخزين محلي (Offline)
              </span>
            )}

            {/* Hotline Link */}
            <a
              href="tel:01001695023"
              className="hotline-btn"
              title="اتصال مباشر بالخط الساخن"
            >
              <i className="fas fa-headset"></i>
              <span>الخط الساخن: 01001695023</span>
            </a>

            <button
              className="icon-btn"
              onClick={() => navigate("/appointments")}
              title="المواعيد"
            >
              <i className="fas fa-calendar-check"></i>
            </button>

            <span className="date-chip">
              <i className="fas fa-calendar-alt" style={{ marginLeft: 6, color: "var(--primary)" }}></i>
              {today}
            </span>
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>

      {/* Overlay backdrop for mobile */}
      {sideOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 499,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setSideOpen(false)}
        />
      )}
    </div>
  );
}