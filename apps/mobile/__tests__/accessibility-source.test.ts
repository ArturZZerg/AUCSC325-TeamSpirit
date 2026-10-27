import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Screen-reader rules checked across every screen and component, so a new
// control can't ship without a role or a spoken name.
const root = path.join(__dirname, '..');
const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? sources(full) : /\.tsx$/.test(name) ? [full] : [];
});
const files = [...sources(path.join(root, 'app')), ...sources(path.join(root, 'src'))];

type Finding = { file: string; line: number; rule: string };
function audit(file: string, text = readFileSync(file, 'utf8')): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const report = (node: ts.Node, rule: string) => findings.push({ file: path.relative(root, file).replace(/\\/g, '/'), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, rule });
  const attributes = (tag: ts.JsxOpeningLikeElement) => new Set(tag.attributes.properties.flatMap(property =>
    ts.isJsxAttribute(property) ? [property.name.getText(source)] : ['...']));
  // Text a screen reader can announce: a <Text> anywhere inside, or a label/title prop on a child component.
  const speaks = (node: ts.JsxElement): boolean => {
    let found = false;
    const visit = (child: ts.Node) => {
      if (found) return;
      if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
        const name = child.tagName.getText(source), props = attributes(child);
        if (name === 'Text' || /Text$/.test(name) || props.has('accessibilityLabel') || props.has('title') || props.has('label') || props.has('...')) { found = true; return; }
      }
      if (ts.isJsxExpression(child) && child.expression && !ts.isJsxElement(child.expression) && !ts.isJsxSelfClosingElement(child.expression)
        && !ts.isJsxFragment(child.expression) && !ts.isConditionalExpression(child.expression) && !ts.isBinaryExpression(child.expression)) { found = true; return; }
      ts.forEachChild(child, visit);
    };
    // Only the children: the button's own props (onPress={...}) say nothing.
    node.children.forEach(visit);
    return found;
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = ts.isJsxElement(node) ? node.openingElement : node, name = tag.tagName.getText(source), props = attributes(tag);
      if (name === 'Pressable' && !props.has('...')) {
        if (!props.has('accessibilityRole') && !props.has('role')) report(node, 'Pressable needs accessibilityRole');
        if (!props.has('accessibilityLabel') && !props.has('aria-label') && !(ts.isJsxElement(node) && speaks(node))) report(node, 'Icon-only Pressable needs accessibilityLabel');
      }
      if (name === 'TextInput' && !props.has('...') && !props.has('accessibilityLabel') && !props.has('aria-label')) report(node, 'TextInput needs accessibilityLabel');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

it('scans the app and catches missing roles, names and labels', () => {
  expect(files.length).toBeGreaterThan(50);
  const sample = (body: string) => audit(path.join(root, 'sample.tsx'), `export const Sample = () => <>${body}</>;`).map(finding => finding.rule);
  expect(sample('<Pressable onPress={go}><Ionicons name="add"/></Pressable>')).toEqual(['Pressable needs accessibilityRole', 'Icon-only Pressable needs accessibilityLabel']);
  expect(sample('<Pressable accessibilityRole="button" onPress={go}><Ionicons name="add"/></Pressable>')).toEqual(['Icon-only Pressable needs accessibilityLabel']);
  expect(sample('<TextInput value={v}/>')).toEqual(['TextInput needs accessibilityLabel']);
  expect(sample('<Pressable accessibilityRole="button" onPress={go}><Text>Save</Text></Pressable>')).toEqual([]);
  expect(sample('<Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={go}><Ionicons name="add"/></Pressable>')).toEqual([]);
});
it('gives every control a role and a spoken name', () => {
  expect(files.flatMap(file => audit(file))).toEqual([]);
});
