// Fictional clinic used only for user-guide screenshots (scripts/capture-guide-screens.mjs).
// Every name, phone number and amount is invented; nothing here comes from or goes to the clinic database.
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cairo=offset=>{const d=new Date(Date.now()+offset*86400000);return d.toLocaleDateString('en-CA',{timeZone:'Africa/Cairo'});};
export const today=cairo(0);
const at=(day,time='10:00')=>`${day}T${time}:00+02:00`;

export const users={
 owner:{id:id(1),display_name:'مالك العيادة (مثال)',role:'owner',doctor_id:null,active:true,email:'owner@example.com'},
 reception:{id:id(2),display_name:'منى — استقبال (مثال)',role:'reception',doctor_id:null,active:true,email:'reception@example.com'},
 doctor:{id:id(3),display_name:'د. أحمد سامي (مثال)',role:'doctor',doctor_id:id(201),active:true,email:'doctor@example.com'},
};

const S={den:id(101),im:id(102),derm:id(103),phys:id(104),nut:id(105),home:id(106),lab:id(107)};
const specialties=[
 {id:S.den,name:'أسنان',client_prefix:'DEN',active:true,sort_order:1},
 {id:S.im,name:'باطنة وكلى',client_prefix:'IM',active:true,sort_order:2},
 {id:S.derm,name:'جلدية وتجميل',client_prefix:'DERM',active:true,sort_order:3},
 {id:S.phys,name:'علاج طبيعي',client_prefix:'PHYS',active:true,sort_order:4},
 {id:S.nut,name:'تغذية',client_prefix:'NUT',active:true,sort_order:5},
 {id:S.home,name:'زيارات منزلية',client_prefix:'HOME',active:true,sort_order:6},
 {id:S.lab,name:'معمل تحاليل',client_prefix:'LAB',active:true,sort_order:7},
];
const D={ahmed:id(201),heba:id(202),karim:id(203),reem:id(204),salma:id(205)};
const doctors=[
 {id:D.ahmed,specialty_id:S.den,name:'د. أحمد سامي (مثال)',category:'dentist',phone_e164:null,schedule:[6,1,3],active:true},
 {id:D.heba,specialty_id:S.im,name:'د. هبة يوسف (مثال)',category:'percentage',phone_e164:null,schedule:[],active:true},
 {id:D.karim,specialty_id:S.den,name:'د. كريم نبيل (مثال)',category:'renting',phone_e164:null,schedule:[0,2,4],active:true},
 {id:D.reem,specialty_id:S.phys,name:'د. ريم عادل (مثال)',category:'percentage',phone_e164:null,schedule:[6,0,1,2,3,4],active:true},
 {id:D.salma,specialty_id:S.derm,name:'د. سلمى فؤاد (مثال)',category:'percentage',phone_e164:null,schedule:[6,2],active:true},
];
export const terms=[[D.ahmed,3000],[D.heba,4000],[D.karim,0],[D.reem,3500],[D.salma,4000]].map(([doctor_id,default_share_bps])=>({doctor_id,default_share_bps}));

const clientTypes=[['family_care_cash','عميل نقدي فاميلي كير'],['egypt_clinics_cash','عميل نقدي عيادات مصر'],['syndicate_cash','عميل نقدي نقابة'],['relatives','أقارب ومعارف'],['insurance_credit','عميل آجل تأمين']].map(([code,name])=>({code,name,active:true}));
const lists=clientTypes.map((type,i)=>({id:id(301+i),client_type_code:type.code,name:type.name,review_required:type.code==='relatives'}));
const versions=lists.map((list,i)=>({id:id(311+i),list_id:list.id,effective_from:cairo(-45),published_at:at(cairo(-45)),created_by:users.owner.id}));

