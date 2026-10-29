/* Browser integration tests of the actual pages/scripts against synthetic data. */
const frame=document.getElementById('subject');
const output=document.getElementById('results');
const results=[];
window.calls=[]; window.runtimeErrors=[];window.scenario='draft';
window.token='.synthetic-django-signed:timestamp:signature';
const baseApplicant={id:7,email:'student@example.invalid',full_name:'Offline Applicant',phone_number:'9000000000',application_no:'TEST-7'};
window.applicant={...baseApplicant,application_form:{application_status:'DRAFT'}};
let sequence=0;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate,label){for(let n=0;n<150;n++){if(predicate())return;await wait(40);}throw Error('Timed out: '+label);}
function check(condition,message){if(!condition)throw Error(message);}
function session(expired=false){sessionStorage.clear();sessionStorage.setItem('mcpApplicantSession',JSON.stringify({authenticated:true,accessToken:expired?'e30.'+btoa('{"exp":1}')+'.offline':token,applicantId:'7',email:baseApplicant.email,fullName:baseApplicant.full_name,phoneNumber:baseApplicant.phone_number,applicationNo:'TEST-7'}));}
async function open(page,{width=1280,auth=true,kind='draft',data}={}){
  window.scenario=kind;window.applicant=data||{...baseApplicant,application_form:{application_status:'DRAFT'}};
  window.calls=[];window.runtimeErrors=[];window.confirmResult=true;
  if(auth)session(kind==='expired');else sessionStorage.clear();
  frame.width=width;
  frame.src='/case/'+(++sequence)+'/'+page;
  await until(()=>frame.contentDocument?.readyState==='complete' && frame.contentWindow.location.pathname.includes('/case/'+sequence+'/'),'page load');
  await wait(150);
  await until(()=>Array.from(frame.contentDocument.querySelectorAll('.preloader')).every(e=>frame.contentWindow.getComputedStyle(e).display==='none'),'page preloader');
  return frame.contentWindow;
}
async function loaded(w){await until(()=>{
  const state=w.document.getElementById('applicationState');
  const content=w.document.getElementById('applicationContent');
  return state ? !['LOADING',''].includes(state.textContent) : Boolean(content && !content.hidden);
},'application loaded');}
function control(w,name){return w.document.getElementById(name);}
function fill(w,id,value){const e=control(w,id);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));}
async function run(name,fn){try{await fn();check(!runtimeErrors.length,'Runtime errors: '+runtimeErrors.join('; '));results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}output.textContent=results.map(r=>(r.pass?'PASS ':'FAIL ')+r.name+(r.error?' — '+r.error:'')).join('\n');}

function completeForm(w) {
  for(const [key,,type,,choices] of w.MCPApplicationForm.fields){
    const input=control(w,key);if(input.matches(':disabled'))continue;
    if(type==='file'){
      const transfer=new w.DataTransfer();transfer.items.add(new w.File(['synthetic fixture'],key+(key==='student_photo'||key==='signature'?'.png':'.pdf'),{type:key==='student_photo'||key==='signature'?'image/png':'application/pdf'}));input.files=transfer.files;
      input.dispatchEvent(new w.Event('input',{bubbles:true}));
    }else fill(w,key,key==='student_email'?baseApplicant.email:type==='email'?'parent@example.invalid':type==='tel'?'9000000000':type==='date'?'2005-06-12':type==='month'?'2024-03':type==='number'?'0':type==='select'?choices[0]:'Synthetic '+key);
  }
  control(w,'declaration_accepted').checked=true;
}
async function discard(w){control(w,'logoutButton').click();await until(()=>w.location.pathname.endsWith('/signin.html')&&w.document.readyState==='complete'&&control(w,'loginForm'),'discard edits');}
async function saved(w){await until(()=>control(w,'formMessage')?.textContent.includes('Draft saved successfully'),'draft saved');}

