function checkAuth(){try{const u=sess.get('user'),t=sess.get('token');if(!u||!t){location.href='/pages/login.html';return null}return JSON.parse(u)}catch(e){sess.clear();location.href='/pages/login.html';return null}}
function logout(){sess.clear();location.href='/pages/login.html'}
const currentUser=checkAuth();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0'),dk=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
if(currentUser){
  document.getElementById('meAv').src = avUrl(currentUser.username || '?');
  document.getElementById('userNameDisplay').textContent=currentUser.username||'User';
  const h=new Date().getHours();document.getElementById('tod').textContent=h<12?'Morning':h<17?'Afternoon':'Evening';
  let tasks=[],view=new Date();view.setDate(1);
  const M=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const od=t=>t.status!=='Completed'&&new Date(t.dueDate)<new Date();
  function mini(){
    document.getElementById('mLabel').textContent=`${M[view.getMonth()]} ${view.getFullYear()}`;
    const by={};tasks.forEach(t=>{(by[dk(new Date(t.dueDate))]??=[]).push(t)});
    const s=new Date(view);s.setDate(1-view.getDay());const g=document.getElementById('mini');g.innerHTML='';
    for(let i=0;i<42;i++){const d=new Date(s);d.setDate(s.getDate()+i);const l=by[dk(d)]||[];const c=document.createElement('div');
      c.className=(d.getMonth()!==view.getMonth()?'o ':'')+(dk(d)===dk(new Date())?'t':'');
      c.innerHTML=`<span>${d.getDate()}</span><div class="dots">${l.slice(0,3).map(t=>`<i class="${t.status==='Completed'?'done':od(t)?'od':t.priority}"></i>`).join('')}</div>`;
      c.onclick=()=>location.href='/pages/calendar.html';g.appendChild(c)}
  }
  document.getElementById('mp').onclick=()=>{view.setMonth(view.getMonth()-1);mini()};
  document.getElementById('mn').onclick=()=>{view.setMonth(view.getMonth()+1);mini()};
  (async()=>{try{
    const r=await fetch('/api/tasks?mine=1',{headers:{Authorization:'Bearer '+sess.get('token')}});
    if(r.status===401)return logout();if(!r.ok)throw 0;tasks=await r.json();
    const mine=tasks.filter(t=>t.assignedTo&&t.assignedTo._id===currentUser._id);
    const set=(id,v)=>document.getElementById(id).textContent=v;
    set('statTotal',mine.length);set('statProgress',mine.filter(t=>t.status==='In Progress').length);
    set('statDone',mine.filter(t=>t.status==='Completed').length);set('statOverdue',mine.filter(od).length);
    const up=tasks.filter(t=>t.status!=='Completed').sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,4);
    document.getElementById('upcoming').innerHTML=up.length?up.map(t=>`<div class="up ${esc(t.priority)}"><div class="bar"></div><div><b>${esc(t.title)}</b><small>${esc(t.groupId?.name)}</small></div><div class="rt"><span class="tag ${esc(t.priority)}">${esc(t.priority)}</span><br>${new Date(t.dueDate).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>`).join(''):'No upcoming tasks.';
    mini();
  }catch(e){document.getElementById('upcoming').textContent='Could not load tasks.';mini()}})();
}