const V={kashf:id(401),hashw:id(402),geer:id(403),homeFee:id(404),imKashf:id(405),dermKashf:id(406),botox:id(407),physSession:id(408),cupping:id(409),nutKashf:id(410),inbody:id(411),homeKashf:id(412),cbc:id(413)};
const services=[
 {id:V.kashf,seed_code:'DEN-001',specialty_id:S.den,name:'كشف أسنان',price:30000},
 {id:V.hashw,seed_code:'DEN-011',specialty_id:S.den,name:'حشو أبيض ضروس',price:60000,requires_deposit:true,default_deposit_minor:20000},
 {id:V.geer,seed_code:'DEN-006',specialty_id:S.den,name:'تنظيف الجير',price:45000},
 {id:V.homeFee,seed_code:'DEN-HOME',specialty_id:S.den,name:'رسم الزيارة المنزلية',price:100000,pricing_kind:'home',category:'home'},
 {id:V.imKashf,seed_code:'CAT-IM-01',specialty_id:S.im,name:'كشف',price:35000},
 {id:V.dermKashf,seed_code:'CAT-DERM-01',specialty_id:S.derm,name:'كشف',open:true},
 {id:V.botox,seed_code:'CAT-DERM-02',specialty_id:S.derm,name:'بوتوكس',open:true},
 {id:V.physSession,seed_code:'CAT-PHYS-02',specialty_id:S.phys,name:'جلسة علاج طبيعي',open:true},
 {id:V.cupping,seed_code:'CAT-PHYS-04',specialty_id:S.phys,name:'حجامة جافة',open:true},
 {id:V.nutKashf,seed_code:'CAT-NUT-01',specialty_id:S.nut,name:'كشف',open:true},
 {id:V.inbody,seed_code:'CAT-NUT-02',specialty_id:S.nut,name:'انبادي',open:true},
 {id:V.homeKashf,seed_code:'CAT-HOME-01',specialty_id:S.home,name:'كشف منزلي (حسب التخصص)',open:true},
 {id:V.cbc,seed_code:'CUSTOM-LAB-1',specialty_id:S.lab,name:'صورة دم كاملة CBC',price:15000},
].map(s=>({category:'general',pricing_kind:'service',requires_deposit:false,default_deposit_minor:20000,review_note:null,active:true,internal_followup:false,open_price:Boolean(s.open),...s}));
const servicePrices=versions.flatMap(version=>services.filter(s=>!s.open_price).map(s=>({version_id:version.id,service_id:s.id,price_minor:s.price})));
const serviceRows=services.map(row=>{const copy={...row};delete copy.price;delete copy.open;return copy;});

const P=[id(501),id(502),id(503),id(504),id(505),id(506),id(507),id(508)];
const patient=(i,name,phone,type,extra={})=>({id:P[i],name,phone_e164:phone,client_type_code:type,patient_code:`FC-${String(101+i).padStart(6,'0')}`,birth_date:'1990-05-12',marketing_consent:true,transactional_consent:true,notes:'',active:true,demo_batch_id:null,insurer_id:null,union_id:null,created_at:at(cairo(-30)),...extra});
const IC={nile:id(601),delta:id(602),unionPayer:id(603)};const unionId=id(611);
const patients=[
 patient(0,'سارة محمود (مثال)','+201000000101','family_care_cash'),
 patient(1,'محمد علي (مثال)','+201000000102','family_care_cash',{marketing_consent:false}),
 patient(2,'منى حسن (مثال)','+201000000103','insurance_credit',{insurer_id:IC.nile}),
 patient(3,'يوسف إبراهيم (مثال)','+201000000104','family_care_cash'),
 patient(4,'نادية فاروق (مثال)','+201000000105','family_care_cash'),
 patient(5,'عمر خالد (مثال)','+201000000106','egypt_clinics_cash'),
 patient(6,'ليلى سمير (مثال)','+201000000107','family_care_cash'),
 patient(7,'حسن محمود (مثال)','+201000000101','family_care_cash',{notes:'ابن سارة محمود — نفس رقم الأسرة'}),
];
const codes=[{patient_id:P[0],specialty_id:S.den,code:'DEN-000382'}];

