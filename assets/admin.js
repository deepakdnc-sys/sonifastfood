(() => {
'use strict';
const $=s=>document.querySelector(s);
let token=sessionStorage.getItem('sff_owner_session')||'';
let busy=false;
const money=n=>'₹'+Number(n||0).toFixed(0);
const setMessage=(s,err=false)=>{ $('#message').textContent=s;$('#message').className=err?'error':'muted'; };
async function api(action,data={}) {
  const url=window.SFF_CONFIG?.API_URL;
  if(!url||url.includes('PASTE_YOUR'))throw Error('Set the Apps Script /exec URL in config.js');
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...data})});
  if(!response.ok)throw Error('HTTP '+response.status);
  const out=await response.json();
  if(!out.ok)throw Error(out.error||'Request failed');
  return out;
}
function loginView(show) {
  $('#login').classList.toggle('hidden',!show);
  $('#dashboard').classList.toggle('hidden',show);
  $('#logout').classList.toggle('hidden',show);
}
function text(parent,tag,value,cls=''){
  const el=document.createElement(tag);el.textContent=String(value);if(cls)el.className=cls;parent.append(el);return el;
}
function button(parent,label,action,orderId,disabled=false){
  const el=document.createElement('button');el.textContent=label;el.disabled=disabled;
  el.addEventListener('click',()=>update(action,orderId));parent.append(el);
}
function renderOrders(orders){
  const host=$('#orders');host.replaceChildren();
  if(!orders.length){text(host,'p','No orders found.','muted');return;}
  for(const o of orders){
    const card=document.createElement('article');card.className='order';
    text(card,'h3',o.orderId);
    text(card,'span',o.orderStatus+' · '+o.paymentStatus,'pill');
    text(card,'p','Date: '+o.createdAt);
    text(card,'p','Customer: '+o.customerName+' · '+o.mobile);
    text(card,'p','Address: '+o.address+(o.landmark?' · '+o.landmark:''));
    text(card,'p','Items: '+o.items.map(i=>i.name+' × '+i.quantity).join(', '));
    text(card,'p','Total: '+money(o.total)+' · '+o.paymentMode);
    const links=document.createElement('div');links.className='row';
    const call=document.createElement('a');call.href='tel:'+o.mobile;call.textContent='📞 Call Customer';links.append(call);
    if(Number.isFinite(o.latitude)&&Number.isFinite(o.longitude)&&o.latitude&&o.longitude){
      const map=document.createElement('a');map.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(o.latitude+','+o.longitude);map.target='_blank';map.rel='noopener noreferrer';map.textContent='📍 Navigate';links.append(map);
    }
    card.append(links);
    const actions=document.createElement('div');actions.className='actions';
    const next={PLACED:['ACCEPT','Accept'],ACCEPTED:['PREPARING','Preparing'],PREPARING:['OUT_FOR_DELIVERY','Out for Delivery'],OUT_FOR_DELIVERY:['DELIVERED','Mark Delivered']};
    if(next[o.orderStatus])button(actions,next[o.orderStatus][1],next[o.orderStatus][0],o.orderId);
    if(['PLACED','ACCEPTED'].includes(o.orderStatus))button(actions,'Reject + Restore Stock','REJECTED',o.orderId);
    if(o.orderStatus!=='REJECTED'){
      button(actions,o.paymentStatus==='PAID'?'Mark Unpaid':'Mark Paid (verified)',o.paymentStatus==='PAID'?'MARK_UNPAID':'MARK_PAID',o.orderId);
    }
    card.append(actions);host.append(card);
  }
}
async function loadOrders(){
  if(busy)return;busy=true;setMessage('Loading orders…');
  try{const out=await api('adminOrders',{token,status:$('#filter').value});renderOrders(out.orders);setMessage(out.orders.length+' orders loaded');}
  catch(err){setMessage(err.message,true);if(/Session expired|Owner login required/.test(err.message))signOut(false);}
  finally{busy=false;}
}
async function update(operation,orderId){
  if(busy)return;
  const label=operation==='REJECTED'?'Reject this order and restore its stock?':operation==='MARK_PAID'?'Confirm payment was actually received and verified?':operation==='DELIVERED'?'Confirm you personally delivered this order (no OTP)?':'Confirm '+operation+' for '+orderId+'?';
  if(!confirm(label))return;
  busy=true;setMessage('Saving…');
  try{await api('adminUpdateOrder',{token,operation,orderId});setMessage('Saved '+orderId);}
  catch(err){setMessage(err.message,true);}
  finally{busy=false;await loadOrders();await loadReport();}
}
async function loadReport(){
  try{
    const out=await api('adminReport',{token,from:$('#from').value,to:$('#to').value});
    const r=out.report;const stats=$('#stats');stats.replaceChildren();
    for(const [label,value] of [['Total Orders',r.orders],['Delivered',r.delivered],['Rejected',r.rejected],['Delivered Value',money(r.deliveredValue)],['Realized Sales',money(r.realizedSales)],['Unpaid Delivered',r.unpaidDelivered]]){
      const div=document.createElement('div');div.className='stat';text(div,'span',label);text(div,'b',value);stats.append(div);
    }
  }catch(err){setMessage('Report: '+err.message,true);}
}
function signOut(callApi=true){const old=token;token='';sessionStorage.removeItem('sff_owner_session');loginView(true);if(callApi&&old)api('adminLogout',{token:old}).catch(()=>{});}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('#loginMsg').textContent='Signing in…';
  const pass=$('#password').value;
  try{const out=await api('adminLogin',{password:pass});token=out.token;sessionStorage.setItem('sff_owner_session',token);$('#password').value='';loginView(false);$('#loginMsg').textContent='';await loadOrders();await loadReport();}
  catch(err){$('#loginMsg').textContent=err.message;}
});
$('#logout').onclick=()=>signOut();
$('#refresh').onclick=loadOrders;
$('#filter').onchange=loadOrders;
$('#reportBtn').onclick=loadReport;
if(token){loginView(false);loadOrders();loadReport();}else loginView(true);
})();