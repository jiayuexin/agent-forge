import { agent } from './agent.js';
import { connectToHub } from './runtime.js';

async function main() {
  await agent.init();
  await agent.startDaemon();
  const hubUrl = process.env.AGENTFORGE_HUB_URL;
  const token = process.env.AGENTFORGE_HUB_TOKEN;
  if (hubUrl && token) {
    await connectToHub(agent, hubUrl, token);
  }
}

main().catch(console.error);