// Visits: [patient, doctor, specialty, day, status, lines[[service,qty,unit]], co_pay_bps|null, insurer]
const VI=[id(701),id(702),id(703),id(704),id(705),id(706),id(707),id(708)];
const visitSpec=[
 [0,D.ahmed,S.den,today,'open',[[V.kashf,1,30000],[V.geer,1,45000]],null,null],
 [1,D.ahmed,S.den,today,'open',[[V.hashw,1,60000]],null,null],
 [2,D.heba,S.im,today,'open',[[V.imKashf,1,35000]],2000,IC.nile],
 [3,D.reem,S.phys,today,'open',[[V.physSession,2,25000]],null,null],
 [4,D.ahmed,S.den,cairo(-12),'completed',[[V.kashf,1,30000],[V.hashw,1,60000]],null,null],
 [5,D.salma,S.derm,cairo(-7),'completed',[[V.botox,1,250000]],null,null],
 [2,D.heba,S.im,cairo(-20),'completed',[[V.imKashf,1,35000]],2000,IC.nile],
 [6,D.ahmed,S.den,cairo(1),'open',[[V.kashf,1,30000]],null,null],
];
const roundShare=(amount,bps)=>(BigInt(amount)*BigInt(bps)+5000n)/10000n;
const visits=[],lines=[];
visitSpec.forEach(([p,doctor,specialty,day,status,items,bps,insurer],i)=>{
 const total=items.reduce((sum,[,qty,unit])=>sum+qty*unit,0);
 const patientShare=bps===null?total:Number(roundShare(total,bps));
 const needsDeposit=items.some(([service])=>services.find(s=>s.id===service)?.requires_deposit);
 visits.push({id:VI[i],patient_id:P[p],doctor_id:doctor,specialty_id:specialty,visit_date:day,location:'clinic',status,client_type_code:patients[p].client_type_code,co_pay_bps:bps??10000,
  total_minor:total,co_pay_minor:patientShare,covered_minor:total-patientShare,confirmed:!(needsDeposit&&i===1),deposit_required_minor:needsDeposit?20000:0,deposit_minimum_snapshot:needsDeposit?20000:0,
  offer_id:null,insurer_id:insurer,union_id:null,diagnosis:status==='completed'?'التهاب لثة بسيط (مثال)':'',instructions:status==='completed'?'مضمضة مرتين يوميًا لمدة أسبوع.':'',version:1,deposit_exemption_reason:null,created_at:at(day,'09:00')});
 items.forEach(([service,qty,unit],n)=>lines.push({id:id(800+i*10+n),visit_id:VI[i],service_id:service,doctor_id:doctor,quantity:qty,unit_price_minor:unit,list_version_id:versions[0].id,discount_minor:0,
  line_total_minor:qty*unit,patient_share_minor:bps===null?qty*unit:Number(roundShare(qty*unit,bps)),covered_share_minor:bps===null?0:qty*unit-Number(roundShare(qty*unit,bps)),is_gift:false,bundle_group_id:null,is_bundle:false,sequence:n+1,deposit_minimum_snapshot:0,manual_price:Boolean(services.find(s=>s.id===service)?.open_price)}));
});
const pay=(n,visit,amount,day,kind='payment',method='cash',by=users.reception.id,extra={})=>({id:id(900+n),visit_id:VI[visit],patient_id:visits[visit].patient_id,amount_minor:amount,method,kind,receipt_number:`R-2026-${String(1200+n)}`,paid_at:at(day,'11:15'),recorded_by:by,reverses_payment_id:null,
 patient_total_snapshot:visits[visit].co_pay_minor,paid_total_snapshot:amount,remaining_snapshot:visits[visit].co_pay_minor-amount,...extra});
