import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { specialties } from "../data/mockData";
import { exportToExcel } from "../utils/storage";
import {
  apiGetDoctors,
  apiCreateDoctor,
  apiUpdateDoctor,
  apiDeleteDoctor,
  isSupabaseConfigured,
} from "../services/supabase";

const EMPTY = {
  name: "",
  specialty: "باطنه",
  phone: "",
  email: "",
  experience: 5,
  fee: 200,
  available: true,
  schedule: ["السبت", "الاثنين", "الأربعاء"],
};

const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

export default function Doctors() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [filterSpec, setFilterSpec] = useState("الكل");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    const load = async () => {
      const res = await apiGetDoctors();
      setData(res);
    };
    load();
  }, []);

  const filtered = data.filter((d) => {
    const matchSearch =
      (d.name && d.name.includes(search)) ||
      (d.phone && d.phone.includes(search)) ||
      (d.specialty && d.specialty.includes(search));
    const matchSpec = filterSpec === "الكل" || d.specialty === filterSpec;
    return matchSearch && matchSpec;
  });

  const openAdd = () => {
    setForm(EMPTY);
    setEditing(null);
    setModal(true);
  };

  const openEdit = (d) => {
    setForm({ ...d, schedule: [...(d.schedule || [])] });
    setEditing(d.id);
    setModal(true);
  };

  const closeModal = () => {
    setModal(false);
    setEditing(null);
  };

  const toggleDay = (day) => {
    setForm((prev) => ({
      ...prev,
      schedule: prev.schedule.includes(day)
        ? prev.schedule.filter((d) => d !== day)
        : [...prev.schedule, day],
    }));
  };

  const handleSave = async () => {
    if (!form.name || !form.specialty) return alert("اسم الطبيب والتخصص مطلوبان");
    if (editing) {
      const updated = await apiUpdateDoctor(editing, form);
      setData((prev) => prev.map((d) => (d.id === editing ? updated : d)));
    } else {
      const created = await apiCreateDoctor(form);
      setData((prev) => [...prev, created]);
    }
    closeModal();
  };

  const toggleAvail = async (id) => {
    const item = data.find((d) => d.id === id);
    if (!item) return;
    const updated = { ...item, available: !item.available };
    await apiUpdateDoctor(id, updated);
    setData((prev) => prev.map((d) => (d.id === id ? updated : d)));
  };

  const handleDelete = async (id) => {
    if (window.confirm("هل أنت متأكد من حذف بيانات هذا الطبيب؟")) {
      await apiDeleteDoctor(id);
      setData((prev) => prev.filter((d) => d.id !== id));
    }
  };

  const handleExportCSV = () => {
    const exportData = filtered.map((d, i) => ({
      "م": i + 1,
      "اسم الطبيب": d.name,
      "التخصص": d.specialty,
      "رقم الهاتف": d.phone,
      "البريد الإلكتروني": d.email,
      "سنوات الخبرة": d.experience,
      "قيمة الكشف (ج.م)": d.fee,
      "الحالة": d.available ? "متاح" : "غير متاح",
      "أيام العمل": (d.schedule || []).join(" - "),
      "التقييم": d.rating,
      "إجمالي المرضى": d.patients,
    }));
    exportToExcel(exportData, `أطباء_عيادة_فاميلي_كير_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div>
      {/* Stats Cards */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 20 }}>
        {[
          { label: "إجمالي الأطباء", value: data.length, icon: "fa-user-doctor", cls: "s-blue", clr: "#667eea" },
          { label: "متاحون بالعيادات الآن", value: data.filter((d) => d.available).length, icon: "fa-circle-check", cls: "s-green", clr: "#2ecc71" },
          { label: "غير متاحين حالياً", value: data.filter((d) => !d.available).length, icon: "fa-circle-xmark", cls: "s-pink", clr: "#e74c3c" },
          {
            label: "متوسط تقييم المرضى",
            value: data.length ? (data.reduce((a, d) => a + d.rating, 0) / data.length).toFixed(1) : "5.0",
            icon: "fa-star",
            cls: "s-teal",
            clr: "#f59e0b",
          },
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

      {/* Main Doctors Card */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3>
              <i className="fas fa-user-doctor" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
              كادر الأطباء والاستشاريين
            </h3>
            <p>إدارة مواعيد وعيادات الأطباء ({filtered.length} طبيب)</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" onClick={handleExportCSV} title="تصدير بيانات الأطباء إلى إكسيل">
              <i className="fas fa-file-excel" style={{ color: "#27ae60", marginLeft: 6 }}></i>
              تصدير إكسيل
            </button>
            <button className="btn-primary" onClick={openAdd}>
              <i className="fas fa-plus"></i> إضافة طبيب جديد
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="filters-row">
            <div className="search-wrap" style={{ flex: 1.5 }}>
              <i className="fas fa-search"></i>
              <input
                placeholder="بحث باسم الطبيب أو التخصص..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="filter-select" value={filterSpec} onChange={(e) => setFilterSpec(e.target.value)}>
              <option value="الكل">كل التخصصات (14 تخصص)</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div
            className="grid-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              marginTop: 18,
            }}
          >
            {filtered.map((doc) => (
              <div key={doc.id} className="doc-card">
                <div className="doc-card-top">
                  <div
                    className="doc-avatar"
                    style={{
                      background: doc.available
                        ? "linear-gradient(135deg, #2ecc71, #27ae60)"
                        : "linear-gradient(135deg, #94a3b8, #64748b)",
                    }}
                  >
                    {doc.name.split(" ")[1]?.[0] || doc.name[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{doc.name}</h4>
                      <button
                        onClick={() => toggleAvail(doc.id)}
                        style={{
                          background: doc.available ? "#e8f8f0" : "#fdeaea",
                          color: doc.available ? "#2ecc71" : "#e74c3c",
                          border: "none",
                          borderRadius: 20,
                          padding: "2px 8px",
                          fontSize: 10.5,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {doc.available ? "متاح الآن" : "غير متاح"}
                      </button>
                    </div>
                    <p style={{ margin: "2px 0 0", color: "var(--primary-dark)", fontSize: 12, fontWeight: 700 }}>
                      {doc.specialty}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11, color: "var(--gray-400)" }}>
                      <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                        <i className="fas fa-star" style={{ marginLeft: 3 }}></i>
                        {doc.rating}
                      </span>
                      <span>•</span>
                      <span>خبرة {doc.experience} سنوات</span>
                      <span>•</span>
                      <span style={{ color: "#10b981", fontWeight: 700 }}>{doc.fee} ج.م</span>
                    </div>
                  </div>
                </div>

                {/* Days Schedule */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--gray-500)", marginBottom: 4, fontWeight: 700 }}>
                    <i className="fas fa-calendar-days" style={{ marginLeft: 5 }}></i> أيام التواجد بالعيادة:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {(doc.schedule || []).map((day) => (
                      <span
                        key={day}
                        style={{
                          fontSize: 10.5,
                          background: "var(--gray-100)",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontWeight: 600,
                          color: "var(--gray-700)",
                        }}
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="doc-stats">
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "var(--gray-800)" }}>{doc.patients}</div>
                    <div style={{ fontSize: 10.5, color: "var(--gray-400)" }}>مريض معالج</div>
                  </div>
                  <div style={{ width: 1, background: "var(--gray-200)" }}></div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "var(--primary)" }}>{doc.appointments}</div>
                    <div style={{ fontSize: 10.5, color: "var(--gray-400)" }}>موعد هذا الشهر</div>
                  </div>
                  <div style={{ width: 1, background: "var(--gray-200)" }}></div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#e91e8c" }}>{doc.fee}</div>
                    <div style={{ fontSize: 10.5, color: "var(--gray-400)" }}>سعر الكشف</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="doc-actions">
                  <button
                    className="btn-primary"
                    style={{ flex: 2, justifyContent: "center", fontSize: 11.5 }}
                    onClick={() => navigate("/appointments")}
                  >
                    <i className="fas fa-calendar-plus"></i> حجز كشف
                  </button>
                  <button className="tbl-btn edit" onClick={() => openEdit(doc)} title="تعديل">
                    <i className="fas fa-pen"></i>
                  </button>
                  <button className="tbl-btn del" onClick={() => handleDelete(doc.id)} title="حذف">
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add / Edit Doctor Modal */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="modal-head">
              <h3>
                <i className="fas fa-user-doctor" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
                {editing ? "تعديل بيانات الطبيب" : "إضافة طبيب جديد"}
              </h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>اسم الطبيب كاملاً *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: د. أحمد محمد علي"
                  />
                </div>
                <div className="form-group">
                  <label>التخصص الطبي *</label>
                  <select value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })}>
                    {specialties.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>قيمة الكشف (ج.م) *</label>
                  <input
                    type="number"
                    value={form.fee}
                    onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
                    placeholder="200"
                  />
                </div>
                <div className="form-group">
                  <label>رقم الهاتف</label>
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
                    placeholder="dr@fcmc.com"
                  />
                </div>
                <div className="form-group">
                  <label>سنوات الخبرة</label>
                  <input
                    type="number"
                    value={form.experience}
                    onChange={(e) => setForm({ ...form, experience: Number(e.target.value) })}
                    placeholder="10"
                  />
                </div>
                <div className="form-group">
                  <label>حالة التواجد</label>
                  <select
                    value={form.available ? "متاح" : "غير متاح"}
                    onChange={(e) => setForm({ ...form, available: e.target.value === "متاح" })}
                  >
                    <option value="متاح">متاح الآن بالمركز</option>
                    <option value="غير متاح">غير متاح حالياً</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>أيام العمل الأسبوعية بالعيادة</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                    {DAYS.map((day) => {
                      const selected = (form.schedule || []).includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 10,
                            border: `1.5px solid ${selected ? "var(--primary)" : "var(--gray-200)"}`,
                            background: selected ? "var(--primary)" : "var(--gray-50)",
                            color: selected ? "#fff" : "var(--gray-700)",
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={closeModal}>
                إلغاء
              </button>
              <button className="btn-primary" onClick={handleSave}>
                <i className="fas fa-save"></i> حفظ بيانات الطبيب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}