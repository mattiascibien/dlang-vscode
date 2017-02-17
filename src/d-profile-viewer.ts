'use strict';

import * as path from 'path';
import * as cp from 'child_process';
import * as vsc from 'vscode';

export default class DProfileViewer {
    public static toolDirectory = '';
    public static toolFile = '';

    public constructor(directory: string, resolve: Function) {
        cp.spawn(path.join(DProfileViewer.toolDirectory, DProfileViewer.toolFile), [], {
            cwd: directory
        }).on('exit', resolve);
    }
};