const payments=[pay(1,0,20000,today),pay(2,4,90000,cairo(-12)),pay(3,5,150000,cairo(-7),'payment','card'),pay(4,6,7000,cairo(-20)),pay(5,3,25000,today)];
const allocations=[
 {payment_id:id(901),visit_line_id:id(800),amount_minor:20000},{payment_id:id(902),visit_line_id:id(840),amount_minor:30000},{payment_id:id(902),visit_line_id:id(841),amount_minor:60000},
 {payment_id:id(903),visit_line_id:id(850),amount_minor:150000},{payment_id:id(904),visit_line_id:id(860),amount_minor:7000},{payment_id:id(905),visit_line_id:id(830),amount_minor:25000}];

const appointments=[
 {id:id(1001),visit_id:VI[0],patient_id:P[0],doctor_id:D.ahmed,appointment_date:today,appointment_time:'10:00:00',status:'arrived'},
 {id:id(1002),visit_id:VI[1],patient_id:P[1],doctor_id:D.ahmed,appointment_date:today,appointment_time:'11:30:00',status:'pending'},
 {id:id(1003),visit_id:VI[2],patient_id:P[2],doctor_id:D.heba,appointment_date:today,appointment_time:'12:00:00',status:'confirmed'},
 {id:id(1004),visit_id:VI[3],patient_id:P[3],doctor_id:D.reem,appointment_date:today,appointment_time:'13:15:00',status:'confirmed'},
 {id:id(1005),visit_id:VI[7],patient_id:P[6],doctor_id:D.ahmed,appointment_date:cairo(1),appointment_time:'10:30:00',status:'confirmed'},
];
const followUps=[
 {id:id(1101),patient_id:P[4],doctor_id:D.ahmed,source_visit_id:VI[4],billing_visit_id:null,due_date:today,due_time:'14:00:00',purpose:'متابعة الحشو',status:'scheduled',planned_billing_mode:'continuation',fee_minor:null,billing_mode:null,admitted_at:null},
 {id:id(1102),patient_id:P[5],doctor_id:D.salma,source_visit_id:VI[5],billing_visit_id:null,due_date:cairo(-2),due_time:null,purpose:'متابعة البوتوكس',status:'scheduled',planned_billing_mode:'fee',fee_minor:20000,billing_mode:null,admitted_at:null},
 {id:id(1103),patient_id:P[2],doctor_id:D.heba,source_visit_id:VI[6],billing_visit_id:null,due_date:cairo(5),due_time:'12:00:00',purpose:'نتيجة التحاليل',status:'scheduled',planned_billing_mode:'continuation',fee_minor:null,billing_mode:null,admitted_at:null},
 {id:id(1104),patient_id:P[0],doctor_id:D.ahmed,source_visit_id:VI[0],billing_visit_id:null,due_date:cairo(14),due_time:'10:00:00',purpose:'تنظيف جير ثاني',status:'scheduled',planned_billing_mode:'continuation',fee_minor:null,billing_mode:null,admitted_at:null},
];
const insuranceCompanies=[
 {id:IC.nile,name:'شركة النيل للتأمين (مثال)',co_pay_bps:2000,contact:'0220000000',notes:'',active:true,payer_kind:'insurer',union_id:null},
 {id:IC.delta,name:'الدلتا للرعاية (مثال)',co_pay_bps:1000,contact:'',notes:'',active:true,payer_kind:'insurer',union_id:null},
 {id:IC.unionPayer,name:'نقابة المهندسين (مثال)',co_pay_bps:0,contact:'',notes:'',active:true,payer_kind:'union',union_id:unionId},
];
const unions=[{id:unionId,name:'نقابة المهندسين (مثال)',contact:'0230000000',notes:'',active:true}];
const invoices=[{id:id(1201),visit_id:VI[6],insurer_id:IC.nile,billed_minor:28000,invoice_date:cairo(-20),voided_at:null}];
const settlements=[{id:id(1211),insurer_id:IC.nile,amount_minor:20000,reference:'TRF-5521 (مثال)',received_at:at(cairo(-5)),reverses_settlement_id:null}];
const settlementAllocations=[{settlement_id:id(1211),invoice_id:id(1201),amount_minor:20000}];
const offers=[
 {id:id(1301),title:'خصم الكشف الأول (مثال)',specialty_id:S.den,code:'WELCOME10',discount_kind:'percent',discount_bps:1000,amount_minor:null,valid_from:cairo(-10),valid_until:cairo(50),usage_limit:null,includes_bundles:false,birthday:false,once_per_patient:true,active:true},
 {id:id(1302),title:'عرض عيد الميلاد (مثال)',specialty_id:S.derm,code:'BDAY-200',discount_kind:'amount',discount_bps:null,amount_minor:20000,valid_from:cairo(-30),valid_until:cairo(60),usage_limit:100,includes_bundles:false,birthday:true,once_per_patient:false,active:true},
];
const templates=[
 ['follow_up','أهلًا {client_name}، نذكّرك بموعد {purpose} يوم {date} في فاميلي كير.'],
 ['birthday','كل سنة وأنت طيب يا {client_name}! هديتك {offer} بالكود {code}.'],
 ['campaign','{client_name}، عرض {offer} بالكود {code} لفترة محدودة.'],
 ['experience_survey','شكرًا لزيارتك يا {client_name}. قيّم تجربتك من هنا: {link}'],
].map(([kind,body])=>({kind,body,active:true}));
const outbox=[
 {id:id(1401),patient_id:P[4],kind:'follow_up',status:'simulated',created_at:at(cairo(-1),'09:00'),campaign_id:null},
 {id:id(1402),patient_id:P[1],kind:'follow_up',status:'skipped',created_at:at(cairo(-1),'09:00'),campaign_id:null},
 {id:id(1403),patient_id:P[0],kind:'campaign',status:'simulated',created_at:at(cairo(-3),'12:00'),campaign_id:id(1501)},
];
const campaigns=[{id:id(1501),offer_id:id(1301),specialty_id:S.den,client_type_code:null,last_visit_from:null,last_visit_until:null,status:'simulated',created_at:at(cairo(-3),'12:00')}];
const expenses=[
 {id:id(1601),amount_minor:45000,spent_on:cairo(-1),category:'maintenance',description:'تصليح كرسي الأسنان (مثال)',recipient:'ورشة الصيانة (مثال)',method:'cash',created_by:users.reception.id,voided_at:null,void_reason:null},
 {id:id(1602),amount_minor:12000,spent_on:cairo(-2),category:'supplies',description:'أدوات تعقيم (مثال)',recipient:'',method:'cash',created_by:users.reception.id,voided_at:null,void_reason:null},
 {id:id(1603),amount_minor:8000,spent_on:cairo(-3),category:'other',description:'مشروبات للعملاء (مثال)',recipient:'',method:'cash',created_by:users.owner.id,voided_at:null,void_reason:null},
];
const rentContracts=[{id:id(1701),doctor_id:D.karim,amount_minor:300000,period:'monthly',starts_on:cairo(-75),ends_on:null,room:'غرفة 2 (مثال)',active:true}];
const rentDues=[0,1,2].map(n=>({id:id(1711+n),contract_id:id(1701),doctor_id:D.karim,period_start:cairo(-75+n*30),period_end:cairo(-46+n*30),amount_minor:300000}));
const rentPayments=[{id:id(1721),contract_id:id(1701),doctor_id:D.karim,amount_minor:450000,receipt_number:'RENT-0012',paid_at:at(cairo(-10)),reverses_payment_id:null,recorded_by:users.owner.id}];
const rentAllocations=[{payment_id:id(1721),due_id:id(1711),amount_minor:300000},{payment_id:id(1721),due_id:id(1712),amount_minor:150000}];
const feedback=[
 {id:id(1801),visit_id:VI[4],rating:5,comment:'خدمة ممتازة وتنظيم حلو (مثال)',submitted_at:at(cairo(-10)),demo_batch_id:null},
 {id:id(1802),visit_id:VI[5],rating:4,comment:'الانتظار كان أطول شوية (مثال)',submitted_at:at(cairo(-6)),demo_batch_id:null},
];
const audit=[
 {id:id(1901),actor_id:users.reception.id,action:'manual_price',entity:'visit_lines',entity_id:id(830),occurred_at:at(today,'13:20'),financial_values:{unit_price_minor:25000,service_id:V.physSession}},
 {id:id(1902),actor_id:users.owner.id,action:'doctor_terms_saved',entity:'doctors',entity_id:D.ahmed,occurred_at:at(cairo(-4),'18:00'),financial_values:{share_bps:3000}},
];

