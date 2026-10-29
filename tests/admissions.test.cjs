// Offline tests: fetch is always mocked; no real account, upload or API write.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function runtime() {
  const storage = new Map();
  const calls = [];
  const redirects = [];
  const ctx = { URL, URLSearchParams, Date, console, FormData, Blob,
    sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    location: { href: 'http://localhost/apply.html', origin: 'http://localhost', pathname: '/apply.html', search: '?application_no=OTHER', replace: v => redirects.push(v) },
    atob: value => Buffer.from(value, 'base64').toString(),
    fetch: async (url, options) => { calls.push({url, options}); return ctx.response; },
    response: new Response('{}'),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['mcp-auth.js', 'mcp-admission-contract.js', 'mcp-application.js', 'mcp-application-form.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', file), 'utf8'), ctx, {filename:file});
  }
  return { ctx, calls, redirects, auth:ctx.MCPAuth, application:ctx.MCPApplication };
}
const applicant = {id:7, email:'test@example.invalid', application_no:'TEST-7', application_form:null};
function login(r, extra={}) { return r.auth.saveSession({ access:'offline-token', applicant:{...applicant,...extra} }); }

test('all changed page scripts parse and local script/style dependencies exist', () => {
  for (const page of ['apply.html','application-status.html','signin.html','signup.html','forgot-password.html','signin-user.html','signup-user.html','login.html','register.html','reset-password.html','otp-verification.html']) {
    const html = fs.readFileSync(path.join(root,page),'utf8');
    const sources = [];
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const src = match[1].match(/src="([^"]+)"/);
      if (src && !/^https?:/.test(src[1])) sources.push(src[1].split('?')[0]);
      else if (!src) new vm.Script(match[2], {filename:page});
    }
    assert.equal(new Set(sources).size,sources.length,`duplicate scripts: ${page}`);
    for (const file of sources) { assert.ok(fs.existsSync(path.join(root,file)), file); new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file}); }
    for (const match of html.matchAll(/<link[^>]+href="(assets\/[^"?]+)/g)) assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
  }
});
test('status design is preserved except the verified mobile header clearance fix', () => {
  const before = require('node:child_process').execFileSync('git',['show','HEAD:application-status.html'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  const after=fs.readFileSync(path.join(root,'application-status.html'),'utf8').replace(/\r\n/g,'\n');
  assert.equal(after.match(/<style>([\s\S]*?)<\/style>/)[1].replace('          margin-top: 70px;\n',''),before.match(/<style>([\s\S]*?)<\/style>/)[1]);
  assert.equal(after.slice(after.indexOf('<body>'),after.indexOf('<script src="https://cdnjs')),before.slice(before.indexOf('<body>'),before.indexOf('<script src="https://cdnjs')));
});
test('missing forms are NOT_STARTED; absent/malformed fields do not permit edits', () => {
  const {application:a}=runtime();
  assert.equal(a.snapshot({...applicant, application_status:'DRAFT'}).status,'NOT_STARTED');
  assert.equal(a.snapshot({application_status:'DRAFT'}).editable,false);
  assert.throws(()=>a.snapshot({application_form:[]}),/invalid application/);
  assert.equal(a.snapshot({...applicant,application_form:{application_status:'DRAFT'}}).editable,true);
  for(const status of ['SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','OTHER']) assert.equal(a.snapshot({...applicant,application_form:{application_status:status}}).editable,false);
  assert.equal(a.snapshot({...applicant,is_form_submitted:true,application_status:'DRAFT'}).status,'SUBMITTED');
});
test('safe redirects reject external URLs, login loops and applicant selectors',()=>{
  const {auth}=runtime();
  for(const next of ['https://evil.invalid/','//evil.invalid','signin.html','javascript:alert(1)']) assert.equal(auth.getSafeNextUrl('?next='+encodeURIComponent(next)),'apply.html');
  assert.equal(auth.getSafeNextUrl('?next=application-status.html%3Fapplication_no%3DOTHER'),'application-status.html');
  assert.equal(auth.buildSignInUrl('application-status.html'),'signin.html?next=application-status.html');
  assert.equal(auth.buildStatusUrl('OTHER'),'application-status.html');
});
test('login needs a token; NOT_STARTED does not route as submitted',()=>{
  const r=runtime(); assert.throws(()=>r.auth.saveSession({applicant}),/access token/);
  login(r,{application_status:'NOT_STARTED'}); assert.equal(r.auth.shouldOpenStatusPage(),false);
  login(r,{application_status:'SUBMITTED'}); assert.equal(r.auth.shouldOpenStatusPage(),true);
  r.auth.updateSession({applicationStatus:'DRAFT',isFormSubmitted:false,applicationSubmitted:false});
  assert.equal(r.auth.isFormSubmitted(),false);
});
test('expired JWT redirects before any request; server 401 clears session',async()=>{
  const r=runtime(); login(r); r.auth.updateSession({accessToken:'e30.'+Buffer.from(JSON.stringify({exp:1})).toString('base64url')+'.sig'});
  await assert.rejects(r.auth.apiFetch('/anything/'),{status:401}); assert.equal(r.calls.length,0); assert.equal(r.auth.getSession(),null);
  login(r); r.ctx.response=new Response('not json',{status:401});
  await assert.rejects(r.auth.apiFetch('/anything/'),{status:401}); assert.equal(r.auth.getSession(),null);
});
test('403 retains session and non-JSON errors preserve HTTP status',async()=>{
  const r=runtime();login(r);r.ctx.response=new Response('{"detail":"Forbidden"}',{status:403});
  await assert.rejects(r.auth.apiFetch('/anything/'),{status:403});assert.ok(r.auth.getSession());
  r.ctx.response=new Response('<html>Not found</html>',{status:404});
  await assert.rejects(r.auth.postJson('/request-password-reset/',{}),{status:404});
});
test('read uses authenticated self endpoint and rejects inconsistent account identifiers',async()=>{
  const r=runtime();login(r);r.ctx.response=Response.json({status:true,data:null,applicant});
  assert.equal((await r.application.load()).status,'NOT_STARTED');
  assert.ok(r.calls[0].url.endsWith('/application/'));
  assert.equal(r.calls[0].options.headers.Authorization,'Bearer offline-token');
  assert.equal(r.calls[0].options.method,'GET');
  r.ctx.response=Response.json({status:true,data:null,applicant:{...applicant,email:'other@example.invalid'}});
  await assert.rejects(r.application.load(),/does not match/);
});
test('new accounts can load the self endpoint without an application reference',async()=>{
  const r=runtime();login(r,{application_no:''});r.ctx.response=Response.json({status:true,data:null,applicant});
  assert.equal((await r.application.load()).status,'NOT_STARTED');assert.ok(r.calls[0].url.endsWith('/application/'));
});
test('auth POSTs do not send a stale JWT; structured failures are rejected',async()=>{
  const r=runtime();login(r);r.ctx.response=Response.json({success:false,message:'Rejected'});
  await assert.rejects(r.auth.postJson('/login/',{email:'test@example.invalid',password:'offline'}),/Rejected/);
  assert.equal(r.calls[0].options.headers.Authorization,undefined);
});
test('document validation and URLs reject unsafe types, empty/oversized files and scripts',()=>{
  const f=runtime().ctx.MCPApplicationForm;
  assert.equal(f.fileError({name:'photo.png',size:10,type:'image/png'},'student_photo'),'');
  assert.notEqual(f.fileError({size:10,type:'application/pdf'},'student_photo'),'');
  assert.notEqual(f.fileError({size:0,type:'image/png'},'signature'),'');
  assert.notEqual(f.fileError({name:'cert.pdf',size:10485761,type:'application/pdf'},'hs_certificate'),'');
  assert.equal(f.safeDocumentUrl('javascript:alert(1)'),null);
  assert.equal(f.safeDocumentUrl('https://user:pass@example.invalid/doc'),null);
});
test('verified write methods exist and legacy writes are absent',()=>{
  const r=runtime();assert.equal(typeof r.application.saveDraft,'function');assert.equal(typeof r.application.submit,'function');
  for(const file of ['mcp-application.js','mcp-application-form.js']) assert.doesNotMatch(fs.readFileSync(path.join(root,'assets/js',file),'utf8'),/update_student_data/);
});

module.exports={runtime,login,applicant};
