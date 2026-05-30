export interface CommandContext {
  args: string[];
  rawText: string;
  talkerId: string;
  talkerName: string;
  roomId?: string;
  say: (text: string) => Promise<void>;
}

export interface Plugin {
  name: string;
  description: string;
  commands?: string[];
  onCommand?: (ctx: CommandContext) => Promise<string | null>;
  onMessage?: (text: string, ctx: CommandContext) => Promise<string | null>;
}