export const tables={
 patients,patient_specialty_codes:codes,specialties,doctors,client_types:clientTypes,services:serviceRows,bundle_components:[],price_lists:lists,price_list_versions:versions,service_prices:servicePrices,
 clinic_settings:[{id:id(1),clinic_name:'فاميلي كير',reminder_lead_days:1,birthday_time:'10:00:00',default_deposit_minor:20000}],
 follow_ups:followUps,appointments,expenses,visits,visit_lines:lines,payments,payment_allocations:allocations,insurance_companies:insuranceCompanies,unions,offers,offer_redemptions:[],
 message_templates:templates,campaigns,campaign_recipients:[],message_outbox:outbox,message_attempts:outbox.map((row,n)=>({id:id(1451+n),outbox_id:row.id,provider:'mock',status:row.status,attempted_at:row.created_at})),consent_events:[],
 profiles:Object.values(users).map(user=>{const copy={...user};delete copy.email;return copy;}),insurance_invoices:invoices,insurance_settlements:settlements,settlement_allocations:settlementAllocations,rent_contracts:rentContracts,rent_dues:rentDues,rent_payments:rentPayments,
 rent_allocations:rentAllocations,doctor_service_terms:[{doctor_id:D.ahmed,service_id:V.hashw,share_bps:3500}],doctor_share_revisions:[],audit_log:audit,demo_batches:[],experience_feedback:feedback,patient_specialties:[],
};

