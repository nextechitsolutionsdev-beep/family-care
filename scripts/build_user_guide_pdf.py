"""Build the printable Arabic Family Care user guide.

Requires reportlab, Pillow, arabic-reshaper and python-bidi. Screenshots are
labelled review captures from the app's demo environment.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "family-care-user-guide-ar.pdf"
REVIEW = ROOT / "docs" / "review"
LOGO = ROOT / "public" / "logo.jpg"
FONT = Path("C:/Windows/Fonts/tahoma.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/tahomabd.ttf")

pdfmetrics.registerFont(TTFont("Tahoma", str(FONT)))
pdfmetrics.registerFont(TTFont("Tahoma-Bold", str(FONT_BOLD)))

W, H = A4
M = 46
R = W - M
CONTENT = W - M * 2
INK = colors.HexColor("#21342D")
MUTED = colors.HexColor("#5B6B62")
GREEN = colors.HexColor("#20664E")
DARK = colors.HexColor("#173F33")
PALE = colors.HexColor("#EDF4EE")
PALE_2 = colors.HexColor("#F6F8F5")
LINE = colors.HexColor("#D7E2D9")
AMBER = colors.HexColor("#9A651D")
AMBER_PALE = colors.HexColor("#FBF5E9")
WHITE = colors.white


def visual(value: str) -> str:
    if any("\u0600" <= char <= "\u06ff" for char in value):
        return get_display(arabic_reshaper.reshape(value), base_dir="R")
    return value


def width(value: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(visual(value), font, size)


def right_text(c: canvas.Canvas, value: str, x: float, y: float,
               size: float = 10.5, bold: bool = False,
               color: colors.Color = INK) -> None:
    c.setFont("Tahoma-Bold" if bold else "Tahoma", size)
    c.setFillColor(color)
    c.drawRightString(x, y, visual(value))


def left_text(c: canvas.Canvas, value: str, x: float, y: float,
              size: float = 9, bold: bool = False,
              color: colors.Color = INK) -> None:
    c.setFont("Tahoma-Bold" if bold else "Tahoma", size)
    c.setFillColor(color)
    c.drawString(x, y, visual(value))


def wrap(value: str, max_width: float, size: float = 10.2,
         bold: bool = False) -> list[str]:
    font = "Tahoma-Bold" if bold else "Tahoma"
    lines: list[str] = []
    for paragraph in value.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for word in paragraph.split():
            trial = f"{current} {word}" if current else word
            if current and width(trial, font, size) > max_width:
                lines.append(current)
                current = word
            else:
                current = trial
        if current:
            lines.append(current)
    return lines


def para(c: canvas.Canvas, value: str, x_right: float, top: float,
         max_width: float, size: float = 10.2, leading: float = 17,
         color: colors.Color = INK, bold: bool = False) -> float:
    for i, line in enumerate(wrap(value, max_width, size, bold)):
        if line:
            right_text(c, line, x_right, top - i * leading, size, bold, color)
    return top - len(wrap(value, max_width, size, bold)) * leading


def line(c: canvas.Canvas, x1: float, y: float, x2: float,
         color: colors.Color = LINE) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(0.7)
    c.line(x1, y, x2, y)


def rounded(c: canvas.Canvas, x: float, y: float, w: float, h: float,
            fill: colors.Color = WHITE, stroke: colors.Color = LINE,
            radius: float = 10) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.8)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def page(c: canvas.Canvas, index: int, title: str, kicker: str) -> None:
    c.bookmarkPage(f"page{index}")
    c.addOutlineEntry(title, f"page{index}")
    c.setFillColor(WHITE)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.rect(0, H - 8, W, 8, fill=1, stroke=0)
    right_text(c, kicker, R, H - 42, 9, True, GREEN)
    right_text(c, title, R, H - 77, 22, True, DARK)
    line(c, M, H - 97, R)
    line(c, M, 46, R)
    right_text(c, "فاميلي كير | دليل الاستخدام", R, 28, 8, False, MUTED)
    left_text(c, f"{index:02d} / 08", M, 28, 8, True, GREEN)


def section(c: canvas.Canvas, title: str, y: float) -> float:
    right_text(c, title, R, y, 13, True, GREEN)
    return y - 25


def bullet(c: canvas.Canvas, text: str, y: float, size: float = 10.2,
           max_width: float = CONTENT - 24) -> float:
    c.setFillColor(GREEN)
    c.circle(R - 3.5, y - 3, 2.7, fill=1, stroke=0)
    return para(c, text, R - 17, y, max_width, size, 16) - 8


def numbered(c: canvas.Canvas, num: str, title: str, desc: str,
             x: float, top: float, w: float, h: float) -> None:
    rounded(c, x, top - h, w, h, PALE_2)
    c.setFillColor(GREEN)
    c.circle(x + w - 22, top - 25, 12, fill=1, stroke=0)
    c.setFont("Tahoma-Bold", 9)
    c.setFillColor(WHITE)
    c.drawCentredString(x + w - 22, top - 28, num)
    right_text(c, title, x + w - 44, top - 28, 10.5, True, DARK)
    para(c, desc, x + w - 17, top - 51, w - 34, 9.2, 14, MUTED)


def info_box(c: canvas.Canvas, title: str, body: str,
             x: float, top: float, w: float,
             fill: colors.Color = PALE, accent: colors.Color = GREEN,
             size: float = 9.8) -> float:
    body_lines = wrap(body, w - 40, size)
    h = 47 + len(body_lines) * 15
    rounded(c, x, top - h, w, h, fill, fill)
    c.setFillColor(accent)
    c.roundRect(x + w - 6, top - h, 6, h, 3, fill=1, stroke=0)
    right_text(c, title, x + w - 22, top - 25, 10.5, True, accent)
    para(c, body, x + w - 22, top - 48, w - 40, size, 15, INK)
    return top - h


def screenshot(c: canvas.Canvas, path: Path, x: float, y: float,
               w: float, h: float, caption: str,
               crop: tuple[int, int, int, int] | None = None) -> None:
    with Image.open(path) as raw:
        im = raw.convert("RGB")
        if crop:
            im = im.crop(crop)
        ratio = min(w / im.width, h / im.height)
        draw_w, draw_h = im.width * ratio, im.height * ratio
        out = BytesIO()
        im.save(out, format="PNG")
        out.seek(0)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.8)
        c.roundRect(x - 2, y - 2, w + 4, h + 4, 6, fill=0, stroke=1)
        c.drawImage(ImageReader(out), x + (w - draw_w) / 2,
                    y + (h - draw_h) / 2, draw_w, draw_h)
    right_text(c, caption, x + w, y - 17, 8, False, MUTED)


OUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1)
c.setTitle("دليل استخدام فاميلي كير")
c.setAuthor("Family Care")
c.setSubject("دليل الفريق لاستخدام نظام إدارة العيادة")

# 1 - Cover
c.bookmarkPage("page1")
c.addOutlineEntry("الغلاف", "page1")
c.setFillColor(PALE_2)
c.rect(0, 0, W, H, fill=1, stroke=0)
c.setFillColor(DARK)
c.rect(0, H - 365, W, 365, fill=1, stroke=0)
c.setFillColor(GREEN)
c.rect(0, H - 11, W, 11, fill=1, stroke=0)
c.drawImage(str(LOGO), R - 67, H - 99, 67, 67, preserveAspectRatio=True)
right_text(c, "فاميلي كير", R - 83, H - 59, 20, True, WHITE)
right_text(c, "دليل الاستخدام", R, H - 176, 34, True, WHITE)
right_text(c, "خطوات العمل اليومية للفريق", R, H - 215, 17, False, colors.HexColor("#D9EDE1"))
right_text(c, "الاستقبال  •  الطبيب  •  المالك", R, H - 267, 12, False, WHITE)
right_text(c, "نسخة 10/10/2026", R, H - 307, 9, False, colors.HexColor("#C9DDD0"))
screenshot(c, REVIEW / "login-desktop.jpg", M, 135, CONTENT, 290,
           "شاشة الدخول - لقطة من النظام")
right_text(c, "family-care-4le.pages.dev", R, 78, 10, True, GREEN)
c.linkURL("https://family-care-4le.pages.dev/", (R - 205, 73, R, 91), relative=0)
right_text(c, "نسخة قابلة للطباعة | صور توضيحية من بيئة التجربة", R, 59, 8.5, False, MUTED)
c.showPage()

# 2 - First steps and roles
page(c, 2, "ابدأ من هنا", "01 | الدخول والصلاحيات")
y = 718
y = info_box(c, "رابط النظام", "افتح النظام على الكمبيوتر أو الهاتف. استخدم البريد وكلمة المرور التي سلّمها لك مالك العيادة. إذا نسيت كلمة المرور، اطلب من المالك تعيين كلمة جديدة.", M, y, CONTENT)
left_text(c, "https://family-care-4le.pages.dev/", M + 16, y - 19, 9.5, True, GREEN)
c.linkURL("https://family-care-4le.pages.dev/", (M + 16, y - 24, M + 255, y - 7), relative=0)
y -= 43
y = section(c, "كيف تتنقل داخل البرنامج؟", y)
y = bullet(c, "القائمة الجانبية تعرض الصفحات المناسبة لصلاحيتك. على الهاتف افتحها من زر «القائمة».", y)
y = bullet(c, "ابحث عن العميل بالاسم أو الموبايل أو كود التخصص من أعلى الشاشة. اختصار Ctrl+K يفتح البحث، وEsc يمسحه.", y)
y = bullet(c, "اضغط «تحديث» لإعادة تحميل البيانات، وسجّل الخروج عند ترك جهاز مشترك.", y)
y -= 8
y = section(c, "من يرى ماذا؟", y)
roles = [
    ("المالك", "كل صفحات التشغيل والإدارة، الأسعار والحسابات والتأمين والتقارير وتقييمات العملاء."),
    ("الاستقبال", "جدول اليوم والعملاء والزيارات والمتابعات والتخصصات والعروض والرسائل حسب الصلاحيات المتاحة."),
    ("الطبيب", "جدوله والملفات والزيارات المرتبطة به، وصفحة «حسابي» لكشف حسابه."),
]
for name, desc in roles:
    rounded(c, M, y - 67, CONTENT, 67, PALE_2)
    right_text(c, name, R - 14, y - 23, 11, True, GREEN)
    para(c, desc, R - 14, y - 44, CONTENT - 28, 9.4, 14, INK)
    y -= 76
info_box(c, "حماية بيانات العملاء", "لا تشارك حسابك مع غيرك. الصلاحيات تطبَّق على البيانات نفسها، وتقييمات العملاء يراها المالك وحده.", M, y - 3, CONTENT)
c.showPage()

# 3 - Journey and customer file
page(c, 3, "من أول اتصال إلى ملف العميل", "02 | تسجيل العميل")
right_text(c, "رحلة الزيارة باختصار", R, 718, 13, True, GREEN)
journey = [
    ("01", "ابحث", "تأكد أن العميل غير مسجل."),
    ("02", "أنشئ الملف", "سجّل النوع والرقم والموافقات."),
    ("03", "احجز", "اختر الطبيب والموعد."),
    ("04", "قدّم الخدمة", "أضف الخدمات والسعر والعرض."),
    ("05", "حصّل وأنهِ", "سجّل الدفع والكشف والمتابعة."),
    ("06", "تابع", "راجع المتابعات والتقييمات."),
]
card_w = (CONTENT - 12) / 2
for idx, (num, title, desc) in enumerate(journey):
    col = idx % 2
    row = idx // 2
    x = M + (card_w + 12) * (1 - col)
    numbered(c, num, title, desc, x, 699 - row * 91, card_w, 79)
y = 401
y = section(c, "إنشاء ملف صحيح من أول مرة", y)
y = bullet(c, "افتح «العملاء»، وابحث أولاً بالاسم أو الموبايل. إن لم يوجد، اضغط «عميل جديد».", y, 9.8)
y = bullet(c, "أدخل الاسم ورقم الموبايل المصري، ثم اختر نوع العميل. إذا كان تأميناً آجلاً، اختر شركة التأمين.", y, 9.8)
y = bullet(c, "اختر التخصص ليُخصص للعميل كود فيه. يمكن أن يكون للشخص أكثر من كود تخصص.", y, 9.8)
y = bullet(c, "سجّل موافقة العروض وأعياد الميلاد، وموافقة رسائل المتابعة، كلّاً على حدة وبناءً على جواب العميل.", y, 9.8)
screenshot(c, REVIEW / "patients-desktop.jpg", M, 82, CONTENT, 143,
           "صفحة العملاء - الأسماء الظاهرة بيانات تجريبية",
           crop=(0, 66, 1366, 450))
c.showPage()

# 4 - Booking and money
page(c, 4, "الحجز والخدمات والتحصيل", "03 | رحلة الزيارة")
y = 719
for num, title, desc in [
    ("1", "افتح الزيارة", "من ملف العميل اضغط «زيارة جديدة». اختر الطبيب والتاريخ والوقت والمكان. الزيارة المنزلية تضيف 1,000 جنيه مرة واحدة."),
    ("2", "أضف الخدمات", "في صفحة الزيارة اضغط «إضافة خدمة»، واختر الخدمة والطبيب المنفذ والعدد. يمكن تطبيق كود عرض صالح قبل التحصيل."),
    ("3", "راجع المبلغ", "راجع إجمالي الزيارة وحصة العميل والتأمين والمحصّل والمتبقي. السعر المسجل وقت الزيارة محفوظ حتى لو تغيرت القائمة لاحقاً."),
    ("4", "سجّل التحصيل", "اضغط «تسجيل تحصيل»، أدخل المبلغ واختر نقدي أو بطاقة أو تحويل. يمكنك تسجيل دفعة جزئية، ثم عرض الإيصال وطباعته."),
]:
    numbered(c, num, title, desc, M, y, CONTENT, 88)
    y -= 98
y -= 4
y = info_box(c, "عندما تظهر حالة «بانتظار الديبوزيت»", "أضف الخدمة التي تشترط ديبوزيت، ثم سجّل المبلغ المطلوب الظاهر في الزيارة. يظل الحجز غير مؤكد حتى يكتمل المطلوب. وإذا غطى التأمين حصة العميل بالكامل، لا يُطلب منه ديبوزيت.", M, y, CONTENT, AMBER_PALE, AMBER)
y -= 16
right_text(c, "في صفحة «اليوم»: افتح الحجز، سجّل «حضر» عند وصول العميل، أو ألغِ الحجز عند الحاجة.", R, y, 9.5, False, MUTED)
c.showPage()

# 5 - Clinical work and follow-ups
page(c, 5, "الكشف والمتابعات", "04 | الطبيب والاستقبال")
y = 719
y = info_box(c, "إنهاء الزيارة", "افتح الزيارة واضغط «الكشف وإنهاء الزيارة». اكتب التشخيص أو ملاحظات الكشف، وأضف التعليمات إن وجدت. يمكن تحديد تاريخ ووقت وغرض متابعة قبل الضغط على «حفظ وإنهاء الزيارة».", M, y, CONTENT)
y -= 24
y = section(c, "إدارة المتابعة بعد الزيارة", y)
for title, desc in [
    ("متابعة جديدة", "من الزيارة نفسها حدّد التاريخ والغرض والوقت إن لزم."),
    ("تمت", "استخدمها عندما تكتمل المتابعة فعلاً."),
    ("تغيير الموعد", "سجّل الموعد الجديد؛ يحتفظ النظام بتاريخ التغيير."),
    ("لم يحضر", "سجّلها حين يتخلف العميل عن الموعد."),
]:
    rounded(c, M, y - 49, CONTENT, 49, PALE_2)
    right_text(c, title, R - 14, y - 20, 10, True, GREEN)
    right_text(c, desc, R - 14, y - 38, 9.2, False, INK)
    y -= 57
y -= 7
y = info_box(c, "لماذا لا يرى الطبيب العميل؟", "تطابق تخصص العميل والطبيب وحده لا يكفي. سجّل زيارة للعميل واختر الطبيب الصحيح فيها. راجع أيضاً ربط حساب الدخول بسجل الطبيب. بعدها تظهر للطبيب الزيارة والملف المرتبط بها.", M, y, CONTENT, AMBER_PALE, AMBER)
y -= 21
right_text(c, "الطبيب يفتح «حسابي»، يحدد الفترة، ويضغط «عرض الحساب» لمراجعة المحصّل ونصيبه.", R, y, 9.5, False, MUTED)
c.showPage()

# 6 - Owner operations
page(c, 6, "إدارة العيادة للمالك", "05 | الأسعار والحسابات والتقارير")
y = 719
owner_items = [
    ("الأسعار والخدمات", "من «التخصصات والخدمات» أضف الخدمة أو عدّلها، ثم انشر سعرها في «الإعدادات ← قوائم الأسعار». حدد تاريخ السريان؛ الزيارات القديمة تبقى بأسعارها."),
    ("حسابات الفريق", "من «الأطباء والحسابات» أضف سجل الطبيب. ثم من «الإعدادات ← الحسابات» أنشئ حساب دخوله واربطه بالطبيب. كلمة المرور الجديدة لا تقل عن 12 حرفاً."),
    ("التأمين والذمم", "راجع فواتير الشركات والمتبقي. عند وصول المبلغ فعلياً، سجّل «تسوية» بالشركة والمبلغ والمرجع. تصحيح التسوية يتم بإجراء العكس الموثق."),
    ("التقارير", "حدد الفترة في «التقارير» لمراجعة تحصيل العملاء والتأمين والإيجارات ونصيب الأطباء، ثم اطبع أو صدّر CSV عند الحاجة."),
]
for title, desc in owner_items:
    rounded(c, M, y - 115, CONTENT, 115, PALE_2)
    right_text(c, title, R - 17, y - 28, 11.5, True, GREEN)
    para(c, desc, R - 17, y - 56, CONTENT - 35, 9.8, 16, INK)
    y -= 127
y -= 8
info_box(c, "قبل اعتماد الأسعار", "قوائم عيادات مصر والنقابة والأقارب والتأمين نُسخت مبدئياً من فاميلي كير وتحتاج مراجعتك. راجع أيضاً ثاني ساعة البنج الكلي 300 جنيه، وبندي النايت جارد 1999 جنيه ونايت جارد الفك 1800 جنيه.", M, y, CONTENT, AMBER_PALE, AMBER, 9.3)
c.showPage()

# 7 - Messages and customer experience
page(c, 7, "الرسائل وتقييم تجربة العميل", "06 | المتابعة بعد الخدمة")
y = 719
y = info_box(c, "وضع الرسائل الحالي", "مزود الرسائل تجريبي: يسجّل التذكيرات والعروض ودعوات التقييم في النظام فقط. لا تصل رسائل SMS أو واتساب إلى العملاء حالياً. يلزم اختيار مزود وربطه واختبار الإرسال قبل الاعتماد عليه.", M, y, CONTENT, AMBER_PALE, AMBER)
y -= 22
y = section(c, "متى يظهر التقييم؟", y)
y = bullet(c, "عند إنهاء زيارة لعميل نشط وافق على رسائل المتابعة، ينشئ النظام دعوة تقييم واحدة.", y, 9.8)
y = bullet(c, "الرابط صالح لمدة 30 يوماً ويقبل رداً واحداً فقط: من نجمة إلى خمس نجوم، وملاحظة اختيارية.", y, 9.8)
y = bullet(c, "لا يظهر الرد في «تقييمات العملاء» حتى يفتح العميل الرابط ويرسل تقييمه. المالك وحده يرى النجوم والتعليقات.", y, 9.8)
y -= 4
right_text(c, "صفحة التقييم التي يراها العميل", R, y, 10.5, True, GREEN)
screen_top = y - 18
screenshot(c, REVIEW / "experience-survey-desktop.jpg", M + 113, screen_top - 230,
           CONTENT - 226, 230, "صورة توضيحية - رابط تجريبي",
           crop=(430, 150, 940, 660))
right_text(c, "حملات العروض", R, 205, 10.5, True, GREEN)
para(c, "اختر العرض والتخصص والفلاتر، ثم اضغط «معاينة المستلمين». تُستبعد الحسابات التي لم توافق على التسويق، ويُعاد التحقق من الموافقة عند تسجيل الحملة التجريبية.", R, 185, CONTENT, 9.2, 14, INK)
info_box(c, "النتائج للمالك فقط", "لا يستطيع الاستقبال أو الطبيب قراءة النجوم أو التعليقات. صفحة التقييم نفسها لا تعرض اسم العميل أو ردود الآخرين.", M, 145, CONTENT)
c.showPage()

# 8 - Common questions and close
page(c, 8, "مرجع سريع وحل المشكلات", "07 | قبل نهاية اليوم")
y = 719
faqs = [
    ("العميل لا يظهر للطبيب", "تأكد من وجود زيارة له اختير فيها الطبيب نفسه، وأن حساب الطبيب مربوط بسجل الطبيب الصحيح."),
    ("الحجز ما زال بانتظار الديبوزيت", "افتح الزيارة وراجع الديبوزيت المطلوب والمحصّل، ثم سجّل المتبقي إذا تم استلامه."),
    ("الخدمة أو السعر غير موجود", "راجع التخصص ونوع العميل وقائمة الأسعار السارية. الخدمة الجديدة تحتاج نشر سعر لها."),
    ("لا توجد تقييمات جديدة", "لن يظهر تقييم قبل إرسال العميل رده. مزود الرسائل التجريبي لا يرسل رابط التقييم له."),
    ("نسيت كلمة المرور", "اطلب من المالك إعادة تعيينها من «الإعدادات ← الحسابات»."),
]
for question, answer in faqs:
    rounded(c, M, y - 76, CONTENT, 76, PALE_2)
    right_text(c, question, R - 15, y - 26, 10.5, True, DARK)
    para(c, answer, R - 15, y - 49, CONTENT - 30, 9.2, 14, MUTED)
    y -= 86
y -= 7
y = info_box(c, "مراجعة نهاية اليوم", "راجع حجوزات الغد والمتابعات المتأخرة، وتأكد من ظهور كل دفعة في سجل التحصيل. أبلغ المالك بأي تصحيح مالي ليستخدم إجراء العكس الموثق، ثم سجّل الخروج.", M, y, CONTENT)
y -= 28
right_text(c, "الدليل يصف النسخة المنشورة بتاريخ 10/10/2026. تحديثات النظام قد تغيّر أسماء بعض الأزرار.", R, y, 8.5, False, MUTED)
c.showPage()

c.save()
print(OUT)
