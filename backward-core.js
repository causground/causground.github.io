/* Source-backed effect → producer → prerequisite traversal and SVG presentation. */
(function(root){
  'use strict';
  const P='#7960ce', INK='#192735', MUTED='#73717c', LINE='#ded7e8';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const words=s=>String(s??'').replaceAll('_',' ');
  function canonical(p){
    if(p.type==='edge')return JSON.stringify(['edge',p.source,p.relation,p.target,p.present!==false]);
    return JSON.stringify(['attribute',p.node,p.attribute,p.value]);
  }
  function effectPredicate(e){
    if(e.operation==='add_edge'||e.operation==='delete_edge')return {type:'edge',...e.edge,present:e.operation==='add_edge'};
    if(e.operation==='set_attribute'||e.operation==='update_attribute')return {type:'node_attribute',node:e.node,attribute:e.attribute,value:e.after};
    return null;
  }
  function roundedPath(points){
    let d=`M${points[0].join(' ')}`;
    for(let i=1;i<points.length-1;i++){
      const [x,y]=points[i],prev=points[i-1],next=points[i+1],before=Math.hypot(prev[0]-x,prev[1]-y),after=Math.hypot(next[0]-x,next[1]-y),r=Math.min(14,before/2,after/2);
      const a=[x+(prev[0]-x)*r/before,y+(prev[1]-y)*r/before],b=[x+(next[0]-x)*r/after,y+(next[1]-y)*r/after];
      d+=`L${a.join(' ')}Q${x} ${y} ${b.join(' ')}`;
    }
    return d+`L${points.at(-1).join(' ')}`;
  }
  function goals(task){
    return task.raw.final_goal_states.map((g,i)=>({id:i,predicate:g.predicate,label:task.goals[i],producer:[...task.actions].reverse().find(a=>a.effects.some(e=>{const p=effectPredicate(e.raw);return p&&canonical(p)===canonical(g.predicate);} ))?.id}));
  }
  const examples=[{id:'GetToastedBread',label:'Toast bread'},{id:'StirVegetables',label:'Stir vegetables'},{id:'RinseSinkBasin',label:'Rinse sink'},{id:'ArrangeBreadBasket',label:'Bread basket'}];
  function preferredGoal(task){
    const distinctive=new Set(['PRESS','WAIT','ROTATE','TILT','SCRUB','STIR','CLOSE']);
    return goals(task).map(g=>{const verb=task.actions.find(a=>a.id===g.producer)?.verb;return {...g,priority:distinctive.has(verb)?2:g.predicate.type==='edge'?1:0,depth:g.producer?build(task,g.id).columns.length:0};}).sort((a,b)=>b.priority-a.priority||b.depth-a.depth||a.id-b.id)[0];
  }
  function build(task,goalId){
    const goal=goals(task).find(g=>g.id===goalId)||goals(task)[0];
    if(!goal?.producer)return {task,goal,columns:[],links:[],steps:[{kind:'unmatched',label:'No matching producer in this record.'}],width:1100,height:560};
    const byId=new Map(task.actions.map(a=>[a.id,a])),edges=task.raw.producer_backed_dependencies;
    const visited=new Set(),visiting=new Set(),ordered=[];
    function visit(id){
      if(visited.has(id))return;
      if(visiting.has(id))throw Error('Cyclic state dependency');
      if(!byId.has(id))throw Error('Missing producer');
      visiting.add(id);edges.filter(e=>e.consumer_id===id).forEach(e=>visit(e.producer_id));
      visiting.delete(id);visited.add(id);ordered.push(id);
    }
    visit(goal.producer);
    const used=edges.filter(e=>visited.has(e.producer_id)&&visited.has(e.consumer_id));
    const columns=ordered.map((id,index)=>{
      const action=byId.get(id),incoming=used.filter(e=>e.consumer_id===id),outgoing=used.filter(e=>e.producer_id===id);
      const conditions=incoming.length?incoming.map(e=>({predicate:e.predicate,label:e.produced_state,producer:e.producer_id})):[];
      if(!conditions.length){const c=action.conditions.find(c=>c.predicate.attribute==='gripper_empty')||action.conditions[0];if(c)conditions.push({predicate:c.predicate,label:c.label,producer:null});}
      const effects=[];
      for(const p of [...outgoing.map(e=>e.predicate),...(id===goal.producer?[goal.predicate]:[])])if(!effects.some(e=>canonical(e)===canonical(p)))effects.push(p);
      return {id,index,action,conditions,effects,x:190+index*400};
    });
    const maxConditions=Math.max(1,...columns.map(c=>c.conditions.length));
    const actionY=246+(maxConditions-1)*160,effectY=actionY+176;
    const maxEffects=Math.max(1,...columns.map(c=>c.effects.length));
    const height=effectY+maxEffects*150+42,width=Math.max(780,columns.length*400-20);
    const offset=(width-(columns.length*400-20))/2;
    columns.forEach(c=>c.x+=offset);
    const links=[];
    columns.forEach(c=>{
      c.conditions.forEach((condition,i)=>{
        const y=50+i*160+118;
        const detour=i<c.conditions.length-1;
        const side=c.x-Math.max(...c.conditions.map(s=>stateWidth(s.predicate)))/2-18;
        const forward=detour?`M${c.x} ${y}V${y+12}H${side}V${actionY-22}H${c.x}V${actionY-8}`:`M${c.x} ${y}V${actionY-8}`;
        const back=detour?`M${c.x} ${actionY-8}V${actionY-22}H${side}V${y+12}H${c.x}V${y}`:`M${c.x} ${actionY-8}V${y}`;
        links.push({id:`require-${c.id}-${i}`,kind:'requires',from:c.id,to:c.id,forward,back});
      });
      c.effects.forEach((p,i)=>{
        const y=effectY+i*150;
        links.push({id:`effect-${c.id}-${i}`,kind:'effect',from:c.id,to:c.id,forward:`M${c.x} ${actionY+76}V${y-8}`,back:`M${c.x} ${y-8}V${actionY+76}`});
      });
    });
    used.forEach((e,i)=>{
      const a=columns.find(c=>c.id===e.producer_id),b=columns.find(c=>c.id===e.consumer_id);
      const ai=a.effects.findIndex(p=>canonical(p)===canonical(e.predicate)),bi=b.conditions.findIndex(c=>canonical(c.predicate)===canonical(e.predicate));
      if(ai<0||bi<0)throw Error('Missing state endpoint');
      const x1=a.x+stateWidth(a.effects[ai])/2,y1=effectY+ai*150+59,x2=b.x-stateWidth(b.conditions[bi].predicate)/2,y2=50+bi*160+59;
      const lane=(x1+x2)/2;
      const points=[[x1,y1],[a.x+182,y1],[a.x+182,height-22],[b.x-190,height-22],[b.x-190,y2],[x2-6,y2]];
      const forward=b.index-a.index>1?roundedPath(points):`M${x1} ${y1}C${lane} ${y1} ${lane} ${y2} ${x2-6} ${y2}`;
      const back=b.index-a.index>1?roundedPath([...points].reverse()):`M${x2-6} ${y2}C${lane} ${y2} ${lane} ${y1} ${x1} ${y1}`;
      links.push({id:`dependency-${i}`,kind:'dependency',from:a.id,to:b.id,predicate:e.predicate,conditionIndex:bi,effectIndex:ai,forward,back});
    });
    const steps=[{kind:'goal',action:goal.producer,label:'Start from the goal state.'}],seen=new Set();
    function retrieve(id,effectIndex=0){
      if(seen.has(id))return;seen.add(id);
      const c=columns.find(c=>c.id===id);
      steps.push({kind:'action',action:id,link:`effect-${id}-${effectIndex}`,label:`Match the effect → ${displayVerb(c.action.verb)}.`});
      c.conditions.forEach((condition,i)=>{
        steps.push({kind:'condition',action:id,conditionIndex:i,link:`require-${id}-${i}`,label:condition.producer?'Trace the required state.':'Check the remaining scene conditions.'});
        if(condition.producer){
          const l=links.find(l=>l.kind==='dependency'&&l.from===condition.producer&&l.to===id&&l.conditionIndex===i);
          steps.push({kind:'bridge',action:condition.producer,effectIndex:l.effectIndex,link:l.id,label:`Find the interaction that produces it.`});
          retrieve(condition.producer,l.effectIndex);
        }
      });
    }
    const rootColumn=columns.find(c=>c.id===goal.producer);
    retrieve(goal.producer,rootColumn.effects.findIndex(p=>canonical(p)===canonical(goal.predicate)));
    steps.push({kind:'complete',label:'Task-relevant knowledge retrieved.'});
    return {task,goal,columns,links,steps,width,height,actionY,effectY};
  }
  function stateWidth(p){return p.type==='edge'?326:224;}
  function displayVerb(v){return v.charAt(0)+v.slice(1).toLowerCase();}
  function objectName(s){return s==='agent'?'Robot':words(s).replace(/\b\w/g,c=>c.toUpperCase());}
  function attribute(p){
    const names={gripper_empty:'hand',is_open:'open',is_on:'power',is_full:'full',cycle_complete:'cycle',stir_contact_motion_complete:'stir contact',scrub_coverage_complete:'coverage',washed_locations:'washed locations',contents_transferred:'transfer'};
    let value=p.value;if(p.attribute==='gripper_empty')value=value?'empty':'occupied';
    if(p.attribute==='is_on'){value=value?'on':'off';if(p.node==='sink')return `water: ${value}`;}
    if(['cycle_complete','stir_contact_motion_complete','scrub_coverage_complete','contents_transferred'].includes(p.attribute))value=value?'complete':'incomplete';
    return `${names[p.attribute]||words(p.attribute)}: ${value}`;
  }
  function art(name,x,y,size=46,paper='assets/real-world.png'){
    // Same clipped source artwork used by the approved opening animation.
    const crops={agent:[985,284,116,114],bread:[105,710,143,90],plate:[573,714,145,88],microwave:[1599,289,122,100]};
    if(crops[name]){const [cx,cy,w,h]=crops[name],scale=size/Math.max(w,h),sw=w*scale,sh=h*scale;return `<svg x="${x+(size-sw)/2}" y="${y+(size-sh)/2}" width="${sw}" height="${sh}" viewBox="${cx} ${cy} ${w} ${h}" overflow="hidden" style="mix-blend-mode:multiply"><image href="${esc(paper)}" width="4382" height="1816"/></svg>`;}
    const shapes={
      cabinet:'<rect x="8" y="4" width="48" height="56" rx="4" fill="#bda07b"/><path d="M32 5v54" stroke="#80694f"/><rect x="13" y="10" width="14" height="43" rx="2" fill="#d9c7ab"/><rect x="37" y="10" width="14" height="43" rx="2" fill="#d9c7ab"/><path d="M25 28v8m14-8v8" stroke="#80694f" stroke-width="2"/>',
      basket:'<path d="m6 25 7 31h38l7-31Z" fill="#d5ba8a" stroke="#b2905e" stroke-width="2"/><path d="M17 26V16C17 3 47 3 47 16v10" fill="none" stroke="#bb9a67" stroke-width="5"/><path d="M10 35h44m-42 9h40m-37 8h34M21 27l3 29m8-29v29m11-29-3 29" stroke="#a9895d" stroke-width="1.5"/>',
      fridge:'<rect x="15" y="2" width="35" height="59" rx="5" fill="#41454e"/><path d="M16 24h33" stroke="#c7c9d0"/><path d="M21 10v8m0 15v16" stroke="#e2e4e9" stroke-width="3" stroke-linecap="round"/>',
      strawberry:'<path d="M12 23C7 8 57 8 52 23S38 58 32 58 17 39 12 23" fill="#e86f6b"/><path d="m32 5-7 9-10-5 4 12 13-5 13 5 4-12-10 5Z" fill="#80a77b"/><g stroke="#ffe4bb" stroke-width="2.5"><path d="m20 27 2 3m11-7 1 3m11 1-1 3m-17 8 1 3m11-4-1 3m-6 7 1 3"/></g>',
      pancake:'<ellipse cx="32" cy="43" rx="29" ry="14" fill="#e5e9ed"/><rect x="7" y="30" width="50" height="13" rx="9" fill="#cf975b"/><ellipse cx="32" cy="30" rx="25" ry="11" fill="#e8bd79"/><ellipse cx="32" cy="26" rx="23" ry="10" fill="#edc989"/><path d="m27 18 13 2-3 9-13-2Z" fill="#fff0ad"/>',
      drawer:'<path d="M5 15h54v39H5Z" fill="#c7ad8e"/><path d="m9 21 10-13h35l5 13Z" fill="#e2d4bd"/><rect x="5" y="24" width="54" height="30" rx="3" fill="#d4bc9d"/><path d="M25 34h14" stroke="#967c60" stroke-width="4" stroke-linecap="round"/>',
      toaster:'<rect x="5" y="16" width="50" height="38" rx="10" fill="#b8bbc4"/><ellipse cx="30" cy="17" rx="20" ry="6" fill="#747986"/><rect x="16" y="8" width="28" height="14" rx="7" fill="#dfb47f" stroke="#ba8e5b" stroke-width="2"/><path d="M56 25v19" stroke="#747986" stroke-width="3"/><rect x="51" y="30" width="11" height="5" rx="2" fill="#7960ce"/><path d="M13 54v5m35-5v5" stroke="#747986" stroke-width="3"/>',
      spatula:'<path d="m32 31 10 28" stroke="#bb9974" stroke-width="8" stroke-linecap="round"/><path d="m15 5 25-3 6 24-20 12Z" fill="#9ca6ac"/><path d="m22 9 5 17m3-18 5 16m2-17 5 15" stroke="#eef1f2" stroke-width="2"/>',
      pot:'<path d="M11 22h42v24c0 13-42 13-42 0Z" fill="#aebbc4"/><ellipse cx="32" cy="22" rx="21" ry="7" fill="#6e8792"/><ellipse cx="32" cy="24" rx="16" ry="4" fill="#b2ba81"/><path d="M11 28H4v13h7m42-13h7v13h-7" fill="none" stroke="#7f939e" stroke-width="4"/><path d="M20 37v9" stroke="#dbe5e8" stroke-width="3"/>',
      sink:'<path d="M4 30h56v25H4Z" fill="#c1ced3"/><path d="M10 35h44v12c0 9-44 9-44 0Z" fill="#8ca6b0"/><path d="M39 31V13c0-13-19-13-19 0v9" stroke="#a1aeb7" stroke-width="7" fill="none"/><path d="M20 24v14" stroke="#8abecf" stroke-width="3" stroke-dasharray="3 3"/>',
      sink_spout:'<path d="M46 58V18c0-22-31-22-31 0v9" stroke="#a1aeb7" stroke-width="10" fill="none"/><path d="M15 31v23" stroke="#8abecf" stroke-width="3" stroke-dasharray="4 4"/><rect x="35" y="54" width="22" height="7" rx="3" fill="#7f939e"/>',
      sponge:'<rect x="6" y="18" width="52" height="34" rx="8" fill="#e4c675"/><path d="M6 29V20q0-5 8-5h36q8 0 8 5v9Z" fill="#7eaa9b"/><g fill="#c9ab61"><circle cx="18" cy="38" r="2"/><circle cx="30" cy="43" r="2"/><circle cx="45" cy="36" r="2"/></g>',
      cutting_board:'<rect x="8" y="9" width="48" height="50" rx="9" fill="#d1b18b"/><path d="M16 27h32m-32 7h32m-32 7h32m-32 7h32" stroke="#be9c72"/><rect x="23" y="15" width="18" height="5" rx="2" fill="#fcfbfa"/>',
      eggplant:'<path d="M40 11C60 22 46 58 17 57 4 57 7 42 21 31 29 25 29 16 40 11" fill="#8e77ab"/><path d="m40 10 3-8 5 1-3 9 9 2-12 8-8-8Z" fill="#86a47c"/><path d="M19 44q8-4 13-12" fill="none" stroke="#bda3d0" stroke-width="4" stroke-linecap="round"/>',
      avocado:'<path d="M32 3C18 3 8 32 8 43c0 25 48 25 48 0C56 32 46 3 32 3" fill="#849c63"/><path d="M32 8C21 8 13 33 13 43c0 19 38 19 38 0C51 33 43 8 32 8" fill="#d4df99"/><ellipse cx="32" cy="41" rx="12" ry="13" fill="#ba8d64"/><ellipse cx="29" cy="37" rx="4" ry="5" fill="#d5ac7a"/>',
      dining_counter:'<path d="M4 18h56v10H4Z" fill="#a49a90"/><path d="M9 28h46v31H9Z" fill="#d4c4af"/><path d="M32 29v29" stroke="#b29c80"/><path d="M27 36v8m10-8v8" stroke="#9c856d" stroke-width="2"/>',
      straw:'<path d="m23 58 3-42 20-9" stroke="#c96c83" stroke-width="8" fill="none"/><path d="m23 58 3-42 20-9" stroke="#f1c1cf" stroke-width="3" fill="none"/>',
      glass_cup:'<path d="m15 8 5 50h25l5-50Z" fill="#e7f3f4" stroke="#9dbdc3" stroke-width="2"/><path d="m19 28 3 28h21l3-28Z" fill="#bfdfe5" opacity=".65"/><ellipse cx="32" cy="8" rx="17" ry="5" fill="#f7fbfb" stroke="#9dbdc3" stroke-width="2"/>'
    };
    const shape=shapes[name]||`<rect x="8" y="8" width="48" height="48" rx="15" fill="#ede8f5"/><text x="32" y="41" font-family="Segoe UI,Arial" font-size="26" text-anchor="middle" fill="#8b72b3">${esc(words(name).slice(0,1).toUpperCase())}</text>`;
    return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64">${shape}</svg>`;
  }
  function labelLines(label,max=16){
    const result=[''];for(const word of label.split(' ')){const last=result.length-1;if(result[last]&&result[last].length+word.length+1>max)result.push(word);else result[last]+=(result[last]?' ':'')+word;}return result;
  }
  function entity(name,x,y,w,h,active,attr,paper){
    let lines=labelLines(objectName(name),w<150?12:21);
    const limit=attr?1:2;if(lines.length>limit){lines=lines.slice(0,limit);lines[limit-1]+='…';}
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="17" fill="${active?'#f6f2fc':'#ffffff'}" stroke="${active?P:LINE}" stroke-width="${active?2:1.3}"/>${art(name,x+w/2-24,y+10,48,paper)}<text x="${x+w/2}" y="${y+79}" text-anchor="middle" fill="${INK}" font-size="20" font-weight="600">${lines.map((s,i)=>`<tspan x="${x+w/2}" dy="${i?22:0}">${esc(s)}</tspan>`).join('')}</text>${attr?`<text x="${x+w/2}" y="${y+h-13}" text-anchor="middle" fill="${active?P:MUTED}" font-size="20">${esc(attr)}</text>`:''}`;
  }
  function state(p,cx,y,active,key,paper){
    const w=stateWidth(p);let markup;
    if(p.type==='edge'){
      const relation={HOLDS:'Holding',INSIDE:'Inside',ON:'On',NEAR:'Near'}[p.relation]||words(p.relation);
      markup=entity(p.source,cx-w/2,y,112,118,active,null,paper)+entity(p.target,cx+w/2-112,y,112,118,active,null,paper)+`<path d="M${cx-51} ${y+66}H${cx+45}" fill="none" stroke="${active?P:'#c7bdd4'}" stroke-width="1.8" stroke-linecap="round"/><path d="M${cx+39} ${y+62.5}L${cx+46} ${y+66}L${cx+39} ${y+69.5}Z" fill="${active?P:'#c7bdd4'}"/><text x="${cx}" y="${y+45}" text-anchor="middle" fill="${active?P:MUTED}" font-size="19" font-weight="600">${esc(relation)}</text>`;
    }else markup=entity(p.node,cx-w/2,y,w,118,active,attribute(p),paper);
    return `<g data-state="${esc(key)}">${markup}</g>`;
  }
  function svg(model,index,options={}){
    const {columns,links,steps,width,height,actionY,effectY,goal}=model;
    if(!columns.length)return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><text x="50" y="100">No matching producer in this record.</text></svg>`;
    const stage=steps[Math.min(index,steps.length-1)],past=steps.slice(0,index+1),done=stage.kind==='complete';
    const activeLinks=new Set(past.map(s=>s.link).filter(Boolean));
    const actions=new Set(past.filter(s=>s.kind==='action').map(s=>s.action));
    const paper=options.paper||'assets/real-world.png';
    let out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="CausGround: backward retrieval from ${esc(goal.label)}" style="font-family:Segoe UI,Arial,sans-serif"><rect width="100%" height="100%" fill="#fcfbfa"/><defs><marker id="cg-causal-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 6 3 0 6" fill="none" stroke="#c5b9d6" stroke-width="1.3"/></marker></defs>`;
    for(const l of links){
      out+=`<path d="${l.forward}" fill="none" stroke="${LINE}" stroke-width="2" marker-end="url(#cg-causal-arrow)"/>`;
      if(activeLinks.has(l.id)||done)out+=`<path class="${l.id===stage.link?'retrieval-current':''}" d="${l.back}" pathLength="1" fill="none" stroke="${l.id===stage.link?P:'#af9bd1'}" stroke-width="${l.id===stage.link?3.5:2.5}" stroke-linecap="round"/>`;
      if(options.motion&&l.id===stage.link)out+=`<circle class="retrieval-pulse" r="5" fill="${P}"><animateMotion path="${l.back}" dur="1.05s" fill="freeze"/></circle>`;
    }
    columns.forEach(c=>{
      c.conditions.forEach((condition,i)=>{
        const active=done||past.some(s=>s.action===c.id&&s.kind==='condition'&&s.conditionIndex===i);
        out+=`<text x="${c.x}" y="${27+i*160}" text-anchor="middle" font-size="17" fill="${MUTED}">Requires</text>`;
        out+=state(condition.predicate,c.x,50+i*160,active,`condition-${c.id}-${i}`,paper);
      });
      const active=actions.has(c.id)||done,focused=stage.action===c.id;
      const args=c.action.call.match(/\((.*)\)/)?.[1].split(',').filter(x=>!['IN','ON','NEAR'].includes(x)).map(words).join(', ')||'';
      const other=c.action.conditions.length-c.conditions.length;
      out+=`<g class="cg-action" data-action="${esc(c.id)}" role="button" tabindex="0" aria-label="Inspect ${esc(c.action.call)}"><rect x="${c.x-112}" y="${actionY}" width="224" height="76" rx="17" fill="${active?P:'#f1edf7'}" stroke="${active?P:'#ddd5e8'}" stroke-width="1.5"/><text x="${c.x}" y="${actionY+32}" text-anchor="middle" fill="${active?'#fff':'#8a8096'}" font-size="29" font-weight="600">${esc(displayVerb(c.action.verb))}</text><text x="${c.x}" y="${actionY+58}" text-anchor="middle" fill="${active?'#f5efff':'#8a8096'}" font-size="18">${esc(args.length>24?args.slice(0,23)+'…':args)}</text></g>`;
      if(other>0)out+=`<text class="cg-more" data-action="${esc(c.id)}" x="${c.x+17}" y="${actionY-22}" fill="#91859e" font-size="16">+ ${other} scene condition${other>1?'s':''}</text>`;
      c.effects.forEach((p,i)=>{
        const isGoal=c.id===goal.producer&&canonical(p)===canonical(goal.predicate);
        const active=done||isGoal||past.some(s=>(s.kind==='bridge'&&s.action===c.id&&s.effectIndex===i)||(s.kind==='action'&&s.action===c.id));
        out+=`<text x="${c.x+17}" y="${effectY-30+i*150}" font-size="17" fill="${isGoal?P:MUTED}" font-weight="${isGoal?600:400}">${isGoal?'Goal state':'Effect'}</text>`;
        if(isGoal)out+=`<rect x="${c.x-stateWidth(p)/2-10}" y="${effectY+i*150-9}" width="${stateWidth(p)+20}" height="136" rx="23" fill="none" stroke="#cdbce8" stroke-dasharray="5 5" stroke-width="1.3"/>`;
        out+=state(p,c.x,effectY+i*150,active,`effect-${c.id}-${i}`,paper);
      });
    });
    out+='</svg>';return out;
  }
  const api={canonical,effectPredicate,goals,preferredGoal,examples,build,svg,displayVerb,stateWidth,state,esc};
  if(typeof module!=='undefined')module.exports=api;else root.CausGroundBackward=api;
})(typeof window==='undefined'?globalThis:window);
