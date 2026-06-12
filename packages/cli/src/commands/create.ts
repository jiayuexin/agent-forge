import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'node:path';
import { AgentGenerator, type GenerateInput } from '@agentforge/core';

export function createCommand(): Command {
  return new Command('create')
    .description('Create a new agent from a description')
    .argument('<description>', 'Natural language description of the agent')
    .option('-t, --template <template>', 'Template ID to use')
    .option('-p, --provider <provider>', 'Model provider', 'openai')
    .option('-m, --model <model>', 'Model name')
    .option('-o, --output <path>', 'Output directory', './agents')
    .action(async (description: string, options: {
      template?: string;
      provider: string;
      model?: string;
      output: string;
    }) => {
      const spinner = ora('Generating agent...').start();

      try {
        const templateDir = path.resolve(
          path.join(__dirname, '..', '..', '..', '..', 'templates'),
        );

        const generator = new AgentGenerator(templateDir);

        const modelConfig: Record<string, unknown> = {
          provider: options.provider,
        };
        if (options.model) {
          modelConfig.modelName = options.model;
        }

        const input: GenerateInput = {
          description,
          templateId: options.template,
          outputDir: options.output,
          config: { modelConfig },
        };

        const result = await generator.generate(input);

        spinner.succeed(chalk.green('Agent generated successfully!'));

        console.log();
        console.log(chalk.bold('Generated files:'));
        for (const filePath of Object.keys(result.files)) {
          console.log(chalk.cyan(`  ${path.join(options.output, filePath)}`));
        }

        console.log();
        console.log(chalk.gray(`Template: ${result.metadata.templateId}`));
        console.log(chalk.gray(`Role: ${result.metadata.parsed.title}`));
        if (result.metadata.tools.length > 0) {
          console.log(
            chalk.gray(
              `Tools: ${result.metadata.tools.map((t) => t.name).join(', ')}`,
            ),
          );
        }
      } catch (err) {
        spinner.fail(chalk.red('Failed to generate agent'));
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(message));
        process.exit(1);
      }
    });
}
