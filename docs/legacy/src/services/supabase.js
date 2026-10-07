import { createClient } from "@supabase/supabase-js";
import {
  getStoredAppointments,
  saveStoredAppointments,
  getStoredPatients,
  saveStoredPatients,
  getStoredDoctors,
  saveStoredDoctors,
} from "../utils/storage";
import { specialties as fallbackSpecialties } from "../data/mockData";

// قراءة بيانات الاتصال من ملف .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("http") &&
  !supabaseUrl.includes("your-project-url")
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ==========================================
// 1. Appointments (المواعيد)
// ==========================================

export const apiGetAppointments = async () => {
  if (!isSupabaseConfigured) return getStoredAppointments();

  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: true });

    if (error) throw error;
    if (data && data.length) {
      // Map Supabase snake_case to frontend format
      const mapped = data.map((a) => ({
        id: a.id,
        patient: a.patient_name,
        doctor: a.doctor_name,
        specialty: a.specialty,
        date: a.appointment_date,
        time: a.appointment_time,
        status: a.status,
        type: a.type,
        location: a.location,
        payment: a.payment_status,
        fee: Number(a.fee),
        notes: a.notes,
      }));
      saveStoredAppointments(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn("Supabase fetch failed, using local storage fallback:", err.message);
  }
  return getStoredAppointments();
};

export const apiCreateAppointment = async (form) => {
  if (isSupabaseConfigured) {
    try {
      const payload = {
        patient_name: form.patient,
        doctor_name: form.doctor,
        specialty: form.specialty,
        appointment_date: form.date,
        appointment_time: form.time,
        status: form.status || "مؤكد",
        type: form.type || "كشف",
        location: form.location || "داخل المركز",
        payment_status: form.payment || "مدفوع",
        fee: Number(form.fee) || 200,
        notes: form.notes || "",
      };

      const { data, error } = await supabase
        .from("appointments")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return {
        ...form,
        id: data.id,
      };
    } catch (err) {
      console.error("Supabase insert appointment error:", err);
    }
  }

  // Fallback to local storage
  const current = getStoredAppointments();
  const created = { ...form, id: Date.now() };
  const updated = [created, ...current];
  saveStoredAppointments(updated);
  return created;
};

export const apiUpdateAppointment = async (id, form) => {
  if (isSupabaseConfigured) {
    try {
      const payload = {
        patient_name: form.patient,
        doctor_name: form.doctor,
        specialty: form.specialty,
        appointment_date: form.date,
        appointment_time: form.time,
        status: form.status,
        type: form.type,
        location: form.location,
        payment_status: form.payment,
        fee: Number(form.fee) || 200,
        notes: form.notes,
      };

      const { error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", id);

      if (error) throw error;
    } catch (err) {
      console.error("Supabase update appointment error:", err);
    }
  }

  const current = getStoredAppointments();
  const updated = current.map((a) => (a.id === id ? { ...form, id } : a));
  saveStoredAppointments(updated);
  return { ...form, id };
};

export const apiDeleteAppointment = async (id) => {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Supabase delete appointment error:", err);
    }
  }

  const current = getStoredAppointments();
  const updated = current.filter((a) => a.id !== id);
  saveStoredAppointments(updated);
};

// ==========================================
// 2. Patients (المرضى)
// ==========================================

export const apiGetPatients = async () => {
  if (!isSupabaseConfigured) return getStoredPatients();

  try {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("id", { ascending: false });

    if (error) throw error;
    if (data && data.length) {
      const mapped = data.map((p) => ({
        id: p.id,
        name: p.name,
        age: p.age,
        phone: p.phone,
        email: p.email,
        gender: p.gender,
        bloodType: p.blood_type,
        specialty: p.specialty,
        status: p.status,
        notes: p.notes,
        lastVisit: p.last_visit,
        totalVisits: p.total_visits,
      }));
      saveStoredPatients(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn("Supabase fetch patients failed:", err.message);
  }
  return getStoredPatients();
};

export const apiCreatePatient = async (form) => {
  if (isSupabaseConfigured) {
    try {
      const payload = {
        name: form.name,
        age: Number(form.age) || null,
        phone: form.phone,
        email: form.email,
        gender: form.gender || "ذكر",
        blood_type: form.bloodType || "O+",
        specialty: form.specialty,
        status: form.status || "جديد",
        notes: form.notes || "",
        last_visit: new Date().toISOString().slice(0, 10),
        total_visits: 1,
      };

      const { data, error } = await supabase.from("patients").insert([payload]).select().single();
      if (error) throw error;
      return {
        ...form,
        id: data.id,
        lastVisit: data.last_visit,
        totalVisits: data.total_visits,
      };
    } catch (err) {
      console.error("Supabase insert patient error:", err);
    }
  }

  const current = getStoredPatients();
  const created = {
    ...form,
    id: Date.now(),
    lastVisit: new Date().toISOString().slice(0, 10),
    totalVisits: 1,
  };
  saveStoredPatients([created, ...current]);
  return created;
};

export const apiUpdatePatient = async (id, form) => {
  if (isSupabaseConfigured) {
    try {
      const payload = {
        name: form.name,
        age: Number(form.age) || null,
        phone: form.phone,
        email: form.email,
        gender: form.gender,
        blood_type: form.bloodType,
        specialty: form.specialty,
        status: form.status,
        notes: form.notes,
      };

      const { error } = await supabase.from("patients").update(payload).eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Supabase update patient error:", err);
    }
  }

  const current = getStoredPatients();
  const updated = current.map((p) => (p.id === id ? { ...form, id, totalVisits: p.totalVisits, lastVisit: p.lastVisit } : p));
  saveStoredPatients(updated);
  return { ...form, id };
};

export const apiDeletePatient = async (id) => {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("patients").delete().eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Supabase delete patient error:", err);
    }
  }

  const current = getStoredPatients();
  const updated = current.filter((p) => p.id !== id);
  saveStoredPatients(updated);
};

