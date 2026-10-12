import './typescript-loader.mjs'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'

// Render the actual React modules without bundling or replacing their hooks.
registerHooks({
 resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
   for (const suffix of ['.tsx', '/index.tsx']) {
    const url = new URL(specifier + suffix, context.parentURL)
    if (existsSync(url)) return next(url.href, context)
   }
  }
  return next(specifier, context)
 },
 load(url, context, next) {
  if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText }
  return next(url, context)
 },
})
