(()=>{'use strict';
const $=s=>document.querySelector(s),form=$('#trackingForm'),result=$('#trackingResult'),steps=$('#trackingSteps');
const stages=['PLACED','ACCEPTED','PREPARING','OUT_FOR_DELIVERY','DELIVERED'];
const labels=['Order placed','Accepted','Preparing','Out for delivery','Delivered'];
const params=new URLSearchParams(location.search);let saved={};try{saved=JSON.parse(localStorage.getItem('sff_last_tracking')||'{}')}catch(_){}
$('#trackOrderId').value=params.get('order')||saved.orderId||'';
$('#trackToken').value=params.get('key')||saved.trackingToken||'';
async function check(){const orderId=$('#trackOrderId').value.trim(),trackingToken=$('#trackToken').value.trim();
 result.textContent='Checking order status…';steps.replaceChildren();
 try{const response=await fetch(window.SFF_CONFIG.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'trackDeliveryOrder',orderId,trackingToken})});
 const data=await response.json();if(!data.ok)throw Error(data.error||'Unable to track order');
 result.textContent='Order '+data.orderId+' · '+data.status.replaceAll('_',' ')+' · Payment: '+data.paymentStatus+' · ₹'+data.total;
 const current=stages.indexOf(data.status);for(let i=0;i<stages.length;i++){const el=document.createElement('div');el.className='tracking-step'+(i<=current?' completed':'');el.textContent=(i<=current?'✓ ':'○ ')+labels[i];steps.append(el)}
 if(data.status==='REJECTED'){steps.replaceChildren();result.textContent='Order '+data.orderId+' was rejected.'}
 }catch(e){result.textContent=e.message}}
 form.addEventListener('submit',e=>{e.preventDefault();check()});if($('#trackOrderId').value&&$('#trackToken').value)check();
 let poll=null;document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('#trackOrderId').value&&$('#trackToken').value)check()});
 poll=setInterval(()=>{if(!document.hidden&&$('#trackOrderId').value&&$('#trackToken').value)check()},30000);
})();