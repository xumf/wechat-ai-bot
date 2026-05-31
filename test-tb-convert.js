const fs = require('fs');
const path = require('path');
const axios = require('axios');

const COOKIE_FILE = path.resolve('data/cookies.json');
const allCookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
const almCookies = allCookies.filter(c => c.domain.includes('alimama'));

console.log('Alimama cookies:', almCookies.length);

const tbToken = almCookies.find(c => c.name === '_tb_token_')?.value || '';
const lid = almCookies.find(c => c.name === 'lid')?.value || '';
console.log('_tb_token_:', tbToken ? tbToken.substring(0, 10) + '...' : 'missing');
console.log('lid:', lid ? lid.substring(0, 10) + '...' : 'missing');

const cookieStr = almCookies.map(c => c.name + '=' + c.value).join('; ');

const variableMap = JSON.stringify({
  url: '【淘宝】https://e.tb.cn/h.RTUZ2GbR0oHeW7O?tk=KgHP5BsBBiE',
  superRedSwitch: '0',
  union_lens: '',
  lensScene: 'PUB',
  spmB: '_portal_v2_tool_links_page_home_index_htm',
});

const params = new URLSearchParams({
  t: String(Date.now()),
  _tb_token_: tbToken,
  floorId: '61446',
  refpid: 'mm_0_0_116276750377',
  variableMap: variableMap,
});

axios.post('https://pub.alimama.com/openapi/param2/1/gateway.unionpub/xt.entry.json',
  params.toString(),
  {
    headers: {
      'accept': '*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'bx-v': '2.5.11',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'cookie': cookieStr,
      'priority': 'u=1, i',
      'referer': 'https://pub.alimama.com/portal/v2/tool/links/page/home/index.htm',
      'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      'x-requested-with': 'XMLHttpRequest',
    },
    timeout: 15000,
  }
).then(r => {
  const data = r.data;
  if (typeof data === 'string') {
    console.log('\nResponse (string):', data.substring(0, 1000));
  } else {
    console.log('\nResponse:', JSON.stringify(data, null, 2).substring(0, 2000));
  }
}).catch(e => {
  console.log('Error:', e.message);
  if (e.response) console.log('Response:', JSON.stringify(e.response.data).substring(0, 1000));
});
