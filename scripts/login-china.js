const { chromium } = require('playwright');
const path = require('path');

const PROFILE_DIR = path.join(__dirname, '..', 'data', 'browser-profile');

async function main() {
  console.log('=== 国内电商登录工具 ===\n');
  console.log(`配置文件目录: ${PROFILE_DIR}\n`);
  console.log('即将打开浏览器，请在窗口中完成以下操作:');
  console.log('  1. 在淘宝页面扫码或账号登录');
  console.log('  2. 在淘宝联盟页面登录（用于转链）');
  console.log('  3. 在京东页面扫码或账号登录');
  console.log('  4. 登录后不要关闭窗口，回到本终端按 Enter 键保存退出\n');
  console.log('提示: Cookies 保存后机器人自动复用，失效后重新运行即可。\n');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    args: ['--no-sandbox'],
  });

  const page = await context.newPage();
  console.log('→ 正在打开淘宝...');
  await page.goto('https://www.taobao.com', { waitUntil: 'domcontentloaded' });

  const page2 = await context.newPage();
  console.log('→ 正在打开淘宝联盟...');
  await page2.goto('https://pub.alimama.com', { waitUntil: 'domcontentloaded' });

  const page3 = await context.newPage();
  console.log('→ 正在打开京东...');
  await page3.goto('https://www.jd.com', { waitUntil: 'domcontentloaded' });

  console.log('\n请在三个标签页中分别登录淘宝、淘宝联盟和京东...');
  console.log('登录完成后，按 Enter 键保存 Cookies 并退出...');

  // Wait for user to press Enter
  await new Promise(resolve => process.stdin.once('data', resolve));

  // Print cookie summary
  const cookies = await context.cookies();
  const tbCookies = cookies.filter(c => c.domain.includes('taobao') || c.domain.includes('tmall') || c.name === 'lg_s');
  const almCookies = cookies.filter(c => c.domain.includes('alimama'));
  const jdCookies = cookies.filter(c => c.domain.includes('jd') || c.domain.includes('360buy'));
  console.log(`\n✅ 共获取 ${cookies.length} 个 Cookies`);
  console.log(`  淘宝: ${tbCookies.length} 个`);
  console.log(`  淘宝联盟: ${almCookies.length} 个`);
  console.log(`  京东: ${jdCookies.length} 个`);

  // Also save cookies to a JSON file as fallback
  const fs = require('fs');
  const COOKIE_FILE = path.join(__dirname, '..', 'data', 'cookies.json');
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`  Cookies 已备份到: ${COOKIE_FILE}\n`);

  if (tbCookies.length > 0) {
    console.log('✅ 淘宝登录成功！');
  } else {
    console.log('⚠️  未检测到淘宝 Cookies，请重新运行并确认登录成功');
  }
  if (almCookies.length > 0) {
    console.log('✅ 淘宝联盟登录成功！（可用于转链）');
  } else {
    console.log('⚠️  未检测到淘宝联盟 Cookies，转链功能可能不可用');
  }
  if (jdCookies.length > 0) {
    console.log('✅ 京东登录成功！');
  } else {
    console.log('⚠️  未检测到京东 Cookies，请重新运行并确认登录成功');
  }

  console.log('\n关闭浏览器...');
  await context.close();
  console.log('完成！现在机器人可以搜索淘宝和京东了 🚀');
}

main().catch(e => {
  console.error('\n❌ 出错:', e.message);
  process.exit(1);
});
