// 后台节点排序回归：剩余时间（少→多）、月价值（折算月成本，高→低）、剩余价值（高→低）。
// Start komari-web dev server first; all API requests are mocked, never live.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '../../theme/node_modules/playwright-core/index.mjs');
import assert from 'node:assert/strict';

const day=86400000;
const base={token:'t',tags:'',auto_renewal:false,weight:0,group:'',region:'JP',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',currency:'￥',remark:''};
const nodes=[
  {...base,uuid:'a',name:'A',price:10,billing_cycle:30,expired_at:new Date(Date.now()+5*day).toISOString()},
  {...base,uuid:'b',name:'B',price:120,billing_cycle:365,expired_at:new Date(Date.now()+300*day).toISOString()},
  {...base,uuid:'c',name:'C',price:100,billing_cycle:365,expired_at:new Date(Date.now()+10*day).toISOString()},
  {...base,uuid:'d',name:'D',price:0,billing_cycle:0,expired_at:''},
  {...base,uuid:'e',name:'E',price:50,billing_cycle:90,expired_at:new Date(Date.now()+80*day).toISOString()},
];

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1600,height:900},locale:'zh-CN'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const req=route.request();
    const path=new URL(req.url()).pathname;
    let json={data:{},status:'success'};
    if(path==='/api/me')json={logged_in:true,uuid:'admin',username:'admin'};
    else if(path==='/api/public')json={data:{theme:'default',sitename:'Test',theme_settings:{_komari_onboarding_v1:{seen:['install','workbench','notifications','markets'],workbenchOpened:true}}}};
    else if(path==='/api/admin/settings')json={data:{eula_accepted:true}};
    else if(path==='/api/admin/client/list')json=nodes;
    else if(path.endsWith('/traffic-config'))json={managed:false,day:0};
    else if(path==='/api/rpc2'){
      const data=req.postDataJSON();
      const reply=r=>({jsonrpc:'2.0',id:r.id,result:r.method==='common:getVersion'?{version:'1.6.0'}:[]});
      json=Array.isArray(data)?data.map(reply):reply(data);
    }
    await route.fulfill({json});
  });
  await page.addInitScript(()=>localStorage.setItem('i18nextLng','zh_CN'));
  await page.goto(`${process.env.ADMIN_SORT_BASE_URL || 'http://127.0.0.1:5181'}/admin/servers`);
  await page.getByRole('button',{name:'添加节点',exact:true}).waitFor();

  const rowNames=async()=>await page.locator('tbody tr').evaluateAll(rows=>rows.map(r=>r.querySelectorAll('td')[2]?.textContent?.trim()).filter(Boolean));
  const chooseSort=async label=>{
    await page.getByRole('combobox',{name:'排序方式'}).click();
    await page.getByRole('option',{name:label}).click();
    await page.waitForTimeout(300);
  };

  await chooseSort('剩余时间：少 → 多');
  assert.deepEqual(await rowNames(),['A','C','E','B','D']);
  await chooseSort('月价值：高 → 低');
  assert.deepEqual(await rowNames(),['E','A','B','C','D']);
  await chooseSort('剩余价值：高 → 低');
  assert.deepEqual(await rowNames(),['B','E','C','A','D']);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS admin sort: remaining time / monthly value / remaining value');
  await context.close();
} finally { await browser.close(); }
