import { Plugin } from './types';
import { getPlugins } from './registry';

export const helpPlugin: Plugin = {
  name: '帮助',
  description: '显示所有可用命令',
  commands: ['/help', '/菜单', '/功能'],
  onCommand: async (ctx) => {
    const lines = ['📋 可用命令:\n'];
    for (const p of getPlugins()) {
      if (p.commands && p.commands.length > 0) {
        lines.push(`  ${p.commands[0]} - ${p.description}`);
      }
    }
    lines.push('\n💡 其他消息会自动由 AI 回复');
    return lines.join('\n');
  },
};
