import type {Row} from './api';

export function specialtyCodes(codes:Row[]):Map<string,string[]> {
 const index=new Map<string,string[]>();
 for(const row of codes){const id=String(row.patient_id??'');const list=index.get(id)??[];list.push(String(row.code??''));index.set(id,list);}
 return index;
}
export function patientSearchIndex(patients:Row[],codes:Row[]):Map<string,string> {
 const byPatient=specialtyCodes(codes);
 return new Map(patients.map(row=>[row.id,`${String(row.name??'')} ${String(row.phone_e164??'')} ${(byPatient.get(row.id)??[]).join(' ')}`.toLowerCase()]));
}
