// Usage: node tests/run-browser.cjs [absolute path to installed playwright-core]
// Uses a new browser profile, never attaches to the user's browser.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {chromium}=require(process.argv[2]||'playwright-core');
const port=process.env.MCP_TEST_PORT || '8766';
const base='http://127.0.0.1:'+port;
let browser;
let report={status:'waiting'};
const pages=new Set(['apply.html','application-status.html','signin.html','signin-user.html','signup.html','signup-user.html','login.html','register.html','forgot-password.html','reset-password.html','otp-verification.html']);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
(async()=>{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const consoleErrors=[],pageErrors=[],blocked=[],missing=[];
  // Fulfill every local URL directly from fixture files. No socket, server,
  // user browser connection or network permission is needed by this runner.
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base){blocked.push(url.origin+url.pathname);return route.abort();}
    if(url.pathname==='/report'){
      if(route.request().method()==='POST')report=JSON.parse(route.request().postData());
      return route.fulfill({contentType:'application/json',body:JSON.stringify(report)});
    }
    if(route.request().method()!=='GET')return route.fulfill({status:405,body:'Blocked'});
    const pathname=url.pathname==='/'?'/tests/browser.html':decodeURIComponent(url.pathname);
    const match=pathname.match(/^\/case\/([^/]+)\/([^/]+)$/);
    let target;
    if(match&&pages.has(match[2]))target=path.join(root,match[2]);
    else if(pathname.startsWith('/assets/')||['/tests/browser.html','/tests/browser-tests.js','/tests/mock-api.js'].includes(pathname))target=path.resolve(root,'.'+pathname);
    if(!target||!target.startsWith(root+path.sep)||!fs.existsSync(target)){missing.push(pathname);return route.fulfill({status:404,body:'Not found'});}
    const ext=path.extname(target);let body=fs.readFileSync(target);
    if(ext==='.html'&&match)body=body.toString().replace(/<script\b[^>]*src="https?:[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*href="https?:[^>]*>/gi,'').replace(/(src|href)="assets\//g,'$1="/assets/').replace(/url\((["']?)assets\//g,'url($1/assets/').replace('</head>','<script src="/tests/mock-api.js"></script></head>');
    if(ext==='.css')body=body.toString().replace(/@import\s*(?:url\([^)]*https?:[^)]*\)|["'][^"']*https?:[^"']*["']);?/gi,'');
    return route.fulfill({contentType:types[ext]||'application/octet-stream',body,headers:{'Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; form-action 'none'; object-src 'none'"}});
  });
  const page=await context.newPage();
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.goto(base);
  for(let attempt=0;report.status==='waiting'&&attempt<240;attempt++)await new Promise(resolve=>setTimeout(resolve,500));
  if(report.status==='waiting')throw new Error('Browser suite timed out: '+await page.locator('#results').textContent());
  const output=path.join(__dirname,'artifacts');fs.mkdirSync(output,{recursive:true});
  for(const [name,target,width] of [['desktop-form','apply.html',1280],['mobile-form','apply.html',390],['mobile-status','application-status.html',390]]){
    await page.evaluate(async({target,width})=>await window.showPreview(target,width),{target,width});
    await page.locator('#subject').screenshot({path:path.join(output,name+'.png')});
  }
  const result={...report,pageErrors,consoleErrors,blocked,missing,environment:'Fresh headless Chromium; every request fulfilled from local files or blocked; synthetic fixtures; no network'};
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  process.exitCode=report.status==='complete' && report.passed===report.total && pageErrors.length===0 && consoleErrors.length===0 && missing.length===0 ? 0:1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