export const reportSummary={patient_cash_minor:292000,insurance_cash_minor:20000,rent_cash_minor:450000,doctor_share_minor:96500,expenses_minor:65000,net_minor:600500};
export function statement(doctor){
 if(doctor===D.karim)return {entries:[],rent:rentDues.map((due,n)=>({...due,paid_minor:n===0?300000:n===1?150000:0})),collected_minor:0,completed_minor:0,doctor_share_minor:0};
 const entries=lines.filter(line=>line.doctor_id===doctor&&visits.find(v=>v.id===line.visit_id)?.status==='completed').map(line=>{const v=visits.find(x=>x.id===line.visit_id);const bps=terms.find(t=>t.doctor_id===doctor).default_share_bps;
  return {visit_id:v.id,visit_date:v.visit_date,completed_at:at(v.visit_date,'16:00'),received_at:at(v.visit_date,'16:00'),patient_id:v.patient_id,service_id:line.service_id,service:services.find(s=>s.id===line.service_id).name,service_total_minor:line.line_total_minor,doctor_share_bps:bps,doctor_share_minor:Number(roundShare(line.line_total_minor,bps)),share_adjustment_minor:0};});
 const share=entries.reduce((sum,row)=>sum+row.doctor_share_minor,0);
 return {entries,rent:[],collected_minor:entries.reduce((s,r)=>s+r.service_total_minor,0),completed_minor:entries.reduce((s,r)=>s+r.service_total_minor,0),doctor_share_minor:share};
}
export const ids={S,D,V,P,VI,IC};
