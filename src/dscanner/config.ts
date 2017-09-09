'use strict';

import * as os from 'os';
import * as path from 'path';
import * as rl from 'readline';
import * as fs from 'fs-extra';
import * as vsc from 'vscode';
import * as misc from '../misc';
import * as util from './util';

const header = '[analysis.config.StaticAnalysisConfig]';

export function mute(check: string) {
    let filename = path.join(misc.getRootPath(), 'dscanner.ini');
    let hasHeader = false;

    return new Promise((resolve) =>
        fs.ensureFile(filename, resolve))
        .then(() => {
            let readStream = fs.createReadStream(filename);
            let reader = rl.createInterface({ input: readStream, output: null });
            let lines = [util.fixes.get(check).checkName + '="disabled"' + os.EOL];

            reader.on('line', (line: string) => {
                if (!line.match(util.fixes.get(check).checkName)) {
                    lines.push(line + os.EOL);

                    if (line === header) {
                        hasHeader = true;
                    }
                }
            });

            return new Promise((resolve) => reader
                .on('close', () => resolve(lines.sort((a, b) => a.localeCompare(b)))));
        }).then((lines: string[]) => {
            if (!hasHeader) {
                lines.unshift(header + os.EOL);
            }

            let writeStream = fs.createWriteStream(filename);
            let closePromise = new Promise((resolve) => writeStream.on('close', resolve));
            let promiseChain = Promise.resolve(undefined);

            lines.forEach((line) => promiseChain = promiseChain
                .then(() => new Promise((resolve) => writeStream.write(line, resolve))));
            promiseChain.then(writeStream.close.bind(writeStream));

            return closePromise.then(() =>
                vsc.workspace.textDocuments.forEach(util.lintDocument.bind(util)));
        });
};