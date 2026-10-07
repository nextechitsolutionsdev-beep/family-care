import React from "react";

export default function PrintTicketModal({ appointment, onClose }) {
  if (!appointment) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal print-modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-head no-print">
          <h3>
            <i className="fas fa-print" style={{ color: "var(--primary)", marginLeft: 8 }}></i>
            تذكرة حجز الموعد
          </h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body print-area" id="print-ticket">
          <div className="ticket-card">
            {/* Header */}
            <div className="ticket-header">
              <img src="/logo.jpg" alt="Logo" className="ticket-logo" />
              <div className="ticket-titles">
                <h2>Family Care Medical Center</h2>
                <p className="ticket-tagline">مركز فاميلي كير الطبي المتكامل ~ Since 2019</p>
                <div className="ticket-hotline">
                  <i className="fas fa-phone-alt"></i> الخط الساخن: <strong>01001695023</strong>
                </div>
              </div>
            </div>

            <div className="ticket-divider"></div>

            {/* Ticket Info */}
            <div className="ticket-badge-row">
              <span className="ticket-num">رقم الحجز: #{appointment.id || "1001"}</span>
              <span className={`ticket-status ${appointment.status === "مؤكد" ? "status-ok" : "status-wait"}`}>
                {appointment.status}
              </span>
            </div>

            <div className="ticket-grid">
              <div className="ticket-cell">
                <span className="t-label">اسم المريض</span>
                <strong className="t-val">{appointment.patient}</strong>
              </div>
              <div className="ticket-cell">
                <span className="t-label">الطبيب المعالج</span>
                <strong className="t-val" style={{ color: "var(--primary-dark)" }}>{appointment.doctor}</strong>
              </div>
              <div className="ticket-cell">
                <span className="t-label">التخصص</span>
                <strong className="t-val">{appointment.specialty}</strong>
              </div>
              <div className="ticket-cell">
                <span className="t-label">نوع الكشف / الخدمة</span>
                <strong className="t-val">{appointment.type || "كشف"} ({appointment.location || "داخل المركز"})</strong>
              </div>
              <div className="ticket-cell">
                <span className="t-label">تاريخ الحجز</span>
                <strong className="t-val">{appointment.date}</strong>
              </div>
              <div className="ticket-cell">
                <span className="t-label">الوقت المحدد</span>
                <strong className="t-val" style={{ direction: "ltr", display: "inline-block" }}>{appointment.time}</strong>
              </div>
            </div>

            <div className="ticket-total-box">
              <div className="t-fee-row">
                <span>قيمة الكشف:</span>
                <strong>{appointment.fee} ج.م</strong>
              </div>
              <div className="t-payment-status">
                حالة الدفع: <span>{appointment.payment || "مدفوع"}</span>
              </div>
            </div>

            <div className="ticket-barcode">
              <div className="barcode-bars">||| | |||| | ||| || |||| | ||| || | ||||</div>
              <p className="barcode-text">*FCMC-{appointment.id}-{appointment.date}*</p>
            </div>

            <div className="ticket-footer">
              <p>• يرجى التواجد بالعيادة قبل الموعد بـ 15 دقيقة لتأكيد الدخول.</p>
              <p>• الاستشارة مجانية خلال 14 يوماً من تاريخ الكشف.</p>
              <p className="clinic-motto">صحتكم أمانة بين أيدينا - فاميلي كير</p>
            </div>
          </div>
        </div>

        <div className="modal-foot no-print">
          <button className="btn-ghost" onClick={onClose}>
            إغلاق
          </button>
          <button className="btn-primary" onClick={handlePrint}>
            <i className="fas fa-print"></i> طباعة الإيصال
          </button>
        </div>
      </div>
    </div>
  );
}
