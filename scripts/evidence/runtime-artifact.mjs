import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
/** Inspect the emitted entry's syntax, including the object bound to its default export. */
export async function artifactExports(root){
 const config=JSON.parse(await readFile(root+'/dist/server/wrangler.json','utf8'))
 const file=root+'/dist/server/'+config.main.replace(/^\.\//,'')
 const tree=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true)
 const exports=[];let defaultName
 for(const node of tree.statements)if(ts.isExportDeclaration(node)&&node.exportClause&&ts.isNamedExports(node.exportClause))for(const element of node.exportClause.elements){exports.push(element.name.text);if(element.name.text==='default')defaultName=(element.propertyName??element.name).text}
 let methods=[]
 for(const node of tree.statements)if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations)if(declaration.name.getText(tree)===defaultName&&declaration.initializer&&ts.isObjectLiteralExpression(declaration.initializer))methods=declaration.initializer.properties.map(property=>property.name?.getText(tree))
 assert.ok(exports.includes('InstallationCoordinator'));assert.deepEqual(methods.sort(),['fetch','queue','scheduled'])
 return {artifact:file,exports,defaultMethods:methods}
}
