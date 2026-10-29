const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {runtime,login,applicant}=require('./admissions.test.cjs');

test('contract sends PATCH/POST multipart, bearer token, and preserves omitted files',async()=>{
  const r=runtime();login(r);
  r.ctx.response=Response.json({status:true,data:{application_status:'DRAFT',application_no:'TEST-7',registered_email:applicant.email}});
  await r.application.saveDraft({father_name:'Partial',hs_physics_mark:0,parent_email:'',declaration_accepted:false,hs_certificate:'https://example.invalid/old.pdf',signature:new Blob(['synthetic'],{type:'image/png'}),applicant:8,rank:1,application_status:'APPROVED'});
  const request=r.calls[0];assert.equal(request.options.method,'PATCH');assert.ok(request.url.endsWith('/application/save-draft/'));
  assert.equal(request.options.headers.Authorization,'Bearer offline-token');assert.equal(request.options.headers['Content-Type'],undefined);
  const body=request.options.body;
  assert.equal(body.get('hs_physics_mark'),'0');assert.equal(body.get('parent_email'),'');assert.equal(body.get('declaration_accepted'),'false');
  assert.equal(body.get('signature').size,9);
  for(const key of ['hs_certificate','rank','applicant','application_status'])assert.equal(body.has(key),false,key);
  r.ctx.response=Response.json({status:true,data:{application_status:'SUBMITTED',application_no:'TEST-7',registered_email:applicant.email}});
  const submitted=await r.application.submit({declaration_accepted:true});assert.equal(submitted.editable,false);
  assert.equal(r.calls[1].options.method,'POST');assert.ok(r.calls[1].url.endsWith('/application/submit/'));assert.equal(r.auth.getApplicationStatus(),'SUBMITTED');
});

test('adapter rejects malformed success envelopes and wrong write transitions',async()=>{
  for(const payload of [{},{status:true},{status:true,data:[]},{status:true,data:'bad'},{status:false,data:null}]){
    const r=runtime();login(r);r.ctx.response=Response.json(payload);await assert.rejects(r.application.load());
  }
  const r=runtime();login(r);r.ctx.response=Response.json({status:true,data:null});await assert.rejects(r.application.saveDraft({}));
  r.ctx.response=Response.json({status:true,data:{application_status:'DRAFT'}});await assert.rejects(r.application.submit({}),/could not be confirmed/);
});

test('current null/DRAFT data overrides stale session submission flags; all other states lock',async()=>{
  const r=runtime();login(r,{is_form_submitted:true,application_status:'SUBMITTED'});
  r.ctx.response=Response.json({status:true,data:null,applicant});assert.equal((await r.application.load()).status,'NOT_STARTED');
  for(const status of ['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','FUTURE_STATUS']){
    r.ctx.response=Response.json({status:true,data:{application_status:status,application_no:'TEST-7',registered_email:applicant.email}});
    assert.equal((await r.application.load()).editable,status==='DRAFT',status);
  }
});

test('Django-signed opaque tokens work; write 401 clears session and field errors survive',async()=>{
  const r=runtime();login(r);r.auth.updateSession({accessToken:'.opaque:timestamp:signature'});
  assert.equal(r.auth.isAuthenticated(),true);
  r.ctx.response=Response.json({status:false,message:'Invalid application data.',errors:{parent_email:['Enter a valid email.']}},{status:400});
  await assert.rejects(r.application.saveDraft({parent_email:'bad'}),e=>e.status===400&&e.data.errors.parent_email[0]==='Enter a valid email.');
  r.ctx.response=new Response('',{status:401});await assert.rejects(r.application.submit({}),{status:401});assert.equal(r.auth.getSession(),null);
});

test('model file limits allow WebP only for images and enforce 10 MiB and extensions',()=>{
  const f=runtime().ctx.MCPApplicationForm;
  assert.equal(f.fileError({name:'photo.webp',type:'image/webp',size:10*1024*1024},'student_photo'),'');
  assert.notEqual(f.fileError({name:'cert.webp',type:'image/webp',size:10},'hs_certificate'),'');
  assert.notEqual(f.fileError({name:'photo.exe',type:'image/png',size:10},'student_photo'),'');
});

test('login, signup, reset and signin-user bytes are preserved from task start',()=>{
  const hashes={'signin-user.html':'C22AA211A5A2E745831C9A700E68066AFA0E48971D76CEA8BE39576BD2B674B6','signup.html':'BABA0A6F7F117D7AD5184ED61E3791A32FF560C00057EB99A7D9C2247070BEE5','signin.html':'A576AE4394B36E2A2B26B49C6D4E28BC346D3F368122B57BF1745881A98F508E','forgot-password.html':'850798205DD4C2F5E3A6F6FE9ACE22ADA86A2E9765E92E1A37DC581616A59B79'};
  for(const [file,hash] of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require('node:path').join(__dirname,'..',file))).digest('hex').toUpperCase(),hash,file);
});
