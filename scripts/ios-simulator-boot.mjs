import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function inspectSimulatorBoot(log, inventory, udid) {
  if (/Data Migration Failed|Status=3,\s*isTerminal=YES/i.test(log) || !/\bFinished\b/.test(log))
    throw new Error('Simulator boot did not finish successfully; native app acceptance cannot start.');
  const device = Object.values(inventory.devices ?? {}).flat().find(value => value.udid === udid);
  if (!device || device.name !== 'CampusFlowIosQa' || device.state !== 'Booted')
    throw new Error('The explicit job-owned QA simulator is not booted.');
  return { udid, name: device.name, state: device.state, ready: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [logPath, inventoryPath, udid, outputPath] = process.argv.slice(2);
    if (!logPath || !inventoryPath || !udid || !outputPath) throw new Error('Boot log, inventory, UUID and proof path are required.');
    const proof = inspectSimulatorBoot(readFileSync(logPath, 'utf8'), JSON.parse(readFileSync(inventoryPath, 'utf8')), udid);
    proof.attempt = Number(process.env.IOS_BOOT_ATTEMPT);
    writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
