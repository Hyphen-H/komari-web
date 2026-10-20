// 账单弹窗回归：未设置过计费的节点默认货币为 ￥、周期为一年（365 天），保存时按默认值提交。
// Start komari-web dev server first; all API requests are mocked, never live.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '../../theme/node_modules/playwright-core/index.mjs');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let editPayload=null;
  const node={uuid:'a',token:'t-a',name:'Alpha',tags:'',expired_at:null,price:0,billing_cycle:0,currency:'',auto_renewal:false,weight:0,group:'',region:'',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
  const pricedNode={...node,uuid:'b',token:'t-b',name:'Beta',price:99,billing_cycle:365,currency:'￥',expired_at:new Date(Date.now()+68*86400000).toISOString()};
  await page.route('**/api/**',async route=>{
    const req=route.request();
    const path=new URL(req.url()).pathname;
    let json={data:{},status:'success'};
    if(path==='/api/me')json={logged_in:true,uuid:'admin',username:'admin'};
    else if(path==='/api/public')json={data:{theme:'default',sitename:'Test',theme_settings:{_komari_onboarding_v1:{seen:['install','workbench','notifications','markets'],workbenchOpened:true}}}};
    else if(path==='/api/admin/settings')json={data:{eula_accepted:true}};
    else if(path==='/api/admin/client/list')json=[node,pricedNode];
    else if(path==='/api/admin/client/a/edit'){editPayload=req.postDataJSON();json={status:'success',data:{}};}
    else if(path.endsWith('/traffic-config'))json={managed:false,day:0};
    else if(path==='/api/rpc2'){
      const data=req.postDataJSON();
      const reply=r=>({jsonrpc:'2.0',id:r.id,result:r.method==='common:getVersion'?{version:'1.6.0'}:[]});
      json=Array.isArray(data)?data.map(reply):reply(data);
    }
    await route.fulfill({json});
  });
  await page.addInitScript(()=>localStorage.setItem('i18nextLng','zh_CN'));
  await page.goto(`${process.env.BILLING_BASE_URL || 'http://127.0.0.1:5181'}/admin/servers`);
  await page.getByRole('button',{name:'添加节点',exact:true}).waitFor();
  await page.locator('tbody tr').filter({hasText:'Alpha'}).getByRole('button',{name:'账单',exact:true}).click();
  const cycle=page.locator('input[name="billingCycle"]');
  const currency=page.locator('input[name="currency"]');
  await cycle.waitFor();
  assert.equal(await cycle.inputValue(),'365','default billing cycle must be one year');
  assert.equal(await currency.inputValue(),'￥','default currency must be ￥');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.waitForTimeout(400);
  assert.ok(editPayload,'save request was not sent');
  assert.equal(editPayload.billing_cycle,365);
  assert.equal(editPayload.currency,'￥');
  const billingCell=(await page.locator('tbody tr').filter({hasText:'Beta'}).locator('td').nth(9).innerText()).replace(/\s+/g,' ');
  assert.ok(billingCell.includes('已用价值'),'billing list must show used value');
  assert.ok(billingCell.includes('剩余价值'),'billing list must show remaining value');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS billing defaults: currency ￥ and 365-day cycle, saved as-is');
  console.log('billing cell:',billingCell);
  await context.close();
} finally {await browser.close();}
