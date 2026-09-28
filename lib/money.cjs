'use strict';
// Exact decimal multiplication and half-away-from-zero rounding at the row level.
// Number inputs are interpreted using their stored decimal representation, not a binary product.
function parts(n){
 if(!Number.isFinite(n))throw Error('INVALID_MONEY');
 const [mantissa,exponent='0']=String(n).toLowerCase().split('e');
 const fraction=(mantissa.split('.')[1]||'').length;
 return [BigInt(mantissa.replace('.','')),fraction-Number(exponent)];
}
function multiplyFactorsMinor(values){
 if(values.some(v=>v===null))return null;
 let n=1n,scale=-2;for(const v of values){const [vn,vs]=parts(v);n*=vn;scale+=vs;}
 if(scale<=0)n*=10n**BigInt(-scale);
 else {const sign=n<0n?-1n:1n;n*=sign;const d=10n**BigInt(scale);n=sign*((n+d/2n)/d);}
 const result=Number(n);if(!Number.isSafeInteger(result))throw Error('MONEY_RANGE_EXCEEDED');return result;
}
function multiplyMinor(a,b=1){return multiplyFactorsMinor([a,b]);}
module.exports={multiplyMinor,multiplyFactorsMinor};
