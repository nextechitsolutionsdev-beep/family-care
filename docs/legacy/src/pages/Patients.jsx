import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { specialties } from "../data/mockData";
import { exportToExcel } from "../utils/storage";
import {
  apiGetPatients,
  apiCreatePatient,
  apiUpdatePatient,
  apiDeletePatient,
  isSupabaseConfigured,
} from "../services/supabase";

const STATUS_STYLE = {
  "جديد": { bg: "#e8f8f0", color: "#2ecc71" },
  "مستمر": { bg: "#eaf4fb", color: "#3498db" },
  "مزمن": { bg: "#fdeaea", color: "#e74c3c" },
};

const BLOOD_COLORS = {
  "A+": "#e74c3c",
  "A-": "#c0392b",
  "B+": "#e67e22",
  "B-": "#d35400",
  "O+": "#2ecc71",
  "O-": "#27ae60",
  "AB+": "#9b59b6",
  "AB-": "#8e44ad",
};

const EMPTY = {
  name: "",
  age: "",
  phone: "",
  email: "",
  gender: "ذكر",
  bloodType: "O+",
  specialty: "باطنه",
  status: "جديد",
  notes: "",
};

export default function Patients({ user }) {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [filterSpec, setFilterSpec] = useState("الكل");

  const [modal, setModal] = useState(false);
  const [viewModal, setViewModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    const load = async () => {
      const res = await apiGetPatients();
      setData(res);
    };
    load();
  }, []);

  const filtered = data.filter((p) => {
    const matchSearch =
      (p.name && p.name.includes(search)) ||
      (p.phone && p.phone.includes(search)) ||
      (p.notes && p.notes.includes(search));
    const matchStatus = filterStatus === "الكل" || p.status === filterStatus;
    const matchSpec = filterSpec === "الكل" || p.specialty === filterSpec;
    return matchSearch && matchStatus && matchSpec;
  });

  const openAdd = () => {
    setForm(EMPTY);
    setEditing(null);
    setModal(true);
  };

  const openEdit = (p) => {
    setForm({ ...p });
    setEditing(p.id);
    setModal(true);
  };

  const closeModal = () => {
    setModal(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) return alert("اسم المريض ورقم الهاتف مطلوبان");
    if (editing) {
      const updated = await apiUpdatePatient(editing, form);
      setData((prev) => prev.map((p) => (p.id === editing ? updated : p)));
    } else {
      const created = await apiCreatePatient(form);
      setData((prev) => [created, ...prev]);
    }
    closeModal();
  };

  const handleDelete = async (id) => {
    if (window.confirm("هل أنت متأكد من حذف ملف هذا المريض نهائياً؟")) {
      await apiDeletePatient(id);
      setData((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleExportCSV = () => {
    const exportData = filtered.map((p, i) => ({
      "م": i + 1,
      "اسم المريض": p.name,
      "السن": p.age,
      "الجنس": p.gender,
      "رقم الهاتف": p.phone,
      "البريد": p.email,
      "فصيلة الدم": p.bloodType,
      "العيادة الرئيسية": p.specialty,
      "تاريخ آخر زيارة": p.lastVisit,
      "إجمالي الزيارات": p.totalVisits,
      "الحالة": p.status,
      "ملاحظات وتاريخ مرضي": p.notes || "",
    }));
    exportToExcel(exportData, `مرضى_عيادة_فاميلي_كير_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div>
      {/* Stats Cards */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 20 }}>
        {[
          { label: "إجمالي سجل المرضى", value: data.length, icon: "fa-users", cls: "s-blue", clr: "#667eea" },
          { label: "مرضى جدد هذا الشهر", value: data.filter((p) => p.status === "جديد").length, icon: "fa-user-plus", cls: "s-green", clr: "#2ecc71" },
          { label: "مرضى متابعة مستمرة", value: data.filter((p) => p.status === "مستمر").length, icon: "fa-user-check", cls: "s-teal", clr: "#00b894" },
          { label: "حالات أمراض مزمنة", value: data.filter((p) => p.status === "مزمن").length, icon: "fa-heart-pulse", cls: "s-pink", clr: "#e74c3c" },
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

      {/* Main Patients Card */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3>
              <i className="fas fa-users" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
              ملفات وسجل المرضى
            </h3>
            <p>إدارة بيانات وتاريخ المرضى ({filtered.length} مريض)</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" onClick={handleExportCSV} title="تصدير سجل المرضى إلى إكسيل">
              <i className="fas fa-file-excel" style={{ color: "#27ae60", marginLeft: 6 }}></i>
              تصدير إكسيل
            </button>
            <button className="btn-primary" onClick={openAdd}>
              <i className="fas fa-plus"></i> إضافة مريض جديد
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="filters-row">
            <div className="search-wrap" style={{ flex: 1.5 }}>
              <i className="fas fa-search"></i>
              <input
                placeholder="بحث باسم المريض أو رقم الهاتف أو الملاحظات..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="الكل">كل الحالات</option>
              <option value="جديد">جديد</option>
              <option value="مستمر">مستمر</option>
              <option value="مزمن">مزمن</option>
            </select>
            <select className="filter-select" value={filterSpec} onChange={(e) => setFilterSpec(e.target.value)}>
              <option value="الكل">كل التخصصات</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>المريض</th>
                  <th>السن / الجنس</th>
                  <th>الهاتف</th>
                  <th>فصيلة الدم</th>
                  <th>العيادة المتابعة</th>
                  <th>آخر زيارة</th>
                  <th>الزيارات</th>
                  <th>الحالة</th>
                  <th style={{ textAlign: "center" }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>
                      <i className="fas fa-user-slash" style={{ fontSize: 36, marginBottom: 12, display: "block" }}></i>
                      لا يوجد مرضى مطابقون لخيارات البحث
                    </td>
                  </tr>
                ) : (
                  filtered.map((p, i) => {
                    const sc = STATUS_STYLE[p.status] || STATUS_STYLE["جديد"];
                    const bc = BLOOD_COLORS[p.bloodType] || "#999";
                    return (
                      <tr key={p.id}>
                        <td style={{ color: "var(--gray-400)", fontSize: 12 }}>{i + 1}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: `linear-gradient(135deg, ${sc.color}, #764ba2)`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: 13,
                                flexShrink: 0,
                              }}
                            >
                              {p.name[0]}
                            </div>
                            <div>
                              <strong style={{ fontSize: 13.5, display: "block", color: "var(--gray-900)" }}>
                                {p.name}
                              </strong>
                              {p.notes && (
                                <span style={{ fontSize: 11, color: "var(--gray-400)" }}>
                                  {p.notes.length > 25 ? p.notes.slice(0, 25) + "..." : p.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 13 }}>{p.age} سنة</span>
                          <span style={{ fontSize: 11, color: "var(--gray-400)", marginRight: 5 }}>({p.gender})</span>
                        </td>
                        <td style={{ direction: "ltr", textAlign: "right", fontWeight: 600, fontSize: 12.5 }}>
                          {p.phone}
                        </td>
                        <td>
                          <span
                            style={{
                              background: `${bc}1a`,
                              color: bc,
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 12,
                            }}
                          >
                            {p.bloodType}
                          </span>
                        </td>
                        <td style={{ fontSize: 12.5 }}>{p.specialty}</td>
                        <td style={{ fontSize: 12, color: "var(--gray-600)" }}>{p.lastVisit}</td>
                        <td>
                          <span style={{ fontWeight: 800, color: "var(--primary-dark)", fontSize: 13 }}>
                            {p.totalVisits}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              background: sc.bg,
                              color: sc.color,
                              padding: "3px 10px",
                              borderRadius: 20,
                              fontSize: 11.5,
                              fontWeight: 700,
                            }}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                            {/* حجز موعد مباشر عند طبيب */}
                            <button
                              className="tbl-btn"
                              style={{ background: "#eff6ff", color: "#2563eb", fontWeight: 700 }}
                              onClick={() => navigate("/appointments")}
                              title="حجز موعد كشف لهذا المريض عند أحد الأطباء"
                            >
                              <i className="fas fa-calendar-plus"></i> حجز كشف
                            </button>
                            <button
                              className="tbl-btn view"
                              onClick={() => setViewModal(p)}
                              title="عرض الملف الطبي كاملاً"
                            >
                              <i className="fas fa-eye"></i> الملف
                            </button>
                            <button className="tbl-btn edit" onClick={() => openEdit(p)} title="تعديل">
                              <i className="fas fa-pen"></i>
                            </button>
                            <button className="tbl-btn del" onClick={() => handleDelete(p.id)} title="حذف">
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Patient Modal */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="modal-head">
              <h3>
                <i className="fas fa-user-shield" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
                {editing ? "تعديل ملف مريض" : "تسجيل مريض جديد"}
              </h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>اسم المريض بالكامل *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="الاسم ثلاثي أو رباعي"
                  />
                </div>
                <div className="form-group">
                  <label>رقم الهاتف للتواصل *</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                  />
                </div>
                <div className="form-group">
                  <label>البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="patient@example.com"
                  />
                </div>
                <div className="form-group">
                  <label>العمر (بالسنوات)</label>
                  <input
                    type="number"
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="form-group">
                  <label>الجنس</label>
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    <option>ذكر</option>
                    <option>أنثى</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>فصيلة الدم</label>
                  <select value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })}>
                    {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>العيادة الأساسية</label>
                  <select value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })}>
                    {specialties.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>حالة المريض</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option>جديد</option>
                    <option>مستمر</option>
                    <option>مزمن</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>التاريخ المرضي والملاحظات / حساسية الأدوية</label>
                  <textarea
                    rows={3}
                    style={{
                      padding: "9px 13px",
                      border: "1.5px solid var(--gray-200)",
                      borderRadius: 10,
                      fontFamily: "Cairo",
                      fontSize: 13,
                      outline: "none",
                      background: "var(--gray-50)",
                    }}
                    value={form.notes || ""}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="أدخل أي ملاحظات طبية هامة أو حساسية من أدوية معينة..."
                  ></textarea>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={closeModal}>
                إلغاء
              </button>
              <button className="btn-primary" onClick={handleSave}>
                <i className="fas fa-save"></i> حفظ البيانات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Patient Profile View Modal */}
      {viewModal && (
        <div className="modal-overlay" onClick={() => setViewModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-head">
              <h3>
                <i className="fas fa-id-card" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
                الملف الطبي للمريض
              </h3>
              <button className="modal-close" onClick={() => setViewModal(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${STATUS_STYLE[viewModal.status]?.color || "#667eea"}, #764ba2)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 30,
                    margin: "0 auto 12px",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                  }}
                >
                  {viewModal.name[0]}
                </div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{viewModal.name}</h2>
                <p style={{ color: "var(--gray-500)", marginTop: 4, fontSize: 13 }}>
                  العيادة الأساسية: <strong>{viewModal.specialty}</strong> • كود: #{viewModal.id}
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {[
                  { icon: "fa-phone", label: "رقم الهاتف", value: viewModal.phone },
                  { icon: "fa-envelope", label: "البريد الإلكتروني", value: viewModal.email || "غير مسجل" },
                  { icon: "fa-cake-candles", label: "السن", value: `${viewModal.age} سنة` },
                  { icon: "fa-venus-mars", label: "الجنس", value: viewModal.gender },
                  { icon: "fa-droplet", label: "فصيلة الدم", value: viewModal.bloodType },
                  { icon: "fa-clock", label: "آخر زيارة للعيادة", value: viewModal.lastVisit },
                  { icon: "fa-repeat", label: "إجمالي الزيارات", value: `${viewModal.totalVisits} زيارة` },
                  { icon: "fa-circle-info", label: "تصنيف الحالة", value: viewModal.status },
                ].map((item, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--gray-50)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <i className={`fas ${item.icon}`} style={{ color: "var(--primary)", width: 16, textAlign: "center" }}></i>
                    <div>
                      <div style={{ fontSize: 10.5, color: "var(--gray-400)" }}>{item.label}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gray-800)" }}>{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Notes & Medical History Box */}
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fef3c7",
                  borderRadius: 12,
                  padding: "12px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#d97706", fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>
                  <i className="fas fa-notes-medical"></i> الملاحظات الطبية والحساسية
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#78350f", lineHeight: 1.6 }}>
                  {viewModal.notes || "لا توجد ملاحظات مرضية مسجلة حالياً."}
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-primary" onClick={() => setViewModal(null)}>
                إغلاق الملف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}