import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const plist = createRequire(import.meta.url)('@expo/plist').default;

/** Read the actual thin Mach-O slice's simulator entitlement section. */
export function readSimulatedEntitlements(binary, architecture) {
  const cpu = { arm64: 0x0100000c, x86_64: 0x01000007 }[architecture];
  const fail = () => { throw new Error('Missing or invalid simulator Mach-O entitlement section.'); };
  if (!cpu || binary.length < 32 || binary.readUInt32LE(0) !== 0xfeedfacf || binary.readUInt32LE(4) !== cpu) fail();
  const commands = binary.readUInt32LE(16), end = 32 + binary.readUInt32LE(20);
  if (commands > 4096 || end > binary.length) fail();
  const name = offset => binary.subarray(offset, offset + 16).toString('utf8').split('\0')[0];
  let offset = 32;
  for (let index = 0; index < commands; index++) {
    if (offset + 8 > end) fail();
    const command = binary.readUInt32LE(offset), size = binary.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > end) fail();
    if (command === 0x19) { // LC_SEGMENT_64, followed by 80-byte section_64 records.
      if (size < 72) fail();
      const count = binary.readUInt32LE(offset + 64);
      if (count * 80 > size - 72) fail();
      for (let section = offset + 72; section < offset + 72 + count * 80; section += 80) {
        if (name(section) !== '__entitlements' || name(section + 16) !== '__TEXT') continue;
        const length = binary.readBigUInt64LE(section + 40), start = binary.readUInt32LE(section + 48);
        if (length === 0n || length > BigInt(binary.length - start) || start < end) fail();
        const xml = binary.subarray(start, start + Number(length)).toString('utf8').replace(/\0+$/, '');
        return { ...plist.parse(xml) };
      }
    }
    offset += size;
  }
  fail();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [input, architecture, output] = process.argv.slice(2);
    if (!input || !architecture || !output) throw new Error('Executable slice, architecture and output are required.');
    writeFileSync(output, `${JSON.stringify(readSimulatedEntitlements(readFileSync(input), architecture), null, 2)}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
