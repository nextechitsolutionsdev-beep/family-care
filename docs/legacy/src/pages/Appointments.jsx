import { useState, useEffect } from "react";
import { specialties } from "../data/mockData";
import { exportToExcel } from "../utils/storage";
import {
  apiGetAppointments,
  apiCreateAppointment,
  apiUpdateAppointment,
  apiDeleteAppointment,
  apiGetDoctors,
  apiGetPatients,
  apiCreatePatient,
  isSupabaseConfigured,
} from "../services/supabase";
import PrintTicketModal from "../components/PrintTicketModal";

const STATUS_CONFIG = {
  "مؤكد": { bg: "#e8f8f0", color: "#2ecc71", border: "#2ecc71", icon: "fa-check" },
  "جاري": { bg: "#eef2ff", color: "#6366f1", border: "#6366f1", icon: "fa-spinner fa-spin" },
  "انتظار": { bg: "#fffbeb", color: "#f59e0b", border: "#f59e0b", icon: "fa-clock" },
  "مكتمل": { bg: "#ecfdf5", color: "#10b981", border: "#10b981", icon: "fa-check-double" },
  "ملغي": { bg: "#fef2f2", color: "#ef4444", border: "#ef4444", icon: "fa-times" },
};

const TYPE_ICONS = {
  "كشف": "fa-stethoscope",
  "متابعة": "fa-rotate",
  "استشارة": "fa-comments",
  "جلسة": "fa-spa",
  "سونار": "fa-radiation",
  "تحاليل": "fa-flask-vial",
  "منزلي": "fa-house-medical",
  "طوارئ": "fa-truck-medical",
};

const EMPTY_FORM = {
  patient: "",
  patientPhone: "",
  doctor: "",
  specialty: "باطنه",
  date: new Date().toISOString().slice(0, 10),
  time: "10:00",
  status: "مؤكد",
  type: "كشف",
  location: "داخل المركز",
  payment: "مدفوع",
  fee: 200,
  notes: "",
};

