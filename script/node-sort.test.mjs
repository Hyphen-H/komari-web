// 后台节点列表国家排序回归：先按国家代码分组，组内再按添加时间从新到旧。
// Start komari-web dev server first; all API requests are mocked, never live.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '../../theme/node_modules/playwright-core/index.mjs');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const mk=(uuid,name,region,created)=>({uuid,token:`t-${uuid}`,name,tags:'',expired_at:null,price:0,billing_cycle:30,currency:'$',auto_renewal:false,weight:0,group:'',region,created_at:created,updated_at:created});
  const nodes=[
    mk('us-old','US Old','US','2026-01-01T00:00:00Z'),
    mk('us-new','US New','US','2026-01-05T00:00:00Z'),
    mk('jp-old','JP Old','JP','2026-01-02T00:00:00Z'),
    mk('jp-new','JP New','JP','2026-01-06T00:00:00Z'),
    mk('none','No Region','','2026-01-03T00:00:00Z'),
  ];
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let json={data:{},status:'success'};
    if(path==='/api/me')json={logged_in:true,uuid:'admin',username:'admin'};
    else if(path==='/api/public')json={data:{theme:'default',sitename:'Test',theme_settings:{_komari_onboarding_v1:{seen:['install','workbench','notifications','markets'],workbenchOpened:true}}}};
    else if(path==='/api/admin/settings')json={data:{eula_accepted:true}};
    else if(path==='/api/admin/client/list')json=nodes;
    else if(path.endsWith('/traffic-config'))json={managed:false,day:0};
    else if(path==='/api/rpc2'){
      const data=route.request().postDataJSON();
      const reply=r=>({jsonrpc:'2.0',id:r.id,result:r.method==='common:getVersion'?{version:'1.6.0'}:[]});
      json=Array.isArray(data)?data.map(reply):reply(data);
    }
    await route.fulfill({json});
  });
  await page.addInitScript(()=>localStorage.setItem('i18nextLng','zh_CN'));
  await page.goto(`${process.env.NODE_SORT_BASE_URL || 'http://127.0.0.1:5181'}/admin/servers`);
  await page.getByRole('button',{name:'添加节点',exact:true}).waitFor();
  const names=async()=>(await page.locator('tbody tr td:nth-child(3)').allInnerTexts()).map(s=>s.trim());
  const choose=async label=>{
    await page.locator('[aria-label="排序方式"]').click();
    await page.getByRole('option',{name:label,exact:true}).click();
    await page.waitForTimeout(250);
  };
  await choose('国家代码：A → Z');
  assert.deepEqual(await names(),['JP New','JP Old','US New','US Old','No Region'],'A→Z groups by country, newest added first within each');
  await choose('国家代码：Z → A');
  assert.deepEqual(await names(),['US New','US Old','JP New','JP Old','No Region'],'Z→A groups by country, newest added first within each');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS country sort: grouped by country, added-time desc within each group');
  await context.close();
} finally {await browser.close();}
