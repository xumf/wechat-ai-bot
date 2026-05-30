/**
 * 快速测试 AI 对话是否正常
 * 运行: node scripts/test-ai.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function main() {
  console.log(`测试 AI 服务: ${process.env.OPENAI_BASE_URL}`);
  console.log(`模型: ${process.env.OPENAI_MODEL}\n`);

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL,
    messages: [
      { role: 'system', content: '你是一个友好的微信聊天助手。请用中文回复。' },
      { role: 'user', content: '你好，请简单介绍一下你自己' },
    ],
  });

  const reply = completion.choices[0]?.message?.content;
  console.log('AI 回复:', reply);
  console.log('\n✅ AI 服务正常');
}

main().catch(e => {
  console.error('❌ AI 服务异常:', e.message);
  process.exit(1);
});