export default function Appointments({ user: propUser }) {
  const activeUser = propUser || (() => {
    try {
      return JSON.parse(localStorage.getItem("clinic_user") || "{}");
    } catch {
      return {};
    }
  })();
  const isReceptionist = activeUser?.role === "receptionist";

  const [data, setData] = useState([]);
  const [doctorsList, setDoctorsList] = useState([]);
  const [patientsList, setPatientsList] = useState([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [filterSpec, setFilterSpec] = useState("الكل");
  const [filterDate, setFilterDate] = useState("الكل");

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [ticketToPrint, setTicketToPrint] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [apts, docs, pts] = await Promise.all([
        apiGetAppointments(),
        apiGetDoctors(),
        apiGetPatients(),
      ]);
      setData(apts);
      setDoctorsList(docs);
      setPatientsList(pts);
    };
    load();
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const filtered = data.filter((a) => {
    const matchSearch =
      (a.patient && a.patient.includes(search)) ||
      (a.doctor && a.doctor.includes(search)) ||
      (a.notes && a.notes.includes(search));
    const matchStatus = filterStatus === "الكل" || a.status === filterStatus;
    const matchSpec = filterSpec === "الكل" || a.specialty === filterSpec;

    let matchDate = true;
    if (filterDate === "اليوم") matchDate = a.date === todayStr;
    else if (filterDate === "غداً") matchDate = a.date === tomorrowStr;

    return matchSearch && matchStatus && matchSpec && matchDate;
  });

  const openAdd = () => {
    setForm({
      ...EMPTY_FORM,
      date: new Date().toISOString().slice(0, 10),
    });
    setEditing(null);
    setModal(true);
  };

  const openEdit = (a) => {
    setForm({ ...a });
    setEditing(a.id);
    setModal(true);
  };

  const closeModal = () => {
    setModal(false);
    setEditing(null);
  };

  // تغيير التخصص يفلتر الطبيب تلقائياً
  const handleSpecialtyChange = (spec) => {
    const specDocs = doctorsList.filter((d) => d.specialty === spec);
    const defaultDoc = specDocs.length > 0 ? specDocs[0] : null;
    setForm((prev) => ({
      ...prev,
      specialty: spec,
      doctor: defaultDoc ? defaultDoc.name : "",
      fee: defaultDoc ? defaultDoc.fee : prev.fee,
    }));
  };

  const handleDoctorChange = (docName) => {
    const docObj = doctorsList.find((d) => d.name === docName);
    setForm((prev) => ({
      ...prev,
      doctor: docName,
      specialty: docObj ? docObj.specialty : prev.specialty,
      fee: docObj ? docObj.fee : prev.fee,
    }));
  };

  const handleSave = async () => {
    if (!form.patient || !form.doctor || !form.date || !form.time) {
      return alert("يرجى ملء جميع الحقول الإلزامية (المريض، الطبيب، التاريخ، الوقت)");
    }

    // Auto register patient if not already in system
    const trimmedPatientName = form.patient.trim();
    const existingPatient = patientsList.find(
      (p) => p.name && p.name.trim().toLowerCase() === trimmedPatientName.toLowerCase()
    );
    if (!existingPatient && trimmedPatientName) {
      try {
        const newPt = await apiCreatePatient({
          name: trimmedPatientName,
          phone: form.patientPhone || "غير مسجل",
          gender: "ذكر",
          bloodType: "O+",
          specialty: form.specialty,
          notes: form.notes ? `تم التسجيل عبر حجز العيادة: ${form.notes}` : "تم تسجيل المريض آلياً عند حجز الكشف",
        });
        if (newPt) {
          setPatientsList((prev) => [newPt, ...prev]);
        }
      } catch (err) {
        console.warn("Auto patient registration note:", err);
      }
    }

    if (editing) {
      const updated = await apiUpdateAppointment(editing, form);
      setData((prev) => prev.map((a) => (a.id === editing ? updated : a)));
    } else {
      const created = await apiCreateAppointment(form);
      setData((prev) => [created, ...prev]);
    }
    closeModal();
  };

  const handleQuickStatus = async (id, newStatus) => {
    const item = data.find((a) => a.id === id);
    if (!item) return;
    const updated = { ...item, status: newStatus };
    await apiUpdateAppointment(id, updated);
    setData((prev) => prev.map((a) => (a.id === id ? updated : a)));
  };

  const handleDelete = async (id) => {
    if (window.confirm("هل أنت متأكد من رغبتك في حذف هذا الموعد نهائياً؟")) {
      await apiDeleteAppointment(id);
      setData((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const handleExportCSV = () => {
    const exportData = filtered.map((a, i) => ({
      "م": i + 1,
      "رقم الحجز": a.id,
      "اسم المريض": a.patient,
      "الطبيب المعالج": a.doctor,
      "التخصص": a.specialty,
      "تاريخ الموعد": a.date,
      "الوقت": a.time,
      "نوع الكشف": a.type,
      "المكان": a.location || "داخل المركز",
      "الرسوم (ج.م)": a.fee,
      "حالة الدفع": a.payment || "مدفوع",
      "حالة الموعد": a.status,
    }));
    exportToExcel(exportData, `مواعيد_عيادة_فاميلي_كير_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const counts = {
    total: data.length,
    today: data.filter((a) => a.date === todayStr).length,
    confirmed: data.filter((a) => a.status === "مؤكد" || a.status === "جاري").length,
    waiting: data.filter((a) => a.status === "انتظار").length,
    completed: data.filter((a) => a.status === "مكتمل").length,
    totalIncome: data.filter((a) => a.status !== "ملغي").reduce((acc, a) => acc + (Number(a.fee) || 0), 0),
  };

  return (
    <div>
      {/* Role Notice Banner for Receptionist */}
      {isReceptionist && (
        <div
          style={{
            background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
            border: "1px solid #bfdbfe",
            borderRadius: 12,
            padding: "12px 18px",
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(37,99,235,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "#2563eb",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              <i className="fas fa-id-card-clip"></i>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: "#1e3a8a" }}>
                شاشة الاستقبال وحجز المرضى عند الأطباء
              </div>
              <div style={{ fontSize: 12, color: "#3b82f6" }}>
                يمكنك تسجيل مريض جديد، حجزه مباشرة عند أي من أطباء الـ 14 تخصصاً، وطباعة تذكرة كشف معتمدة فوراً.
              </div>
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ padding: "7px 16px", fontSize: 12.5 }}
            onClick={openAdd}
          >
            <i className="fas fa-plus"></i> حجز كشف جديد
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(5, 1fr)", marginBottom: 20 }}>
        {[
          { label: "إجمالي المواعيد", value: counts.total, icon: "fa-calendar-days", cls: "s-blue", clr: "#667eea" },
          { label: "مواعيد اليوم", value: counts.today, icon: "fa-calendar-day", cls: "s-pink", clr: "#e91e8c" },
          { label: "مؤكدة / جارية", value: counts.confirmed, icon: "fa-circle-check", cls: "s-green", clr: "#2ecc71" },
          { label: "في غرفة الانتظار", value: counts.waiting, icon: "fa-hourglass-half", cls: "s-teal", clr: "#f59e0b" },
          isReceptionist
            ? { label: "كشوفات مكتملة اليوم", value: counts.completed, icon: "fa-clipboard-check", cls: "s-green", clr: "#10b981" }
            : { label: "إجمالي التحصيل", value: `${counts.totalIncome.toLocaleString()} ج.م`, icon: "fa-sack-dollar", cls: "s-green", clr: "#10b981" },
        ].map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`}>
            <div className="stat-icon" style={{ background: `${s.clr}1a` }}>
              <i className={`fas ${s.icon}`} style={{ color: s.clr }}></i>
            </div>
            <div className="stat-num" style={{ fontSize: typeof s.value === "string" && s.value.length > 7 ? 20 : 28 }}>
              {s.value}
            </div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3>
              <i className="fas fa-calendar-check" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
              جدول المواعيد والحجوزات
            </h3>
            <p>
              يتم عرض <strong>{filtered.length}</strong> موعد مطابق للبحث
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" onClick={handleExportCSV} title="تصدير إلى ملف إكسيل CSV عربي">
              <i className="fas fa-file-excel" style={{ color: "#27ae60", marginLeft: 6 }}></i>
              تصدير إكسيل
            </button>
            <button className="btn-primary" onClick={openAdd}>
              <i className="fas fa-plus"></i> حجز موعد جديد
            </button>
          </div>
        </div>

        <div className="card-body">
          {/* Filters Bar */}
          <div className="filters-row" style={{ alignItems: "center" }}>
            <div className="search-wrap" style={{ flex: 1.5 }}>
              <i className="fas fa-search"></i>
              <input
                placeholder="بحث باسم المريض أو الطبيب..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="filter-select" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
                <option value="الكل">كل التواريخ</option>
                <option value="اليوم">مواعيد اليوم فقط</option>
                <option value="غداً">مواعيد غداً</option>
              </select>

              <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="الكل">كل الحالات</option>
                <option value="مؤكد">مؤكد</option>
                <option value="جاري">جاري الآن</option>
                <option value="انتظار">في الانتظار</option>
                <option value="مكتمل">مكتمل</option>
                <option value="ملغي">ملغي</option>
              </select>

              <select className="filter-select" value={filterSpec} onChange={(e) => setFilterSpec(e.target.value)}>
                <option value="الكل">كل التخصصات (14 تخصص)</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>المريض</th>
                  <th>الطبيب</th>
                  <th>التخصص</th>
                  <th>الموعد والتوقيت</th>
                  <th>نوع الخدمة</th>
                  <th>الرسوم والدفع</th>
                  <th>الحالة</th>
                  <th style={{ textAlign: "center" }}>إجراءات الحجز</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>
                      <i className="fas fa-calendar-xmark" style={{ fontSize: 36, marginBottom: 12, display: "block" }}></i>
                      لا توجد مواعيد مطابقة للبحث
                    </td>
                  </tr>
                ) : (
                  filtered.map((a, i) => {
                    const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG["انتظار"];
                    const isToday = a.date === todayStr;
                    return (
                      <tr key={a.id} style={{ background: isToday ? "rgba(46,204,113,0.02)" : "transparent" }}>
                        <td style={{ color: "var(--gray-400)", fontSize: 12 }}>{i + 1}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
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
                              {a.patient ? a.patient[0] : "م"}
                            </div>
                            <div>
                              <strong style={{ fontSize: 13, display: "block", color: "var(--gray-900)" }}>
                                {a.patient}
                              </strong>
                              {a.location === "خدمة منزلية" && (
                                <span style={{ fontSize: 10, color: "#e91e8c", fontWeight: 700 }}>
                                  <i className="fas fa-house-medical" style={{ marginLeft: 3 }}></i> زيارة منزلية
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 13, color: "var(--primary-dark)", fontWeight: 700 }}>
                            {a.doctor}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: "var(--gray-600)" }}>{a.specialty}</span>
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: isToday ? "var(--primary-dark)" : "var(--gray-800)" }}>
                            {a.date} {isToday && <span style={{ fontSize: 10, background: "#e8f8f0", color: "#2ecc71", padding: "1px 6px", borderRadius: 10 }}>اليوم</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--gray-400)", direction: "ltr", display: "inline-block" }}>
                            {a.time}
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11.5,
                              background: "var(--gray-100)",
                              padding: "3px 10px",
                              borderRadius: 20,
                              fontWeight: 600,
                            }}
                          >
                            <i className={`fas ${TYPE_ICONS[a.type] || "fa-stethoscope"}`} style={{ color: "var(--primary)" }}></i>
                            {a.type}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 800, color: "#2ecc71", fontSize: 13 }}>
                            {a.fee} ج.م
                          </div>
                          <span
                            style={{
                              fontSize: 10.5,
                              color: a.payment === "مدفوع" ? "#10b981" : "#f59e0b",
                              fontWeight: 700,
                            }}
                          >
                            {a.payment || "مدفوع"}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              background: sc.bg,
                              color: sc.color,
                              border: `1px solid ${sc.border}`,
                              padding: "3px 10px",
                              borderRadius: 20,
                              fontSize: 11.5,
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <i className={`fas ${sc.icon}`} style={{ fontSize: 10 }}></i>
                            {a.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                            {/* تغيير سريع للحالة */}
                            {a.status !== "مكتمل" && (
                              <button
                                className="tbl-btn"
                                style={{ background: "#ecfdf5", color: "#10b981" }}
                                onClick={() => handleQuickStatus(a.id, "مكتمل")}
                                title="تم إنهاء الكشف"
                              >
                                <i className="fas fa-check"></i>
                              </button>
                            )}

                            {/* طباعة تذكرة كشف */}
                            <button
                              className="tbl-btn"
                              style={{ background: "#f0fdf4", color: "#16a34a" }}
                              onClick={() => setTicketToPrint(a)}
                              title="طباعة تذكرة الكشف"
                            >
                              <i className="fas fa-print"></i>
                            </button>

                            {/* تعديل */}
                            <button className="tbl-btn edit" onClick={() => openEdit(a)} title="تعديل الموعد">
                              <i className="fas fa-pen"></i>
                            </button>

                            {/* حذف */}
                            <button className="tbl-btn del" onClick={() => handleDelete(a.id)} title="إلغاء وحذف">
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

      {/* Add / Edit Appointment Modal */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-head">
              <h3>
                <i className="fas fa-calendar-plus" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
                {editing ? "تعديل تفاصيل الموعد" : "حجز موعد كشف جديد"}
              </h3>
              <button className="modal-close" onClick={closeModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {/* Patient selection or input */}
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>اسم المريض *</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      style={{ flex: 1 }}
                      value={form.patient}
                      onChange={(e) => setForm({ ...form, patient: e.target.value })}
                      placeholder="اكتب اسم المريض أو اختر من المسجلين..."
                    />
                    <select
                      style={{ width: 190 }}
                      onChange={(e) => {
                        if (e.target.value) {
                          const found = patientsList.find((p) => p.name === e.target.value);
                          setForm({
                            ...form,
                            patient: e.target.value,
                            patientPhone: found?.phone || form.patientPhone,
                          });
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        اختر مريض مسجل مسبقاً ({patientsList.length})
                      </option>
                      {patientsList.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name} {p.phone ? `(${p.phone})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Patient Phone */}
                <div className="form-group">
                  <label>رقم هاتف المريض (للتواصل وتأكيد الحجز)</label>
                  <input
                    type="tel"
                    value={form.patientPhone || ""}
                    onChange={(e) => setForm({ ...form, patientPhone: e.target.value })}
                    placeholder="010xxxxxxxx"
                  />
                </div>

                {/* Specialty */}
                <div className="form-group">
                  <label>التخصص الطبي *</label>
                  <select value={form.specialty} onChange={(e) => handleSpecialtyChange(e.target.value)}>
                    {specialties.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Doctor */}
                <div className="form-group">
                  <label>الطبيب المعالج *</label>
                  <select value={form.doctor} onChange={(e) => handleDoctorChange(e.target.value)}>
                    <option value="">اختر الطبيب</option>
                    {doctorsList
                      .filter((d) => !form.specialty || d.specialty === form.specialty)
                      .map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name} ({d.fee} ج.م)
                        </option>
                      ))}
                  </select>
                </div>

                {/* Date */}
                <div className="form-group">
                  <label>تاريخ الموعد *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>

                {/* Time */}
                <div className="form-group">
                  <label>التوقيت *</label>
                  <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </div>

                {/* Type */}
                <div className="form-group">
                  <label>نوع الكشف / الزيارة</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="كشف">كشف جديد</option>
                    <option value="متابعة">متابعة / إعادة</option>
                    <option value="استشارة">استشارة</option>
                    <option value="جلسة">جلسة علاجية</option>
                    <option value="سونار">سونار</option>
                    <option value="تحاليل">سحب تحاليل</option>
                    <option value="منزلي">كشف منزلي</option>
                    <option value="طوارئ">طوارئ أسنان</option>
                  </select>
                </div>

                {/* Location */}
                <div className="form-group">
                  <label>مكان تقديم الخدمة</label>
                  <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                    <option value="داخل المركز">داخل المركز (العيادات)</option>
                    <option value="خدمة منزلية">خدمة منزلية (زيارة خارج المركز)</option>
                  </select>
                </div>

                {/* Fee */}
                <div className="form-group">
                  <label>قيمة الكشف (ج.م)</label>
                  <input
                    type="number"
                    value={form.fee}
                    onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>

                {/* Payment */}
                <div className="form-group">
                  <label>حالة الدفع</label>
                  <select value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })}>
                    <option value="مدفوع">مدفوع بالكامل</option>
                    <option value="مؤجل">مؤجل / عند الحضور</option>
                  </select>
                </div>

                {/* Status */}
                <div className="form-group">
                  <label>حالة الحجز</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="مؤكد">مؤكد</option>
                    <option value="جاري">جاري الآن في العيادة</option>
                    <option value="انتظار">في الانتظار</option>
                    <option value="مكتمل">مكتمل</option>
                    <option value="ملغي">ملغي</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>ملاحظات أو شكوى المريض</label>
                  <input
                    value={form.notes || ""}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="مثال: فحص دوري، يعاني من ألم بالظهر..."
                  />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={closeModal}>
                إلغاء
              </button>
              <button className="btn-primary" onClick={handleSave}>
                <i className="fas fa-save"></i> حفظ الموعد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt / Ticket Modal */}
      {ticketToPrint && (
        <PrintTicketModal
          appointment={ticketToPrint}
          onClose={() => setTicketToPrint(null)}
        />
      )}
    </div>
  );
}