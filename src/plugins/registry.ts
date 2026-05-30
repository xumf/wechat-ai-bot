import { Plugin, CommandContext } from './types';
import logger from '../utils/logger';

const plugins: Plugin[] = [];

export function registerPlugin(plugin: Plugin) {
  plugins.push(plugin);
  logger.info(`Plugin registered: ${plugin.name}`);
}

export function getPlugins() {
  return plugins;
}

export async function handleCommand(text: string, ctx: CommandContext): Promise<string | null> {
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  ctx.args = args;

  for (const plugin of plugins) {
    if (plugin.commands?.includes(cmd) && plugin.onCommand) {
      const reply = await plugin.onCommand(ctx);
      if (reply) return reply;
    }
  }
  return null;
}

export async function handleKeyword(text: string, ctx: CommandContext): Promise<string | null> {
  for (const plugin of plugins) {
    if (plugin.onMessage) {
      const reply = await plugin.onMessage(text, ctx);
      if (reply) return reply;
    }
  }
  return null;
}
