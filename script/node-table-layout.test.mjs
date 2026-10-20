// 节点列表列布局 + 添加节点流量输入回归：
// - 客户端版本列在最后、备注列在倒数第二，备注完整换行显示（字号不变）
// - 表格超宽时出现横向滚动条
// - 添加节点可输入流量，单位缺省按 G 计算，支持 1.5T / 500M 等写法并换算
// Start komari-web dev server first; all API requests are mocked, never live.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '../../theme/node_modules/playwright-core/index.mjs');
import assert from 'node:assert/strict';

const longRemark='这是用于测试的完整备注文本：包含中文、English words、数字 1234567890 以及更多内容，用来验证备注列是否完整换行显示而不是被省略号截断。';
const node={uuid:'a',token:'t',name:'Alpha',tags:'',region:'JP',ipv4:'1.2.3.4',ipv6:'',version:'1.7.3',price:99,billing_cycle:365,currency:'￥',expired_at:new Date(Date.now()+68*86400000).toISOString(),weight:0,group:'默认',remark:longRemark,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
const node2={...node,uuid:'b',name:'Beta',region:'US',ipv4:'5.6.7.8',version:'1.7.2',price:0,billing_cycle:0,currency:'',expired_at:'',weight:1,group:'',remark:'短备注',created_at:'2026-02-01T00:00:00Z'};
// 补足行数，让页面可纵向滚动，验证滚动条常驻视口底部
const extraNodes=Array.from({length:10},(_,i)=>({...node,uuid:`x${i}`,name:`Extra ${i}`,ipv4:`10.0.0.${i}`,weight:i+2,remark:`备注 ${i}`}));
const nodeList=[node,node2,...extraNodes];

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const editPayloads=[];
  await page.route('**/api/**',async route=>{
    const req=route.request();
    const path=new URL(req.url()).pathname;
    let json={data:{},status:'success'};
    if(path==='/api/me')json={logged_in:true,uuid:'admin',username:'admin'};
    else if(path==='/api/public')json={data:{theme:'default',sitename:'Test',theme_settings:{_komari_onboarding_v1:{seen:['install','workbench','notifications','markets'],workbenchOpened:true}}}};
    else if(path==='/api/admin/settings')json={data:{eula_accepted:true}};
    else if(path==='/api/admin/client/list')json=nodeList;
    else if(path==='/api/admin/client/add')json={data:{uuid:'new-uuid',token:'new-token'}};
    else if(path.endsWith('/edit')){editPayloads.push(req.postDataJSON());json={status:'success',data:{}};}
    else if(path.endsWith('/traffic-config'))json={managed:false,day:0};
    else if(path==='/api/rpc2'){
      const data=req.postDataJSON();
      const reply=r=>({jsonrpc:'2.0',id:r.id,result:r.method==='common:getVersion'?{version:'1.6.0'}:[]});
      json=Array.isArray(data)?data.map(reply):reply(data);
    }
    await route.fulfill({json});
  });
  await page.addInitScript(()=>localStorage.setItem('i18nextLng','zh_CN'));
  await page.goto(`${process.env.NODE_TABLE_BASE_URL || 'http://127.0.0.1:5181'}/admin/servers`);
  await page.getByRole('button',{name:'添加节点',exact:true}).waitFor();

  // 列顺序：客户端版本最后，备注倒数第二
  const headers=(await page.locator('thead th').allInnerTexts()).map(t=>t.trim());
  assert.equal(headers[headers.length-1],'客户端版本');
  assert.equal(headers[headers.length-2],'私有备注');

  // 备注完整显示
  const remark=(await page.locator('tbody tr').first().locator('td').nth(9).innerText()).trim();
  assert.equal(remark,longRemark);

  // 横向滚动：表格自身溢出 + 页底常驻滚动条
  const scroller=page.locator('[data-slot="table-container"]');
  const scroll=await scroller.evaluate(el=>({sw:el.scrollWidth,cw:el.clientWidth}));
  assert.ok(scroll.sw>scroll.cw,`table should overflow horizontally (${scroll.sw} <= ${scroll.cw})`);
  const track=page.locator('.km-node-table-scrollbar');
  assert.equal(await track.count(),1,'pinned horizontal scrollbar should exist');
  const trackBox=await track.boundingBox();
  const viewport=page.viewportSize();
  assert.ok(viewport.height-(trackBox.y+trackBox.height)<40,'scrollbar should be pinned near the viewport bottom');
  // 拖动滑块 -> 表格同步滚动
  const thumb=track.locator('> div');
  const thumbBox=await thumb.boundingBox();
  const dragX=thumbBox.x+thumbBox.width/2;
  const dragY=thumbBox.y+thumbBox.height/2;
  await page.mouse.move(dragX,dragY);
  await page.mouse.down();
  await page.mouse.move(dragX+200,dragY,{steps:10});
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.ok(await scroller.evaluate(el=>el.scrollLeft)>100,'dragging the thumb should scroll the table');
  // 页面滚动时滚动条仍固定在视口底部
  await page.evaluate(()=>{
    const scroller=[...document.querySelectorAll('div')].find(el=>el.scrollHeight>el.clientHeight+50&&getComputedStyle(el).overflowY==='auto');
    scroller?.scrollTo({top:400,behavior:'instant'});
  });
  await page.waitForTimeout(400);
  const trackBox2=await track.boundingBox();
  assert.ok(Math.abs(trackBox2.y-trackBox.y)<40,'scrollbar should stay pinned while the page scrolls');

  // 添加节点：流量按单位换算
  await page.getByRole('button',{name:'添加节点',exact:true}).click();
  await page.getByPlaceholder('1000').fill('1.5T');
  await page.waitForTimeout(200);
  assert.ok((await page.locator('text=单位缺省按 G 计算').first().innerText()).includes('1.50 TB'));
  await page.getByRole('button',{name:'创建节点并生成部署命令'}).click();
  await page.waitForTimeout(800);
  assert.equal(editPayloads.length,1);
  assert.equal(editPayloads[0].traffic_limit,Math.round(1.5*1024**4));
  assert.equal(editPayloads[0].traffic_limit_type,'sum');

  // 无单位按 G 计算
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.getByRole('button',{name:'添加节点',exact:true}).click();
  await page.getByPlaceholder('1000').fill('100');
  await page.waitForTimeout(200);
  assert.ok((await page.locator('text=单位缺省按 G 计算').first().innerText()).includes('100.00 GB'));
  await page.getByRole('button',{name:'创建节点并生成部署命令'}).click();
  await page.waitForTimeout(800);
  assert.equal(editPayloads[1].traffic_limit,100*1024**3);

  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS node table columns + traffic input');
  await context.close();
} finally { await browser.close(); }
