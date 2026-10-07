import { useState } from "react";
import { apiLogin } from "../services/supabase";
import "./Login.css";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError("");

    const u = username.trim();
    const p = password.trim();

    if (!u || !p) {
      return setError("يرجى إدخال اسم المستخدم وكلمة المرور");
    }

    setLoading(true);
    try {
      const res = await apiLogin(u, p);
      if (res.success && res.user) {
        onLogin(res.user);
      } else {
        setError(res.error || "اسم المستخدم أو كلمة المرور غير صحيحة");
      }
    } catch (err) {
      setError("حدث خطأ أثناء تسجيل الدخول، يرجى المحاولة ثانية");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role) => {
    setError("");
    setLoading(true);
    try {
      if (role === "reception") {
        setUsername("reception");
        setPassword("rec123");
        const res = await apiLogin("reception", "rec123");
        if (res.success) onLogin(res.user);
      } else if (role === "doctor") {
        setUsername("doctor");
        setPassword("doc123");
        const res = await apiLogin("doctor", "doc123");
        if (res.success) onLogin(res.user);
      }
    } catch (err) {
      setError("تعذر تسجيل الدخول السريع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Brand Side Panel */}
      <div className="login-brand-panel">
        <div className="brand-content">
          <div className="brand-logo-wrap">
            <img
              src="/logo.jpg"
              alt="Family Care Logo"
              className="brand-logo-img"
              style={{ width: 105, height: 105, borderRadius: "50%", objectFit: "cover" }}
            />
            <span className="brand-since-badge">Since 2019</span>
          </div>

          <h1 className="brand-title">Family Care Medical Center</h1>
          <p className="brand-desc">
            مركز فاميلي كير الطبي المتكامل لـ 14 تخصصاً طبياً، جراحات اليوم الواحد، رعاية منزلية متطورة وطوارئ 24 ساعة.
          </p>

          <div className="brand-features-grid">
            {[
              { icon: "fa-stethoscope", title: "14 تخصص طبي" },
              { icon: "fa-user-doctor", title: "استشاريون متميزون" },
              { icon: "fa-house-medical", title: "خدمات وزيارات منزلية" },
              { icon: "fa-tooth", title: "طوارئ أسنان 24 ساعة" },
            ].map((f, i) => (
              <div key={i} className="brand-feat-card">
                <div className="brand-feat-icon">
                  <i className={`fas ${f.icon}`}></i>
                </div>
                <span className="brand-feat-text">{f.title}</span>
              </div>
            ))}
          </div>

          <div className="brand-hotline-bar">
            <i className="fas fa-headset"></i>
            <span>الخط الساخن المباشر: 01001695023</span>
          </div>
        </div>
      </div>

      {/* Login Form Panel */}
      <div className="login-form-panel">
        <div className="login-form-card">
          <div className="form-header">
            <img
              src="/logo.jpg"
              alt="Logo"
              className="form-logo-thumb"
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
            />
            <h2>تسجيل الدخول للنظام</h2>
            <p>أدخل بيانات الحساب للدخول إلى المنظومة الطبية</p>
          </div>

          {error && (
            <div className="alert-error">
              <i className="fas fa-circle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="login-input-group">
              <label>اسم المستخدم</label>
              <div className="input-box">
                <i className="fas fa-user field-icon"></i>
                <input
                  type="text"
                  placeholder="اسم المستخدم (reception أو doctor)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="login-input-group">
              <label>كلمة المرور</label>
              <div className="input-box">
                <i className="fas fa-lock field-icon"></i>
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="pass-toggle-btn"
                  onClick={() => setShowPass(!showPass)}
                  title={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  <i className={`fas ${showPass ? "fa-eye-slash" : "fa-eye"}`}></i>
                </button>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  <span>جاري التحقق والدخول...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-arrow-right-to-bracket"></i>
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>

            {/* Quick Demo Role Buttons (Reception & Doctor only) */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 6, fontWeight: 700, textAlign: "center" }}>
                تجربة سريعة بضغطة زر للموظفين:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  type="button"
                  className="demo-fill-btn"
                  style={{ marginTop: 0, padding: "8px 6px", fontSize: 11.5, background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}
                  onClick={() => handleQuickLogin("reception")}
                  disabled={loading}
                >
                  <i className="fas fa-id-card-clip" style={{ color: "#2563eb" }}></i>
                  <span>موظف الاستقبال</span>
                </button>
                <button
                  type="button"
                  className="demo-fill-btn"
                  style={{ marginTop: 0, padding: "8px 6px", fontSize: 11.5, background: "#faf5ff", color: "#6b21a8", borderColor: "#e9d5ff" }}
                  onClick={() => handleQuickLogin("doctor")}
                  disabled={loading}
                >
                  <i className="fas fa-user-doctor" style={{ color: "#9333ea" }}></i>
                  <span>الطبيب المعالج</span>
                </button>
              </div>
            </div>
          </form>

          <div className="login-credentials-note" style={{ fontSize: 11, lineHeight: 1.6 }}>
            <div>📋 <strong>الاستقبال:</strong> reception / rec123 (تسجيل وحجز المرضى فقط)</div>
            <div>🩺 <strong>الطبيب:</strong> doctor / doc123 (حالات اليوم، الكشف والروشتة)</div>
            <div style={{ color: "#94a3b8", fontSize: 10.5, marginTop: 4 }}>
              🔒 حساب الإدارة محمي ويتم إدخاله يدوياً في الخانات أعلاه.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}