// Local-only verification server. Never proxies to an external service.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let report = {status:'waiting'};
const pages = new Set(['apply.html','application-status.html','signin.html','signin-user.html','signup.html','signup-user.html','login.html','register.html','forgot-password.html','reset-password.html','otp-verification.html']);
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  if(url.pathname==='/report' && req.method==='POST') {
    let body=''; req.on('data',c=>{body+=c;if(body.length>100000)req.destroy();});
    req.on('end',()=>{try{report=JSON.parse(body);res.end('ok');console.log(JSON.stringify(report));}catch{res.writeHead(400).end();}});return;
  }
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(url.pathname==='/report'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(report));return;}
  let pathname=decodeURIComponent(url.pathname);
  if(pathname==='/') pathname='/tests/browser.html';
  const casePage=pathname.match(/^\/case\/([^/]+)\/([^/]+)$/);
  let target;
  if(casePage && pages.has(casePage[2])) target=path.join(root,casePage[2]);
  else if(pathname.startsWith('/assets/') || ['/tests/browser.html','/tests/browser-tests.js','/tests/mock-api.js'].includes(pathname)) target=path.resolve(root,'.'+pathname);
  if(!target || !target.startsWith(root+path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()){res.writeHead(404).end('Not found');return;}
  const ext=path.extname(target);
  let body=fs.readFileSync(target);
  if(ext==='.html' && casePage){
    body=body.toString().replace(/<script\b[^>]*src="https?:[^>]*>[\s\S]*?<\/script>/gi,'')
      .replace(/<link\b[^>]*href="https?:[^>]*>/gi,'').replace(/(src|href)="assets\//g,'$1="/assets/').replace(/url\((["']?)assets\//g,'url($1/assets/')
      .replace('</head>','<script src="/tests/mock-api.js"></script></head>');
  }
  // External resources are intentionally blocked in test pages, including live APIs.
  if(ext==='.css') body=body.toString().replace(/@import\s*(?:url\([^)]*https?:[^)]*\)|["'][^"']*https?:[^"']*["']);?/gi,'');
  res.setHeader('Content-Type',(types[ext]||'application/octet-stream')+'; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; form-action 'none'; object-src 'none'");
  res.end(body);
}).listen(Number(process.env.MCP_TEST_PORT || 8765),'127.0.0.1',()=>console.log('Local mocked verification server ready'));
