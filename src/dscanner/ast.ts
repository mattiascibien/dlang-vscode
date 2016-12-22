'use strict';

import * as xml from 'xml2js';
import * as vsc from 'vscode';

const variableContainers = [vsc.SymbolKind.Module, vsc.SymbolKind.Enum, vsc.SymbolKind.Class, vsc.SymbolKind.Interface];
let types = new Map<string, vsc.SymbolKind>();

types.set(declaration('module'), vsc.SymbolKind.Module);
types.set(declaration('variable'), vsc.SymbolKind.Variable);
types.set(declaration('function'), vsc.SymbolKind.Function);
types.set(declaration('enum'), vsc.SymbolKind.Enum);
types.set(declaration('union'), vsc.SymbolKind.Class);
types.set(declaration('struct'), vsc.SymbolKind.Class);
types.set(declaration('class'), vsc.SymbolKind.Class);
types.set(declaration('interface'), vsc.SymbolKind.Interface);
types.set(declaration('template'), vsc.SymbolKind.Function);

export { types };

interface Declaration {
    name: string;
    kind: vsc.SymbolKind;
    line: number;
    container?: string;
}

export function parse(data: string) {
    return new Promise<Declaration[]>((resolve) => {
        xml.parseString(data, { explicitArray: false }, (err, output) => {
            resolve(parseNode(output));
        });
    });
}

function parseNode(rootNode: any) {
    let declarations: Declaration[] = [];
    let nodes = [rootNode];
    let names: string[] = [null];
    let declarationNodes = [];
    let dec: Declaration;
    let nameIsIdentifier: boolean;

    rootNode.depth = 0;

    function addDeclaration(dec: Declaration) {
        if (dec) {
            dec.line = dec.line || 1;
            declarations.push(dec);
        }
    }

    function canContainLine(n: string) {
        return ['name', 'identifier', 'declarator'].indexOf(n) > -1;
    }

    while (nodes.length) {
        let node = nodes.pop();
        let name = names.pop();
        let kind = types.get(name);

        if (kind) {
            let parent;

            if (kind === vsc.SymbolKind.Variable) {
                parent = declarationNodes.reverse().find((dn) => dn.depth < node.depth);
                declarationNodes.reverse();
            }

            if (kind !== vsc.SymbolKind.Variable || variableContainers.indexOf(parent.kind) > -1) {
                addDeclaration(dec);

                dec = {
                    name: null,
                    kind: kind,
                    line: node.$ ? Number(node.$.line) : null
                };

                declarationNodes = declarationNodes.filter((dn) => dn.depth < node.depth);
                declarationNodes.push({ depth: node.depth, kind: kind });
            }
        } else if (dec) {
            switch (name) {
                case 'name':
                    dec.name = node._ || node;
                    nameIsIdentifier = false;
                    break;

                case 'identifier':
                    dec.name || (dec.name = node._ || node);
                    nameIsIdentifier = true;
                    break;
            }

            if (node.$ && node.$.line) {
                dec.line = Number(node.$.line);
            }

            if (dec.name && dec.line && !nameIsIdentifier) {
                addDeclaration(dec);
                dec = null;
            }
        }

        let newNodes = [];
        let newNames: string[] = [];

        for (let childName in node) {
            let child = node[childName];

            if (child instanceof Array) {
                child.reverse();

                for (let itemName in child) {
                    if (child[itemName] instanceof Object) {
                        child[itemName].depth = node.depth + 1;
                    }

                    nodes.push(child[itemName]);
                    names.push(itemName);
                }
            } else if (child instanceof Object || canContainLine(childName)) {
                if (child instanceof Object) {
                    child.depth = node.depth + 1;
                }

                newNodes.unshift(child);
                newNames.unshift(childName);
            }
        }

        nodes = nodes.concat(newNodes);
        names = names.concat(newNames);
    }

    addDeclaration(dec);
    return declarations;
}

function declaration(kind: string) {
    return kind + 'Declaration';
}