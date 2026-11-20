import {label} from './api';

/** InstaPay and mobile wallet exist on the server only after 20261119100400 (owner decision 19/11/2026); until then it
 * accepts cash, card and transfer. New forms stop offering transfer once the new methods exist. */
let extended=false;
export const setExtendedPaymentMethods=(available:boolean)=>{extended=available;};
export const paymentMethods=()=>extended?['cash','instapay','card','wallet']:['cash','card','transfer'];
export const paymentMethodOptions=()=>paymentMethods().map(value=>({value,label:label(value)}));
