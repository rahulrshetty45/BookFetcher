#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { config } from 'dotenv';
import { BookExtractor } from './core/BookExtractor';

// Load environment variables
config();

const program = new Command();

program
  .name('book-fetcher')
  .description('AI pipeline to extract book content from cover images')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract book content from a cover image')
  .argument('<image-path>', 'Path to the book cover image')
  .option('-o, --output <file>', 'Output file for extracted text')
  .option('-v, --verbose', 'Verbose output')
  .action(async (imagePath: string, options) => {
    try {
      console.log(chalk.blue('🚀 Starting book extraction pipeline...'));
      
      // Validate image file exists
      if (!await fs.pathExists(imagePath)) {
        console.error(chalk.red(`❌ Image file not found: ${imagePath}`));
        process.exit(1);
      }

      // Initialize extractor
      const extractor = new BookExtractor({
        verbose: options.verbose || false
      });

      // Run extraction pipeline
      const result = await extractor.extractFromImage(imagePath);

      // Output results
      if (options.output) {
        await fs.writeFile(options.output, result.text);
        console.log(chalk.green(`✅ Extracted text saved to: ${options.output}`));
      } else {
        console.log(chalk.yellow('\n📖 Extracted Book Content:'));
        console.log(chalk.cyan('━'.repeat(50)));
        console.log(`${chalk.bold('Title:')} ${result.book.title}`);
        console.log(`${chalk.bold('Author:')} ${result.book.author}`);
        console.log(`${chalk.bold('Genre:')} ${result.book.genre}`);
        console.log(`${chalk.bold('Page Type:')} ${result.pageType}`);
        console.log(chalk.cyan('━'.repeat(50)));
        console.log(result.text);
        console.log(chalk.cyan('━'.repeat(50)));
      }

    } catch (error) {
      console.error(chalk.red('❌ Extraction failed:'), error instanceof Error ? error.message : String(error));
      if (options.verbose && error instanceof Error) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate if image contains a clear book cover')
  .argument('<image-path>', 'Path to the book cover image')
  .action(async (imagePath: string) => {
    try {
      console.log(chalk.blue('🔍 Validating book cover image...'));
      
      const extractor = new BookExtractor();
      const validation = await extractor.validateBookImage(imagePath);
      
      if (validation.isValid) {
        console.log(chalk.green('✅ Valid book cover detected!'));
        console.log(`Confidence: ${validation.confidence}%`);
        if (validation.suggestions) {
          console.log(`Suggestions: ${validation.suggestions}`);
        }
      } else {
        console.log(chalk.red('❌ Invalid book cover image'));
        console.log(`Reason: ${validation.reason}`);
        if (validation.suggestions) {
          console.log(`Suggestions: ${validation.suggestions}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Handle unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

program.parse(); 