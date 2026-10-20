// 后台节点列表标签筛选回归：默认单选（后选替换先选）；开启“多选”后保留已选，按交集（全部满足）过滤。
// Start komari-web dev server first; all API requests are mocked, never live.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '../../theme/node_modules/playwright-core/index.mjs');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const mk=(uuid,name,tags)=>({uuid,token:`t-${uuid}`,name,tags,expired_at:null,price:0,billing_cycle:30,currency:'$',auto_renewal:false,weight:0,group:'',region:'',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'});
  const nodes=[mk('a','Alpha','ISP;GPU'),mk('b','Beta','ISP'),mk('c','Gamma','GPU')];
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
  await page.goto(`${process.env.TAG_FILTER_BASE_URL || 'http://127.0.0.1:5181'}/admin/servers`);
  await page.getByRole('button',{name:'添加节点',exact:true}).waitFor();
  const tagBar=page.locator('div.rt-Flex').filter({has:page.getByText('标签',{exact:true})}).last();
  const names=async()=>(await page.locator('tbody tr td:nth-child(3)').allInnerTexts()).map(s=>s.trim());
  const clickTag=async tag=>{await tagBar.getByText(tag,{exact:true}).click();};
  const multi=page.getByRole('button',{name:'多选',exact:true});
  assert.equal(await multi.getAttribute('aria-pressed'),'false','Multi-select defaults to off');
  assert(await tagBar.evaluate(el=>el.firstElementChild?.textContent?.trim().startsWith('多选')),'Multi-select toggle sits at the left edge');
  assert.deepEqual((await names()).sort(),['Alpha','Beta','Gamma']);
  await clickTag('ISP');
  await page.waitForTimeout(200);
  assert.deepEqual((await names()).sort(),['Alpha','Beta'],'Single tag keeps all matching nodes');
  await clickTag('GPU');
  await page.waitForTimeout(200);
  assert.deepEqual((await names()).sort(),['Alpha','Gamma'],'Single-select replaces the previous tag');
  await multi.click();
  assert.equal(await multi.getAttribute('aria-pressed'),'true');
  await clickTag('ISP');
  await page.waitForTimeout(200);
  assert.deepEqual((await names()).sort(),['Alpha'],'Multi-select requires every selected tag (AND) and keeps the previous one');
  await clickTag('GPU');
  await page.waitForTimeout(200);
  assert.deepEqual((await names()).sort(),['Alpha','Beta'],'Deselecting one tag narrows back to remaining tag');
  await multi.click();
  await page.waitForTimeout(200);
  assert.equal(await multi.getAttribute('aria-pressed'),'false');
  assert.deepEqual((await names()).sort(),['Alpha','Beta'],'Disabling multi-select collapses to the latest tag');
  await clickTag('GPU');
  await page.waitForTimeout(200);
  assert.deepEqual((await names()).sort(),['Alpha','Gamma'],'Single-select replaces again after multi is off');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS tag filter: default single-select replace, multi-select keeps selection and requires all (AND)');
  await context.close();
} finally {await browser.close();}
