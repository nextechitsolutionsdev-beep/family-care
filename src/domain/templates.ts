/** Message template variables and where the server replaces them (private.queue_message, private.queue_reminder,
 * create_experience_survey). Must match the per-kind list in private.command('template_save'). */
export const templateVariables:{key:string;meaning:string;kinds:string[];example:string}[]=[
 {key:'client_name',meaning:'اسم العميل',kinds:['birthday','campaign','follow_up','appointment','experience_survey'],example:'أحمد محمد'},
 {key:'offer',meaning:'اسم العرض',kinds:['birthday','campaign'],example:'خصم تنظيف الأسنان'},
 {key:'code',meaning:'كود العرض',kinds:['birthday','campaign'],example:'SMILE20'},
 {key:'clinic',meaning:'اسم العيادة',kinds:['follow_up','appointment'],example:'فاميلي كير'},
 {key:'day',meaning:'يوم الميعاد',kinds:['follow_up','appointment'],example:'الأربعاء'},
 {key:'date',meaning:'تاريخ الميعاد',kinds:['follow_up','appointment'],example:'25/11/2026'},
 {key:'time',meaning:'ساعة الميعاد (بتختفي لو مش متحددة)',kinds:['follow_up','appointment'],example:'الساعة 5:30 م'},
 {key:'doctor',meaning:'اسم الدكتور',kinds:['follow_up','appointment'],example:'د. منى'},
 {key:'specialty',meaning:'التخصص',kinds:['follow_up','appointment'],example:'أسنان'},
 {key:'purpose',meaning:'غرض المتابعة',kinds:['follow_up'],example:'متابعة تركيب'},
 {key:'balance',meaning:'سطر المتبقي على العميل (بيختفي لو مفيش)',kinds:['follow_up','appointment'],example:'\n💰 المتبقي عليك: 250 جنيه'},
 {key:'link',meaning:'رابط تقييم الزيارة',kinds:['experience_survey'],example:'https://…'},
];

/** Variables written in a template that are not allowed for its kind (a typo would reach the patient as raw braces). */
export function unknownVariables(body:string,allowed:string[]):string[]{
 return [...new Set([...body.matchAll(/\{([^{}]*)\}/g)].map(match=>match[1]).filter(key=>!allowed.includes(key)))];
}
