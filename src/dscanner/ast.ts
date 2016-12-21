'use strict';

import * as xml from 'xml2js';
import * as vsc from 'vscode';

let types = new Map<string, vsc.SymbolKind>();

types.set(declaration('module'), vsc.SymbolKind.Module);
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
    let containers: string[] = [null];
    let dec: Declaration;
    let nameIsIdentifier: boolean;

    function addDeclaration(dec: Declaration) {
        if (dec) {
            dec.line = dec.line || 1;
            declarations.push(dec);
        }
    }

    function canContainLine(n: string) {
        return n === 'name' || n === 'identifier' || n === 'declarator';
    }

    while (nodes.length) {
        let node = nodes.pop();
        let name = names.pop();

        if (types.get(name)) {
            addDeclaration(dec);

            dec = {
                name: null,
                kind: types.get(name),
                line: node.$ ? Number(node.$.line) : null
            };
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

        let tempNodes = [];
        let tempNames: string[] = [];

        for (let childName in node) {
            let child = node[childName];

            if (child instanceof Array) {
                let array = child.reverse();

                for (let itemName in array) {
                    nodes.push(array[itemName]);
                    names.push(itemName);
                }
            } else if (child instanceof Object || canContainLine(childName)) {
                tempNodes.unshift(child);
                tempNames.unshift(childName);
            }
        }

        nodes = nodes.concat(tempNodes);
        names = names.concat(tempNames);
    }

    addDeclaration(dec);
    return declarations;
}

function declaration(kind: string) {
    return kind + 'Declaration';
}