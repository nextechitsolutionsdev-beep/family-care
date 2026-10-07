import { useState, useEffect } from "react";
import {
  apiGetAppointments,
  apiUpdateAppointment,
  apiGetPatients,
  apiUpdatePatient,
  apiGetDoctors,
  apiUpdateDoctor,
} from "../services/supabase";

export default function DoctorPortal({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctorsList, setDoctorsList] = useState([]);

  // الطبيب المسجل حالياً (مع إمكانية التبديل للتجربة السريعة)
  const [currentDoctorName, setCurrentDoctorName] = useState(
    user?.doctorName || user?.name || "د. أحمد كمال الدين"
  );

  const [activeTab, setActiveTab] = useState("today"); // 'today' | 'waiting' | 'in_progress' | 'completed' | 'all'
  const [consultModal, setConsultModal] = useState(null); // الموعد الجاري فحص تشخيصه
  const [consultForm, setConsultForm] = useState({
    diagnosis: "",
    prescription: "",
    notes: "",
    followUpDate: "",
  });

  const [patientHistoryModal, setPatientHistoryModal] = useState(null);
  const [isAvailable, setIsAvailable] = useState(true);

  const todayStr = new Date().toISOString().slice(0, 10);

  // تحميل البيانات
  useEffect(() => {
    const load = async () => {
      const [apts, pts, docs] = await Promise.all([
        apiGetAppointments(),
        apiGetPatients(),
        apiGetDoctors(),
      ]);
      setAppointments(apts);
      setPatients(pts);
      setDoctorsList(docs);

      const foundDoc = docs.find((d) => d.name === currentDoctorName);
      if (foundDoc) {
        setIsAvailable(foundDoc.available !== false);
      }
    };
    load();
  }, [currentDoctorName]);

  // استخراج الطبيب الحالي من القائمة
  const currentDocObj =
    doctorsList.find((d) => d.name === currentDoctorName) || {
      name: currentDoctorName,
      specialty: user?.specialty || "باطنه",
      fee: 200,
    };

  // فلترة المواعيد الخاصة بهذا الطبيب فقط
  const doctorAppointments = appointments.filter(
    (a) => a.doctor && a.doctor.trim() === currentDoctorName.trim()
  );

  // مواعيد اليوم للطبيب
  const todayAppointments = doctorAppointments.filter((a) => a.date === todayStr);

  // إحصائيات الطبيب الخاصة به
  const stats = {
    todayTotal: todayAppointments.length,
    waiting: todayAppointments.filter((a) => a.status === "انتظار" || a.status === "مؤكد").length,
    inProgress: todayAppointments.filter((a) => a.status === "جاري").length,
    completed: todayAppointments.filter((a) => a.status === "مكتمل").length,
    upcoming: doctorAppointments.filter((a) => a.date > todayStr).length,
  };

  // المريض الجاري كشفه الآن في العيادة
  const currentExamining = todayAppointments.find((a) => a.status === "جاري");

  // الفلترة حسب التبويب
  const filteredList = doctorAppointments.filter((a) => {
    if (activeTab === "today") return a.date === todayStr;
    if (activeTab === "waiting")
      return a.date === todayStr && (a.status === "انتظار" || a.status === "مؤكد");
    if (activeTab === "in_progress") return a.date === todayStr && a.status === "جاري";
    if (activeTab === "completed") return a.date === todayStr && a.status === "مكتمل";
    if (activeTab === "all") return true;
    return true;
  });

  // تبديل حالة الموعد
  const handleSetStatus = async (appointmentId, newStatus) => {
    const item = appointments.find((a) => a.id === appointmentId);
    if (!item) return;

    const updated = { ...item, status: newStatus };
    await apiUpdateAppointment(appointmentId, updated);
    setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? updated : a)));
  };

  // بدء الكشف (نداء المريض ودخوله للعيادة)
  const handleStartExam = async (appointment) => {
    // إذا كان هناك مريض آخر جاري، نسأل الطبيب
    if (currentExamining && currentExamining.id !== appointment.id) {
      if (
        !window.confirm(
          `هناك مريض حالي قيد الكشف (${currentExamining.patient}). هل تود بدء كشف ${appointment.patient} بدلاً منه؟`
        )
      ) {
        return;
      }
    }
    await handleSetStatus(appointment.id, "جاري");
  };

  // فتح نافذة كتابة التشخيص والروشتة
  const handleOpenConsult = (appointment) => {
    setConsultModal(appointment);
    setConsultForm({
      diagnosis: "",
      prescription: "",
      notes: appointment.notes || "",
      followUpDate: "",
    });
  };

  // حفظ الكشف والروشتة وإنهاء الحالة
  const handleSaveConsult = async () => {
    if (!consultModal) return;

    const combinedNotes = [
      consultModal.notes ? `الشكوى: ${consultModal.notes}` : "",
      consultForm.diagnosis ? `التشخيص: ${consultForm.diagnosis}` : "",
      consultForm.prescription ? `العلاج: ${consultForm.prescription}` : "",
      consultForm.followUpDate ? `إعادة كشف: ${consultForm.followUpDate}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const updatedAppointment = {
      ...consultModal,
      status: "مكتمل",
      notes: combinedNotes,
    };

    await apiUpdateAppointment(consultModal.id, updatedAppointment);
    setAppointments((prev) =>
      prev.map((a) => (a.id === consultModal.id ? updatedAppointment : a))
    );

    // تحديث ملف المريض الطبي بإضافة الملاحظات
    const targetPatient = patients.find(
      (p) => p.name && p.name.trim() === consultModal.patient.trim()
    );
    if (targetPatient) {
      const updatedPt = {
        ...targetPatient,
        lastVisit: todayStr,
        notes: `[زيارة ${todayStr} مع ${currentDoctorName}]: ${consultForm.diagnosis || "كشف"} - ${consultForm.prescription || ""}`,
      };
      await apiUpdatePatient(targetPatient.id, updatedPt);
      setPatients((prev) => prev.map((p) => (p.id === targetPatient.id ? updatedPt : a)));
    }

    setConsultModal(null);
    alert("تم إنهاء الكشف وحفظ الروشتة والتشخيص بنجاح في ملف المريض ✅");
  };

  // تبديل حالة تواجد الطبيب بالعيادة
  const handleToggleAvailability = async () => {
    const nextState = !isAvailable;
    setIsAvailable(nextState);
    if (currentDocObj.id) {
      await apiUpdateDoctor(currentDocObj.id, {
        ...currentDocObj,
        available: nextState,
      });
      setDoctorsList((prev) =>
        prev.map((d) => (d.id === currentDocObj.id ? { ...d, available: nextState } : d))
      );
    }
  };

  // فتح الملف الطبي للمريض
  const handleViewPatientRecord = (patientName) => {
    const pt = patients.find((p) => p.name && p.name.trim() === patientName.trim()) || {
      name: patientName,
      phone: "غير مسجل",
      bloodType: "غير محدد",
      notes: "لا توجد ملاحظات سابقة",
      totalVisits: 1,
    };

    const patientPastVisits = appointments.filter(
      (a) => a.patient && a.patient.trim() === patientName.trim()
    );

    setPatientHistoryModal({
      patient: pt,
      visits: patientPastVisits,
    });
  };

  return (
    <div>
      {/* Doctor Header Banner */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
          color: "#fff",
          marginBottom: 20,
          border: "none",
          padding: "24px 28px",
          boxShadow: "0 10px 30px rgba(49, 46, 129, 0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #818cf8, #4f46e5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                color: "#fff",
                border: "3px solid rgba(255,255,255,0.2)",
                boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
              }}
            >
              <i className="fas fa-user-doctor"></i>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#fff" }}>
                  {currentDoctorName}
                </h2>
                <span
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    padding: "3px 12px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  تخصص {currentDocObj.specialty || "عام"}
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#cbd5e1" }}>
                بوابة الطبيب المعالج • متابعة حالات الكشف اليومية، تنظيم أدوار الانتظار وتدوين الروشتات الطبية
              </p>
            </div>
          </div>

          {/* Quick Doctor Switcher for Testing + Clinic Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleToggleAvailability}
              style={{
                background: isAvailable ? "#10b981" : "#64748b",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: 25,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                transition: "all 0.2s",
              }}
              title="تغيير حالة تواجدك بالعيادة"
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#fff",
                  display: "inline-block",
                }}
              />
              {isAvailable ? "متواجد بالعيادة الآن" : "غير متاح بالعيادة"}
            </button>

            {/* Doctor Picker Selector */}
            {doctorsList.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11.5, color: "#94a3b8" }}>تبديل الطبيب:</span>
                <select
                  value={currentDoctorName}
                  onChange={(e) => setCurrentDoctorName(e.target.value)}
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.25)",
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12.5,
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  {doctorsList.map((d) => (
                    <option key={d.id} value={d.name} style={{ color: "#1e293b", background: "#fff" }}>
                      {d.name} ({d.specialty})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Cards Specific to the Logged Doctor */}
      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 20 }}>
        {[
          {
            label: "إجمالي حالات اليوم",
            value: stats.todayTotal,
            sub: "مسجلين في جدول عيادتك",
            icon: "fa-calendar-check",
            color: "#6366f1",
            bg: "#eef2ff",
          },
          {
            label: "في غرفة الانتظار",
            value: stats.waiting,
            sub: "في انتظار الدخول للعيادة",
            icon: "fa-hourglass-half",
            color: "#f59e0b",
            bg: "#fffbeb",
          },
          {
            label: "جاري الكشف عليه الآن",
            value: stats.inProgress,
            sub: "داخل غرفة الكشف حالياً",
            icon: "fa-stethoscope",
            color: "#3b82f6",
            bg: "#eff6ff",
          },
          {
            label: "حالات تم الانتهاء منها",
            value: stats.completed,
            sub: "تم فحصهم وإصدار التشخيص",
            icon: "fa-circle-check",
            color: "#10b981",
            bg: "#ecfdf5",
          },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ padding: 20 }}>
            <div className="stat-icon" style={{ background: s.bg }}>
              <i className={`fas ${s.icon}`} style={{ color: s.color }}></i>
            </div>
            <div className="stat-num" style={{ fontSize: 30, color: s.color }}>
              {s.value}
            </div>
            <div className="stat-label" style={{ fontWeight: 700, fontSize: 14 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* LIVE Active Consultation Card (if any patient is currently "جاري") */}
      {currentExamining && (
        <div
          style={{
            background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
            border: "2px solid #10b981",
            borderRadius: 14,
            padding: "18px 24px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            boxShadow: "0 4px 16px rgba(16,185,129,0.15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#10b981",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                boxShadow: "0 0 0 6px rgba(16,185,129,0.2)",
              }}
            >
              <i className="fas fa-stethoscope fa-beat"></i>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    background: "#047857",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 12,
                  }}
                >
                  الحالة الحالية داخل العيادة
                </span>
                <span style={{ fontSize: 12, color: "#065f46" }}>
                  وقت الحجز: {currentExamining.time}
                </span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#064e3b", margin: "4px 0" }}>
                {currentExamining.patient}
              </h3>
              <p style={{ margin: 0, fontSize: 12.5, color: "#047857" }}>
                نوع الكشف: <strong>{currentExamining.type}</strong> • الشكوى:{" "}
                {currentExamining.notes || "فحص طبي عام"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn-ghost"
              style={{ background: "#fff", borderColor: "#a7f3d0", color: "#065f46" }}
              onClick={() => handleViewPatientRecord(currentExamining.patient)}
            >
              <i className="fas fa-folder-open" style={{ marginLeft: 6 }}></i>
              الملف الطبي
            </button>
            <button
              className="btn-primary"
              style={{ background: "#059669", borderColor: "#059669" }}
              onClick={() => handleOpenConsult(currentExamining)}
            >
              <i className="fas fa-clipboard-check" style={{ marginLeft: 6 }}></i>
              إنهاء الكشف وكتابة الروشتة
            </button>
          </div>
        </div>
      )}

      {/* Main Clinic Queue Table */}
      <div className="card">
        <div
          className="card-head"
          style={{
            borderBottom: "1px solid var(--gray-100)",
            paddingBottom: 16,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
              <i className="fas fa-list-check" style={{ color: "#4f46e5", marginLeft: 8 }}></i>
              قائمة حالات الكشف بالعيادة
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--gray-500)", margin: "4px 0 0" }}>
              متابعة أدوار المرضى، بدء الكشف وتدوين التقارير الطبية
            </p>
          </div>

          {/* Filter Tabs */}
          <div style={{ display: "flex", gap: 6, background: "var(--gray-100)", padding: 4, borderRadius: 10 }}>
            {[
              { id: "today", label: `حالات اليوم (${stats.todayTotal})` },
              { id: "waiting", label: `في الانتظار (${stats.waiting})` },
              { id: "in_progress", label: `جاري (${stats.inProgress})` },
              { id: "completed", label: `المكتملة (${stats.completed})` },
              { id: "all", label: `كل المواعيد (${doctorAppointments.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "Cairo",
                  background: activeTab === tab.id ? "#fff" : "transparent",
                  color: activeTab === tab.id ? "#4f46e5" : "var(--gray-600)",
                  boxShadow: activeTab === tab.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Patients Table */}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 50 }}>الدور</th>
                <th>المريض</th>
                <th>التاريخ والتوقيت</th>
                <th>نوع الكشف</th>
                <th>المكان</th>
                <th>حالة الحالة</th>
                <th>شكوى المريض / التقرير</th>
                <th style={{ textAlign: "center", width: 230 }}>إجراءات الطبيب</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "40px 0", color: "var(--gray-400)" }}>
                    <i className="fas fa-user-clock" style={{ fontSize: 34, marginBottom: 10, display: "block" }}></i>
                    لا توجد حالات مسجلة في هذا التبويب حالياً
                  </td>
                </tr>
              ) : (
                filteredList.map((a, idx) => {
                  const isToday = a.date === todayStr;
                  const isCurrent = a.status === "جاري";
                  const isDone = a.status === "مكتمل";

                  return (
                    <tr
                      key={a.id}
                      style={{
                        background: isCurrent ? "rgba(99, 102, 241, 0.05)" : undefined,
                        fontWeight: isCurrent ? 700 : undefined,
                      }}
                    >
                      <td style={{ fontWeight: 800, color: "#4f46e5" }}>#{idx + 1}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: isCurrent ? "#4f46e5" : "#e2e8f0",
                              color: isCurrent ? "#fff" : "#334155",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 800,
                            }}
                          >
                            {a.patient ? a.patient.charAt(0) : "م"}
                          </div>
                          <div>
                            <span style={{ fontWeight: 800, display: "block", color: "var(--gray-900)" }}>
                              {a.patient}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--gray-400)" }}>
                              {a.location || "داخل العيادة"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          <i className="fas fa-clock" style={{ color: "#f59e0b", marginLeft: 5 }}></i>
                          {a.time}
                        </div>
                        <div style={{ fontSize: 11, color: isToday ? "#10b981" : "var(--gray-400)", fontWeight: isToday ? 800 : 400 }}>
                          {isToday ? "اليوم" : a.date}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            background: "#f1f5f9",
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {a.type || "كشف"}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{a.location || "داخل المركز"}</td>
                      <td>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 20,
                            fontSize: 11.5,
                            fontWeight: 800,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            background:
                              a.status === "جاري"
                                ? "#eff6ff"
                                : a.status === "مكتمل"
                                ? "#ecfdf5"
                                : a.status === "انتظار"
                                ? "#fffbeb"
                                : "#f8fafc",
                            color:
                              a.status === "جاري"
                                ? "#2563eb"
                                : a.status === "مكتمل"
                                ? "#059669"
                                : a.status === "انتظار"
                                ? "#d97706"
                                : "#475569",
                            border: `1px solid ${
                              a.status === "جاري"
                                ? "#bfdbfe"
                                : a.status === "مكتمل"
                                ? "#a7f3d0"
                                : a.status === "انتظار"
                                ? "#fde68a"
                                : "#e2e8f0"
                            }`,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background:
                                a.status === "جاري"
                                ? "#3b82f6"
                                : a.status === "مكتمل"
                                ? "#10b981"
                                : a.status === "انتظار"
                                ? "#f59e0b"
                                : "#94a3b8",
                            }}
                          />
                          {a.status}
                        </span>
                      </td>
                      <td>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--gray-600)",
                            maxWidth: 220,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={a.notes}
                        >
                          {a.notes || "—"}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          {/* بدء الكشف / نداء المريض */}
                          {!isDone && !isCurrent && (
                            <button
                              className="tbl-btn"
                              style={{ background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}
                              onClick={() => handleStartExam(a)}
                              title="نداء المريض ودخوله لغرفة الكشف الآن"
                            >
                              <i className="fas fa-bell"></i> نداء ودخول
                            </button>
                          )}

                          {/* إنهاء الكشف وكتابة الروشتة */}
                          {isCurrent && (
                            <button
                              className="tbl-btn"
                              style={{ background: "#ecfdf5", color: "#059669", fontWeight: 800 }}
                              onClick={() => handleOpenConsult(a)}
                              title="إنهاء الكشف وتدوين التشخيص والروشتة"
                            >
                              <i className="fas fa-clipboard-check"></i> إنهاء وكتابة روشتة
                            </button>
                          )}

                          {/* إذا كان مكتملاً، زر تعديل التقرير/الروشتة */}
                          {isDone && (
                            <button
                              className="tbl-btn"
                              style={{ background: "#f8fafc", color: "#475569" }}
                              onClick={() => handleOpenConsult(a)}
                              title="مراجعة التقرير والروشتة"
                            >
                              <i className="fas fa-file-medical"></i> الروشتة
                            </button>
                          )}

                          {/* زر الملف الطبي للمريض */}
                          <button
                            className="tbl-btn view"
                            onClick={() => handleViewPatientRecord(a.patient)}
                            title="عرض الملف الطبي السابق للمريض"
                          >
                            <i className="fas fa-eye"></i> الملف
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

      {/* Consultation & Prescription Modal */}
      {consultModal && (
        <div className="modal-overlay" onClick={() => setConsultModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <h3>
                <i className="fas fa-notes-medical" style={{ color: "#4f46e5", marginLeft: 8 }}></i>
                تدوين التقرير الطبي والروشتة: {consultModal.patient}
              </h3>
              <button className="modal-close" onClick={() => setConsultModal(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div
                style={{
                  background: "#f8fafc",
                  padding: "10px 14px",
                  borderRadius: 8,
                  marginBottom: 16,
                  display: "flex",
                  gap: 16,
                  fontSize: 12.5,
                }}
              >
                <div>
                  <strong>المريض:</strong> {consultModal.patient}
                </div>
                <div>
                  <strong>نوع الكشف:</strong> {consultModal.type}
                </div>
                <div>
                  <strong>التاريخ:</strong> {consultModal.date} ({consultModal.time})
                </div>
              </div>

              <div className="form-grid">
                {/* Diagnosis */}
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>التشخيص الطبي (Clinical Diagnosis) *</label>
                  <textarea
                    rows="2"
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid var(--gray-300)",
                      fontFamily: "Cairo",
                      fontSize: 13,
                    }}
                    value={consultForm.diagnosis}
                    onChange={(e) => setConsultForm({ ...consultForm, diagnosis: e.target.value })}
                    placeholder="مثال: التهاب حاد في المعدة، ارتفاع ضغط دم مرحلة أولى..."
                  />
                </div>

                {/* Prescription */}
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label>الروشتة الطبية والعلاج الموصوف (Prescription & Medicines) *</label>
                  <textarea
                    rows="4"
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid var(--gray-300)",
                      fontFamily: "Cairo",
                      fontSize: 13,
                    }}
                    value={consultForm.prescription}
                    onChange={(e) =>
                      setConsultForm({ ...consultForm, prescription: e.target.value })
                    }
                    placeholder="اكتب أسماء الأدوية، الجرعات، ومواعيد تناولها (مثال: نكسيوم 40 مجم قرص قبل الإفطار)..."
                  />
                </div>

                {/* Follow Up Date */}
                <div className="form-group">
                  <label>تاريخ الإعادة / المتابعة القادمة</label>
                  <input
                    type="date"
                    value={consultForm.followUpDate}
                    onChange={(e) =>
                      setConsultForm({ ...consultForm, followUpDate: e.target.value })
                    }
                  />
                </div>

                {/* Instructions */}
                <div className="form-group">
                  <label>تعليمات ونصائح الطبيب للمريض</label>
                  <input
                    value={consultForm.notes}
                    onChange={(e) => setConsultForm({ ...consultForm, notes: e.target.value })}
                    placeholder="مثال: تجنب المقليات، الراحة التامة..."
                  />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setConsultModal(null)}>
                إلغاء
              </button>
              <button
                className="btn-primary"
                style={{ background: "#059669", borderColor: "#059669" }}
                onClick={handleSaveConsult}
              >
                <i className="fas fa-check"></i> حفظ وإنهاء الكشف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Medical History Modal */}
      {patientHistoryModal && (
        <div className="modal-overlay" onClick={() => setPatientHistoryModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-head">
              <h3>
                <i className="fas fa-folder-open" style={{ color: "#3b82f6", marginLeft: 8 }}></i>
                الملف الطبي للمريض: {patientHistoryModal.patient.name}
              </h3>
              <button className="modal-close" onClick={() => setPatientHistoryModal(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              {/* Patient Basic Card */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  background: "#f1f5f9",
                  padding: 14,
                  borderRadius: 10,
                  marginBottom: 16,
                  fontSize: 12.5,
                }}
              >
                <div>
                  <strong>رقم الهاتف:</strong> {patientHistoryModal.patient.phone}
                </div>
                <div>
                  <strong>فصيلة الدم:</strong>{" "}
                  <span style={{ color: "#dc2626", fontWeight: 800 }}>
                    {patientHistoryModal.patient.bloodType || "O+"}
                  </span>
                </div>
                <div>
                  <strong>السن والنوع:</strong> {patientHistoryModal.patient.age || "—"} سنة (
                  {patientHistoryModal.patient.gender || "ذكر"})
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <strong>التاريخ المرضي والملاحظات:</strong>{" "}
                  {patientHistoryModal.patient.notes || "لا توجد ملاحظات مزمنة مسجلة"}
                </div>
              </div>

              {/* Past Visits History */}
              <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: "#1e293b" }}>
                سجل الزيارات والكشوفات السابقة بالمركز ({patientHistoryModal.visits.length}):
              </h4>
              <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {patientHistoryModal.visits.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--gray-400)" }}>هذه أول زيارة للمريض بالمركز</p>
                ) : (
                  patientHistoryModal.visits.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid var(--gray-200)",
                        padding: 10,
                        borderRadius: 8,
                        background: "#fff",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <strong>
                          <i className="fas fa-calendar-day" style={{ color: "#6366f1", marginLeft: 5 }}></i>
                          {v.date} - {v.time}
                        </strong>
                        <span
                          style={{
                            background: v.status === "مكتمل" ? "#ecfdf5" : "#f1f5f9",
                            color: v.status === "مكتمل" ? "#059669" : "#475569",
                            padding: "1px 7px",
                            borderRadius: 12,
                            fontWeight: 700,
                          }}
                        >
                          {v.status}
                        </span>
                      </div>
                      <div style={{ color: "var(--gray-600)" }}>
                        <strong>الطبيب المعالج:</strong> {v.doctor} ({v.specialty}) • {v.type}
                      </div>
                      {v.notes && (
                        <div style={{ marginTop: 4, background: "#f8fafc", padding: 6, borderRadius: 4 }}>
                          {v.notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-primary" onClick={() => setPatientHistoryModal(null)}>
                إغلاق الملف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
