import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SecondaryButton } from '../../components/ui'
import { APP_NAME, SCHOOL_LOGO_SRC, SCHOOL_NAME } from '../../lib/brand'

const sections = [
  { id: 'overview', title: 'نظرة عامة' },
  { id: 'roles', title: 'أنواع الحسابات' },
  { id: 'flow', title: 'مسار طلب الخروج' },
  { id: 'admin', title: 'شاشة المدير' },
  { id: 'gate', title: 'مناوبو البوابة' },
  { id: 'display', title: 'شاشة الفصل' },
  { id: 'notify', title: 'الإشعارات' },
  { id: 'import', title: 'الاستيراد الجماعي' },
  { id: 'status', title: 'حالات الطلب' },
  { id: 'tips', title: 'نصائح وتشغيل' },
] as const

function GuideSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="guide-section scroll-mt-24 space-y-3">
      <h2 className="border-b border-[rgba(212,175,55,0.35)] pb-2 text-xl font-bold text-[var(--color-gold)]">
        {title}
      </h2>
      <div className="space-y-3 text-[var(--color-text)] leading-8">{children}</div>
    </section>
  )
}

export function AdminGuidePage() {
  const [active, setActive] = useState<string>(sections[0].id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target.id) setActive(visible.target.id)
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0.2, 0.5, 1] },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  function exportPdf() {
    const previousTitle = document.title
    document.title = `دليل منصة ${APP_NAME} — ${SCHOOL_NAME}`
    window.addEventListener(
      'afterprint',
      () => {
        document.title = previousTitle
      },
      { once: true },
    )
    window.print()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-gold)]">دليل المنصة</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            دليل شامل لتشغيل نظام {APP_NAME} في {SCHOOL_NAME}: الأدوار، الشاشات، الطلبات،
            الإشعارات، والاستيراد.
          </p>
        </div>
        <SecondaryButton type="button" className="no-print" onClick={exportPdf}>
          تصدير PDF
        </SecondaryButton>
      </div>

      <div className="print-only guide-print-header">
        <img src={SCHOOL_LOGO_SRC} alt="" width={72} height={72} />
        <div>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '18pt' }}>{SCHOOL_NAME}</p>
          <p style={{ margin: '4px 0 0', fontSize: '14pt' }}>دليل تشغيل منصة {APP_NAME}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="no-print glass-panel h-fit p-3 lg:sticky lg:top-4">
          <p className="mb-2 px-2 text-sm font-bold text-[var(--color-gold)]">محتويات الدليل</p>
          <nav className="flex flex-col gap-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  active === s.id
                    ? 'bg-[rgba(212,175,55,0.2)] font-bold text-[var(--color-gold)]'
                    : 'text-[var(--color-muted)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--color-text)]'
                }`}
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="glass-panel space-y-10 p-4 md:p-6">
          <GuideSection id="overview" title="نظرة عامة">
            <p>
              منصة <strong>{APP_NAME}</strong> تطبيق ويب عربي (من اليمين لليسار) لإدارة طلبات
              خروج الطلاب في <strong>{SCHOOL_NAME}</strong>.
            </p>
            <ul className="list-inside list-disc space-y-1 text-[var(--color-muted)]">
              <li>مناوب البوابة يرسل طلب خروج من البوابة.</li>
              <li>تظهر الطلبات فورًا على شاشة الفصل المعني.</li>
              <li>شاشة الفصل تعرض الطلب ويمكن الموافقة أو الرفض منها.</li>
              <li>المدير يدير الفصول والطلاب والحسابات والطلبات.</li>
            </ul>
            <p className="text-sm text-[var(--color-muted)]">
              الدخول موحّد لجميع الأدوار: يكتب المستخدم اسم الدخول وكلمة المرور في شاشة تسجيل
              الدخول.
            </p>
          </GuideSection>

          <GuideSection id="roles" title="أنواع الحسابات">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[rgba(212,175,55,0.35)] text-right text-[var(--color-gold)]">
                    <th className="px-2 py-2">الدور</th>
                    <th className="px-2 py-2">أين يدخل؟</th>
                    <th className="px-2 py-2">ماذا يستطيع أن يفعل؟</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--color-muted)]">
                  <tr className="border-b border-[rgba(255,255,255,0.06)]">
                    <td className="px-2 py-2 font-bold text-[var(--color-text)]">مناوب بوابة</td>
                    <td className="px-2 py-2">صفحة البوابة</td>
                    <td className="px-2 py-2">البحث عن الطالب وإرسال طلب خروج</td>
                  </tr>
                  <tr className="border-b border-[rgba(255,255,255,0.06)]">
                    <td className="px-2 py-2 font-bold text-[var(--color-text)]">شاشة فصل</td>
                    <td className="px-2 py-2">/display/class</td>
                    <td className="px-2 py-2">عرض الطلبات الواردة، موافقة/رفض، تنبيهات</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-2 font-bold text-[var(--color-text)]">مدير</td>
                    <td className="px-2 py-2">لوحة الإدارة</td>
                    <td className="px-2 py-2">إدارة كاملة للمنصة والتقارير والاستيراد</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              حسابات مناوبي البوابة والفصول والمدير تُنشأ من لوحة الإدارة أو أدوات الإعداد.
            </p>
          </GuideSection>

          <GuideSection id="flow" title="مسار طلب الخروج">
            <ol className="list-inside list-decimal space-y-2 text-[var(--color-muted)]">
              <li>
                المدير يضيف الطلاب ويربطهم بفصول، أو يستوردهم جماعيًا، وينشئ حساب شاشة لكل
                فصل.
              </li>
              <li>مناوب البوابة يسجّل الدخول ويبحث عن الطالب بجزء من اسمه.</li>
              <li>يضغط «خروج» فيُرسل الطلب مباشرة إلى شاشة الفصل.</li>
              <li>تظهر الطلبات على الشاشة (مع تنبيه صوتي/إشعار إن كان مفعّلًا).</li>
              <li>من الشاشة تتم الموافقة أو الرفض (مع سبب عند الرفض).</li>
            </ol>
          </GuideSection>

          <GuideSection id="admin" title="شاشة المدير — أقسام القائمة">
            <ul className="space-y-3 text-[var(--color-muted)]">
              <li>
                <Link className="font-bold text-[var(--color-gold)]" to="/admin">
                  لوحة التحكم
                </Link>
                : ملخص سريع — طلبات اليوم، قيد الانتظار، الموافقات والرفض لليوم.
              </li>
              <li>
                <Link className="font-bold text-[var(--color-gold)]" to="/admin/requests">
                  الطلبات
                </Link>
                : استعراض كل الطلبات مع التصفية حسب الصف / الفصل / الحالة / التاريخ.
              </li>
              <li>
                <Link className="font-bold text-[var(--color-gold)]" to="/admin/students">
                  الطلاب
                </Link>
                : إضافة وتعديل الطلاب وتعيين الصف والفصل.
              </li>
              <li>
                <Link className="font-bold text-[var(--color-gold)]" to="/admin/gate">
                  مناوبو البوابة
                </Link>
                : إنشاء حسابات مناوبي البوابة وتفعيل/تعطيل الحساب.
              </li>
              <li>
                <Link className="font-bold text-[var(--color-gold)]" to="/admin/classes">
                  الفصول
                </Link>
                : عرض الفصول الـ 24 (متوسط 1–3 + ثانوي 1–3 × شعب أ ب ج د)، إنشاء حساب شاشة لكل فصل، وتفعيل/تعطيل.
              </li>
              <li>
                <Link className="font-bold text-[var(--color-gold)]" to="/admin/import">
                  استيراد
                </Link>
                : رفع ملف CSV لإضافة طلاب دفعة واحدة.
              </li>
              <li>
                <span className="font-bold text-[var(--color-gold)]">الدليل</span> (هذه الشاشة):
                مرجع تشغيل المنصة بالكامل.
              </li>
            </ul>
          </GuideSection>

          <GuideSection id="gate" title="مناوبو البوابة">
            <ul className="list-inside list-disc space-y-1 text-[var(--color-muted)]">
              <li>ينشئ المدير حسابات مناوبي البوابة من صفحة «مناوبو البوابة».</li>
              <li>البحث بالاسم جزئيًا — يكفي كتابة جزء من اسم الطالب.</li>
              <li>زر «خروج» يرسل الطلب فورًا إلى شاشة الفصل دون تأكيد إضافي.</li>
              <li>لا يمكن إرسال طلب جديد لنفس الطالب إذا كان لديه طلب قيد الانتظار.</li>
            </ul>
          </GuideSection>

          <GuideSection id="display" title="شاشة الفصل">
            <ul className="list-inside list-disc space-y-1 text-[var(--color-muted)]">
              <li>
                من صفحة «الفصول» أنشئ <strong>حساب شاشة</strong> لكل فصل (مثل{' '}
                <strong dir="ltr">c1@g.com</strong> / <strong dir="ltr">c123456</strong>).
              </li>
              <li>
                افتح <strong dir="ltr">/display/class</strong> على تابلت أو شاشة TV في الفصل
                بحساب الشاشة.
              </li>
              <li>تظهر الطلبات الواردة من البوابة فورًا مع صوت تنبيه.</li>
              <li>الموافقة أو الرفض مباشرة من الشاشة (مع سبب عند الرفض).</li>
              <li>فعّل الإشعارات والصوت عند أول فتح لضمان التنبيه حتى لو كانت الشاشة في الخلفية.</li>
            </ul>
          </GuideSection>

          <GuideSection id="notify" title="الإشعارات">
            <p>عند وصول طلب جديد من البوابة، يصل تنبيه إلى شاشة الفصل.</p>
            <ul className="list-inside list-disc space-y-1 text-[var(--color-muted)]">
              <li>شاشة الفصل: تنبيه صوتي وإشعار عند وصول طلب جديد.</li>
              <li>
                لتفعيل التنبيهات: اضغط «تفعيل الإشعارات» ثم اسمح بها عندما يطلب المتصفح ذلك.
              </li>
              <li>على الجوال افتح المنصة من الرابط الآمن الذي يعطيك إياه مسؤول التقنية.</li>
            </ul>
          </GuideSection>

          <GuideSection id="import" title="الاستيراد الجماعي">
            <p>
              من صفحة «استيراد» ارفع ملف Excel/CSV جاهز من المدرسة. الأعمدة المطلوبة: اسم
              الطالب، رقم هوية الطالب، الصف، الشعبة (اختياري — الافتراضي أ).
            </p>
            <ul className="list-inside list-disc text-[var(--color-muted)]">
              <li>
                الصف: الأول/الثاني/الثالث <strong>متوسط</strong> أو <strong>ثانوي</strong> (مثل: الأول
                المتوسط، الثاني الثانوي)، أو رقم داخلي 1–6 (1–3 متوسط، 4–6 ثانوي). الشعبة: أ أو ب أو
                ج أو د.
              </li>
              <li>المنصة تراجع الملف وتعرض الأخطاء قبل التنفيذ.</li>
            </ul>
          </GuideSection>

          <GuideSection id="status" title="حالات الطلب">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[rgba(212,175,55,0.35)] text-right text-[var(--color-gold)]">
                    <th className="px-2 py-2">الحالة</th>
                    <th className="px-2 py-2">المعنى</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--color-muted)]">
                  <tr className="border-b border-[rgba(255,255,255,0.06)]">
                    <td className="px-2 py-2 font-bold text-[var(--color-text)]">قيد الانتظار</td>
                    <td className="px-2 py-2">أُرسل الطلب من البوابة وينتظر قرار شاشة الفصل</td>
                  </tr>
                  <tr className="border-b border-[rgba(255,255,255,0.06)]">
                    <td className="px-2 py-2 font-bold text-[var(--color-text)]">تمت الموافقة</td>
                    <td className="px-2 py-2">وافقت الشاشة على خروج الطالب</td>
                  </tr>
                  <tr className="border-b border-[rgba(255,255,255,0.06)]">
                    <td className="px-2 py-2 font-bold text-[var(--color-text)]">تم الرفض</td>
                    <td className="px-2 py-2">رُفض الطلب مع سبب مسجّل</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-2 font-bold text-[var(--color-text)]">ملغي</td>
                    <td className="px-2 py-2">أُلغي الطلب (إن وُجدت هذه الحالة في السجلات)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GuideSection>

          <GuideSection id="tips" title="نصائح وتشغيل يومي">
            <ul className="list-inside list-disc space-y-2 text-[var(--color-muted)]">
              <li>
                ابدأ دائمًا بالتأكد أن الفصول نشطة وأن لكل فصل <strong>حساب شاشة</strong> قبل
                بدء اليوم الدراسي.
              </li>
              <li>أضف الطلاب قبل بدء اليوم؛ وإلا لن يجدهم مناوب البوابة في البحث.</li>
              <li>تأكد من وجود حسابات مناوبي البوابة نشطة قبل وقت الخروج.</li>
              <li>
                إن تعطّل حساب فصل، عطّله من صفحة الموظفين أو احذفه وأنشئ بديلًا بنفس النمط.
              </li>
              <li>
                للمراقبة الشاملة استخدم «الطلبات» مع الفلاتر بدل الاعتماد على لوحة فصل واحد.
              </li>
              <li>
                التطبيق يدعم التثبيت كتطبيق (PWA) ويعمل مع تنبيه عند انقطاع الشبكة.
              </li>
              <li>
                هذا الدليل متاح دائمًا من قائمة المدير تحت بند «الدليل» للرجوع إليه أثناء العمل.
              </li>
            </ul>
          </GuideSection>
        </div>
      </div>
    </div>
  )
}
