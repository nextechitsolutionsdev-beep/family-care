import { appointments, patients, doctors } from "../data/mockData";

export const getStoredAppointments = () => {
  try {
    const raw = localStorage.getItem("clinic_appointments_v2");
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return appointments;
};

export const saveStoredAppointments = (data) => {
  try {
    localStorage.setItem("clinic_appointments_v2", JSON.stringify(data));
  } catch (e) {
    console.error(e);
  }
};

export const getStoredPatients = () => {
  try {
    const raw = localStorage.getItem("clinic_patients_v2");
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return patients;
};

export const saveStoredPatients = (data) => {
  try {
    localStorage.setItem("clinic_patients_v2", JSON.stringify(data));
  } catch (e) {
    console.error(e);
  }
};

export const getStoredDoctors = () => {
  try {
    const raw = localStorage.getItem("clinic_doctors_v2");
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return doctors;
};

export const saveStoredDoctors = (data) => {
  try {
    localStorage.setItem("clinic_doctors_v2", JSON.stringify(data));
  } catch (e) {
    console.error(e);
  }
};

/**
 * تصدير البيانات إلى ملف Excel (CSV مع UTF-8 BOM لضمان قراءة اللغة العربية بشكل سليم في ميكروسوفت إكسيل)
 */
export const exportToExcel = (data, filename = "appointments_report.csv") => {
  if (!data || !data.length) return alert("لا توجد بيانات للتصدير");
  
  const headers = Object.keys(data[0]);
  const rows = data.map((obj) =>
    headers
      .map((header) => {
        let val = obj[header] === undefined || obj[header] === null ? "" : String(obj[header]);
        val = val.replace(/"/g, '""');
        return `"${val}"`;
      })
      .join(",")
  );

  // إضافة UTF-8 BOM (\uFEFF) ليفتح في Excel العربي دون مشاكل تشفير
  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
