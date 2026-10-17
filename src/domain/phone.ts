/** Canonicalize Egyptian mobiles without changing invalid numbers into valid ones. */
export function normalizeEgyptianPhone(value: unknown): string {
 const raw=String(value??'').trim()
  .replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[\s()\-\u200e\u200f\u061c]/g,'');
 if(/^01[0125][0-9]{8}$/.test(raw))return '+2'+raw;
 if(/^1[0125][0-9]{8}$/.test(raw))return '+20'+raw;
 if(/^201[0125][0-9]{8}$/.test(raw))return '+'+raw;
 if(/^00201[0125][0-9]{8}$/.test(raw))return '+'+raw.slice(2);
 return raw;
}
