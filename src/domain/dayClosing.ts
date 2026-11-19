/** Reception day closing rules (owner decision 19/11/2026). The database computes the saved figures
 * (private.day_summary); these helpers apply the same rules to the rows shown on the closing screen. */
export type DaySection='percentage'|'renting';

/** «يومية المستأجرين» is renting doctors; every other doctor (specialty and percentage) is «يومية النسبة». */
export function daySection(category:unknown):DaySection{return category==='renting'?'renting':'percentage';}

/** Display order of the revenue tiles, as on the paper sheet. Transfer appears only for older entries. */
export const methodOrder=['instapay','card','wallet','cash','transfer'] as const;

/** What a receipt moved that day: the applied amount plus any excess, negative for a refund. */
export function signedReceived(payment:Record<string,unknown>):bigint{
 const received=BigInt(String(payment.amount_minor??0))+BigInt(String(payment.excess_minor??0));
 return payment.kind==='refund'?-received:received;
}

/** Cash in the drawer: left from the previous closing + cash revenue − cash expenses. */
export function drawer(carriedIn:bigint,cashIn:bigint,cashExpenses:bigint):bigint{return carriedIn+cashIn-cashExpenses;}

/** The owner can receive from zero up to the cash in the drawer (nothing when the drawer is short). */
export function handoverAllowed(drawerAmount:bigint,handed:bigint):boolean{return handed>=0n&&handed<=(drawerAmount>0n?drawerAmount:0n);}

/** What is carried to the next day («متبقي من حساب امس») after handing an amount to the owner. */
export function carriedOut(drawerAmount:bigint,handed:bigint):bigint{return drawerAmount-handed;}
