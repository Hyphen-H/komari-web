// Uses the existing adjacent theme's Playwright, or an explicit module URL.
// Start komari-web dev server first; all API requests are mocked, never live.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '../../theme/node_modules/playwright-core/index.mjs');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
 const context=await browser.newContext({viewport,locale:'zh-CN'});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const created=[];let failCreate=true;
 const base={cpu_name:'',virtualization:'',arch:'',cpu_cores:0,os:'',gpu_name:'',ipv4:'',ipv6:'',region:'',mem_total:0,swap_total:0,disk_total:0,version:'',weight:0,price:0,public_remark:'',billing_cycle:30,currency:'$',expired_at:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
 const nodes=[{...base,uuid:'existing',token:'existing-test-token',name:'Existing'}];
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let json={data:{},status:'success'};
  if(path==='/api/me')json={logged_in:true,uuid:'admin',username:'admin'};
  else if(path==='/api/public')json={data:{theme:'default',sitename:'Test',theme_settings:{_komari_onboarding_v1:{seen:['install','workbench','notifications','markets'],workbenchOpened:true}}}};
  else if(path==='/api/admin/settings')json={data:{eula_accepted:true,auto_discovery_key:'TEST-AUTO-DISCOVERY-KEY'}};
  else if(path==='/api/admin/client/list')json=nodes;
  else if(path.endsWith('/traffic-config'))json={managed:false,day:0};
  else if(path==='/api/admin/client/add'){
   if(failCreate){await route.fulfill({status:500,json:{error:'failure'}});return;}
   const body=route.request().postDataJSON();created.push(body);
   const node={...base,...body,uuid:'bound-bwsg',token:'BWSG-DEDICATED-TEST-TOKEN'};
   nodes.push(node);
   await new Promise(resolve=>setTimeout(resolve,100));
   json={uuid:node.uuid,token:node.token};
  } else if(path==='/api/rpc2'){
   const data=route.request().postDataJSON();
   const reply=r=>({jsonrpc:'2.0',id:r.id,result:r.method==='common:getVersion'?{version:'1.6.0'}:r.method==='admin:getLastRunVersion'?{last_run_version:'1.6.0'}:[]});
   json=Array.isArray(data)?data.map(reply):reply(data);
  }
  await route.fulfill({json});
 });
 await page.addInitScript(()=>localStorage.setItem('i18nextLng','zh_CN'));
 await page.goto(`${process.env.NODE_ONBOARDING_BASE_URL || 'http://127.0.0.1:5181'}/admin/servers`);
 await page.getByRole('button',{name:'添加节点',exact:true}).click();
 let dialog=page.getByRole('dialog');
 assert.equal(await dialog.locator('textarea[disabled]').count(),0,'No auto-discovery command may be shown in naming form');
 await dialog.getByPlaceholder('名称 (可选)').fill('BWSG');
 await dialog.getByRole('textbox',{name:'搜索或创建分组'}).fill('production');
 await dialog.getByRole('textbox',{name:'搜索或创建分组'}).press('Enter');
 await dialog.getByPlaceholder('输入后按回车添加').fill('ISP');
 await dialog.getByPlaceholder('输入后按回车添加').press('Enter');
 await dialog.getByRole('button',{name:'创建节点并生成部署命令',exact:true}).click();
 await page.getByText('HTTP 500',{exact:false}).waitFor();
 assert.equal(await dialog.getByPlaceholder('名称 (可选)').inputValue(),'BWSG');
 failCreate=false;
 await dialog.getByRole('button',{name:'创建节点并生成部署命令',exact:true}).dblclick();
 await page.getByRole('heading',{name:'部署节点：BWSG',exact:true}).waitFor();
 dialog=page.getByRole('dialog');
 assert.equal(created.length,1,'Double click must create only one node');
 assert.equal(created[0].name,'BWSG');assert.equal(created[0].group,'production');assert.equal(created[0].tags,'ISP');
 let command=await dialog.locator('textarea[disabled]').inputValue();
 assert(command.includes('BWSG-DEDICATED-TEST-TOKEN'));assert(!command.includes('--auto-discovery'));
 const reset=dialog.locator('input[type=number][max="31"]');
 await reset.fill('7');
 command=await dialog.locator('textarea[disabled]').inputValue();
 assert(command.includes('--month-rotate') && command.includes('7'));
 for (const platform of ['Windows','macOS','Docker','Linux']){
  await dialog.getByRole('radio',{name:platform,exact:true}).click();
  command=await dialog.locator('textarea[disabled]').inputValue();
  assert(command.includes('BWSG-DEDICATED-TEST-TOKEN'),platform);
  assert(!command.includes('--auto-discovery'),platform);
 }
 if (process.env.NODE_ONBOARDING_ARTIFACT_DIR) await page.screenshot({path:`${process.env.NODE_ONBOARDING_ARTIFACT_DIR}/komari-bound-command-${viewport.width}.png`});
 await page.keyboard.press('Escape');
 await page.locator('tbody tr').filter({hasText:'BWSG'}).getByTitle('一键部署指令',{exact:true}).click();
 await page.getByRole('dialog').waitFor();
 assert.equal(created.length,1,'Reopening deployment must not create a node');
 command=await page.getByRole('dialog').locator('textarea[disabled]').inputValue();assert(command.includes('BWSG-DEDICATED-TEST-TOKEN'));
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'自动发现',exact:true}).click();
 dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:'自动发现批量接入',exact:true}).waitFor();
 command=await dialog.locator('textarea[disabled]').inputValue();assert(command.includes('--auto-discovery'));assert(!command.includes('BWSG-DEDICATED-TEST-TOKEN'));
 assert.equal(await dialog.getByPlaceholder('名称 (可选)').count(),0);
 assert.equal(created.length,1);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(`PASS ${viewport.width}px: failed-create retained, single bound BWSG, metadata, month reset, all platforms, reopen no duplicate, isolated auto-discovery, no pageerror`);
 await context.close();
}
} finally {await browser.close();}
