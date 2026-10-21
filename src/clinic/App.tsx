import {lazy,Suspense,useEffect,useState,useRef,useMemo} from 'react';
import {BrowserRouter,Routes,Route,Navigate,NavLink,Link,useNavigate,Outlet} from 'react-router-dom';
import {db,text,today,date,readableError,label,type Profile} from './api';
import {ClinicProvider,useClinic} from './store';
import {patientSearchIndex} from './search';
const Today=lazy(()=>import('./Today'));
const Patients=lazy(()=>import('./Patients'));
const Visit=lazy(()=>import('./Visit'));
const FollowUps=lazy(()=>import('./FollowUps'));
const Doctors=lazy(()=>import('./Doctors'));
const DoctorSchedules=lazy(()=>import('./DoctorSchedules'));
const Insurance=lazy(()=>import('./Insurance'));
const Messages=lazy(()=>import('./Messages'));
const Settings=lazy(()=>import('./Settings'));
const Reports=lazy(()=>import('./Reports'));
const Expenses=lazy(()=>import('./Expenses'));
const Experience=lazy(()=>import('./Experience'));
const ExperienceSurvey=lazy(()=>import('./ExperienceSurvey'));
function Login(){
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [show,setShow]=useState(false);
 const signIn=(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();setBusy(true);setError('');
  void db.auth.signInWithPassword({email:email.trim(),password})
   .then(({error})=>{if(error)setError(error.code==='invalid_credentials'?'البريد أو كلمة المرور غير صحيحة.':'تعذر تسجيل الدخول. راجع اتصال الإنترنت.');})
   .catch(()=>setError('تعذر الاتصال. حاول مرة أخرى.'))
   .finally(()=>setBusy(false));
 };
 return <main className="login-page"><div className="login-shell">
  <section className="login-brand" aria-label="فاميلي كير">
   <div className="login-brand-top"><span className="login-brand-logo"><img src="/logo.jpg" width="64" height="64" alt=""/></span><div><strong>فاميلي كير</strong><small>FAMILY CARE MEDICAL CENTER</small></div></div>
   <div className="login-brand-center"><span className="login-brand-kicker">مساحة عمل فريق العيادة</span><p className="login-brand-statement">رعاية منظمة. <br/>يوم عمل أوضح.</p><p className="login-brand-description">ملفات العملاء، الزيارات، والمواعيد والحسابات في مكان واحد لفريق فاميلي كير.</p></div>
   <div className="login-brand-bottom"><span>نظام إدارة العيادة</span><span>لأعضاء الفريق المصرّح لهم</span></div>
  </section>
  <section className="login-content">
   <div className="login-content-top"><span className="login-content-mark" aria-hidden="true"/>بوابة فريق العمل</div>
   <div className="login-content-inner"><div className="login-heading"><span className="login-eyebrow">مرحبًا بعودتك</span><h1>تسجيل الدخول</h1><p>استخدم حسابك للوصول إلى مساحة عمل العيادة.</p></div>
    <form className="login-form" onSubmit={signIn}>
     <div className="login-field"><label htmlFor="login-email">البريد الإلكتروني</label><input id="login-email" type="email" dir="ltr" required autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)}/></div>
     <div className="login-field"><label htmlFor="login-password">كلمة المرور</label><div className="login-password-field"><input id="login-password" type={show?'text':'password'} dir="ltr" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/><button type="button" aria-label={show?'إخفاء كلمة المرور':'إظهار كلمة المرور'} aria-pressed={show} onClick={()=>setShow(value=>!value)}>{show?'إخفاء':'إظهار'}</button></div></div>
     {error&&<p className="error" role="alert">{error}</p>}
     <button className="primary login-submit" disabled={busy}>{busy?'جارٍ الدخول…':'دخول إلى النظام'}<span aria-hidden="true">←</span></button>
    </form><p className="login-help">ليس لديك حساب أو نسيت كلمة المرور؟<br/>تواصل مع مالك العيادة لاستعادة الوصول.</p>
   </div><p className="login-content-footer">© فاميلي كير · بوابة الموظفين</p>
  </section>
 </div></main>;
}
function Layout(){
 const {profile,rows,refresh}=useClinic();const navigate=useNavigate();const [search,setSearch]=useState('');const [menu,setMenu]=useState(false);const [error,setError]=useState('');const searchInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();searchInput.current?.focus();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const codes=rows('patient_specialty_codes');const patients=rows('patients');
 const searchIndex=useMemo(()=>patientSearchIndex(patients,codes),[patients,codes]);
 const clients=search.trim()?patients.filter(row=>row.active&&searchIndex.get(row.id)?.includes(search.trim().toLowerCase())).slice(0,12):[];
 const nav=[['/','اليوم'],['/patients','العملاء'],['/follow-ups','المتابعات'],...(profile.role!=='doctor'?[['/doctor-schedules','مواعيد الدكاترة']]:[]),['/specialties','التخصصات والخدمات'],...(profile.role==='doctor'?[['/doctors','حسابي']]:[['/messages','العروض والرسائل'],['/expenses','المصروفات']]),...(profile.role==='owner'?[['/doctors','الأطباء والحسابات'],['/insurance','التأمين والنقابات'],['/experience','تقييمات العملاء'],['/reports','التقارير'],['/settings','الإعدادات']]:[])];
 return <div className="desk"><aside className={menu?'sidebar open':'sidebar'}><Link className="brand" to="/"><img src="/logo.jpg" width="40" height="40" alt=""/><strong>فاميلي كير</strong></Link><nav>{nav.map(([path,title])=><NavLink key={path} to={path} end={path==='/'} onClick={()=>setMenu(false)}>{title}</NavLink>)}</nav><footer><strong>{profile.display_name}</strong><small>{label(profile.role)}</small><button onClick={()=>{void db.auth.signOut().then(({error})=>{if(error)setError('تعذر إنهاء الجلسة. حاول مرة أخرى.');});}}>تسجيل الخروج</button></footer></aside><div className="workspace"><header className="topbar"><button className="menu-button" aria-label="القائمة" onClick={()=>setMenu(current=>!current)}>☰</button><div className="global-search"><label htmlFor="global-search">بحث العميل</label><input id="global-search" ref={searchInput} type="search" placeholder="الاسم، الموبايل، كود العميل — Ctrl+K" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setSearch('');if(event.key==='Enter'&&clients[0]){navigate(`/patients/${clients[0].id}`);setSearch('');}}}/>{search.trim()&&<div className="search-results">{clients.length?clients.map(row=><button key={row.id} onClick={()=>{navigate(`/patients/${row.id}`);setSearch('');}}>{text(row.name)} <bdi>{text(row.patient_code)}</bdi> <bdi>{text(row.phone_e164)}</bdi></button>):<p>لا يوجد عميل مطابق.</p>}</div>}</div><bdi className="work-date">{date(today())}</bdi><button aria-label="تحديث البيانات" onClick={()=>{void refresh().catch(()=>{});}}>تحديث</button></header>{error&&<p className="error" role="alert">{error}</p>}<main className="page"><Suspense fallback={<p role='status' className='loading'>جارٍ فتح الشاشة…</p>}><Outlet/></Suspense></main></div></div>;
}
function Guard({children,roles}:{children:React.ReactNode;roles:Profile['role'][]}){const {profile}=useClinic();return roles.includes(profile.role)?children:<Navigate to="/" replace/>;}
function PrivateApp(){
 const [uid,setUid]=useState<string|null|undefined>();const [profile,setProfile]=useState<Profile|null>(null);const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);
 useEffect(()=>{void db.auth.getSession().then(({data,error})=>{if(error)setError('تعذر قراءة الجلسة.');setUid(data.session?.user.id??null);});const {data}=db.auth.onAuthStateChange((_event,session)=>setUid(session?.user.id??null));return()=>data.subscription.unsubscribe();},[]);
 useEffect(()=>{
   let active=true;setProfile(null);setError('');if(!uid)return;
   void (async()=>{const {data:identity,error:identityError}=await db.auth.getUser();if(identityError)throw identityError;const {data,error}=await db.from('profiles').select('*').eq('id',identity.user.id).eq('active',true).single();if(error)throw new Error('حسابك غير مفعل في العيادة. راجع المالك.');if(active)setProfile(data as Profile);})().catch(error=>{if(active)setError(readableError(error));});return()=>{active=false;};
 },[uid,attempt]);
 if(uid===undefined)return <p className="loading" role="status">جارٍ التحقق من الجلسة…</p>;
 if(!uid)return <Login/>;
 if(error)return <main className="access-error"><p className="error" role="alert">{error}</p><button className="primary" onClick={()=>setAttempt(value=>value+1)}>إعادة المحاولة</button><button onClick={()=>void db.auth.signOut()}>العودة لتسجيل الدخول</button></main>;
 if(!profile)return <p className="loading" role="status">جارٍ فتح العيادة…</p>;
 return <BrowserRouter><ClinicProvider profile={profile}><Routes><Route element={<Layout/>}><Route index element={<Today/>}/><Route path="appointments" element={<Today/>}/><Route path="doctor-portal" element={<Today/>}/><Route path="patients" element={<Patients/>}/><Route path="patients/:id" element={<Patients/>}/><Route path="visits/:id" element={<Visit/>}/><Route path="follow-ups" element={<FollowUps/>}/><Route path="specialties" element={<Settings catalogOnly/>}/><Route path="doctor-schedules" element={<Guard roles={['owner','reception']}><DoctorSchedules/></Guard>}/><Route path="doctors" element={<Guard roles={['owner','doctor']}><Doctors/></Guard>}/><Route path="insurance" element={<Guard roles={['owner']}><Insurance/></Guard>}/><Route path="messages" element={<Guard roles={['owner','reception']}><Messages/></Guard>}/><Route path="experience" element={<Guard roles={['owner']}><Experience/></Guard>}/><Route path="expenses" element={<Guard roles={['owner','reception']}><Expenses/></Guard>}/><Route path="reports" element={<Guard roles={['owner']}><Reports/></Guard>}/><Route path="settings" element={<Guard roles={['owner']}><Settings/></Guard>}/><Route path="*" element={<Navigate to="/" replace/>}/></Route></Routes></ClinicProvider></BrowserRouter>;
}
function Application(){
 const [hash,setHash]=useState(window.location.hash);
 useEffect(()=>{const update=()=>setHash(window.location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 if(hash.startsWith('#experience/'))return <ExperienceSurvey token={hash.slice('#experience/'.length)}/>;
 return <PrivateApp/>;
}

export default function App(){return <Suspense fallback={<p role='status' className='loading'>جارٍ فتح الشاشة…</p>}><Application/></Suspense>;}
