import {readFile, readdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'

// Count every seed suite, including opt-in suites, without executing tests or
// starting workers. Expand registration matrices; assertion loops add no tests.
const root = fileURLToPath(new URL('../../', import.meta.url))
const unknown = Symbol('unknown')
function value(node, scope) {
  if (!node) return unknown
  if (ts.isParenthesizedExpression(node)) return value(node.expression, scope)
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isIdentifier(node)) return scope.get(node.text) ?? unknown
  if (ts.isArrayLiteralExpression(node)) {
    const result = []
    for (const item of node.elements) {
      if (ts.isSpreadElement(item)) {
        const items = value(item.expression, scope)
        if (!Array.isArray(items)) return unknown
        result.push(...items)
      } else result.push(value(item, scope))
    }
    return result
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
    const left = value(node.left, scope), right = value(node.right, scope)
    return left === unknown || right === unknown ? unknown : left === right
  }
  if (ts.isConditionalExpression(node)) {
    const condition = value(node.condition, scope)
    return condition === unknown ? unknown : value(condition ? node.whenTrue : node.whenFalse, scope)
  }
  return unknown
}
function bind(name, item, scope) {
  if (ts.isIdentifier(name)) scope.set(name.text, item)
  else if (ts.isArrayBindingPattern(name)) name.elements.forEach((part, index) => {
    if (ts.isBindingElement(part)) bind(part.name, Array.isArray(item) ? item[index] : unknown, scope)
  })
}
export async function countTests() {
  const counts = []
  for (const filename of (await readdir(root + 'tests', {recursive: true})).sort()) {
    if (!/\.(?:mjs|js|ts|tsx)$/.test(filename) || filename === 'contract.mjs') continue
    const source = await readFile(root + 'tests/' + filename, 'utf8')
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true)
    const names = new Set()
    let browser = false, count = 0
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      const module = statement.moduleSpecifier.text, clause = statement.importClause
      if (module === '@playwright/test' && clause?.namedBindings?.getText(ast).includes('chromium')) browser = true
      if (module !== 'node:test' && !module.endsWith('/contract.mjs')) continue
      if (clause?.name && module === 'node:test') names.add(clause.name.text)
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) {
          if (['test', 'it', 'contract'].includes(item.propertyName?.text ?? item.name.text)) names.add(item.name.text)
        }
      }
    }
    const wrappers = new Set()
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        const fn = declaration.initializer
        if (ts.isIdentifier(declaration.name) && fn && ts.isArrowFunction(fn) && ts.isCallExpression(fn.body) && ts.isIdentifier(fn.body.expression) && names.has(fn.body.expression.text)) {
          wrappers.add(declaration.name.text); names.add(declaration.name.text)
        }
      }
    }
    const registration = node => ts.isCallExpression(node) && (
      ts.isIdentifier(node.expression) && names.has(node.expression.text) ||
      ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'test' &&
      ts.isIdentifier(node.expression.expression) && ['t', 'context'].includes(node.expression.expression.text)
    )
    function contains(node) {
      if (registration(node)) return true
      return ts.forEachChild(node, contains) ?? false
    }
    function walk(node, scope) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && wrappers.has(node.name.text)) return
      if (ts.isBlock(node) || ts.isSourceFile(node)) scope = new Map(scope)
      if (ts.isVariableDeclaration(node) && node.initializer) bind(node.name, value(node.initializer, scope), scope)
      if (ts.isForOfStatement(node) && contains(node.statement)) {
        const items = value(node.expression, scope)
        if (!Array.isArray(items)) throw Error(`${filename}: test registration needs a statically bounded array: ${node.expression.getText(ast)}`)
        for (const item of items) {
          const local = new Map(scope), declaration = node.initializer.declarations?.[0]
          if (declaration) bind(declaration.name, item, local)
          walk(node.statement, local)
        }
        return
      }
      if (registration(node)) count++
      ts.forEachChild(node, child => walk(child, scope))
    }
    walk(ast, new Map())
    // Legacy browser scripts run assertions at top level instead of node:test.
    // Count them as a journey even when a wrapper also invokes that script.
    if (!count && browser && !filename.startsWith('helpers/')) count = 1
    if (count) counts.push({filename, count})
  }
  return {total: counts.reduce((sum, item) => sum + item.count, 0), counts}
}
export async function enforceTestBudget() {
  const {total} = await countTests()
  console.log(`Seed test budget: ${total}/200 (expanded registrations and standalone browser journeys)`)
  if (total > 200) throw Error(`Seed has ${total} tests; keep at most 200 meaningful integration tests.`)
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await countTests()
  if (process.argv.includes('--inventory')) for (const item of result.counts) console.log(`${item.count}\t${item.filename}`)
  console.log(`TOTAL ${result.total}`)
  if (result.total > 200) process.exitCode = 1
}
