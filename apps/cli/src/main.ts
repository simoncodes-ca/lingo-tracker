#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('lingo-tracker')
  .description('Effortlessly track, validate, and manage your translations')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize Lingo Tracker in the current project')
  .option('--translationsFolder <path>')
  .option('--exportFolder <path>', 'dist/lingo-export')
  .option('--importFolder <path>', 'dist/lingo-import')
  .option('--subfolderSplitThreshold <number>', '100')
  .option('--baseLocale <locale>', 'en')
  .option('--locales <locales...>', 'supported locales')
  .action(async (options) => {
    const { initCommand } = await import('./init/init');
    await initCommand(options);
  });

program.parse();