// ==========================================
// 3. Doctors (الأطباء)
// ==========================================

export const apiGetDoctors = async () => {
  if (!isSupabaseConfigured) return getStoredDoctors();

  try {
    const { data, error } = await supabase.from("doctors").select("*").order("id", { ascending: true });
    if (error) throw error;
    if (data && data.length) {
      const mapped = data.map((d) => ({
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        phone: d.phone,
        email: d.email,
        experience: d.experience,
        fee: Number(d.fee),
        available: d.available,
        rating: Number(d.rating),
        patients: d.patients_count,
        appointments: d.appointments_count,
        schedule: d.schedule || [],
      }));
      saveStoredDoctors(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn("Supabase fetch doctors failed:", err.message);
  }
  return getStoredDoctors();
};

export const apiCreateDoctor = async (form) => {
  if (isSupabaseConfigured) {
    try {
      const payload = {
        name: form.name,
        specialty: form.specialty,
        phone: form.phone,
        email: form.email,
        experience: Number(form.experience) || 5,
        fee: Number(form.fee) || 200,
        available: form.available !== false,
        rating: 4.85,
        patients_count: 0,
        appointments_count: 0,
        schedule: form.schedule || ["السبت", "الاثنين", "الأربعاء"],
      };

      const { data, error } = await supabase.from("doctors").insert([payload]).select().single();
      if (error) throw error;
      return {
        ...form,
        id: data.id,
        rating: 4.85,
        patients: 0,
        appointments: 0,
      };
    } catch (err) {
      console.error("Supabase insert doctor error:", err);
    }
  }

  const current = getStoredDoctors();
  const created = {
    ...form,
    id: Date.now(),
    rating: 4.85,
    patients: 0,
    appointments: 0,
  };
  saveStoredDoctors([...current, created]);
  return created;
};

export const apiUpdateDoctor = async (id, form) => {
  if (isSupabaseConfigured) {
    try {
      const payload = {
        name: form.name,
        specialty: form.specialty,
        phone: form.phone,
        email: form.email,
        experience: Number(form.experience) || 5,
        fee: Number(form.fee) || 200,
        available: form.available,
        schedule: form.schedule,
      };

      const { error } = await supabase.from("doctors").update(payload).eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Supabase update doctor error:", err);
    }
  }

  const current = getStoredDoctors();
  const updated = current.map((d) => (d.id === id ? { ...d, ...form } : d));
  saveStoredDoctors(updated);
  return { ...form, id };
};

export const apiDeleteDoctor = async (id) => {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("doctors").delete().eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Supabase delete doctor error:", err);
    }
  }

  const current = getStoredDoctors();
  const updated = current.filter((d) => d.id !== id);
  saveStoredDoctors(updated);
};

// ==========================================
// 4. Specialties (التخصصات)
// ==========================================

export const apiGetSpecialties = async () => {
  if (!isSupabaseConfigured) return fallbackSpecialties;

  try {
    const { data, error } = await supabase.from("specialties").select("*").order("id", { ascending: true });
    if (error) throw error;
    if (data && data.length) {
      return data.map((s) => ({
        id: s.id,
        name: s.name,
        nameEn: s.name_en,
        icon: s.icon,
        color: s.color,
        bg: s.bg,
        doctors: s.doctors_count,
        today: s.today_count,
        desc: s.description,
      }));
    }
  } catch (err) {
    console.warn("Supabase fetch specialties failed:", err.message);
  }
  return fallbackSpecialties;
};

// ==========================================
// 5. Authentication & Users (تسجيل الدخول والمستخدمين)
// ==========================================

export const apiLogin = async (username, password) => {
  const u = (username || "").trim().toLowerCase();
  const p = (password || "").trim();

  if (!u || !p) {
    return { success: false, error: "يرجى إدخال اسم المستخدم وكلمة المرور" };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", u)
        .eq("password", p)
        .maybeSingle();

      if (error) {
        console.warn("Supabase users table query error:", error.message);
      } else if (data) {
        return {
          success: true,
          user: {
            role: data.role,
            name: data.name,
            title: data.title,
            email: data.email,
            doctorName: data.doctor_name || (data.role === "doctor" ? data.name : undefined),
            specialty: data.role === "doctor" ? "باطنه" : undefined,
          },
        };
      }
    } catch (err) {
      console.warn("Supabase login exception:", err.message);
    }
  }

  // Fallback if offline
  if (u === "admin" && p === "admin123") {
    return {
      success: true,
      user: {
        role: "admin",
        name: "المدير العام",
        title: "مدير المركز والنظام",
        email: "admin@fcmc.com",
      },
    };
  } else if (u === "reception" && (p === "rec123" || p === "123456")) {
    return {
      success: true,
      user: {
        role: "receptionist",
        name: "أحمد علي (استقبال)",
        title: "مسؤول حجز وتسجيل المرضى",
        email: "reception@fcmc.com",
      },
    };
  } else if (
    (u === "doctor" && (p === "doc123" || p === "123456")) ||
    (u === "drahmed" && (p === "doc123" || p === "123456"))
  ) {
    return {
      success: true,
      user: {
        role: "doctor",
        name: "د. أحمد كمال الدين",
        doctorName: "د. أحمد كمال الدين",
        specialty: "باطنه",
        title: "استشاري الأمراض الباطنة والكبد",
        email: "dr.ahmed@fcmc.com",
      },
    };
  }

  return { success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
};
