import { clamp, destination, nextRow, rowStop, sampleJourney, stationStop, strideAdvance, walkDuration, type Anchor, type Journey, type Stop } from './route';
import { onThemeChange, resolveTheme } from '../theme';
import { decodeName } from './name-decode';
import { createTrickBag, GESTURES, GLITCH, glitchState } from './gestures';
import type { BenScene } from './scene';
import { beamOutState, spawnState, type HoloState, type SpawnMode } from './timeline';

/** A brisk cartoon walk: 1.3 × the walk clip's own pace. */
const WALK_PACE=1.3;
/** Ben only changes stations once scrolling has paused this long (ms): one calm beam to
 * where the visitor stopped instead of one per section passed on the way. */
const SCROLL_SETTLE=250;
/** Hover events this soon after a scroll come from the page moving under a resting pointer (ms). */
const SCROLL_HOVER_GRACE=300;
/** A technology row counts as hovered once the pointer rests on it this long (ms). */
const ROW_DWELL=180;
/** One hop from row to row: duration (s) and height of the arc (px). */
const HOP_DURATION=.6,HOP_LIFT=26;
/** A gesture requested while Ben is still on his way is dropped after this long (s). */
const GESTURE_PATIENCE=4;
/** Speech bubbles stay this long (s); the click hint follows this much quiet time in the hero. */
const BUBBLE_TIME=3.6,HINT_AFTER=4;
/** In a docked part of the page Ben talks about the topic (project) whose top passes this line. */
const TOPIC_LINE=.55;
/** Canvas around Ben, in body heights: wide enough for the beams, tall enough for a flip. */
const CANVAS_WIDTH=2.3,CANVAS_HEIGHT=1.3,CANVAS_FEET=1.17;
/** Touch phones/tablets use a calmer route; mouse-driven desktop behavior stays the same. */
const MOBILE_QUERY='(max-width: 61.99rem) and (pointer: coarse)';
type Phase='spawn'|'beam-out'|'beam-in';
interface Lines{hint?:string;hintTouch?:string;thanks?:string;tricks?:Record<string,string>}
export function startCompanion(element:HTMLElement):()=>void {
  // Ben's body (canvas, click target, bubble) lives in the page, never over the screen: wherever
  // it sits, the browser scrolls it with the content, so it cannot lag behind on phones.
  const body=element.querySelector<HTMLElement>('[data-ben-body]')!;
  const container=body.querySelector<HTMLElement>('[data-companion-canvas]')!;
  const bounds=body.querySelector<HTMLElement>('[data-ben-bounds]')!;
  const bubble=body.querySelector<HTMLElement>('[data-ben-bubble]');
  const anchorNodes=[...document.querySelectorAll<HTMLElement>('[data-ben-anchor]')];
  const rowNodes=[...document.querySelectorAll<HTMLElement>('[data-ben-row]')];
  const contactForm=document.querySelector<HTMLFormElement>('[data-contact-form]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery=matchMedia(MOBILE_QUERY);
  let mobile=mobileQuery.matches,routeHeight=innerHeight,viewportWidth=innerWidth;
  let docksDirty=true,keyboardOpen=false;
  let lines:Lines={};
  try{lines=JSON.parse(element.dataset.lines??'{}') as Lines;}catch{/* no lines, no bubbles */}
  let disposed=false,loading=false,failed=false,needsMeasure=true;
  let scene:BenScene|undefined,loadAbort:AbortController|undefined,gestures:Promise<void>|undefined;
  let frame=0,previous=0,clock=0,waveStarted=-10000,lastScroll=-Infinity;
  let anchors:Anchor[]=[],stations:HTMLElement[]=[],contactStation=-1,stackStation=-1,pose:Stop|undefined,journey:Journey|undefined;
  /** Per docked station: where Ben stands relative to the dock's left edge, and its topics. */
  let docks=new Map<number,{offset:number;topics:Array<{node:HTMLElement;y:number}>}>();
  let rows:Array<{x:number;y:number;say?:string}>=[],hoveredRow=-1,pendingRow=-1,rowTimer=0;
  let stride=0,walk=0,facing=-.1;
  let introDone=false,dark=resolveTheme()==='dark';
  let pointer={x:-1,y:-1};
  let gesture:{name:string;started:number}|undefined,queuedGesture:{name:string;at:number}|undefined;
  const nextTrick=createTrickBag();
  let bubbleUntil=-1,bubbleWidth=0,bubbleHeight=0,lastSaid:string|undefined,hinted=false,quietSince=0;
  let topic:HTMLElement|undefined;
  /** Where Ben's head sits in his canvas while he stands (the bubble ignores trick poses). */
  let head:{x:number;y:number}|undefined;
  // Ben materialises ('spawn') and changes sections by beaming
  // ('beam-out' here, 'beam-in' there) as a hologram. phaseTime advances at most 0.1 s per
  // frame, so a stall (e.g. compiling the effect's shaders) never skips part of it, while
  // slow devices still play it in real time.
  let phase:Phase|undefined,phaseTime=0,spawnMode:SpawnMode='short',beamTarget:Stop|undefined;
  let stopDecode:(()=>void)|undefined;
  const removers:Array<()=>void>=[];
  function listen(target:EventTarget,name:string,fn:EventListener,options?:AddEventListenerOptions){
    target.addEventListener(name,fn,options);removers.push(()=>target.removeEventListener(name,fn,options));
  }
  function startPhase(next:Phase){phase=next;phaseTime=0;}
  function startSpawn(mode:SpawnMode){
    startPhase('spawn');spawnMode=mode;
    if(mode!=='full')return;
    const heading=document.querySelector<HTMLElement>('[data-name-decode]');
    stopDecode?.();stopDecode=heading?decodeName(heading,1600,300):undefined;
  }
  function onScreen(stop:Stop){
    const viewport=mobile?window.visualViewport:null,top=viewport?.offsetTop??0,height=viewport?.height??innerHeight;
    return stop.y-scrollY-stop.height<top+height+60&&stop.y-scrollY>top-60;
  }
  function updateViewport(){
    // Browser chrome and the keyboard change the visible height, not the reading position.
    // A width change (including rotation) establishes a new routing viewport.
    if(!mobile||innerWidth!==viewportWidth)routeHeight=innerHeight;
    viewportWidth=innerWidth;
    const viewport=window.visualViewport;
    const field=document.activeElement;
    const editing=field instanceof HTMLElement&&field.matches('input,textarea,[contenteditable="true"]');
    // Blur precedes the keyboard's closing animation on some phones; wait for room to return.
    keyboardOpen=mobile&&(editing||keyboardOpen)&&(viewport?.scale??1)===1&&routeHeight-(viewport?.height??innerHeight)>140;
    docksDirty=true;wake();
  }
  function layoutRect(node:Element){
    const r=node.getBoundingClientRect();
    // Reveal effects translate content temporarily without a ResizeObserver notification.
    // Docks must use the final page baseline, not a sampled frame of that animation.
    const reveal=node.closest('[data-reveal]');
    const transform=reveal?getComputedStyle(reveal).transform:'none';
    const offset=transform==='none'?0:new DOMMatrixReadOnly(transform).m42;
    return {left:r.left,right:r.right,top:r.top-offset,width:r.width,height:r.height};
  }
  /** Ben's height in a dock (set in CSS as --ben-size: smaller on phones). */
  const dockSize=(node:HTMLElement)=>parseFloat(getComputedStyle(node).getPropertyValue('--ben-size'))||165;
  function measure(){
    // Hidden stations drop out; station numbers count the visible ones.
    anchors=[];stations=[];docks=new Map();contactStation=-1;stackStation=-1;
    for(const node of anchorNodes){
      const r=layoutRect(node),dock=node.hasAttribute('data-ben-dock');
      if(!r.width||(!r.height&&!dock))continue;
      const index=anchors.length,section=node.closest('section');
      if(node.hasAttribute('data-ben-contact'))contactStation=index;
      if(node.hasAttribute('data-ben-stack'))stackStation=index;
      const zone=section?section.getBoundingClientRect().top+scrollY:undefined;
      if(dock){
        const size=dockSize(node),half=Math.round(size*.42);
        // In the projects Ben walks the gutter between previews and text, else the right edge.
        let offset=r.width-half;
        const meta=section?.querySelector('.work__meta')?.getBoundingClientRect(),text=section?.querySelector('.work__body')?.getBoundingClientRect();
        if(node.hasAttribute('data-ben-gutter')&&meta&&text&&text.left-meta.right>size*.4)offset=(meta.right+text.left)/2-r.left;
        docks.set(index,{offset,topics:[...(section?.querySelectorAll<HTMLElement>('[data-ben-topic]')??[])].map(node=>({node,y:layoutRect(node).top+scrollY}))});
        anchors.push({x:r.left,y:r.top+scrollY,width:r.width,height:size,say:node.dataset.benSay,zone,dock:true,standX:r.left+offset});
      }else anchors.push({x:r.left,y:r.top+scrollY,width:r.width,height:r.height,say:node.dataset.benSay,zone});
      stations.push(node);
    }
    // Technology rows: Ben stands on the rule under a row, level with its text, as far right as
    // on the station above.
    const half=(anchors[stackStation]?.width??140)/2;
    rows=rowNodes.map(node=>{const r=layoutRect(node);return {x:r.right-half,y:r.top+r.height+scrollY,say:node.dataset.benSay};});
    needsMeasure=false;docksDirty=true;
  }
  /** Docks are sticky: their place follows the scroll position, so it is read every frame. */
  function followDocks(){
    if(mobile&&!docksDirty)return;
    for(const [index,dock] of docks){
      const r=stations[index]!.getBoundingClientRect(),a=anchors[index]!;
      a.x=r.left;a.y=r.top+scrollY;a.standX=r.left+dock.offset;
    }
    docksDirty=false;
  }
  function loadGestures(){
    if(!scene||gestures)return;
    const url=element.dataset.gestureModel;if(!url)return;
    const signal=loadAbort?.signal??new AbortController().signal;
    gestures=scene.addGestures(url,signal).then(()=>{element.dataset.gestures='ready';},error=>{
      if(!signal.aborted)console.info('[companion] Gestures unavailable.',error);
    });
  }
  /** The visitor is writing a message: focus is somewhere in the contact form. */
  const writing=()=>!!contactForm?.contains(document.activeElement);
  /** While the visitor writes, Ben watches the field instead of the resting mouse (viewport px). */
  function lookPoint(){
    const field=document.activeElement;
    if(writing()&&field instanceof HTMLElement&&field.matches('input,textarea')){
      const r=field.getBoundingClientRect();
      return {x:r.left+r.width*.5,y:r.top+Math.min(r.height*.5,32)};
    }
    return pointer.x<0?null:pointer;
  }
  /** A short line in a speech bubble beside Ben's head. */
  function say(text:string|undefined,seconds=BUBBLE_TIME){
    if(!bubble||!text)return;
    bubble.textContent=text;bubbleWidth=bubble.offsetWidth;bubbleHeight=bubble.offsetHeight;
    bubbleUntil=clock+seconds;lastSaid=text;
  }
  /** Ben has reached the stop the visitor is at: he comments on it (once per arrival). */
  function arrive(stop:Stop){
    if(stop.say&&stop.say!==lastSaid)say(stop.say);
    if(!stop.say)lastSaid=undefined;
  }
  /** In a docked part of the page: the topic (project) being read right now. */
  function currentTopic(station:number){
    let current:HTMLElement|undefined;
    for(const {node,y} of docks.get(station)?.topics??[])if((mobile?y-scrollY:node.getBoundingClientRect().top)<(mobile?routeHeight:innerHeight)*TOPIC_LINE)current=node;
    return current;
  }
  /** Puts Ben's body where he stands: in a dock, or in page coordinates. Returns canvas metrics. */
  function place(stop:Stop){
    const h=stop.height,width=Math.ceil(h*CANVAS_WIDTH),height=Math.ceil(h*CANVAS_HEIGHT),feet=Math.ceil(h*CANVAS_FEET);
    const host=stop.dock?stations[stop.station]!:element;
    if(body.parentElement!==host)host.append(body);
    // In a dock the body is placed against the dock's top edge, which is where his feet are.
    const left=stop.dock?stop.x-anchors[stop.station]!.x-width/2:stop.x-width/2;
    const top=stop.dock?-feet:stop.y-feet;
    const size=`${width}px`,tall=`${height}px`,move=`translate3d(${left}px,${top}px,0)`;
    if(body.style.width!==size)body.style.width=size;
    if(body.style.height!==tall)body.style.height=tall;
    if(body.style.transform!==move)body.style.transform=move;
    scene?.resize(width,height);
    // Viewport position of the canvas: converts the pointer and keeps the bubble on screen.
    return {width,height,feet,screenLeft:stop.x-width/2,screenTop:stop.y-scrollY-feet};
  }
  function placeBubble(showing:boolean,canvas:{width:number;feet:number;screenLeft:number}){
    if(!bubble||!pose)return;
    if(showing){
      // Left of his head, with its tail pointing at him; always inside the viewport.
      const at=head??{x:canvas.width/2,y:canvas.feet-pose.height*.8};
      const left=clamp(at.x-24-bubbleWidth,8-canvas.screenLeft,Math.max(8,innerWidth-bubbleWidth-8)-canvas.screenLeft);
      const move=`translate3d(${left}px,${at.y-bubbleHeight*.75}px,0)`;
      if(bubble.style.transform!==move)bubble.style.transform=move;
    }
    if(String(showing)!==bubble.dataset.show)bubble.dataset.show=String(showing);
  }
  const scrolledRecently=()=>performance.now()-lastScroll<SCROLL_HOVER_GRACE;
  // Technology rows: after a short rest of the pointer Ben hops over to the row. Rows that merely
  // scroll under a resting pointer are ignored, so scrolling never chains hops.
  rowNodes.forEach((node,index)=>{
    const consider=((event:PointerEvent)=>{
      if(event.pointerType==='touch'||reduced.matches||scrolledRecently())return;
      // A row that has not faded in yet is invisible: nothing to hop to.
      if(node.dataset.reveal!==undefined&&node.dataset.reveal!=='shown')return;
      // Chrome sends a synthetic move after scrolling; only a real move counts.
      if(event.type==='pointermove'&&!event.movementX&&!event.movementY)return;
      if(hoveredRow===index||pendingRow===index)return;
      clearTimeout(rowTimer);pendingRow=index;
      rowTimer=window.setTimeout(()=>{rowTimer=0;pendingRow=-1;hoveredRow=index;wake();},ROW_DWELL);
    }) as EventListener;
    listen(node,'pointerenter',consider);
    listen(node,'pointermove',consider);
    listen(node,'pointerleave',()=>{if(pendingRow===index){clearTimeout(rowTimer);rowTimer=0;pendingRow=-1;}});
  });
  function cancel(){cancelAnimationFrame(frame);frame=0;previous=0;}
  function wake(){
    if(disposed||reduced.matches||document.hidden||!scene)return;
    if(!frame)frame=requestAnimationFrame(draw);
  }
  function draw(now:number){
    frame=0;if(!scene||disposed||reduced.matches||document.hidden)return;
    if(keyboardOpen){body.style.visibility='hidden';if(bubble)bubble.dataset.show='false';previous=0;return;}
    // Keep gestures responsive, but do not skin/render a quiet touch companion at 60/120 Hz.
    // The clock still uses elapsed seconds, so throttling never slows an animation down.
    const busy=!!(phase||journey||gesture||queuedGesture)||(clock-waveStarted>=0&&clock-waveStarted<2.8);
    const interval=mobile?1000/(busy?60:30):0;
    if(previous&&!needsMeasure&&now-previous<interval-.75){frame=requestAnimationFrame(draw);return;}
    const elapsed=previous?(now-previous)/1000:0;
    const dt=Math.min(elapsed,.15);previous=now;clock+=elapsed;
    if(needsMeasure)measure();if(!anchors.length)return;
    followDocks();
    const spec=gesture?GESTURES[gesture.name]:undefined;
    const tail=spec?.snapOut?GLITCH:0;
    if(gesture&&clock-gesture.started>=scene.gestureDuration(gesture.name)+tail)gesture=undefined;
    const atContact=contactStation>0;
    // Writing a message (or Ben thanking for one) keeps him beside the form.
    const viewportHeight=mobile?routeHeight:innerHeight;
    let target=atContact&&(writing()||gesture?.name==='bow'||queuedGesture?.name==='bow')?stationStop(anchors,contactStation):destination(scrollY,viewportHeight,anchors);
    if(target.station===stackStation&&rows.length)target=rowStop(target,rows,scrollY,viewportHeight,hoveredRow);
    if(atContact&&target.station===contactStation)loadGestures();
    if(!pose){
      pose={...target};
      startSpawn(!introDone&&target.station===0&&scrollY<100?'full':'short');
    }
    // A docked Ben rides along with his dock.
    if(pose.dock&&!journey)pose={...pose,...stationStop(anchors,pose.station)};
    if(phase==='beam-out')beamTarget=target;
    const planned=journey?.to??pose;
    const sameDock=!!planned.dock&&!!target.dock&&planned.station===target.station;
    const differs=!sameDock&&(Math.abs(planned.x-target.x)>2||Math.abs(planned.y-target.y)>2||Math.abs(planned.height-target.height)>2
      ||planned.station!==target.station||(planned.row??-1)!==(target.row??-1));
    // Ben stays put while he materialises, beams or plays a gesture; he follows
    // afterwards, once the page has stopped moving. A hop is never interrupted mid-air.
    const settled=performance.now()-lastScroll>=SCROLL_SETTLE;
    const pending=differs&&!phase&&!gesture;
    if(pending&&settled&&journey?.kind!=='jump'){
      const dy=Math.abs(pose.y-target.y),dx=Math.abs(pose.x-target.x);
      // Whatever he said belongs to the old place.
      bubbleUntil=-1;topic=undefined;
      const sameList=pose.station===target.station&&target.station===stackStation&&(pose.row??-1)!==(target.row??-1);
      const adjacent=Math.abs((pose.row??-1)-(target.row??-1))===1;
      if(sameList&&onScreen(pose)&&(!mobile||adjacent)){
        // Desktop visits every row; touch only hops to a neighbouring row. A fast swipe
        // beams straight to its latest destination instead of replaying obsolete stops.
        const step=nextRow(pose.row??-1,target.row??-1),section=stationStop(anchors,stackStation);
        const to=step<0?section:{...section,x:rows[step]!.x,y:rows[step]!.y,row:step,say:rows[step]!.say};
        journey={from:{...pose},to,start:clock,duration:HOP_DURATION,kind:'jump',lift:HOP_LIFT};
      }else if(dy>12||pose.dock!==target.dock){
        // Another section: beam over instead of jumping (and growing mid-air).
        journey=undefined;beamTarget=target;
        if(onScreen(pose))startPhase('beam-out');else{pose={...target};startPhase('beam-in');}
      }else journey={from:{...pose},to:target,start:clock,duration:walkDuration(dx,target.height,scene.walkSpeed*WALK_PACE),kind:'walk'};
    }
    const oldX=pose.x;
    let air=0,moving=false,progress=0,landed=false;
    if(journey){
      const sample=sampleJourney(journey,clock);air=sample.air;progress=sample.progress;pose=sample;moving=!sample.done;
      if(sample.done){journey=undefined;landed=true;}
    }
    let holo:HoloState|undefined;
    if(phase)phaseTime+=mobile?elapsed*(phase==='spawn'?1:1.5):Math.min(elapsed,.1);
    if(phase==='spawn'){
      const state=spawnState(phaseTime,spawnMode);
      if(state.done){phase=undefined;introDone=true;waveStarted=clock;}else holo=state;
    }else if(phase==='beam-out'){
      const state=beamOutState(phaseTime);
      if(state.done){pose={...beamTarget!};startPhase('beam-in');holo=spawnState(0,'short');}else holo=state;
    }else if(phase==='beam-in'){
      const state=spawnState(phaseTime,'short');
      if(state.done){
        phase=undefined;landed=true;
        // At the contact form Ben nods: yes, write me.
        if(pose.station===contactStation&&!queuedGesture)requestGesture('agree');
      }else holo=state;
    }
    // Only the final landing counts, not a row passed on the way.
    if(landed&&!differs)arrive(pose);
    // A requested gesture starts once Ben stands at his place, solid and still.
    if(queuedGesture){
      if(clock-queuedGesture.at>GESTURE_PATIENCE)queuedGesture=undefined;
      else if(!phase&&!moving&&!differs&&scene.gestureDuration(queuedGesture.name)){
        const name=queuedGesture.name;
        // A snapping gesture starts at the peak of its glitch.
        gesture={name,started:clock+(GESTURES[name]?.snapIn?GLITCH:0)};queuedGesture=undefined;waveStarted=-10000;
        say(name==='bow'?lines.thanks:lines.tricks?.[name]);
      }
    }
    if(!holo&&gesture&&GESTURES[gesture.name])holo=glitchState(GESTURES[gesture.name]!,clock-gesture.started);
    const visible=onScreen(pose);
    body.style.visibility=visible?'visible':'hidden';
    // Nobody sees an effect that is scrolled away, and the loop pauses off-screen, so an
    // unfinished phase would hang. Skip ahead: arrive directly, finish the entrance, and plan
    // the trip to the visitor's section in the very next frame.
    if(!visible&&phase){
      if(phase==='beam-out'){pose={...beamTarget!};startPhase('beam-in');}
      else{if(phase==='spawn')introDone=true;phase=undefined;}
      frame=requestAnimationFrame(draw);return;
    }
    // Resuming starts from this settled timestamp, avoiding elapsed-time jumps after tab hiding.
    // A pending move keeps the loop alive until scrolling settles. Asked again here: a beam that
    // ended in this very frame leaves Ben off-screen at the old place, still to move.
    if(!visible&&!moving){if(bubble?.dataset.show==='true')bubble.dataset.show='false';if((differs&&!phase&&!gesture)||queuedGesture)frame=requestAnimationFrame(draw);else previous=0;return;}
    const dx=pose.x-oldX;
    const walking=moving&&journey?.kind==='walk';
    const ease=1-Math.exp(-dt*12);
    const velocity=dt?Math.abs(dx)/dt:0;
    walk+=(walking?clamp(velocity/(pose.height*.7))-walk:-walk)*ease;
    if(walking)stride+=strideAdvance(dx,pose.height,scene.walkStride);
    const direction=Math.sign((journey?.to.x??pose.x)-(journey?.from.x??pose.x));
    // Walking turns Ben sideways; hops between rows keep him facing the visitor.
    const desiredFacing=walking?(direction||1)*1.35:-.12;
    facing+=(desiredFacing-facing)*(1-Math.exp(-dt*9));
    const wave=clock-waveStarted;
    const waving=wave>=0&&wave<2.8;
    const canvas=place(pose);
    const look=lookPoint();
    const info=scene.draw({time:clock,x:canvas.width/2,feet:canvas.feet,height:pose.height,facing,stride,walk,air,point:0,watch:0,wave,dark,progress,holo,
      pointer:look&&{x:look.x-canvas.screenLeft,y:look.y-canvas.screenTop},
      gesture:gesture&&{name:gesture.name,time:clock-gesture.started},hop:moving&&journey?.kind==='jump'?progress:undefined});
    const beaming=phase==='beam-out'||phase==='beam-in';
    const action=beaming?'beam':phase??(moving?(journey?.kind==='jump'?'hop':'walk'):gesture?gesture.name:waving?'wave':'idle');
    // In the hero, after a quiet moment, Ben hints that he can be clicked (once per visit).
    if(action!=='idle'||pose.station!==0)quietSince=clock;
    else if(!hinted&&clock-quietSince>HINT_AFTER){hinted=true;say(matchMedia('(pointer: coarse)').matches?lines.hintTouch??lines.hint:lines.hint);}
    // Docked in the projects, he names the project being read.
    if(pose.dock&&action==='idle'&&(!mobile||settled)){
      const now=currentTopic(pose.station);
      if(now&&now!==topic){topic=now;say(now.dataset.benSay);}
    }
    if(action==='idle')head=info.head;
    placeBubble(clock<bubbleUntil&&!phase&&(!mobile||settled),canvas);
    for(const [key,value] of Object.entries({ground:info.ground.toFixed(2),look:info.look.toFixed(1),station:String(pose.station),row:String(pose.row??-1),travel:String(moving||beaming),step:stride.toFixed(2),action})){
      if(element.dataset[key]!==value)element.dataset[key]=value;
    }
    const bw=`${pose.height*.42}px`,bh=`${pose.height}px`,bt=`translate3d(${canvas.width/2-pose.height*.21}px,${canvas.feet-pose.height}px,0)`;
    if(bounds.style.width!==bw)bounds.style.width=bw;
    if(bounds.style.height!==bh)bounds.style.height=bh;
    if(bounds.style.transform!==bt)bounds.style.transform=bt;
    // A continuous clock while visible: no freeze/wake cycle, smooth gaze and breathing.
    frame=requestAnimationFrame(draw);
  }
  async function enable(){
    if(disposed||reduced.matches||scene||loading||failed)return;
    loading=true;const abort=new AbortController();loadAbort=abort;
    try{
      const {createBenScene}=await import('./scene');if(abort.signal.aborted)return;
      const result=await createBenScene(container,element.dataset.model!,abort.signal,mobile);
      if(disposed||reduced.matches||abort.signal.aborted){result.destroy();return;}
      scene=result;scene.setMobile(mobile);needsMeasure=true;element.dataset.ready='true';body.dataset.ready='true';document.documentElement.dataset.companionActive='true';wake();
      if(writing())loadGestures();
    }catch(error){
      if(!abort.signal.aborted){failed=true;element.dataset.fallback='true';console.info('[companion] Static portrait retained.',error);}
    }finally{loading=false;if(abort.signal.aborted&&!disposed&&!reduced.matches)void enable();}
  }
  function disable(){
    cancel();loadAbort?.abort();scene?.destroy();scene=undefined;gestures=undefined;pose=undefined;journey=undefined;phase=undefined;gesture=undefined;queuedGesture=undefined;
    stopDecode?.();stopDecode=undefined;bubbleUntil=-1;if(bubble)bubble.dataset.show='false';
    if(body.parentElement!==element)element.append(body);
    delete element.dataset.action;delete element.dataset.ready;delete body.dataset.ready;delete element.dataset.gestures;delete document.documentElement.dataset.companionActive;
  }
  function requestGesture(name:string){queuedGesture={name,at:clock};loadGestures();wake();}
  // Clicking Ben plays a trick: dance, flip, kick, push-ups or video games, never twice in a row.
  listen(bounds,'pointerenter',()=>loadGestures());
  listen(bounds,'click',()=>{
    if(!scene||phase||gesture||queuedGesture||journey)return;
    requestGesture(nextTrick());
  });
  if(contactForm){
    listen(contactForm,'focusin',()=>{loadGestures();wake();});
    listen(contactForm,'focusout',()=>wake());
  }
  listen(document,'focusin',updateViewport);
  listen(document,'focusout',()=>{queueMicrotask(()=>{if(!disposed)updateViewport();});});
  // The contact form asks for a gesture (e.g. a bow once a message is sent).
  listen(document,'companion:gesture',((event:CustomEvent<string>)=>{
    if(!scene||typeof event.detail!=='string')return;
    requestGesture(event.detail);
  }) as EventListener);
  listen(window,'pointermove',((event:PointerEvent)=>{if(event.pointerType!=='touch'){pointer={x:event.clientX,y:event.clientY};wake();}}) as EventListener,{passive:true});
  listen(document,'pointerleave',()=>{pointer.x=-1;wake();});
  // Scrolling hands the technology list back to the scroll position.
  listen(window,'scroll',()=>{
    lastScroll=performance.now();docksDirty=true;hoveredRow=-1;pendingRow=-1;clearTimeout(rowTimer);rowTimer=0;
    if(mobile&&bubble?.dataset.show==='true')bubble.dataset.show='false';
    wake();
  },{passive:true});
  listen(window,'resize',()=>{needsMeasure=true;updateViewport();},{passive:true});
  if(window.visualViewport){
    listen(window.visualViewport,'resize',updateViewport,{passive:true});
    listen(window.visualViewport,'scroll',updateViewport,{passive:true});
  }
  listen(mobileQuery,'change',()=>{
    mobile=mobileQuery.matches;routeHeight=innerHeight;needsMeasure=true;
    scene?.setMobile(mobile);updateViewport();
  });
  listen(document,'visibilitychange',()=>{if(document.hidden)cancel();else wake();});
  listen(reduced,'change',()=>{if(reduced.matches)disable();else void enable();});
  const resize=new ResizeObserver(()=>{needsMeasure=true;wake();});resize.observe(document.querySelector('main')!);anchorNodes.forEach(n=>resize.observe(n));
  const stopTheme=onThemeChange(theme=>{dark=theme==='dark';wake();});
  void document.fonts.ready.then(()=>{if(!disposed){needsMeasure=true;wake();}});void enable();
  return()=>{disposed=true;disable();clearTimeout(rowTimer);resize.disconnect();stopTheme();removers.forEach(fn=>fn());};
}
