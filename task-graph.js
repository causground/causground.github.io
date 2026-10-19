/* One source-backed graph for every goal of a task. */
(function(root){
  'use strict';
  const base=typeof module!=='undefined'?require('./backward-core.js'):root.CausGroundBackward;
  const {canonical,goals,esc,state,stateWidth,displayVerb}=base;
  const P='#7960ce',LINE='#c7bdd4',MUTED='#84788f';
  function connector(x1,y1,x2,y2){
    if(Math.abs(x2-x1)<1)return `M${x1} ${y1}V${y2}`;
    const mid=(y1+y2)/2,sx=Math.sign(x2-x1),sy=Math.sign(y2-y1),r=Math.min(14,Math.abs(y2-y1)/4,Math.abs(x2-x1)/4);
    return `M${x1} ${y1}V${mid-sy*r}Q${x1} ${mid} ${x1+sx*r} ${mid}H${x2-sx*r}Q${x2} ${mid} ${x2} ${mid+sy*r}V${y2}`;
  }
  function goalLabel(g){
    const p=g.predicate;
    if(p.attribute==='cycle_complete')return 'Toasting cycle complete';
    if(p.attribute==='stir_contact_motion_complete')return 'Stir contact complete';
    if(p.attribute==='washed_locations')return 'All sink locations washed';
    if(p.node==='sink'&&p.attribute==='is_on')return 'Water running';
    return g.label.charAt(0).toUpperCase()+g.label.slice(1);
  }
  function build(task){
    const targets=goals(task),byId=new Map(task.actions.map(a=>[a.id,a]));
    const deps=task.raw.producer_backed_dependencies;
    const visited=new Set(),visiting=new Set(),ordered=[];
    function visit(id){
      if(visited.has(id))return;
      if(visiting.has(id))throw Error('Cyclic state dependency');
      if(!byId.has(id))throw Error('Missing goal producer');
      visiting.add(id);deps.filter(e=>e.consumer_id===id).forEach(e=>visit(e.producer_id));
      visiting.delete(id);visited.add(id);ordered.push(id);
    }
    targets.forEach(g=>visit(g.producer));
    const nodes=[],links=[],byNode=new Map(),effectStates=new Map();
    const addNode=n=>{if(!byNode.has(n.id)){nodes.push(n);byNode.set(n.id,n);}return byNode.get(n.id);};
    const addLink=(from,to,kind)=>{const id=from+'→'+to;if(!links.some(l=>l.id===id))links.push({id,from,to,kind});return id;};
    function effect(producer,predicate){
      const key=producer+'|'+canonical(predicate);
      if(!effectStates.has(key)){
        const n=addNode({id:'state-'+effectStates.size,kind:'state',predicate,producer,width:stateWidth(predicate),height:118,goalIds:[]});
        effectStates.set(key,n);addLink('action-'+producer,n.id,'effect');
      }
      return effectStates.get(key);
    }
    ordered.forEach(id=>addNode({id:'action-'+id,action:id,kind:'action',record:byId.get(id),width:224,height:76,goalIds:[]}));
    for(const id of ordered){
      const action=byNode.get('action-'+id),incoming=deps.filter(e=>e.consumer_id===id&&visited.has(e.producer_id));
      action.requirements=[];
      for(const e of incoming){const n=effect(e.producer_id,e.predicate);if(!action.requirements.includes(n.id))action.requirements.push(n.id);addLink(n.id,action.id,'requires');}
      if(!incoming.length){
        const c=action.record.conditions.find(c=>c.predicate.attribute==='gripper_empty')||action.record.conditions[0];
        if(c){const n=addNode({id:'scene-'+canonical(c.predicate),kind:'state',predicate:c.predicate,producer:null,width:stateWidth(c.predicate),height:118,goalIds:[]});action.requirements.push(n.id);addLink(n.id,action.id,'requires');}
      }
      action.otherConditions=Math.max(0,action.record.conditions.length-action.requirements.length);
    }
    const graphGoals=targets.map((g,i)=>{
      const n=effect(g.producer,g.predicate);n.goalIds.push(g.id);
      return {...g,number:i+1,label:goalLabel(g),node:n.id};
    });
    const inLinks=id=>links.filter(l=>l.to===id),outLinks=id=>links.filter(l=>l.from===id);
    const ranked=new Set(),ranking=new Set();
    function rank(n){
      if(ranked.has(n.id))return n.rank;if(ranking.has(n.id))throw Error('Cyclic merged graph');
      ranking.add(n.id);n.rank=Math.max(-1,...inLinks(n.id).map(l=>rank(byNode.get(l.from))))+1;
      ranking.delete(n.id);ranked.add(n.id);return n.rank;
    }
    nodes.forEach(rank);
    const downstream=new Map();
    function goalSet(id){
      if(downstream.has(id))return downstream.get(id);
      const result=new Set(byNode.get(id).goalIds);outLinks(id).forEach(l=>goalSet(l.to).forEach(g=>result.add(g)));downstream.set(id,result);return result;
    }
    const ranks=[...new Set(nodes.map(n=>n.rank))].sort((a,b)=>a-b);
    const rows=ranks.map(r=>nodes.filter(n=>n.rank===r));
    const width=Math.max(780,400*Math.max(graphGoals.length,...rows.map(row=>row.length))-20);
    // Keep each continuing causal chain in one lane. An intermediate goal
    // labels its existing state instead of pulling the chain sideways.
    const terminalGoals=graphGoals.filter(g=>!outLinks(g.node).length);
    const goalX=new Map(terminalGoals.map((g,i)=>[g.id,190+i*400+(width-(terminalGoals.length*400-20))/2]));
    let y=28;
    for(const row of rows){
      row.forEach(n=>{const xs=[...goalSet(n.id)].filter(id=>goalX.has(id)).map(id=>goalX.get(id));n.x=xs.reduce((a,b)=>a+b,0)/xs.length;n.y=y;});
      row.sort((a,b)=>a.x-b.x||nodes.indexOf(a)-nodes.indexOf(b));
      row.forEach((n,i)=>{n.x=Math.max(n.x,n.width/2+24,i?row[i-1].x+(row[i-1].width+n.width)/2+60:0);});
      for(let i=row.length-1;i>=0;i--){const n=row[i];n.x=Math.min(n.x,width-n.width/2-24,i<row.length-1?row[i+1].x-(row[i+1].width+n.width)/2-60:width);}
      y+=Math.max(...row.map(n=>n.height))+(row.some(n=>outLinks(n.id).length>1)?64:40);
    }
    const height=y;
    links.forEach(l=>{
      const a=byNode.get(l.from),b=byNode.get(l.to);
      const y1=a.kind==='state'&&a.predicate.type==='edge'?a.y+66:a.y+a.height;
      const y2=b.kind==='state'&&b.predicate.type==='edge'?b.y+22:b.y-6;
      l.forward=connector(a.x,y1,b.x,y2);
      l.back=connector(b.x,y2,a.x,y1);
    });
    const steps=[{kind:'overview',label:`${graphGoals.length} goals. One task.`}],retrieved=new Set();
    function retrieve(stateNode,goalId){
      if(!stateNode.producer)return;
      const action=byNode.get('action-'+stateNode.producer),effectLink=links.find(l=>l.from===action.id&&l.to===stateNode.id);
      if(retrieved.has(action.id)){steps.push({kind:'reuse',node:action.id,action:action.action,goalId,link:effectLink.id,label:`Reuse the retrieved ${displayVerb(action.record.verb)} interaction.`});return;}
      retrieved.add(action.id);steps.push({kind:'action',node:action.id,action:action.action,goalId,link:effectLink.id,label:`Match the effect → ${displayVerb(action.record.verb)}.`});
      for(const id of action.requirements){
        const n=byNode.get(id),link=links.find(l=>l.from===id&&l.to===action.id);
        steps.push({kind:'condition',node:id,action:action.action,goalId,link:link.id,label:n.producer?'Trace the required state.':'Check the remaining scene conditions.'});
        retrieve(n,goalId);
      }
    }
    for(const g of graphGoals){
      steps.push({kind:'goal',node:g.node,goalId:g.id,label:`Goal ${String(g.number).padStart(2,'0')} · ${g.label}`});
      retrieve(byNode.get(g.node),g.id);
      steps.push({kind:'branch-complete',node:g.node,goalId:g.id,label:`Knowledge for goal ${String(g.number).padStart(2,'0')} retrieved.`});
    }
    steps.push({kind:'complete',label:'Knowledge for all task goals retrieved.'});
    return {task,goals:graphGoals,nodes,links,steps,width,height};
  }
  function svg(model,index,options={}){
    const {nodes,links,steps,width,height,goals}=model,stage=steps[index],past=steps.slice(0,index+1),done=stage.kind==='complete';
    const activeNodes=new Set(past.map(s=>s.node)),activeLinks=new Set(past.map(s=>s.link));
    const paper=options.paper||'assets/real-world.png';
    const markers=[['cg-joint-arrow',LINE],['cg-joint-arrow-active','#af9bd1']].map(([id,color])=>`<marker id="${id}" markerUnits="userSpaceOnUse" viewBox="0 0 10 10" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto"><path d="M1.5 1.5 8.5 5 1.5 8.5Z" fill="${color}"/></marker>`).join('');
    let out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-label="CausGround: joint backward retrieval for ${goals.length} task goals" style="font-family:Segoe UI,Arial,sans-serif"><rect width="100%" height="100%" fill="#fcfbfa"/><defs>${markers}</defs>`;
    for(const l of links){
      const reached=done||activeLinks.has(l.id);
      out+=`<path d="${l.forward}" fill="none" stroke="${reached?'#af9bd1':LINE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${reached?'cg-joint-arrow-active':'cg-joint-arrow'})"/>`;
    }
    for(const l of links){
      const reached=done||activeLinks.has(l.id);
      if(reached)out+=`<path class="${l.id===stage.link?'retrieval-current':''}" d="${l.back}" pathLength="1" fill="none" stroke="${l.id===stage.link?P:'#af9bd1'}" stroke-width="${l.id===stage.link?2.6:1.8}" stroke-linecap="round"/>`;
      if(options.motion&&l.id===stage.link)out+=`<circle class="retrieval-pulse" r="3.5" fill="${P}"><animateMotion path="${l.back}" dur="1.05s" fill="freeze"/></circle>`;
    }
    for(const n of nodes){
      const active=done||activeNodes.has(n.id);
      if(n.kind==='state'){
        if(n.goalIds.length){
          const current=n.goalIds.includes(stage.goalId),label=n.goalIds.map(id=>'Goal '+String(goals.find(g=>g.id===id).number).padStart(2,'0')).join(' / ');
          out+=`<text x="${n.x+n.width/2-8}" y="${n.y-13}" text-anchor="end" font-size="16" fill="${current?P:'#9a87b4'}" font-weight="600">${label}</text>`;
        }else if(!n.producer)out+=`<text x="${n.x}" y="${n.y-12}" text-anchor="middle" font-size="16" fill="${MUTED}">Scene condition</text>`;
        out+=state(n.predicate,n.x,n.y,active,n.id,paper);
      }else{
        const args=n.record.call.match(/\((.*)\)/)?.[1].split(',').filter(x=>!['IN','ON','NEAR'].includes(x)).map(s=>s.replaceAll('_',' ')).join(', ')||'';
        out+=`<g class="cg-action" data-action="${esc(n.action)}" role="button" tabindex="0" aria-label="Inspect ${esc(n.record.call)}"><rect x="${n.x-112}" y="${n.y}" width="224" height="76" rx="17" fill="${active?P:'#f1edf7'}" stroke="${active?P:'#ddd5e8'}" stroke-width="1.5"/><text x="${n.x}" y="${n.y+32}" text-anchor="middle" fill="${active?'#fff':'#8a8096'}" font-size="27" font-weight="600">${esc(displayVerb(n.record.verb))}</text><text x="${n.x}" y="${n.y+58}" text-anchor="middle" fill="${active?'#f5efff':'#8a8096'}" font-size="18">${esc(args.length>25?args.slice(0,24)+'…':args)}</text></g>`;
      }
    }
    return out+'</svg>';
  }
  const api={build,svg,goalLabel};if(typeof module!=='undefined')module.exports=api;else root.CausGroundTaskGraph=api;
})(typeof window==='undefined'?globalThis:window);
