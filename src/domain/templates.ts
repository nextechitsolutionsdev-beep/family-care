/** Message template variables and where the server replaces them (private.queue_message, create_experience_survey). */
export const templateVariables:{key:string;meaning:string;kinds:string[];example:string}[]=[
 {key:'client_name',meaning:'اسم العميل',kinds:['birthday','campaign','follow_up','experience_survey'],example:'أحمد محمد'},
 {key:'offer',meaning:'اسم العرض',kinds:['birthday','campaign'],example:'خصم تنظيف الأسنان'},
 {key:'code',meaning:'كود العرض',kinds:['birthday','campaign'],example:'SMILE20'},
 {key:'purpose',meaning:'غرض المتابعة',kinds:['follow_up'],example:'متابعة تركيب'},
 {key:'date',meaning:'تاريخ المتابعة',kinds:['follow_up'],example:'25/11/2026'},
 {key:'link',meaning:'رابط تقييم الزيارة',kinds:['experience_survey'],example:'https://…'},
];

/** Variables written in a template that are not allowed for its kind (a typo would reach the patient as raw braces). */
export function unknownVariables(body:string,allowed:string[]):string[]{
 return [...new Set([...body.matchAll(/\{([^{}]*)\}/g)].map(match=>match[1]).filter(key=>!allowed.includes(key)))];
}
