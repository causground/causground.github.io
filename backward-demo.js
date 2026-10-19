(() => {
  'use strict';
  const base=window.CausGroundBackward,core=window.CausGroundTaskGraph,tasks=window.CAUSGROUND_TASKS,$=s=>document.querySelector(s),esc=base.esc;
  let task,model,step=0,timer=null,playing=false,seen=false,zoom=1,expanded=false,selected;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const featured=base.examples.map(e=>e.id);
  $('#cg-examples').innerHTML=base.examples.map(({id,label})=>`<button type="button" data-task="${id}" aria-pressed="false">${esc(label)}</button>`).join('');
  function stop(){clearTimeout(timer);timer=null;playing=false;$('#cg-stage-wrap').classList.add('cg-paused');$('#cg-play').textContent=step>=model.steps.length-1?'Replay retrieval':'Play retrieval';$('#cg-play').setAttribute('aria-label',step>=model.steps.length-1?'Replay backward retrieval':'Play backward retrieval');}
  function play(){
    if(step>=model.steps.length-1){step=0;render();}
    playing=true;$('#cg-stage-wrap').classList.remove('cg-paused');$('#cg-play').textContent='Pause retrieval';$('#cg-play').setAttribute('aria-label','Pause backward retrieval');
    clearTimeout(timer);
    timer=setTimeout(()=>{if(!playing)return;step++;render();if(step>=model.steps.length-1)stop();else play();},reduced.matches?1700:1350);
  }
  function chooseTask(id){
    if(model)stop();task=tasks.find(t=>t.id===id);
    $('#cg-task-prompt').textContent=task.description;
    document.querySelectorAll('[data-task]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.task===id)));
    model=core.build(task);step=0;zoom=1;
    $('#cg-scrub').max=model.steps.length-1;
    $('#cg-details').open=false;
    selected=model.goals[0].producer;
    render();if(seen&&!reduced.matches&&model.nodes.length)play();
  }
  function inspect(id,open=false){
    const a=task.actions.find(a=>a.id===id);if(!a)return;selected=id;
    $('#cg-detail-label').textContent=`${a.call} · Conditions & effects`;
    $('#cg-conditions').innerHTML=a.conditions.map(c=>`<li title="${esc(c.bases.join(' · '))}">${esc(c.label)}</li>`).join('');
    $('#cg-effects').innerHTML=a.effects.map(e=>`<li title="${esc(e.basis)}">${esc(e.label)}</li>`).join('');
    $('#cg-record').textContent=JSON.stringify({action:a.call,conditions:a.conditions,effects:a.effects,evidence:a.evidence},null,2);
    if(open)$('#cg-details').open=true;
  }
  function sizeGraph(){
    $('#cg-art').style.width=model.width+'px';$('#cg-art').style.height=model.height+'px';
    $('#cg-art').style.transform=`scale(${zoom})`;
    $('#cg-sizer').style.width=model.width*zoom+'px';$('#cg-sizer').style.height=model.height*zoom+'px';
    $('#cg-zoom-out').disabled=zoom<=.9;$('#cg-zoom-in').disabled=zoom>=1.4;
  }
  function render(){
    $('#cg-art').innerHTML=core.svg(model,step,{motion:!reduced.matches});
    sizeGraph();
    const stage=model.steps[step];
    $('#cg-stage').textContent=stage.label;
    $('#cg-step-count').textContent=`${String(step+1).padStart(2,'0')} / ${String(model.steps.length).padStart(2,'0')}`;
    $('#cg-scrub').value=step;$('#cg-scrub').setAttribute('aria-valuetext',stage.label);
    $('#cg-prev').disabled=step===0;$('#cg-next').disabled=step>=model.steps.length-1;
    $('#cg-play').disabled=model.nodes.length===0;$('#cg-details').hidden=model.nodes.length===0;
    const past=model.steps.slice(0,step+1),encountered=new Set(past.filter(s=>s.kind==='action').map(s=>s.action));
    const completed=new Set(past.filter(s=>s.kind==='branch-complete').map(s=>s.goalId));
    $('#cg-goals').innerHTML=model.goals.map(g=>`<div class="cg-goal-card ${completed.has(g.id)?'retrieved':''} ${stage.goalId===g.id?'current':''}" role="listitem" ${stage.goalId===g.id?'aria-current="step"':''}><span class="cg-goal-number">${String(g.number).padStart(2,'0')}</span><span>${esc(g.label)}</span></div>`).join('');
    const currentGoal=stage.goalId??model.goals[0].id;
    const retrievalOrder=[...new Set(model.steps.filter(s=>s.goalId===currentGoal&&['action','reuse'].includes(s.kind)).map(s=>s.action))].map(id=>task.actions.find(a=>a.id===id));
    $('#cg-path').innerHTML=retrievalOrder.map((a,i)=>`${i?'<span aria-hidden="true">→</span>':''}<button type="button" data-action="${esc(a.id)}" class="${encountered.has(a.id)?'retrieved':''}" aria-label="Inspect ${esc(a.call)}">${esc(base.displayVerb(a.verb))}</button>`).join('');
    if(stage.action)inspect(stage.action);else if(selected)inspect(selected);
    // Keep the active retrieval region readable on narrow screens without scaling text away.
    const node=model.nodes.find(n=>n.id===stage.node);
    const viewport=$('#cg-viewport');
    if(node){const left=node.x*zoom-viewport.clientWidth/2,top=(node.y+node.height/2)*zoom-viewport.clientHeight/2;viewport.scrollTo({left:Math.max(0,left),top:Math.max(0,top),behavior:reduced.matches?'instant':'smooth'});}
    else viewport.scrollTo({left:0,top:0,behavior:'instant'});
  }
  function go(value){stop();step=Math.max(0,Math.min(model.steps.length-1,value));render();stop();}
  $('#cg-play').addEventListener('click',()=>playing?stop():play());
  $('#cg-prev').addEventListener('click',()=>go(step-1));$('#cg-next').addEventListener('click',()=>go(step+1));
  $('#cg-scrub').addEventListener('input',e=>go(Number(e.target.value)));
  $('#cg-reset').addEventListener('click',()=>{go(0);play();});
  $('#cg-stage-wrap').addEventListener('click',e=>{
    const t=e.target.closest('[data-task]');if(t)chooseTask(t.dataset.task);
    const a=e.target.closest('[data-action]');if(a){stop();inspect(a.dataset.action,true);}
  });
  $('#cg-art').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const a=e.target.closest('[data-action]');if(a){e.preventDefault();stop();inspect(a.dataset.action,true);}}});
  $('#cg-zoom-out').addEventListener('click',()=>{zoom=Math.max(.9,Math.round((zoom-.1)*10)/10);sizeGraph();});
  $('#cg-zoom-in').addEventListener('click',()=>{zoom=Math.min(1.4,Math.round((zoom+.1)*10)/10);sizeGraph();});
  function toggleExpanded(){
    const stage=$('#cg-stage-wrap'),dialog=$('#cg-dialog');expanded=!expanded;
    if(expanded){dialog.append(stage);dialog.showModal();document.body.classList.add('graph-expanded');}
    else{dialog.close();$('#cg-home').append(stage);document.body.classList.remove('graph-expanded');$('#cg-expand').focus();}
    $('#cg-expand').textContent=expanded?'Close ×':'Expand ↗';
  }
  $('#cg-expand').addEventListener('click',toggleExpanded);
  $('#cg-dialog').addEventListener('cancel',e=>{e.preventDefault();toggleExpanded();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
  chooseTask(featured[0]);
  const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting&&!seen){seen=true;if(!reduced.matches)play();}else if(!e.isIntersecting&&seen&&!expanded)stop();}},{threshold:.12});
  observer.observe($('#causal-knowledge'));
})();
