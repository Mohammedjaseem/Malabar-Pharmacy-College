// Injected only by the local test harness. No real API requests are sent.
window.addEventListener('error', event => parent.runtimeErrors.push(event.message));
window.addEventListener('unhandledrejection', event => parent.runtimeErrors.push(String(event.reason)));
window.confirm = () => parent.confirmResult !== false;
window.fetch = async (url, options={}) => {
  const path = new URL(url,location.href).pathname;
  const api = '/admissions/api/mcp';
  const method=options.method||'GET';
  if(!path.startsWith(api)) throw new Error('Non-mock request blocked: '+path);
  parent.calls.push({path,method,headers:options.headers,body:options.body});
  if(path===api+'/application/' && method==='GET') {
    if(parent.scenario==='unauthorized') return Response.json({status:false,message:'Session expired'},{status:401});
    if(parent.scenario==='forbidden') return Response.json({status:false,message:'Forbidden'},{status:403});
    if(parent.scenario==='malformed') return new Response('<html>error</html>',{status:502});
    const data=parent.applicant.application_form;
    return Response.json({status:true,applicant:data===null?{application_no:parent.applicant.application_no,full_name:parent.applicant.full_name,email:parent.applicant.email}:undefined,
      data:data===null?null:{...structuredClone(data),application_no:parent.applicant.application_no,registered_email:parent.applicant.email}});
  }
  const draft=path===api+'/application/save-draft/'&&method==='PATCH';
  const submit=path===api+'/application/submit/'&&method==='POST';
  if(draft||submit){
    if(!options.headers?.Authorization?.startsWith('Bearer '))return Response.json({status:false,message:'Authorization required'},{status:401});
    if(!(options.body instanceof FormData)||options.headers['Content-Type'])throw Error('Expected browser multipart boundary');
    await new Promise(resolve=>setTimeout(resolve,150));
    if(parent.scenario==='write401')return Response.json({status:false,message:'Session expired'},{status:401});
    if(parent.scenario==='write403')return Response.json({status:false,message:'Forbidden'},{status:403});
    if(parent.scenario==='network')throw new TypeError('Failed to fetch');
    if(parent.scenario==='bad-success')return Response.json({status:true,data:null});
    if(parent.scenario==='validation')return Response.json({status:false,message:'Invalid application data.',errors:{parent_email:['Enter a valid email address.'],declaration_accepted:['Please confirm the declaration.'],non_field_errors:['Please review your details.']}},{status:400});
    if(parent.scenario==='write500')return new Response('<html>server error</html>',{status:500});
    const existing=parent.applicant.application_form;
    if(existing&&existing.application_status!=='DRAFT')return Response.json({status:false,message:'A submitted application cannot be edited.'},{status:400});
    const data={...(existing||{}),application_status:'DRAFT'};
    for(const [key,value] of options.body.entries())data[key]=value instanceof Blob?'/media/mock/'+encodeURIComponent(value.name):key==='declaration_accepted'?value==='true':value;
    if(submit){
      const required=['full_name','father_name','father_occupation','mother_name','mother_occupation','correspondence_address','permanent_address','student_email','parent_email','date_of_birth','gender','nationality','category','religion','caste','contact_number','quota','student_photo','signature','program_type','hs_register_number','hs_year_month_of_passing','hs_board_of_examination','hs_physics_mark','hs_chemistry_mark','hs_biology_mark','hs_mathematics_mark','hs_total_mark','hs_overall_percentage','hs_pcb_pcm_higher_value','hs_certificate','high_school_register_number','high_school_year_month_of_passing','high_school_total_percentage','high_school_certificate'];
      if(data.program_type==='BPharm-Lateral')required.push('dpharm_register_number','dpharm_year_month_of_passing','dpharm_total_mark','dpharm_percentage','dpharm_certificate','kspc_registration_number');
      const errors={};for(const key of required)if(data[key]===undefined||data[key]===null||data[key]==='')errors[key]=['Required before submission.'];
      if(data.declaration_accepted!==true)errors.declaration_accepted=['Declaration required.'];
      if(Object.keys(errors).length)return Response.json({status:false,message:'Complete required fields.',errors},{status:400});
      data.application_status='SUBMITTED';data.submitted_at='2026-10-29T12:00:00Z';
    }
    parent.applicant.application_form=data;
    return Response.json({status:true,message:draft?'Draft saved.':'Submitted.',application_no:parent.applicant.application_no,data:{...data,application_no:parent.applicant.application_no,registered_email:parent.applicant.email}});
  }
  if(path===api+'/login/'&&method==='POST')return Response.json({status:true,access_token:parent.token,token_type:'Bearer',applicant:{...structuredClone(parent.applicant),application_status:parent.applicant.application_form?.application_status||null,is_form_created:!!parent.applicant.application_form,is_form_submitted:!!parent.applicant.application_form&&parent.applicant.application_form.application_status!=='DRAFT'}});
  if(method==='POST'&&['/register/','/verify-otp/','/resend-otp/','/request-password-reset/','/reset-password/'].some(p=>path===api+p))return Response.json({status:true,message:'Mock success'});
  throw new Error('Unverified API operation blocked: '+path);
};
