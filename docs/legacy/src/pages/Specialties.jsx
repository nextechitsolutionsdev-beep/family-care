import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { specialties, insideServices, outsideServices } from "../data/mockData";

export default function Specialties() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filteredSpecs = specialties.filter(
    (s) =>
      s.name.includes(search) ||
      s.nameEn.toLowerCase().includes(search.toLowerCase()) ||
      s.desc.includes(search)
  );

  const totalDoctors = specialties.reduce((acc, s) => acc + s.doctors, 0);
  const totalToday = specialties.reduce((acc, s) => acc + s.today, 0);

  return (
    <div>
      {/* Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #1a1f2e 0%, #1e3c2f 100%)",
          borderRadius: 16,
          padding: "24px 28px",
          color: "#fff",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 8px 30px rgba(0,0,0,0.1)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span
              style={{
                background: "rgba(46,204,113,0.2)",
                color: "var(--primary)",
                padding: "3px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Since 2019
            </span>
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
              Family Care Medical Center
            </span>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 6px" }}>
            كل التخصصات في مكان واحد
          </h2>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.75)", fontSize: 13.5 }}>
            رعاية طبية شاملة لجميع أفراد الأسرة بكادر استشاري وأحدث التجهيزات والزيارات المنزلية
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="tel:01001695023"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--secondary)",
              color: "#fff",
              textDecoration: "none",
              padding: "10px 20px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 14,
              boxShadow: "0 4px 16px rgba(233,30,140,0.4)",
            }}
          >
            <i className="fas fa-phone-alt"></i>
            01001695023
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 22 }}>
        {[
          { label: "إجمالي التخصصات", value: specialties.length, icon: "fa-stethoscope", cls: "s-blue", clr: "#667eea" },
          { label: "مواعيد اليوم بالعيادات", value: totalToday, icon: "fa-calendar-check", cls: "s-green", clr: "#2ecc71" },
          { label: "كادر الأطباء والاستشاريين", value: totalDoctors, icon: "fa-user-doctor", cls: "s-teal", clr: "#00b894" },
          { label: "خدمات متكاملة داخل وخارج المركز", value: insideServices.length + outsideServices.length, icon: "fa-hand-holding-medical", cls: "s-pink", clr: "#e91e8c" },
        ].map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`}>
            <div className="stat-icon" style={{ background: `${s.clr}1a` }}>
              <i className={`fas ${s.icon}`} style={{ color: s.clr }}></i>
            </div>
            <div className="stat-num">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Specialties Grid */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <div>
            <h3>
              <i className="fas fa-stethoscope" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
              تخصصات فاميلي كير الطبية (14 تخصص)
            </h3>
            <p>اختر التخصص لمعاينة الأطباء وحجز موعد فوري</p>
          </div>
          <div className="search-wrap" style={{ width: 260 }}>
            <i className="fas fa-search"></i>
            <input
              placeholder="بحث في التخصصات..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {filteredSpecs.map((s) => (
              <div
                key={s.id}
                className="spec-card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  padding: "20px 18px",
                }}
              >
                <div className="spec-icon" style={{ background: s.bg }}>
                  <i className={`fas ${s.icon}`} style={{ color: s.color }}></i>
                </div>
                <h4 style={{ margin: "6px 0 2px", fontSize: 15, fontWeight: 800 }}>{s.name}</h4>
                <p style={{ fontSize: 11, color: "var(--gray-400)", margin: "0 0 10px" }}>{s.nameEn}</p>
                <p style={{ fontSize: 11.5, color: "var(--gray-600)", minHeight: 34, lineHeight: 1.5, margin: "0 0 14px" }}>
                  {s.desc}
                </p>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-around",
                    width: "100%",
                    background: "#fff",
                    borderRadius: 10,
                    padding: "8px 0",
                    border: "1px solid var(--gray-100)",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 800, color: s.color, fontSize: 17 }}>{s.today}</div>
                    <div style={{ fontSize: 10.5, color: "var(--gray-400)" }}>مواعيد اليوم</div>
                  </div>
                  <div style={{ width: 1, background: "var(--gray-200)" }}></div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: "var(--gray-800)" }}>{s.doctors}</div>
                    <div style={{ fontSize: 10.5, color: "var(--gray-400)" }}>أطباء متاحون</div>
                  </div>
                </div>

                <button
                  className="btn-primary"
                  style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
                  onClick={() => navigate("/appointments")}
                >
                  <i className="fas fa-calendar-plus"></i> حجز كشف في {s.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Services Grid (Inside & Outside the clinic) */}
      <div className="grid-2">
        {/* Inside Clinic */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                <i className="fas fa-hospital" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
                خدمات داخل المركز
              </h3>
              <p>تجهيزات وتقنيات متاحة بعياداتنا</p>
            </div>
            <span style={{ fontSize: 11.5, background: "#e8f8f0", color: "#2ecc71", padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>
              طوارئ 24 ساعة
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {insideServices.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--gray-50)",
                    borderRadius: 12,
                    border: "1px solid var(--gray-100)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: `${s.color}1a`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize: 16 }}></i>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gray-800)" }}>
                      {s.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--primary-dark)" }}>
                    {s.fee}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Outside Clinic / Home Services */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                <i className="fas fa-house-medical" style={{ color: "var(--secondary)", marginLeft: 8 }}></i>
                خدمات خارج المركز (الرعاية المنزلية)
              </h3>
              <p>فريق طبي وتمريضي متخصص يصلك حتى باب بيتك</p>
            </div>
            <span style={{ fontSize: 11.5, background: "#fce4ec", color: "#e91e8c", padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>
              زيارات منزلية
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {outsideServices.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--gray-50)",
                    borderRadius: 12,
                    border: "1px solid var(--gray-100)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: `${s.color}1a`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <i className={`fas ${s.icon}`} style={{ color: s.color, fontSize: 16 }}></i>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gray-800)" }}>
                      {s.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--secondary)" }}>
                    {s.fee}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}