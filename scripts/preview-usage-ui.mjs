import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { previewCatalog } from './usage-preview-fixtures.mjs';

// Only this local host supplies fixtures. The production HTML always calls MCP.
const preview = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Firecrawl usage preview</title>
<style>body{margin:0;background:#eee;font:13px system-ui;color:#262626}header{padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}select,button{font:inherit}iframe{display:block;width:1120px;max-width:100%;height:940px;margin:16px auto;border:1px solid #ddd;background:#f9f9f9}label{display:flex;gap:5px}</style>
<header><strong>Local preview · Sample data</strong><label>State <select id="scenario"><option value="normal">Normal</option><option value="catalog-error">Catalog error</option><option value="categories-error">Categories error</option><option value="tools-error">Tools error</option><option value="context-error">Context error</option><option value="context-slow">Slow context updates</option><option value="unsupported-message">No message support</option><option value="unsupported-context">No context support</option><option value="extra">Extra credits</option><option value="empty">No usage</option><option value="history-error">History error</option><option value="balance-error">Balance error</option><option value="error">Account disconnected</option><option value="metadata">No billing dates</option><option value="zero">Zero credits</option></select></label><label>Theme <select id="theme"><option>light</option><option>dark</option></select></label><label>Width <select id="width"><option>480</option><option>320</option><option>760</option><option selected>1120</option></select></label><button id="reload">Reload</button></header>
<iframe id="view" title="Firecrawl usage" src="/usage.html?fixture=returning"></iframe>
<script>
const frame=document.getElementById('view');
const scenario=document.getElementById('scenario');
const firstVisit=new URL(location.href).searchParams.has('onboarding');
if(firstVisit) frame.src='/usage.html?fixture=fresh';
const theme=document.getElementById('theme');
window.calls=[];window.messages=[];window.modelContexts=[];window.previewErrors=[];
const catalogFixture=${previewCatalog.toString()};
window.addEventListener('error',event=>window.previewErrors.push(event.message));
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow) return;
 const m=event.data;if(m.jsonrpc!=='2.0'||!m.method) return;
 const reply=result=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},location.origin);
 if(m.method==='ui/initialize') return reply({protocolVersion:m.params.protocolVersion,hostInfo:{name:'Firecrawl local preview',version:'1.0.0'},hostCapabilities:{serverTools:{},openLinks:{},...(scenario.value==='unsupported-context'?{}:{updateModelContext:{}}),...(scenario.value==='unsupported-message'?{}:{message:{text:{}}})},hostContext:{theme:theme.value,displayMode:'fullscreen'}});
 if(m.method==='ui/notifications/size-changed'){window.lastRequestedSize=m.params;return;}
 if(m.method==='tools/call'){
  window.calls.push(m.params);
  if(m.params.name==='firecrawl_find_tools') return setTimeout(()=>reply(catalogFixture(m.params.arguments,scenario.value)),150);
  const historical=m.params.arguments.view==='historical';
  const mode=scenario.value;
  if(mode==='error'||(historical&&mode==='history-error')||(!historical&&mode==='balance-error')) return reply({isError:true,content:[{type:'text',text:'Fixture account request failed'}]});
  const current={remainingCredits:mode==='extra'?1250:mode==='zero'?0:8750,planCredits:mode==='extra'?1000:10000,billingPeriodStart:mode==='metadata'?null:'2026-09-15T00:00:00Z',billingPeriodEnd:mode==='metadata'?null:'2026-10-15T00:00:00Z'};
  const periods=mode==='empty'?[]:[{startDate:'2026-07-01T00:00:00Z',endDate:'2026-08-01T00:00:00Z',creditsUsed:3210},{startDate:'2026-08-01T00:00:00Z',endDate:'2026-09-01T00:00:00Z',creditsUsed:mode==='zero'?0:6400},{startDate:'2026-09-01T00:00:00Z',endDate:null,creditsUsed:1250}];
  const data=historical?{success:true,periods}:current;
  return setTimeout(()=>reply({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data}),150);
 }
 if(m.method==='ui/message'){window.messages.push(m.params);return reply({});}
 if(m.method==='ui/update-model-context'){
  if(scenario.value==='context-error') return frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:'Preview context update failed'}},location.origin);
  const commit=()=>{window.modelContexts.push(m.params);reply({});};
  return scenario.value==='context-slow'?setTimeout(commit,600):commit();
 }
 if(m.method==='ui/open-link'){window.lastOpenedUrl=m.params.url;return reply({});}
 if(m.id!==undefined) frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Not supported by preview host'}},location.origin);
});
theme.addEventListener('change',()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{theme:theme.value}},location.origin));
document.getElementById('width').addEventListener('change',event=>frame.style.width=event.target.value+'px');
document.getElementById('reload').addEventListener('click',()=>{window.calls=[];window.messages=[];window.modelContexts=[];frame.src='/usage.html?fixture='+(firstVisit?'persist':'returning')+'&t='+Date.now();});
</script></html>`;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    if (path !== '/' && path !== '/usage.html') {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Model the host's no-network sandbox policy, while allowing embedded assets.
    if (path === '/usage.html')
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; frame-ancestors 'self'"
      );
    let html =
      path === '/'
        ? preview
        : await readFile(
            new URL('../dist/usage.html', import.meta.url),
            'utf8'
          );
    if (path === '/usage.html') {
      const fixture = new URL(request.url, 'http://localhost').searchParams.get(
        'fixture'
      );
      const key = 'firecrawl.provider-onboarding.v1';
      const boot =
        fixture === 'fresh'
          ? `localStorage.removeItem('${key}')`
          : fixture === 'blocked'
            ? `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError')}})`
            : fixture === 'persist'
              ? ''
              : `localStorage.setItem('${key}',JSON.stringify({version:1,completed:true,sources:[]}))`;
      // Fixture state is injected only by this development host.
      html = html.replace(
        '<script>',
        `<script>try{${boot}}catch{};</script><script>`
      );
    }
    response.end(html);
  } catch {
    response.writeHead(500).end('Build the usage interface first.');
  }
});
const port = Number(process.env.USAGE_PREVIEW_PORT ?? 4173);
server.listen(port, '127.0.0.1', () =>
  console.log('Usage preview (sample data): http://127.0.0.1:' + port)
);