async function main(){
  await run('Unauthenticated application redirects to real sign-in',async()=>{const w=await open('apply.html',{auth:false});await until(()=>w.location.pathname.endsWith('/signin.html'),'signin');check(w.location.search==='?next=apply.html','return URL');});
  await run('Compatibility sign-in and sign-up redirects retain next',async()=>{
    let w=await open('signin-user.html?next=application-status.html',{auth:false});await until(()=>w.location.pathname.endsWith('/signin.html'),'signin alias');check(w.location.search.includes('application-status.html'),'next lost');
    w=await open('signup-user.html?next=apply.html',{auth:false});await until(()=>w.location.pathname.endsWith('/signup.html'),'signup alias');
  });
  await run('Mock login sends one request and opens the real form',async()=>{
    const w=await open('signin.html',{auth:false});fill(w,'email',baseApplicant.email);fill(w,'password','offline-password');control(w,'loginForm').requestSubmit();
    await until(()=>w.location.pathname.endsWith('/apply.html'),'login redirect');await until(()=>control(w,'applicationState')?.textContent==='DRAFT','draft');
    check(calls.filter(c=>c.path.endsWith('/login/')).length===1,'duplicate login');check(!calls[0].headers.Authorization,'login sent JWT');
  });
  await run('Register and verify OTP use existing APIs and return to sign-in (mock)',async()=>{
    const w=await open('signup.html',{auth:false});for(const [id,value] of Object.entries({fullName:'Offline Student',email:baseApplicant.email,phoneNumber:'9000000000',password:'offline-password',confirmPassword:'offline-password'}))fill(w,id,value);
    control(w,'registerForm').requestSubmit();await until(()=>calls.some(c=>c.path.endsWith('/register/')),'register');
    fill(w,'otpInput','123456');control(w,'otpForm').requestSubmit();await until(()=>w.location.pathname.endsWith('/signin.html'),'verified redirect');
    check(calls.filter(c=>c.path.endsWith('/verify-otp/')).length===1,'OTP request count');check(!sessionStorage.getItem('mcpPendingVerificationEmail'),'pending email retained');
  });
  await run('New applicant shows NOT STARTED and account prefill',async()=>{
    const w=await open('apply.html',{data:{...baseApplicant,application_form:null,application_status:'DRAFT'}});await loaded(w);
    check(control(w,'applicationState').textContent==='NOT STARTED','wrong state');check(control(w,'full_name').value===baseApplicant.full_name,'name prefill');check(!control(w,'applicationFields').disabled,'new form disabled');
  });
  await run('All saved fields, dates, zero values, unknown choices and documents prefill',async()=>{
    let w=await open('apply.html');await loaded(w);const fields=w.MCPApplicationForm.fields;
    const values={application_status:'DRAFT',declaration_accepted:true};
    for(const [key,,type] of fields)values[key]=type==='file'?'/media/offline.pdf':type==='number'?0:type==='date'?'2005-06-12':type==='month'?'2024-03-01':type==='email'?'saved@example.invalid':type==='select'?'Saved custom value':'Saved '+key;
    values.program_type='BPharm-Lateral';values.contact_number='9000000000';
    w=await open('apply.html',{data:{...baseApplicant,application_form:values}});await loaded(w);
    for(const [key,,type] of fields){const e=control(w,key);if(type==='file'){check(e.value==='','file value must stay empty');check(control(w,'saved_'+key).textContent.includes('View saved'),'saved doc missing');check(!e.required,'existing file required');}else check(e.value===(type==='month'?values[key].slice(0,7):String(values[key])),'prefill '+key);}
    check(control(w,'declaration_accepted').checked,'declaration');check(!control(w,'lateralFields').hidden,'lateral');
    check(calls.length===1,'duplicate application reads');
  });
  await run('Validation, lateral requirements and file selection stay local',async()=>{
    const w=await open('apply.html');await loaded(w);
    control(w,'validateApplication').click();check(control(w,'full_name').getAttribute('aria-invalid')!=='true','prefilled name invalid');check(control(w,'father_name').getAttribute('aria-invalid')==='true','missing required field');
    fill(w,'program_type','BPharm-Lateral');control(w,'program_type').dispatchEvent(new w.Event('change',{bubbles:true}));check(!control(w,'lateralFields').disabled,'lateral disabled');
    const data=new w.DataTransfer();data.items.add(new w.File(['synthetic'],'bad.pdf',{type:'application/pdf'}));control(w,'student_photo').files=data.files;control(w,'validateApplication').click();check(control(w,'error_student_photo').textContent.includes('JPG'),'invalid photo accepted');
    const good=new w.DataTransfer();good.items.add(new w.File(['synthetic'],'photo.png',{type:'image/png'}));control(w,'student_photo').files=good.files;control(w,'validateApplication').click();check(!control(w,'error_student_photo').textContent,'valid photo rejected');
    check(calls.every(c=>c.method==='GET'),'validation wrote data');
    control(w,'logoutButton').click();await until(()=>w.location.pathname.endsWith('/signin.html')&&w.document.readyState==='complete'&&control(w,'loginForm'),'discard test edits');
  });
  await run('Partial draft PATCH saves once, clears values and reloads after logout/login',async()=>{
    const w=await open('apply.html',{data:{...baseApplicant,application_form:null}});await loaded(w);
    fill(w,'father_name','Saved Parent');fill(w,'hs_physics_mark','0');
    control(w,'saveDraftButton').click();control(w,'saveDraftButton').click();await saved(w);
    check(calls.filter(c=>c.method==='PATCH').length===1,'duplicate draft writes');
    const request=calls.find(c=>c.method==='PATCH');check(request.body.get('declaration_accepted')==='false','draft demanded declaration');check(!request.headers['Content-Type'],'multipart boundary overridden');
    check(control(w,'applicationState').textContent==='DRAFT','draft state not updated');
    await discard(w);fill(w,'email',baseApplicant.email);fill(w,'password','offline-password');control(w,'loginForm').requestSubmit();
    await until(()=>w.location.pathname.endsWith('/apply.html')&&control(w,'father_name')?.value==='Saved Parent','saved draft reloaded');
    check(control(w,'hs_physics_mark').value==='0','zero lost');
    fill(w,'father_name','');control(w,'saveDraftButton').click();await saved(w);check(applicant.application_form.father_name==='','cleared text not sent');
  });
  await run('Uploads save, existing files survive omitted inputs, submission redirects and locks',async()=>{
    const w=await open('apply.html',{data:{...baseApplicant,application_form:null}});await loaded(w);completeForm(w);
    control(w,'saveDraftButton').click();await saved(w);
    const original=applicant.application_form.student_photo;
    check(control(w,'student_photo').files.length===0,'saved file selection not cleared');check(control(w,'saved_student_photo').textContent.includes('View saved'),'saved document missing');
    fill(w,'father_name','Updated Parent');control(w,'saveDraftButton').click();await saved(w);
    check(applicant.application_form.student_photo===original,'previous file lost');
    check(!calls.filter(c=>c.method==='PATCH')[1].body.has('student_photo'),'saved URL resubmitted');
    control(w,'submitApplicationButton').click();control(w,'submitApplicationButton').click();
    await until(()=>w.location.pathname.endsWith('/application-status.html')&&control(w,'summaryStatus')?.textContent.includes('Submitted'),'submitted status');
    check(calls.filter(c=>c.path.endsWith('/application/submit/')).length===1,'duplicate submit');check(applicant.application_form.application_status==='SUBMITTED','fixture not submitted');
    check(control(w,'continueApplicationButton').hidden,'submitted Continue visible');
    w.location.assign('apply.html');await until(()=>control(w,'applicationState')?.textContent==='SUBMITTED','submitted form');check(control(w,'applicationFields').disabled,'submitted edits permitted');
  });
  await run('Submission requires complete fields and honors cancelled confirmation',async()=>{
    const w=await open('apply.html');await loaded(w);control(w,'submitApplicationButton').click();check(!calls.some(c=>c.method==='POST'),'incomplete submitted');
    completeForm(w);window.confirmResult=false;control(w,'submitApplicationButton').click();check(!calls.some(c=>c.method==='POST'),'cancelled submitted');window.confirmResult=true;await discard(w);
  });
  await run('Server field errors show inline and correction can be saved without losing files',async()=>{
    const w=await open('apply.html',{kind:'validation'});await loaded(w);completeForm(w);control(w,'saveDraftButton').click();
    await until(()=>control(w,'error_parent_email').textContent.includes('valid email'),'field errors');check(control(w,'error_declaration_accepted').textContent.includes('confirm'),'declaration error');check(control(w,'formMessage').textContent.includes('review your details'),'non-field error');
    check(control(w,'student_photo').files.length===1,'selected file lost on error');check(!control(w,'saveDraftButton').disabled,'cannot correct');
    window.scenario='draft';fill(w,'parent_email','corrected@example.invalid');control(w,'saveDraftButton').click();await saved(w);check(!control(w,'error_parent_email').textContent,'old error retained');
  });
  await run('Write expiration clears session; forbidden and ambiguous failures lock until reload',async()=>{
    let w=await open('apply.html',{kind:'write401'});await loaded(w);fill(w,'father_name','Unsaved');control(w,'saveDraftButton').click();await until(()=>w.location.pathname.endsWith('/signin.html'),'write401 redirect');check(!sessionStorage.getItem('mcpApplicantSession'),'write401 retained session');
    for(const kind of ['write403','network','write500','bad-success']){
      w=await open('apply.html',{kind});await loaded(w);fill(w,'father_name','Unsaved');control(w,'saveDraftButton').click();await until(()=>!control(w,'retryApplication').hidden,'recovery action '+kind);
      check(control(w,'applicationFields').disabled,'uncertain response editable '+kind);check(control(w,'father_name').value==='Unsaved','failed request erased edits');
      window.scenario='draft';control(w,'retryApplication').click();await until(()=>!control(w,'applicationFields').disabled,'recovery '+kind);
    }
  });
  await run('Remote status change rejects stale writes and reloads as read-only',async()=>{
    const w=await open('apply.html');await loaded(w);applicant.application_form.application_status='UNDER_REVIEW';control(w,'saveDraftButton').click();await until(()=>!control(w,'retryApplication').hidden,'stale draft rejection');
    control(w,'retryApplication').click();await until(()=>control(w,'applicationState').textContent==='UNDER REVIEW','lock refresh');check(control(w,'saveDraftButton').disabled,'locked save enabled');
  });
  await run('Every non-DRAFT state blocks editing and writes',async()=>{
    for(const status of ['SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','FUTURE_STATUS']){
      const w=await open('apply.html',{data:{...baseApplicant,application_form:{application_status:status}}});await loaded(w);
      check(control(w,'applicationFields').disabled,'editable '+status);for(const id of ['saveDraftButton','submitApplicationButton']){check(control(w,id).disabled,id+' '+status);control(w,id).click();}check(calls.every(c=>c.method==='GET'),'write for '+status);
    }
  });
  await run('Submitted application is read-only',async()=>{
    const w=await open('apply.html',{data:{...baseApplicant,application_form:{application_status:'SUBMITTED',full_name:'Submitted Name'}}});await loaded(w);check(control(w,'applicationFields').disabled,'editable submitted form');check(control(w,'validateApplication').disabled,'validation enabled');check(control(w,'full_name').value==='Submitted Name','submitted prefill');
  });
  await run('Draft status Continue Application navigates to editable form',async()=>{
    const w=await open('application-status.html');await loaded(w);const link=control(w,'continueApplicationButton');check(!link.hidden,'continue hidden');link.click();await until(()=>w.location.pathname.endsWith('/apply.html'),'continue');await until(()=>control(w,'applicationState')?.textContent==='DRAFT','draft form');
  });
  await run('NOT_STARTED status does not mark draft created and offers Start',async()=>{
    const w=await open('application-status.html',{data:{...baseApplicant,application_form:null,application_status:'DRAFT'}});await loaded(w);check(control(w,'summaryStatus').textContent.includes('Not started'),'draft shown');check(control(w,'continueApplicationButton').textContent==='Start Application','start label');check(!w.document.querySelector('.progress-step.current'),'false progress');
  });
  await run('Submitted status hides Continue and refreshed status follows backend fixture',async()=>{
    const w=await open('application-status.html');await loaded(w);applicant.application_form.application_status='SUBMITTED';control(w,'refreshTopButton').click();await until(()=>control(w,'summaryStatus').textContent.includes('Submitted'),'status refresh');check(control(w,'continueApplicationButton').hidden,'continue visible');
  });
  await run('Logout clears session; login reloads saved draft from mocked backend',async()=>{
    const w=await open('apply.html',{data:{...baseApplicant,application_form:{application_status:'DRAFT',father_name:'Saved Parent'}}});await loaded(w);control(w,'logoutButton').click();await until(()=>w.location.pathname.endsWith('/signin.html')&&w.document.readyState==='complete'&&control(w,'loginForm'),'logout');check(!sessionStorage.getItem('mcpApplicantSession'),'session retained');
    fill(w,'email',baseApplicant.email);fill(w,'password','offline-password');control(w,'loginForm').requestSubmit();await until(()=>w.location.pathname.endsWith('/apply.html'),'relogin');await until(()=>control(w,'father_name')?.value==='Saved Parent','persisted draft fixture');
  });
  await run('Expired JWT and server 401 redirect; 403 retains session and locks form',async()=>{
    let w=await open('apply.html',{kind:'expired'});await until(()=>w.location.pathname.endsWith('/signin.html'),'expired redirect');check(!calls.length,'expired request');
    w=await open('apply.html',{kind:'unauthorized'});await until(()=>w.location.pathname.endsWith('/signin.html'),'401 redirect');check(!sessionStorage.getItem('mcpApplicantSession'),'401 session');
    w=await open('apply.html',{kind:'forbidden'});await loaded(w);check(control(w,'applicationFields').disabled,'403 editable');check(control(w,'formMessage').textContent.includes('permission'),'403 message');check(sessionStorage.getItem('mcpApplicantSession'),'403 erased session');
  });
  await run('Correct reset-OTP route, reset fields and sign-in redirect (mock)',async()=>{
    const w=await open('forgot-password.html',{auth:false});fill(w,'email',baseApplicant.email);control(w,'forgotPasswordForm').requestSubmit();await until(()=>calls.length===1,'reset request');check(calls[0].path.endsWith('/request-password-reset/'),'wrong reset route');
    for(const [id,value] of Object.entries({otp:'123456',newPassword:'offline-new-password',confirmNewPassword:'offline-new-password'}))fill(w,id,value);
    control(w,'resetPasswordForm').requestSubmit();await until(()=>w.location.pathname.endsWith('/signin.html'),'reset redirect');check(JSON.parse(calls[1].body).new_password==='offline-new-password','reset payload');
  });
  for(const width of [1280,768,390,320])for(const page of ['apply.html','application-status.html'])await run(page+' layout at '+width+'px',async()=>{
    const w=await open(page,{width});await loaded(w);check(w.document.documentElement.scrollWidth<=width+1,'horizontal overflow '+w.document.documentElement.scrollWidth);
    const heading=w.document.querySelector(page==='apply.html'?'.eyebrow':'.status-hero-kicker');
    check(heading.getBoundingClientRect().top>=w.document.querySelector('.navbar').getBoundingClientRect().bottom,'header overlaps heading');
    if(width<992){
      w.document.querySelector('.navbar-toggler').click();await until(()=>w.document.querySelector('.navbar-collapse').classList.contains('show'),'mobile menu opens');
      w.document.querySelector('.navbar-toggler').click();await until(()=>!w.document.querySelector('.navbar-collapse').classList.contains('show'),'mobile menu closes');
    }
    if(page==='apply.html')check(w.getComputedStyle(w.document.querySelector('.application-grid')).gridTemplateColumns.split(' ').length===(width<600?1:2),'wrong column count');
  });
  await fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'complete',passed:results.filter(r=>r.pass).length,total:results.length,results})});
  await showPreview('apply.html',390);
}
window.showPreview=async(page,width)=>{const w=await open(page,{width});await loaded(w);};
main().catch(async error=>{output.textContent+='\nHARNESS ERROR '+error.message;await fetch('/report',{method:'POST',body:JSON.stringify({status:'error',error:error.message,results})});});
